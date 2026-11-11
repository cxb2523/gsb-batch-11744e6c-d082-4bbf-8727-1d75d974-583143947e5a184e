"""scanner.failure_audit 的离线单元测试。

所有样例均在本地手工构造（或通过 monkeypatch 的离线 ScanEngine 生成），
不访问网络、不依赖真实 Azure 凭据。覆盖：

* 正常路径：多严重度 finding、evaluate() 全部 ERROR 的失败规则、正常返回
  空 list 的遗留规则；审计分数必须与 score_findings 逐项相等，失败标注可见，
  空 list 规则不得出现在 failed_rule_ids；
* 负向路径：failed_rule_ids 含一条 evaluations 中无记录的规则，报告
  “失败规则缺少评估记录”且不抛异常；
* 边界路径：空 findings、缺失 score 字段、findings/evaluations 非 list、
  severity 无法规范化时返回可读降级结果而不抛异常。
"""

import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import scanner.engine as engine_mod
from openshield.severity import score_findings
from scanner.engine import ScanEngine
from scanner.evaluation import EvaluationStatus, RuleEvaluation
from scanner.failure_audit import (
    ATTR_ALL_ERROR,
    ATTR_EVALUATOR_EXCEPTION,
    ATTR_MALFORMED_ITEMS,
    ATTR_SCAN_FAILED,
    audit_scan_result,
)

_SUB = "00000000-0000-0000-0000-000000000001"
_SCAN_ID = "00000000-0000-0000-0000-000000000000"
_DETECTED_AT = "2026-11-11T00:00:00+00:00"


# ── 样例构造辅助 ─────────────────────────────────────────────────────────────


def _finding(rule_id: str, severity: str, resource_id: str) -> dict:
    return {
        "rule_id": rule_id,
        "rule_name": "Test rule",
        "severity": severity,
        "category": "Test",
        "resource_id": resource_id,
        "resource_name": "r",
        "resource_type": "Microsoft.Test/resources",
        "description": "d",
        "remediation": "r",
        "playbook": "playbooks/cli/fix.sh",
        "frameworks": {},
        "metadata": {},
        "scan_id": _SCAN_ID,
        "detected_at": _DETECTED_AT,
    }


def _evaluation(rule_id: str, status: str, reason_code=None, reason=None) -> dict:
    return {
        "rule_id": rule_id,
        "resource_id": f"/subscriptions/{_SUB}/resources/{rule_id}",
        "resource_type": "Microsoft.Test/resources",
        "status": status,
        "reason_code": reason_code,
        "reason": reason,
        "evidence": {},
    }


def _check_by_name(report: dict, name: str) -> dict:
    matches = [check for check in report["checks"] if check["name"] == name]
    assert len(matches) == 1
    return matches[0]


# ── 正常路径 ─────────────────────────────────────────────────────────────────


