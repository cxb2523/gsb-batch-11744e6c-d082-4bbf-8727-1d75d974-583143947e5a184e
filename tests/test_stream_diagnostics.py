"""Stream-resolution & cache-replay diagnostics (pure-function module)."""

import json
import os
import time

from hearth.stream import pick_audio_stream
from hearth.stream_cache import StreamCache
from hearth.stream_diagnostics import diagnose_stream


def fmt(abr=0, codec="opus", vcodec="none", url="http://x", protocol="https", asr=44100, tbr=None):
    return {"abr": abr, "tbr": tbr, "acodec": codec, "vcodec": vcodec, "url": url,
            "protocol": protocol, "asr": asr}


def snap_formats(formats):
    """The URL-less snapshot view of real yt-dlp-style format dicts."""
    return [{
        "has_url": bool(f.get("url")),
        "acodec": f.get("acodec"),
        "vcodec": f.get("vcodec"),
        "protocol": f.get("protocol"),
        "abr": f.get("abr"),
        "tbr": f.get("tbr"),
        "asr": f.get("asr"),
    } for f in formats]


def make_snapshot(video_id="vid1", formats=None, cache=None, incoming_bytes=128,
                  resolve=None):
    return {
        "video_id": video_id,
        "formats": formats if formats is not None else [],
        "resolve": resolve or {"has_url": True, "loudness_is_none": False},
        "cache": cache or {"max_bytes": 1024, "entries": []},
        "incoming_bytes": incoming_bytes,
    }


def check(report, name):
    return next(c for c in report["checks"] if c["name"] == name)


def build_real_cache(tmp_path, entries, max_bytes):
    """Materialize a snapshot's cache entries as a real on-disk StreamCache."""
    cache = StreamCache(tmp_path / "pantry", max_bytes=max_bytes)
    cache.root.mkdir(parents=True, exist_ok=True)
    now = time.time()
    for e in entries:
        path = cache.root / f"{e['id']}.audio"
        path.write_bytes(b"x" * e["bytes"])
        mtime = now + e["mtime"]          # snapshot mtimes are relative offsets
        os.utime(path, (mtime, mtime))
    return cache


# --- normal path: mixed video/HLS/progressive formats ---

def test_normal_path_matches_picker_and_names_strict_branch():
    formats = [
        fmt(abr=400, codec="none", vcodec="avc1", url="video"),       # video stream
        fmt(abr=140, protocol="m3u8", url="hls"),                     # HLS audio
        fmt(abr=130, protocol="https", url="progressive"),            # progressive
        fmt(abr=999, url=""),                                         # url-less
    ]
    report = diagnose_stream(make_snapshot(formats=snap_formats(formats)))

    best = pick_audio_stream(formats)
    expected_index = next(i for i, f in enumerate(formats) if f is best)
    assert report["selected_index"] == expected_index
    assert report["playable"] is True
    assert report["selection"]["relaxed"] is False
    assert "纯音频" in report["selection"]["reason"]
    assert report["selection"]["sort_basis"] == [
        "progressive_first", "bitrate_desc", "sample_rate_desc"]
    assert check(report, "formats_playable")["passed"] is True


def test_relaxed_branch_when_no_audio_only_format():
    formats = [
        fmt(abr=50, protocol="m3u8", url="only-hls", vcodec="avc1", codec="mp4a"),
    ]
    report = diagnose_stream(make_snapshot(formats=snap_formats(formats)))

    best = pick_audio_stream(formats)
    assert best is not None
    assert report["selected_index"] == 0
    assert report["selection"]["relaxed"] is True
    assert "放宽" in report["selection"]["reason"]


def test_selection_matches_picker_item_for_item():
    formats = [
        fmt(abr=70, url="low"),
        fmt(abr=160, url="high", asr=48000),
        fmt(abr=160, url="high-hls", protocol="m3u8", asr=48000),
        fmt(abr=128, url="mid"),
    ]
    report = diagnose_stream(make_snapshot(formats=snap_formats(formats)))
    best = pick_audio_stream(formats)
    picked = formats[report["selected_index"]]
    # item-for-item equality on every field the picker considers
    for key in ("url", "acodec", "vcodec", "protocol", "abr", "tbr", "asr"):
        assert picked.get(key) == best.get(key)


# --- negative paths: nothing playable ---

def test_all_formats_urlless_is_unplayable():
    formats = [fmt(abr=100, url=""), fmt(abr=200, url="")]
    report = diagnose_stream(make_snapshot(formats=snap_formats(formats)))
    assert report["playable"] is False
    assert report["selected_index"] is None
    c = check(report, "formats_playable")
    assert c["passed"] is False
    assert c["reason"]


def test_only_video_streams_is_unplayable():
    formats = [
        fmt(abr=400, codec="none", vcodec="avc1", url="v1"),
        fmt(abr=800, codec="none", vcodec="av01", url="v2"),
    ]
    report = diagnose_stream(make_snapshot(formats=snap_formats(formats)))
    assert report["playable"] is False
    assert report["selected_index"] is None
    assert check(report, "formats_playable")["passed"] is False


# --- edge paths: bad ids, empty data, exact-cap cache ---

