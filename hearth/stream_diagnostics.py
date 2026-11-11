"""Pure-function diagnostics for stream resolution and cache replay.

Given a plain-data snapshot (no yt-dlp objects, no network, no real
cache directory), explain what the playback pipeline *would* do:

* which format ``pick_audio_stream`` selects, and why (strict audio-only
  branch vs. the relaxed any-audio fallback, and the sort basis);
* whether the request hits or writes the stream cache;
* what a post-write ``trim(keep=...)`` would evict and what total would
  remain;
* an ordered checklist of the invariants the pipeline relies on.

The module never imports yt_dlp, never touches the network, and never
reads or writes the real cache directory. The returned report contains
no format URLs — only indices and metadata — and is JSON-serializable.
"""

from __future__ import annotations

from .stream import pick_audio_stream

# A stand-in URL for snapshot formats flagged ``has_url``. The picker
# only tests truthiness, so any non-empty placeholder reproduces the
# real selection exactly without leaking a real URL into the report.
_PLACEHOLDER_URL = "diagnostic://placeholder"


def _slot_ok(video_id: object) -> bool:
    """Mirror of StreamCache._slot's validity rule, without the path."""
    vid = str(video_id or "").strip()
    return bool(vid) and "/" not in vid and "\\" not in vid and vid not in (".", "..")


def _synthetic_formats(formats: list[dict]) -> list[dict]:
    """Rebuild picker-compatible format dicts from the URL-less snapshot."""
    synthetic = []
    for f in formats or []:
        synthetic.append({
            "url": _PLACEHOLDER_URL if f.get("has_url") else "",
            "acodec": f.get("acodec"),
            "vcodec": f.get("vcodec"),
            "protocol": f.get("protocol"),
            "abr": f.get("abr"),
            "tbr": f.get("tbr"),
            "asr": f.get("asr"),
        })
    return synthetic


def _audio_only(formats: list[dict]) -> list[dict]:
    return [
        f for f in formats
        if f.get("url")
        and f.get("acodec") not in (None, "none")
        and f.get("vcodec") in (None, "none")
    ]


def _any_audio(formats: list[dict]) -> list[dict]:
    return [
        f for f in formats
        if f.get("url") and f.get("acodec") not in (None, "none")
    ]


def _simulate_trim(entries: list[dict], max_bytes: int, keep: str) -> tuple[list[str], int]:
    """Replay StreamCache.trim on snapshot entries.

    Same coldest-first (mtime, then id) order, same keep protection,
    same "stop as soon as the total fits" rule — including the case
    where the only evictable entry is kept and the cap stays exceeded.
    """
    cap = max(1, int(max_bytes))
    items = sorted(
        (
            (float(e.get("mtime", 0.0)), str(e.get("id", "")), int(e.get("bytes", 0)))
            for e in entries or []
        ),
        key=lambda item: (item[0], item[1]),
    )
    total = sum(size for _mtime, _vid, size in items)
    removed: list[str] = []
    for _mtime, vid, size in items:
        if total <= cap:
            break
        if vid == keep:
            continue
        total -= size
        removed.append(vid)
    return removed, total