def test_audit_happy_path_multi_severity_failures_and_empty_list_rule():
    findings = [
        _finding("AZ-EVAL-OK", "CRITICAL", "/r/1"),
        _finding("AZ-EVAL-OK", "HIGH", "/r/2"),
        _finding("AZ-EVAL-OK", "MEDIUM", "/r/3"),
        _finding("AZ-EVAL-OK", "LOW", "/r/4"),
        _finding("AZ-EVAL-OK", "INFO", "/r/5"),
    ]
    expected_score = score_findings(findings)

    result = {
        "scan_id": _SCAN_ID,
        "subscription_id": _SUB,
        "status": "completed",
        "total_findings": len(findings),
        "score": expected_score,
        "findings": findings,
        "evaluations": [
            # 正常迁移规则：FAIL + PASS，不在 failed_rule_ids。
            _evaluation("AZ-EVAL-OK", EvaluationStatus.FAIL),
            _evaluation("AZ-EVAL-OK", EvaluationStatus.PASS),
            # evaluate() 全部 ERROR 的失败规则。
            _evaluation(
                "AZ-EVAL-BROKEN",
                EvaluationStatus.ERROR,
                reason_code="INVENTORY_UNAVAILABLE",
                reason="inventory unavailable",
            ),
            # 只实现 scan() 且本次正常返回空 list 的遗留规则：
            # 引擎只留一条 LEGACY 占位行，且不会进入 failed_rule_ids。
            {
                "rule_id": "AZ-LEGACY-EMPTY",
                "resource_id": f"/subscriptions/{_SUB}",
                "resource_type": "",
                "status": EvaluationStatus.UNKNOWN,
                "reason_code": "LEGACY_RULE_NOT_MIGRATED",
                "reason": "not migrated",
                "evidence": {},
            },
        ],
        "failed_rule_ids": ["AZ-EVAL-BROKEN"],
    }

    report = audit_scan_result(result)

    # 输出必须是可 JSON 序列化的纯数据。
    json.dumps(report)
    assert report["degraded"] is False
    assert report["degraded_reasons"] == []

    # failed_rule_ids 与输入逐项相等且顺序保持。
    assert report["failed_rule_ids"] == ["AZ-EVAL-BROKEN"]

    # 分数与 score_findings 逐项相等。
    assert report["score_audit"]["matches"] is True
    assert report["score_audit"]["recomputed_score"] == expected_score
    assert report["score_audit"]["input_score"] == expected_score
    score_check = _check_by_name(report, "score 与 score_findings 重算结果一致")
    assert score_check["passed"] is True

    # 归因：全部评估结果为 ERROR，并给出条目数与各状态计数。
    attribution = report["failure_attributions"][0]
    assert attribution["rule_id"] == "AZ-EVAL-BROKEN"
    assert attribution["attribution"] == ATTR_ALL_ERROR
    assert attribution["evaluation_entry_count"] == 1
    assert attribution["status_counts"][EvaluationStatus.ERROR] == 1
    assert attribution["status_counts"][EvaluationStatus.PASS] == 0

    # 失败标注必须显式可见，而不是仅凭 score 给出干净结论。
    assert report["incomplete_coverage"] is True
    incomplete_check = _check_by_name(report, "存在未完成规则时显式标注分数不代表完整覆盖")
    assert incomplete_check["passed"] is False
    assert "存在未完成规则，分数不代表完整覆盖" in incomplete_check["reason"]
    assert "AZ-EVAL-BROKEN" in incomplete_check["reason"]

    # 空 list 正常规则不得出现在 failed_rule_ids / 归因其列。
    assert "AZ-LEGACY-EMPTY" not in report["failed_rule_ids"]
    assert all(item["rule_id"] != "AZ-LEGACY-EMPTY" for item in report["failure_attributions"])
    empty_list_check = _check_by_name(report, "失败规则不包含只返回空 list 的正常规则")
    assert empty_list_check["passed"] is True

    # 覆盖率缺口：遗留规则计入 UNKNOWN 桶；全 ERROR 规则计入另两个桶。
    gaps = report["coverage_gaps"]
    assert gaps["rules_with_only_error"]["rule_ids"] == ["AZ-EVAL-BROKEN"]
    assert gaps["rules_without_usable_results"]["rule_ids"] == ["AZ-EVAL-BROKEN"]
    assert gaps["rules_legacy_unknown"]["rule_ids"] == ["AZ-LEGACY-EMPTY"]
    assert gaps["rules_legacy_unknown"]["count"] == 1

    # finding 字段检查通过。
    assert _check_by_name(report, "所有 finding 均带 scan_id 与 detected_at")["passed"] is True
    assert _check_by_name(report, "失败规则均有评估记录")["passed"] is True


def test_audit_preserves_failed_rule_ids_order_and_contents():
    result = {
        "score": 100,
        "findings": [],
        "evaluations": [
            _evaluation("R3", EvaluationStatus.ERROR, reason_code="INVENTORY_UNAVAILABLE"),
            _evaluation("R1", EvaluationStatus.ERROR, reason_code="INVENTORY_UNAVAILABLE"),
            _evaluation("R2", EvaluationStatus.ERROR, reason_code="INVENTORY_UNAVAILABLE"),
        ],
        "failed_rule_ids": ["R3", "R1", "R2"],
    }

    report = audit_scan_result(result)

    assert report["failed_rule_ids"] == ["R3", "R1", "R2"]
    assert [item["rule_id"] for item in report["failure_attributions"]] == ["R3", "R1", "R2"]