def test_path_traversal_id_cannot_be_stored():
    report = diagnose_stream(make_snapshot(video_id="../evil"))
    assert report["cache"]["id_valid"] is False
    assert report["cache"]["will_store"] is False
    c = check(report, "cache_id_valid")
    assert c["passed"] is False
    assert c["reason"]


def test_empty_id_cannot_be_stored():
    report = diagnose_stream(make_snapshot(video_id=""))
    assert report["cache"]["id_valid"] is False
    assert report["cache"]["will_store"] is False
    assert check(report, "cache_id_valid")["passed"] is False


def test_empty_payload_cannot_be_stored():
    report = diagnose_stream(make_snapshot(incoming_bytes=0))
    assert report["cache"]["will_store"] is False
    c = check(report, "cache_data_nonempty")
    assert c["passed"] is False
    assert c["reason"]


def test_cache_exactly_at_cap_trims_nothing(tmp_path):
    entries = [
        {"id": "a", "bytes": 600, "mtime": 100.0},
        {"id": "b", "bytes": 424, "mtime": 200.0},
    ]
    snap = make_snapshot(cache={"max_bytes": 1024, "entries": entries})
    report = diagnose_stream(snap)
    assert report["cache"]["trim"]["removed_ids"] == []
    assert report["cache"]["trim"]["remaining_bytes"] == 1024

    cache = build_real_cache(tmp_path, entries, max_bytes=1024)
    assert cache.trim(keep="vid1") == 0
    assert cache.size() == 1024


# --- consistency with a real StreamCache.trim on disk ---

def test_trim_matches_real_cache_eviction(tmp_path):
    entries = [
        {"id": "old", "bytes": 300, "mtime": 100.0},
        {"id": "mid", "bytes": 300, "mtime": 200.0},
        {"id": "new", "bytes": 300, "mtime": 300.0},
        {"id": "vid1", "bytes": 500, "mtime": 400.0},
    ]
    snap = make_snapshot(video_id="vid1",
                         cache={"max_bytes": 1024, "entries": entries})
    report = diagnose_stream(snap)

    cache = build_real_cache(tmp_path, entries, max_bytes=1024)
    removed = cache.trim(keep="vid1")
    remaining_ids = sorted(p.stem for p in cache.root.glob("*.audio"))

    assert removed == len(report["cache"]["trim"]["removed_ids"])
    assert sorted(report["cache"]["trim"]["removed_ids"]) == ["mid", "old"]
    assert remaining_ids == ["new", "vid1"]
    assert cache.size() == report["cache"]["trim"]["remaining_bytes"] == 800
    assert check(report, "keep_survives_trim")["passed"] is True


def test_keep_protection_allows_staying_over_cap(tmp_path):
    # The only evictable entry is the kept one: trim prefers the
    # over-cap state over deleting the protected id.
    entries = [
        {"id": "vid1", "bytes": 900, "mtime": 100.0},
        {"id": "vid1b", "bytes": 900, "mtime": 200.0},
    ]
    # vid1b is also protected indirectly? No — only vid1 is kept, so
    # vid1b goes, vid1 stays, and 900 <= 1024 ends the round. To force
    # the over-cap case, make the kept entry alone exceed the cap.
    entries = [
        {"id": "vid1", "bytes": 1500, "mtime": 100.0},
    ]
    snap = make_snapshot(video_id="vid1",
                         cache={"max_bytes": 1024, "entries": entries})
    report = diagnose_stream(snap)
    assert report["cache"]["trim"]["removed_ids"] == []
    assert report["cache"]["trim"]["remaining_bytes"] == 1500  # over cap, kept

    cache = build_real_cache(tmp_path, entries, max_bytes=1024)
    assert cache.trim(keep="vid1") == 0
    assert cache.size() == 1500
    assert cache.has("vid1")


def test_hit_marks_and_recency_refresh():
    entries = [
        {"id": "vid1", "bytes": 100, "mtime": 100.0},   # coldest before the hit
        {"id": "other", "bytes": 100, "mtime": 200.0},
    ]
    report = diagnose_stream(make_snapshot(
        video_id="vid1", cache={"max_bytes": 1024, "entries": entries}))
    assert report["cache"]["hit"] is True
    assert report["cache"]["recency_order_before"] == ["vid1", "other"]
    # the touch lifts the hit id to warmest, changing eviction order
    assert report["cache"]["recency_order_after"] == ["other", "vid1"]
    assert check(report, "hit_refreshes_recency")["passed"] is True


def test_miss_reports_no_hit():
    report = diagnose_stream(make_snapshot(video_id="ghost"))
    assert report["cache"]["hit"] is False


# --- report shape ---

def test_report_is_json_serializable_and_hides_urls():
    formats = [
        fmt(abr=140, protocol="m3u8", url="https://secret-cdn.example/hls"),
        fmt(abr=130, url="https://secret-cdn.example/progressive"),
    ]
    entries = [{"id": "vid1", "bytes": 100, "mtime": 100.0}]
    report = diagnose_stream(make_snapshot(
        formats=snap_formats(formats),
        cache={"max_bytes": 1024, "entries": entries}))
    blob = json.dumps(report)   # must not raise
    assert "secret-cdn" not in blob
    assert "placeholder" not in blob
    assert isinstance(report["checks"], list)
    assert all(set(c) == {"name", "passed", "reason"} for c in report["checks"])
