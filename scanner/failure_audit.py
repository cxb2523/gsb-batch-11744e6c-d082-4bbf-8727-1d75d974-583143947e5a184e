"""失败规则归因与覆盖率缺口审计（纯函数模块）。

输入是 ``ScanEngine.run_scan`` 返回的结果字典，输出一份只由 JSON 原生类型
（str/int/float/bool/None/list/dict）组成的结构化审计报告，回答三件事：

1. ``failed_rule_ids`` 里每条规则为什么失败（归因），以及它在
   ``evaluations`` 中留下了多少条目、各状态计数如何；
2. 本次扫描的覆盖率缺口：多少规则没有任何可用结果、多少规则只产出
   ERROR、多少规则仍是 UNKNOWN/LEGACY_RULE_NOT_MIGRATED；
3. 一组按固定顺序排列的检查项，显式标注“存在未完成规则，分数不代表完整
   覆盖”，避免仅凭 score 给出干净结论。

本模块不修改 scanner.engine / scanner.evaluation / openshield.severity 的任何
既有行为，不访问网络、不读写磁盘、不实例化 AzureClient。所有解析都做防御
式处理：输入畸形时返回带可读原因的降级结果而不是抛出未捕获异常。
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from openshield.severity import SeverityContractError, normalize_severity, score_findings
from scanner.evaluation import EvaluationStatus

# ── 归因结论（reason 文案与任务约定逐字一致，另附稳定的机器可读 code） ──────

ATTR_EVALUATOR_EXCEPTION = "评估器抛异常或返回非 list"
ATTR_MALFORMED_ITEMS = "评估器返回畸形条目"
ATTR_ALL_ERROR = "全部评估结果为 ERROR"
ATTR_SCAN_FAILED = "规则返回非 list 或抛异常"

# 引擎在 scanner/engine.py 中写入的 reason_code，保持字符串常量而非跨私有
# 方法引用，避免对引擎内部实现细节产生导入级耦合。
_REASON_EVALUATOR_EXCEPTION = "EVALUATOR_EXCEPTION"
_REASON_MALFORMED_EVALUATION = "MALFORMED_EVALUATION"
_REASON_LEGACY = "LEGACY_RULE_NOT_MIGRATED"

_ALL_STATUSES = (
    EvaluationStatus.PASS,
    EvaluationStatus.FAIL,
    EvaluationStatus.ERROR,
    EvaluationStatus.UNKNOWN,
    EvaluationStatus.NOT_APPLICABLE,
)
_KNOWN_STATUSES = frozenset(_ALL_STATUSES)

_INCOMPLETE_COVERAGE_REASON = "存在未完成规则，分数不代表完整覆盖"
_MISSING_EVALUATION_REASON = "失败规则缺少评估记录"


def _empty_status_counts() -> Dict[str, int]:
    return {status: 0 for status in _ALL_STATUSES}


def _as_list(value: Any) -> Optional[List[Any]]:
    """只接受真正的 list（与引擎 isinstance(x, list) 的判定口径一致）。"""
    return value if isinstance(value, list) else None


def _attribute_rule(rule_id: str, entries: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """依据一条失败规则在 evaluations 中的条目给出归因。

    判定优先级与 scanner/engine.py 的真实行为对齐：

    * 引擎在 evaluate() 抛异常或返回非 list 时写入单条
      EVALUATOR_EXCEPTION 的 ERROR 条目；
    * evaluate() 返回畸形条目时追加 MALFORMED_EVALUATION 的 ERROR 条目，
      且保留的有效条目可能同时存在；
    * 其余“条目全部为 ERROR”的情况（如 INVENTORY_UNAVAILABLE）归为全部
      评估结果为 ERROR；
    * 在 evaluations 中没有任何条目，或条目形态无法对应 evaluate() 路径的，
      是 scan() 路径“返回非 list 或抛异常”（scan() 返回非 list 时引擎不
      写任何评估行；抛异常时仅留下一条 LEGACY 占位行）。
    """
    status_counts = _empty_status_counts()
    reason_codes: List[str] = []
    for entry in entries:
        status = entry.get("status")
        if isinstance(status, str) and status in _KNOWN_STATUSES:
            status_counts[status] += 1
        reason_code = entry.get("reason_code")
        if isinstance(reason_code, str) and reason_code not in reason_codes:
            reason_codes.append(reason_code)

    entry_count = len(entries)

    if entry_count == 0:
        code, reason = "SCAN_NON_LIST_OR_RAISED", ATTR_SCAN_FAILED
    elif _REASON_EVALUATOR_EXCEPTION in reason_codes:
        code, reason = "EVALUATOR_EXCEPTION_OR_NON_LIST", ATTR_EVALUATOR_EXCEPTION
    elif _REASON_MALFORMED_EVALUATION in reason_codes:
        code, reason = "MALFORMED_EVALUATION_ITEMS", ATTR_MALFORMED_ITEMS
    elif entry_count > 0 and status_counts[EvaluationStatus.ERROR] == entry_count:
        code, reason = "ALL_EVALUATIONS_ERROR", ATTR_ALL_ERROR
    else:
        # 没有 ERROR 证据却出现在 failed_rule_ids 中：evaluate() 路径无法
        # 产生这种状态，只可能来自 scan() 的非 list 返回/抛异常路径。
        code, reason = "SCAN_NON_LIST_OR_RAISED", ATTR_SCAN_FAILED

    return {
        "rule_id": rule_id,
        "attribution_code": code,
        "attribution": reason,
        "evaluation_entry_count": entry_count,
        "status_counts": status_counts,
        "reason_codes": reason_codes,
    }


def _make_check(name: str, passed: bool, reason: Optional[str] = None) -> Dict[str, Any]:
    check = {"name": name, "passed": bool(passed)}
    check["reason"] = reason if not passed and reason else None
    return check


def audit_scan_result(result: Any) -> Dict[str, Any]:
    """对一次 run_scan 结果字典执行失败归因与覆盖率缺口审计。

    返回纯数据字典（可直接 ``json.dumps``），顶层包含：

    ``degraded`` / ``degraded_reasons`` / ``affected_fields``
        降级标记。输入结构畸形（缺 score、findings/evaluations 非 list、
        finding severity 无法规范化等）时不抛异常，而是在这里逐条说明受
        影响的字段与可读原因。
    ``failed_rule_ids``
        与输入逐项相等且顺序保持的失败规则 ID 列表。
    ``failure_attributions``
        每条失败规则的归因、评估条目数与各状态计数。
    ``coverage_gaps``
        无任何可用结果 / 只产出 ERROR / UNKNOWN 遗留规则的规则数与 ID。
    ``checks``
        按固定顺序排列的检查项，每项含 name/passed/reason。
    ``score_audit``
        输入 score、用同一份 findings 重算的 score 及二者是否一致。
    """
    degraded_reasons: List[str] = []
    affected_fields: List[str] = []

    def _degrade(field: str, reason: str) -> None:
        degraded_reasons.append(reason)
        if field not in affected_fields:
            affected_fields.append(field)

    # 整个函数再包一层兜底：任何意外都转化为降级报告，绝不向调用方抛出。
    try:
        if not isinstance(result, dict):
            return _top_level_failure(
                degraded_reasons=["输入的扫描结果不是字典，无法执行审计"],
                affected_fields=["result"],
            )

        # ── failed_rule_ids：顺序与内容必须与输入逐项相等 ────────────────
        raw_failed = result.get("failed_rule_ids")
        failed_list = _as_list(raw_failed)
        if failed_list is None:
            _degrade("failed_rule_ids", "failed_rule_ids 不是 list，按空列表处理")
            failed_list = []
        failed_rule_ids: List[Any] = list(failed_list)

        # ── evaluations ──────────────────────────────────────────────────
        raw_evaluations = result.get("evaluations")
        evaluations = _as_list(raw_evaluations)
        if evaluations is None:
            _degrade("evaluations", "evaluations 不是 list，无法统计评估覆盖率，按空列表处理")
            evaluations = []

        entries_by_rule: Dict[Any, List[Dict[str, Any]]] = {}
        malformed_evaluation_entries = 0
        all_rule_ids: List[Any] = list(failed_rule_ids)

        for entry in evaluations:
            if not isinstance(entry, dict):
                malformed_evaluation_entries += 1
                continue
            rule_id = entry.get("rule_id")
            entries_by_rule.setdefault(rule_id, []).append(entry)
            if rule_id not in all_rule_ids:
                all_rule_ids.append(rule_id)

        if malformed_evaluation_entries:
            _degrade(
                "evaluations",
                f"evaluations 中有 {malformed_evaluation_entries} 个非字典条目，已在统计中忽略",
            )

        # ── findings ─────────────────────────────────────────────────────
        raw_findings = result.get("findings")
        findings = _as_list(raw_findings)
        if findings is None:
            _degrade("findings", "findings 不是 list，无法核对 finding 字段与重算分数，按空列表处理")
            findings = []

        valid_findings: List[Dict[str, Any]] = []
        non_dict_findings = 0
        for finding in findings:
            if not isinstance(finding, dict):
                non_dict_findings += 1
                continue
            valid_findings.append(finding)
        if non_dict_findings:
            _degrade("findings", f"findings 中有 {non_dict_findings} 个非字典条目，已在统计中忽略")

        # severity 规范化：任何一个 finding 的 severity 不合法都不能让审计
        # 崩掉；标记降级，分数重算只使用可规范化的 finding。
        findings_for_score: List[Dict[str, Any]] = []
        invalid_severity_count = 0
        for finding in valid_findings:
            try:
                canonical = normalize_severity(finding.get("severity"))
            except SeverityContractError:
                invalid_severity_count += 1
                continue
            normalized = dict(finding)
            normalized["severity"] = canonical
            findings_for_score.append(normalized)
        if invalid_severity_count:
            _degrade(
                "findings.severity",
                f"{invalid_severity_count} 个 finding 的 severity 无法规范化，已排除在分数重算之外",
            )

        # findings 里出现过的规则同样纳入覆盖率口径。
        for finding in valid_findings:
            rule_id = finding.get("rule_id")
            if rule_id is not None and rule_id not in all_rule_ids:
                all_rule_ids.append(rule_id)

        # ── 失败规则归因（保持 failed_rule_ids 的输入顺序） ──────────────
        failure_attributions = [
            _attribute_rule(rule_id, entries_by_rule.get(rule_id, [])) for rule_id in failed_rule_ids
        ]

        # ── 覆盖率缺口 ───────────────────────────────────────────────────
        no_usable_result_rule_ids: List[Any] = []
        error_only_rule_ids: List[Any] = []
        legacy_unknown_rule_ids: List[Any] = []

        for rule_id in all_rule_ids:
            entries = entries_by_rule.get(rule_id, [])
            if not entries:
                # 完全没有评估行：引擎只在 scan() 返回非 list 时产生这种形态。
                no_usable_result_rule_ids.append(rule_id)
                continue
            statuses = [e.get("status") for e in entries]
            if all(status == EvaluationStatus.ERROR for status in statuses):
                error_only_rule_ids.append(rule_id)
                # 全 ERROR 同样意味着没有任何可用结果。
                no_usable_result_rule_ids.append(rule_id)
            elif all(
                status == EvaluationStatus.UNKNOWN
                and e.get("reason_code") == _REASON_LEGACY
                for status, e in zip(statuses, entries)
            ):
                legacy_unknown_rule_ids.append(rule_id)

        coverage_gaps = {
            "rules_without_usable_results": {
                "count": len(no_usable_result_rule_ids),
                "rule_ids": no_usable_result_rule_ids,
            },
            "rules_with_only_error": {
                "count": len(error_only_rule_ids),
                "rule_ids": error_only_rule_ids,
            },
            "rules_legacy_unknown": {
                "count": len(legacy_unknown_rule_ids),
                "rule_ids": legacy_unknown_rule_ids,
            },
        }

        # ── 分数核对 ─────────────────────────────────────────────────────
        input_score = result.get("score")
        recomputed_score: Any = None
        score_matches = False
        try:
            recomputed_score = score_findings(findings_for_score)
        except Exception as exc:  # 契约外的极端畸形，降级而不是抛出
            _degrade("score", f"使用 findings 重算 score_findings 失败: {exc}")
        if recomputed_score is not None:
            if isinstance(input_score, int) and not isinstance(input_score, bool):
                score_matches = input_score == recomputed_score
            elif input_score is None:
                _degrade("score", "结果字典缺少 score 字段，无法核对分数一致性")
            else:
                _degrade("score", f"score 字段类型异常（{type(input_score).__name__}），无法核对分数一致性")

        score_audit = {
            "input_score": input_score,
            "recomputed_score": recomputed_score,
            "matches": bool(score_matches),
            "findings_considered": len(findings_for_score),
            "findings_excluded_invalid_severity": invalid_severity_count,
        }

        # ── 检查项（固定顺序） ───────────────────────────────────────────
        checks: List[Dict[str, Any]] = []

        # 1. 结构检查（畸形输入时直接失败，原因可读）。
        if isinstance(raw_evaluations, list) and not malformed_evaluation_entries:
            checks.append(_make_check("evaluations 结构有效", True))
        else:
            checks.append(
                _make_check(
                    "evaluations 结构有效",
                    False,
                    "evaluations 不是 list 或包含非字典条目，详见 degraded_reasons",
                )
            )

        if isinstance(raw_findings, list) and not non_dict_findings:
            checks.append(_make_check("findings 结构有效", True))
        else:
            checks.append(
                _make_check(
                    "findings 结构有效",
                    False,
                    "findings 不是 list 或包含非字典条目，详见 degraded_reasons",
                )
            )

        # 2. 每条失败规则都必须在 evaluations 中有对应条目。
        missing_evaluation_ids = [
            rule_id for rule_id in failed_rule_ids if not entries_by_rule.get(rule_id)
        ]
        if missing_evaluation_ids:
            checks.append(
                _make_check(
                    "失败规则均有评估记录",
                    False,
                    f"{_MISSING_EVALUATION_REASON}: {_join_ids(missing_evaluation_ids)}",
                )
            )
        else:
            checks.append(_make_check("失败规则均有评估记录", True))

        # 3. failed_rule_ids 中不得混入只返回空 list 的正常规则。
        #    正常完成的规则至少留下一条真实可用的评估（PASS/FAIL/
        #    NOT_APPLICABLE，或非 LEGACY 占位的 UNKNOWN 证据行）且没有
        #    ERROR；只有 LEGACY_RULE_NOT_MIGRATED 占位行的 scan() 规则无法
        #    区分“抛异常”与“空 list”（引擎对两种情况都只留占位行），不据此
        #    误报；完全没有评估行的情况由上一项检查负责。
        def _is_usable_evidence(entry: Dict[str, Any]) -> bool:
            status = entry.get("status")
            if not isinstance(status, str) or status not in _KNOWN_STATUSES:
                return False
            if status == EvaluationStatus.ERROR:
                return False
            if status == EvaluationStatus.UNKNOWN and entry.get("reason_code") == _REASON_LEGACY:
                return False
            return True

        healthy_but_failed = []
        for rule_id in failed_rule_ids:
            entries = entries_by_rule.get(rule_id, [])
            if entries and any(_is_usable_evidence(e) for e in entries) and not any(
                e.get("status") == EvaluationStatus.ERROR for e in entries
            ):
                healthy_but_failed.append(rule_id)
        if healthy_but_failed:
            checks.append(
                _make_check(
                    "失败规则不包含只返回空 list 的正常规则",
                    False,
                    f"以下规则存在可用且无 ERROR 的评估结果，不应出现在 failed_rule_ids 中: "
                    f"{_join_ids(healthy_but_failed)}",
                )
            )
        else:
            checks.append(_make_check("失败规则不包含只返回空 list 的正常规则", True))

        # 4. failed_rule_ids 非空时必须显式标注覆盖不完整，而不是只看分数。
        if failed_rule_ids:
            checks.append(
                _make_check(
                    "存在未完成规则时显式标注分数不代表完整覆盖",
                    False,
                    f"{_INCOMPLETE_COVERAGE_REASON}（未完成规则: {_join_ids(failed_rule_ids)}）",
                )
            )
        else:
            checks.append(_make_check("存在未完成规则时显式标注分数不代表完整覆盖", True))

        # 5. 每条 finding 都必须带 scan_id 与 detected_at。
        missing_scan_id = [
            index
            for index, finding in enumerate(valid_findings)
            if not finding.get("scan_id")
        ]
        missing_detected_at = [
            index
            for index, finding in enumerate(valid_findings)
            if not finding.get("detected_at")
        ]
        if not missing_scan_id and not missing_detected_at:
            checks.append(_make_check("所有 finding 均带 scan_id 与 detected_at", True))
        else:
            detail = []
            if missing_scan_id:
                detail.append(f"缺 scan_id 的 finding 下标: {missing_scan_id}")
            if missing_detected_at:
                detail.append(f"缺 detected_at 的 finding 下标: {missing_detected_at}")
            checks.append(
                _make_check("所有 finding 均带 scan_id 与 detected_at", False, "；".join(detail))
            )

        # 6. score 必须等于用同一 findings 调用 score_findings 的结果。
        if recomputed_score is None:
            checks.append(
                _make_check(
                    "score 与 score_findings 重算结果一致",
                    False,
                    "score_findings 重算失败，详见 degraded_reasons",
                )
            )
        elif not isinstance(input_score, int) or isinstance(input_score, bool):
            checks.append(
                _make_check(
                    "score 与 score_findings 重算结果一致",
                    False,
                    "结果字典缺少合法的 score 字段，无法核对，详见 degraded_reasons",
                )
            )
        elif score_matches:
            checks.append(_make_check("score 与 score_findings 重算结果一致", True))
        else:
            checks.append(
                _make_check(
                    "score 与 score_findings 重算结果一致",
                    False,
                    f"输入 score={input_score}，重算 score={recomputed_score}，二者不一致",
                )
            )

        return {
            "degraded": bool(degraded_reasons),
            "degraded_reasons": degraded_reasons,
            "affected_fields": affected_fields,
            "failed_rule_ids": failed_rule_ids,
            "failure_attributions": failure_attributions,
            "coverage_gaps": coverage_gaps,
            "score_audit": score_audit,
            "checks": checks,
            "incomplete_coverage": bool(failed_rule_ids),
            "incomplete_coverage_reason": _INCOMPLETE_COVERAGE_REASON if failed_rule_ids else None,
        }
    except Exception as exc:  # pragma: no cover - 兜底防御，正常路径不可达
        return _top_level_failure(
            degraded_reasons=[f"审计过程中发生未预期错误，已降级返回: {type(exc).__name__}: {exc}"],
            affected_fields=["result"],
        )


def _join_ids(rule_ids: Sequence[Any]) -> str:
    return ", ".join(str(rule_id) for rule_id in rule_ids)


def _top_level_failure(degraded_reasons: List[str], affected_fields: List[str]) -> Dict[str, Any]:
    """结构差到无法正常审计时的统一降级形状：字段齐全、仍可 JSON 序列化。"""
    return {
        "degraded": True,
        "degraded_reasons": degraded_reasons,
        "affected_fields": affected_fields,
        "failed_rule_ids": [],
        "failure_attributions": [],
        "coverage_gaps": {
            "rules_without_usable_results": {"count": 0, "rule_ids": []},
            "rules_with_only_error": {"count": 0, "rule_ids": []},
            "rules_legacy_unknown": {"count": 0, "rule_ids": []},
        },
        "score_audit": {
            "input_score": None,
            "recomputed_score": None,
            "matches": False,
            "findings_considered": 0,
            "findings_excluded_invalid_severity": 0,
        },
        "checks": [
            _make_check("evaluations 结构有效", False, degraded_reasons[0]),
            _make_check("findings 结构有效", False, degraded_reasons[0]),
            _make_check("失败规则均有评估记录", True),
            _make_check("失败规则不包含只返回空 list 的正常规则", True),
            _make_check("存在未完成规则时显式标注分数不代表完整覆盖", True),
            _make_check("所有 finding 均带 scan_id 与 detected_at", True),
            _make_check(
                "score 与 score_findings 重算结果一致",
                False,
                "输入不可解析，无法重算分数",
            ),
        ],
        "incomplete_coverage": False,
        "incomplete_coverage_reason": None,
    }