def test_audit_attributes_evaluator_exception_path():
    result = {
        "score": 100,
        "findings": [],
        "evaluations": [
            {
                "rule_id": "AZ-EVAL-EXC",
                "resource_id": f"/subscriptions/{_SUB}",
                "resource_type": "",
                "status": EvaluationStatus.ERROR,
                "reason_code": "EVALUATOR_EXCEPTION",
                "reason": "boom",
                "evidence": {},
            }
        ],
        "failed_rule_ids": ["AZ-EVAL-EXC"],
    }

    report = audit_scan_result(result)
    attribution = report["failure_attributions"][0]
    assert attribution["attribution"] == ATTR_EVALUATOR_EXCEPTION
    assert attribution["evaluation_entry_count"] == 1
    assert attribution["status_counts"][EvaluationStatus.ERROR] == 1


def test_audit_attributes_malformed_evaluation_items_path():
    result = {
        "score": 100,
        "findings": [],
        "evaluations": [
            _evaluation("AZ-EVAL-MAL", EvaluationStatus.PASS),
            {
                "rule_id": "AZ-EVAL-MAL",
                "resource_id": f"/subscriptions/{_SUB}",
                "resource_type": "",
                "status": EvaluationStatus.ERROR,
                "reason_code": "MALFORMED_EVALUATION",
                "reason": "bad items",
                "evidence": {},
            },
        ],
        "failed_rule_ids": ["AZ-EVAL-MAL"],
    }

    report = audit_scan_result(result)
    attribution = report["failure_attributions"][0]
    assert attribution["attribution"] == ATTR_MALFORMED_ITEMS
    assert attribution["evaluation_entry_count"] == 2
    assert attribution["status_counts"][EvaluationStatus.PASS] == 1
    assert attribution["status_counts"][EvaluationStatus.ERROR] == 1


# ── 负向路径 ─────────────────────────────────────────────────────────────────


def test_audit_reports_failed_rule_without_evaluation_records():
    result = {
        "score": 100,
        "findings": [],
        "evaluations": [
            _evaluation("AZ-EVAL-BROKEN", EvaluationStatus.ERROR, reason_code="INVENTORY_UNAVAILABLE"),
        ],
        # AZ-GHOST 在 evaluations 中没有任何条目（模拟 scan() 返回非 list 的形态，
        # 或结果字典被外部篡改）。
        "failed_rule_ids": ["AZ-GHOST", "AZ-EVAL-BROKEN"],
    }

    report = audit_scan_result(result)  # 不得抛异常

    missing_check = _check_by_name(report, "失败规则均有评估记录")
    assert missing_check["passed"] is False
    assert "失败规则缺少评估记录" in missing_check["reason"]
    assert "AZ-GHOST" in missing_check["reason"]

    ghost = next(item for item in report["failure_attributions"] if item["rule_id"] == "AZ-GHOST")
    assert ghost["attribution"] == ATTR_SCAN_FAILED
    assert ghost["evaluation_entry_count"] == 0

    # 覆盖率缺口同样要把无记录规则算作无可用结果。
    assert "AZ-GHOST" in report["coverage_gaps"]["rules_without_usable_results"]["rule_ids"]
    # 顺序仍然保持。
    assert report["failed_rule_ids"] == ["AZ-GHOST", "AZ-EVAL-BROKEN"]


def test_audit_flags_healthy_rule_wrongly_listed_as_failed():
    """一条只有 PASS 评估、正常完成的规则被错误放进 failed_rule_ids 时，
    空 list 防护检查必须失败并给出可读原因。"""
    result = {
        "score": 100,
        "findings": [],
        "evaluations": [_evaluation("AZ-HEALTHY", EvaluationStatus.PASS)],
        "failed_rule_ids": ["AZ-HEALTHY"],
    }

    report = audit_scan_result(result)
    check = _check_by_name(report, "失败规则不包含只返回空 list 的正常规则")
    assert check["passed"] is False
    assert "AZ-HEALTHY" in check["reason"]


def test_audit_detects_score_mismatch():
    findings = [_finding("AZ-X", "HIGH", "/r/1")]
    result = {
        "score": 100,  # 实际应为 90
        "findings": findings,
        "evaluations": [],
        "failed_rule_ids": [],
    }

    report = audit_scan_result(result)
    check = _check_by_name(report, "score 与 score_findings 重算结果一致")
    assert check["passed"] is False
    assert report["score_audit"]["matches"] is False
    assert report["score_audit"]["recomputed_score"] == score_findings(findings)


