#!/usr/bin/env python3
"""audit.py — offline "snapshot audit" for ph-stocks.

Pure functions that audit a captured PSE Edge HTML page without any network
or disk access. Field extraction is delegated to update.parse() /
update.parse_idx(), so audited fields are guaranteed to be identical to the
live pipeline; this module only adds the main()-style degradation logic
(suspended → previous close) plus an ordered list of human-readable checks.

Public entry points:
    audit_stock(html, symbol, name) -> dict
    audit_index(html)               -> dict

Both return JSON-serializable plain data (no regex objects, functions, or
exception instances) and never raise on malformed/empty input.
"""
import math

import update

# Markers used only to judge whether the HTML looks like the target page.
_STOCK_MARKERS = ("compInfo", "Last Traded Price", "stockData", "<th>")
_INDEX_MARKERS = ("MARKET", 'class="label"', "form.do", "alignL")

# Fields every stock audit result must contain (None when unavailable).
_STOCK_REQUIRED_KEYS = (
    "symbol", "name", "as_of", "last_traded_price", "previous_close",
    "change", "change_amount", "change_pct", "volume", "value",
    "market_cap", "status",
)


def _json_safe(v):
    """Recursively replace non-finite floats (NaN/inf) with None so the
    result is strictly JSON-serializable."""
    if isinstance(v, float) and not math.isfinite(v):
        return None
    if isinstance(v, dict):
        return {k: _json_safe(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_json_safe(x) for x in v]
    return v


def _check(name, passed, reason=None):
    return {"name": name, "passed": bool(passed), "reason": reason}


def audit_stock(html, symbol, name):
    """Audit one stockData.do page snapshot.

    Returns a dict with all parse() fields (plus the required keys above,
    defaulting to None), a "note" field (set when the suspended fallback
    applies, mirroring main()), and "checks": an ordered list of
    {"name", "passed", "reason"} items.
    """
    if not isinstance(html, str):
        html = ""
    recognized = any(m in html for m in _STOCK_MARKERS)

    parse_error = None
    try:
        q = update.parse(html, symbol, name)
    except Exception as e:  # never let a parse failure escape
        parse_error = repr(e)
        q = {"symbol": symbol, "name": name, "as_of": None, "logo_url": None}

    for k in _STOCK_REQUIRED_KEYS:
        q.setdefault(k, None)
    q["symbol"] = symbol
    if not q.get("name"):
        q["name"] = name

    # Degradation branch identical to update.main().
    note = q.get("note")
    fallback = False
    if q.get("last_traded_price") is None:
        if str(q.get("status") or "").lower() == "suspended" \
                and q.get("previous_close") is not None:
            q["last_traded_price"] = q["previous_close"]
            note = "Suspended — showing previous close"
            fallback = True

    checks = [
        _check("page_recognized", recognized,
               None if recognized else "HTML 为空或不像 stockData.do 页面，字段均为降级值"),
    ]
    if parse_error is not None:
        checks.append(_check("parse", False, f"解析抛出异常: {parse_error}"))
    checks.append(_check(
        "as_of", q.get("as_of") is not None,
        None if q.get("as_of") is not None else "页面缺少 'As of' 时间戳，as_of 为 None"))
    if fallback:
        checks.append(_check(
            "suspended_fallback", True,
            "停牌回退到前收：last_traded_price 采用 previous_close "
            f"({q.get('previous_close')})"))
        checks.append(_check("last_traded_price", True))
    else:
        ok = q.get("last_traded_price") is not None
        checks.append(_check(
            "last_traded_price", ok,
            None if ok else
            f"缺少 Last Traded Price 且不满足停牌回退条件 "
            f"(status={q.get('status')!r})，最新价不可用"))
    ch_ok = all(q.get(k) is not None
                for k in ("change", "change_amount", "change_pct"))
    checks.append(_check(
        "change_parsed", ch_ok,
        None if ch_ok else
        "Change(% Change) 无法匹配，change/change_amount/change_pct 均为 None"))

    result = _json_safe(q)
    result["note"] = note
    result["checks"] = checks
    return result


def audit_index(html):
    """Audit one index/form.do page snapshot.

    Returns {"market_status", "as_of", "indices", "market_summary", "checks"}
    where the first four keys match parse_idx() exactly (index rows with an
    empty change keep None, never 0).
    """
    if not isinstance(html, str):
        html = ""
    recognized = any(m in html for m in _INDEX_MARKERS)

    parse_error = None
    try:
        idx = update.parse_idx(html)
    except Exception as e:
        parse_error = repr(e)
        idx = {"as_of": None, "market_status": None,
               "indices": [], "market_summary": {}}
    idx.setdefault("as_of", None)
    idx.setdefault("market_status", None)
    idx.setdefault("indices", [])
    idx.setdefault("market_summary", {})

    checks = [
        _check("page_recognized", recognized,
               None if recognized else "HTML 为空或不像 index/form.do 页面，字段均为降级值"),
    ]
    if parse_error is not None:
        checks.append(_check("parse", False, f"解析抛出异常: {parse_error}"))
    checks.append(_check(
        "market_status", idx.get("market_status") is not None,
        None if idx.get("market_status") is not None else "页面缺少 MARKET 状态标记"))
    checks.append(_check(
        "as_of", idx.get("as_of") is not None,
        None if idx.get("as_of") is not None else "页面缺少 'As of' 时间戳，as_of 为 None"))
    checks.append(_check(
        "indices_present", bool(idx.get("indices")),
        None if idx.get("indices") else "未解析到任何指数行"))
    checks.append(_check(
        "market_summary_present", bool(idx.get("market_summary")),
        None if idx.get("market_summary") else "未解析到市场汇总数据"))

    result = _json_safe(idx)
    result["checks"] = checks
    return result