def diagnose_stream(snapshot: dict) -> dict:
    """Build a JSON-serializable diagnostics report from a pure-data snapshot.

    Expected snapshot shape (all plain data)::

        {
            "video_id": str,
            "formats": [{"has_url": bool, "acodec": ..., "vcodec": ...,
                         "protocol": ..., "abr": ..., "tbr": ..., "asr": ...}],
            "resolve": {"has_url": bool, "loudness_is_none": bool},
            "cache": {"max_bytes": int,
                      "entries": [{"id": str, "bytes": int, "mtime": float}]},
            "incoming_bytes": int,   # size of the payload a store() would write
        }
    """
    snapshot = snapshot or {}
    video_id = str(snapshot.get("video_id") or "")
    formats = list(snapshot.get("formats") or [])
    resolve = dict(snapshot.get("resolve") or {})
    cache = dict(snapshot.get("cache") or {})
    entries = list(cache.get("entries") or [])
    max_bytes = int(cache.get("max_bytes", 0) or 0)
    incoming_bytes = int(snapshot.get("incoming_bytes", 0) or 0)

    # --- format selection (delegates to the real picker for parity) ---
    synthetic = _synthetic_formats(formats)
    best = pick_audio_stream(synthetic)
    selected_index = next(
        (i for i, f in enumerate(synthetic) if f is best), None
    )
    strict = _audio_only(synthetic)
    relaxed = not strict and bool(_any_audio(synthetic))
    if best is None:
        selection_reason = "没有任何带 url 且含音轨的格式，解析结果不可播放"
    elif relaxed:
        selection_reason = "无纯音频格式，走放宽分支（任意含音轨格式）后再排序"
    else:
        selection_reason = "纯音频分支直选，按 progressive 优先、码率、采样率降序"

    # --- cache replay ---
    id_valid = _slot_ok(video_id)
    known_ids = [str(e.get("id", "")) for e in entries]
    hit = id_valid and video_id in known_ids
    will_store = id_valid and incoming_bytes > 0
    keep = video_id if id_valid else ""
    removed_ids, remaining_bytes = _simulate_trim(entries, max_bytes, keep)

    # Recency order before/after a hit's mtime touch.
    order_before = [vid for _m, vid, _s in sorted(
        ((float(e.get("mtime", 0.0)), str(e.get("id", "")), int(e.get("bytes", 0))) for e in entries),
        key=lambda item: (item[0], item[1]),
    )]
    order_after = list(order_before)
    if hit and video_id in order_after:
        order_after.remove(video_id)
        order_after.append(video_id)  # touched to "now": becomes warmest

    # --- ordered checks ---
    checks: list[dict] = []

    checks.append({
        "name": "formats_playable",
        "passed": best is not None,
        "reason": None if best is not None else
                  "无可用格式：全部缺 url 或仅为视频流，不可播放",
    })
    checks.append({
        "name": "cache_id_valid",
        "passed": id_valid,
        "reason": None if id_valid else
                  "video_id 为空、含路径分隔符或为 . / ..，不可写入缓存",
    })
    checks.append({
        "name": "cache_data_nonempty",
        "passed": incoming_bytes > 0,
        "reason": None if incoming_bytes > 0 else
                  "待写入数据为空，store 会拒绝写入",
    })
    keep_safe = keep not in removed_ids
    checks.append({
        "name": "keep_survives_trim",
        "passed": keep_safe,
        "reason": None if keep_safe else
                  f"keep 保护的 id {keep!r} 被本轮 trim 删除",
    })
    if hit:
        recency_ok = bool(order_after) and order_after[-1] == video_id
        checks.append({
            "name": "hit_refreshes_recency",
            "passed": recency_ok,
            "reason": None if recency_ok else
                      "命中后 mtime 未刷新到最新，淘汰顺序未改变",
        })
    else:
        checks.append({
            "name": "hit_refreshes_recency",
            "passed": True,
            "reason": "未命中缓存，无 mtime 刷新",
        })

    return {
        "video_id": video_id,
        "playable": best is not None,
        "selected_index": selected_index,
        "selection": {
            "relaxed": relaxed,
            "sort_basis": ["progressive_first", "bitrate_desc", "sample_rate_desc"],
            "reason": selection_reason,
        },
        "resolve": {
            "has_url": bool(resolve.get("has_url")),
            "loudness_is_none": bool(resolve.get("loudness_is_none", True)),
        },
        "cache": {
            "hit": hit,
            "id_valid": id_valid,
            "will_store": will_store,
            "max_bytes": max(1, max_bytes),
            "total_bytes_before": sum(int(e.get("bytes", 0)) for e in entries),
            "trim": {
                "keep": keep,
                "removed_ids": removed_ids,
                "remaining_bytes": remaining_bytes,
            },
            "recency_order_before": order_before,
            "recency_order_after": order_after,
        },
        "checks": checks,
    }