def test_audit_flags_finding_missing_scan_id_or_detected_at():
    bad_finding = _finding("AZ-X", "LOW", "/r/1")
    del bad_finding["scan_id"]
    result = {
        "score": score_findings([bad_finding]),
        "findings": [bad_finding],
        "evaluations": [],
        "failed_rule_ids": [],
    }

    report = audit_scan_result(result)
    check = _check_by_name(report, "所有 finding 均带 scan_id 与 detected_at")
    assert check["passed"] is False
    assert "scan_id" in check["reason"]


# ── 边界 / 降级路径 ──────────────────────────────────────────────────────────


def test_audit_empty_findings_and_missing_score_returns_readable_degradation():
    result = {
        "findings": [],
        "evaluations": [],
        "failed_rule_ids": [],
        # 故意缺少 score 字段。
    }

    report = audit_scan_result(result)  # 不得抛异常
    json.dumps(report)

    assert report["degraded"] is True
    assert "score" in report["affected_fields"]
    assert any("score" in reason for reason in report["degraded_reasons"])
    assert report["score_audit"]["recomputed_score"] == 100
    assert report["score_audit"]["matches"] is False
    score_check = _check_by_name(report, "score 与 score_findings 重算结果一致")
    assert score_check["passed"] is False
    assert score_check["reason"]

    # 空 findings 本身合法：finding 字段检查应通过，失败标注检查也通过。
    assert _check_by_name(report, "所有 finding 均带 scan_id 与 detected_at")["passed"] is True
    assert _check_by_name(report, "存在未完成规则时显式标注分数不代表完整覆盖")["passed"] is True
    assert report["failed_rule_ids"] == []


def test_audit_non_list_findings_degrades_without_raising():
    result = {
        "score": 100,
        "findings": {"unexpected": "object"},
        "evaluations": [],
        "failed_rule_ids": [],
    }

    report = audit_scan_result(result)
    json.dumps(report)
    assert report["degraded"] is True
    assert "findings" in report["affected_fields"]
    assert _check_by_name(report, "findings 结构有效")["passed"] is False


def test_audit_non_list_evaluations_degrades_without_raising():
    result = {
        "score": 100,
        "findings": [],
        "evaluations": "not-a-list",
        "failed_rule_ids": ["AZ-X"],
    }

    report = audit_scan_result(result)
    json.dumps(report)
    assert report["degraded"] is True
    assert "evaluations" in report["affected_fields"]
    # evaluations 不可读，失败规则自然“缺少评估记录”，但不能抛异常。
    assert _check_by_name(report, "evaluations 结构有效")["passed"] is False
    assert "AZ-X" in _check_by_name(report, "失败规则均有评估记录")["reason"]


def test_audit_invalid_severity_degrades_and_excludes_finding_from_rescore():
    good = _finding("AZ-OK", "HIGH", "/r/1")
    bad = _finding("AZ-BAD", "URGENT", "/r/2")  # 契约外严重度
    result = {
        "score": score_findings([good]),
        "findings": [good, bad],
        "evaluations": [],
        "failed_rule_ids": [],
    }

    report = audit_scan_result(result)  # 不得抛异常
    json.dumps(report)
    assert report["degraded"] is True
    assert "findings.severity" in report["affected_fields"]
    assert report["score_audit"]["findings_excluded_invalid_severity"] == 1
    assert report["score_audit"]["findings_considered"] == 1
    assert report["score_audit"]["recomputed_score"] == score_findings([good])


def test_audit_handles_non_dict_input_and_non_list_failed_rule_ids():
    assert audit_scan_result(None)["degraded"] is True
    assert audit_scan_result("bogus")["degraded"] is True

    report = audit_scan_result(
        {
            "score": 100,
            "findings": [],
            "evaluations": [],
            "failed_rule_ids": ("R1",),  # tuple，不是 list
        }
    )
    assert report["degraded"] is True
    assert "failed_rule_ids" in report["affected_fields"]
    assert report["failed_rule_ids"] == []


# ── 与真实 ScanEngine 输出的端到端一致性 ─────────────────────────────────────


