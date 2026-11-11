"""CLI verify: recorded report_hash vs in-process rerun."""
import json
from pathlib import Path

from mcp_authscan.monolith import PROBE_SET_VERSION
from mcp_authscan.report_verify import HASH_SCHEME, HASHED_KEYS, compute
from mcp_authscan import verify


def _minimal_payload():
    data = {
        "target": "http://127.0.0.1:9002/mcp",
        "scan_mode": "LIVE_ENDPOINT_ASSESSMENT",
        "probe_set_version": PROBE_SET_VERSION,
        "probes": [],
        "counts": {},
        "coverage": {},
        "completed": [],
        "not_implemented": [],
        "not_tested": [],
        "scope": "",
        "exit_contract": "",
        "exit_condition": "",
        "exit_code": 0,
        "fail_on": "high",
        "authorization": {},
        "hash_scheme": HASH_SCHEME,
        "findings": [],
        "report_hash": "",
    }
    assert set(HASHED_KEYS).issubset(data)
    data["report_hash"] = compute(data, [])[0]
    return data


def _write(tmp_path, payload):
    path = Path(tmp_path) / "report.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_self_consistent_report_matches(tmp_path, monkeypatch, capsys):
    payload = _minimal_payload()
    path = _write(tmp_path, payload)

    def fake_rerun(target, extra_args):
        return json.loads(json.dumps(payload))

    monkeypatch.setattr(verify, "_rerun", fake_rerun)
    rc = verify.main([str(path)])
    out = capsys.readouterr().out.splitlines()
    assert rc == 0
    assert out[0] == "MATCH"


def test_edited_content_fails_integrity(tmp_path, monkeypatch, capsys):
    payload = _minimal_payload()
    payload["counts"] = {"pass": 99}
    path = _write(tmp_path, payload)

    def fake_rerun(target, extra_args):
        raise AssertionError("rerun must not run on a tampered report")

    monkeypatch.setattr(verify, "_rerun", fake_rerun)
    rc = verify.main([str(path)])
    out = capsys.readouterr().out.splitlines()
    assert rc == 1
    assert out[0] == "INTEGRITY"
    assert out[1] == "report_hash"


def test_rerun_drift_diverges(tmp_path, monkeypatch, capsys):
    payload = _minimal_payload()
    path = _write(tmp_path, payload)
    drifted = json.loads(json.dumps(payload))
    drifted["counts"] = {"pass": 1}

    def fake_rerun(target, extra_args):
        return drifted

    monkeypatch.setattr(verify, "_rerun", fake_rerun)
    rc = verify.main([str(path)])
    out = capsys.readouterr().out.splitlines()
    assert rc == 1
    assert out[0] == "DIVERGENCE"


def test_missing_report_hash_not_reproducible(tmp_path, monkeypatch, capsys):
    payload = _minimal_payload()
    payload["report_hash"] = ""
    path = _write(tmp_path, payload)

    def fake_rerun(target, extra_args):
        raise AssertionError("rerun must not run without a report_hash")

    monkeypatch.setattr(verify, "_rerun", fake_rerun)
    rc = verify.main([str(path)])
    out = capsys.readouterr().out.splitlines()
    assert rc == 2
    assert out[0] == "NOT_REPRODUCIBLE"


def test_non_string_report_hash_not_reproducible(tmp_path, monkeypatch, capsys):
    for bad_hash in (12345, ["abc"], {"hash": "abc"}, 12.5):
        payload = _minimal_payload()
        payload["report_hash"] = bad_hash
        path = _write(tmp_path, payload)

        def fake_rerun(target, extra_args):
            raise AssertionError("rerun must not run on a non-string report_hash")

        monkeypatch.setattr(verify, "_rerun", fake_rerun)
        rc = verify.main([str(path)])
        out = capsys.readouterr().out.splitlines()
        assert rc == 2, bad_hash
        assert out[0] == "NOT_REPRODUCIBLE", bad_hash


def test_tampered_report_hash_fails_integrity(tmp_path, monkeypatch, capsys):
    payload = _minimal_payload()
    payload["report_hash"] = "0" * 64  # valid string, wrong value
    path = _write(tmp_path, payload)

    def fake_rerun(target, extra_args):
        raise AssertionError("rerun must not run on a tampered report")

    monkeypatch.setattr(verify, "_rerun", fake_rerun)
    rc = verify.main([str(path)])
    out = capsys.readouterr().out.splitlines()
    assert rc == 1
    assert out[0] == "INTEGRITY"
    assert out[1] == "report_hash"