def _offline_engine(monkeypatch, rules) -> ScanEngine:
    monkeypatch.setattr(engine_mod, "AzureClient", lambda subscription_id: MagicMock())
    eng = ScanEngine.__new__(ScanEngine)
    eng.subscription_id = _SUB
    eng.client = MagicMock()
    eng.rules = rules
    return eng


def test_audit_agrees_with_real_engine_output_for_all_failure_modes(monkeypatch):
    """对引擎真实产出的结果字典：审计的 failed_rule_ids 逐项相等且顺序保持，
    score 与 score_findings 逐项相等，四种失败形态归因正确，且不对引擎的
    合法输出产生误报。"""

    def _boom(*_args, **_kwargs):
        raise RuntimeError("evaluator blew up")

    def _scan_boom(*_args, **_kwargs):
        raise RuntimeError("scan blew up")

    rules = [
        # 1. evaluate() 抛异常。
        SimpleNamespace(RULE_ID="AZ-ENG-EXC", scan=lambda *_: [], evaluate=_boom),
        # 2. evaluate() 返回畸形条目。
        SimpleNamespace(
            RULE_ID="AZ-ENG-MAL",
            scan=lambda *_: [],
            evaluate=lambda *_: [{"status": "PASS"}],
        ),
        # 3. evaluate() 全部 ERROR。
        SimpleNamespace(
            RULE_ID="AZ-ENG-ERR",
            scan=lambda *_: [],
            evaluate=lambda *_: [
                RuleEvaluation(
                    rule_id="AZ-ENG-ERR",
                    resource_id="/r/1",
                    resource_type="t",
                    status=EvaluationStatus.ERROR,
                    reason_code="INVENTORY_UNAVAILABLE",
                )
            ],
        ),
        # 4. scan() 抛异常（遗留路径，留下 LEGACY 占位行）。
        SimpleNamespace(RULE_ID="AZ-ENG-SCAN-EXC", scan=_scan_boom),
        # 5. scan() 正常返回空 list（遗留占位行，但不得被标记失败）。
        SimpleNamespace(RULE_ID="AZ-ENG-EMPTY", scan=lambda *_: []),
        # 6. 正常迁移规则：PASS。
        SimpleNamespace(
            RULE_ID="AZ-ENG-OK",
            scan=lambda *_: [],
            evaluate=lambda *_: [
                RuleEvaluation(
                    rule_id="AZ-ENG-OK",
                    resource_id="/r/ok",
                    resource_type="t",
                    status=EvaluationStatus.PASS,
                )
            ],
        ),
    ]

    result = _offline_engine(monkeypatch, rules).run_scan()
    report = audit_scan_result(result)

    # failed_rule_ids 与输入逐项相等且顺序保持。
    assert report["failed_rule_ids"] == result["failed_rule_ids"]
    assert report["failed_rule_ids"] == [
        "AZ-ENG-EXC",
        "AZ-ENG-MAL",
        "AZ-ENG-ERR",
        "AZ-ENG-SCAN-EXC",
    ]

    # score 与 score_findings 逐项相等。
    assert report["score_audit"]["matches"] is True
    assert report["score_audit"]["recomputed_score"] == score_findings(result["findings"])
    assert report["score_audit"]["input_score"] == result["score"]

    by_rule = {item["rule_id"]: item for item in report["failure_attributions"]}
    assert by_rule["AZ-ENG-EXC"]["attribution"] == ATTR_EVALUATOR_EXCEPTION
    assert by_rule["AZ-ENG-MAL"]["attribution"] == ATTR_MALFORMED_ITEMS
    assert by_rule["AZ-ENG-ERR"]["attribution"] == ATTR_ALL_ERROR
    assert by_rule["AZ-ENG-SCAN-EXC"]["attribution"] == ATTR_SCAN_FAILED

    # 空 list 规则与健康规则均不在失败列表，且不触发任何误报检查。
    assert "AZ-ENG-EMPTY" not in report["failed_rule_ids"]
    assert "AZ-ENG-OK" not in report["failed_rule_ids"]
    assert _check_by_name(report, "失败规则不包含只返回空 list 的正常规则")["passed"] is True
    assert _check_by_name(report, "失败规则均有评估记录")["passed"] is True

    # 引擎输出完全合法：不降级，覆盖不完整标注可见，整个报告可 JSON 序列化。
    assert report["degraded"] is False
    assert report["incomplete_coverage"] is True
    json.dumps(report)
