"""Storage backend tests: local disk and the object-store (cloud) backend.

The cloud tests use cloudpathlib's built-in local S3 mock, so they need neither
boto3 nor a real AWS account — they exercise the same CloudStorage code paths
against a temp directory.
"""

import pytest

from app.core import settings as settings_mod
from app.core import storage


# --------------------------------------------------------------------------
# Shared key guard
# --------------------------------------------------------------------------

@pytest.mark.parametrize("bad", ["../escape", "a/../../b", "..", ""])
def test_key_guard_rejects_traversal_and_empty(bad):
    with pytest.raises(storage.StorageError):
        storage._clean_key("tickets", bad)


def test_key_guard_rejects_unknown_category():
    with pytest.raises(storage.StorageError):
        storage._clean_key("ticket", "x.png")  # note: "ticket", not "tickets"


def test_key_guard_normalises_subdirs_and_separators():
    assert storage._clean_key("lifecycle", "7/doc.pdf") == "7/doc.pdf"
    assert storage._clean_key("lifecycle", "\\7\\doc.pdf") == "7/doc.pdf"
    # an absolute-looking key is pinned to a plain relative key, not honoured
    assert storage._clean_key("lifecycle", "/etc/passwd") == "etc/passwd"


# --------------------------------------------------------------------------
# Local disk backend
# --------------------------------------------------------------------------

@pytest.fixture
def local_store(tmp_path):
    return storage.LocalStorage(tmp_path / "uploads")


def test_local_roundtrip_and_subdir_key(local_store):
    local_store.save("tickets", "1_1_a.png", b"hi")
    assert local_store.exists("tickets", "1_1_a.png")
    with local_store.open("tickets", "1_1_a.png") as fh:
        assert fh.read() == b"hi"

    local_store.save("lifecycle", "7/doc.pdf", b"%PDF-")
    path = local_store.local_path("lifecycle", "7/doc.pdf")
    assert path.is_file() and path.parent.name == "7"

    local_store.delete("tickets", "1_1_a.png")
    assert not local_store.exists("tickets", "1_1_a.png")


def test_local_absolute_key_is_rerooted(local_store):
    local_store.save("lifecycle", "/etc/passwd", b"x")
    assert local_store.exists("lifecycle", "etc/passwd")


def test_default_local_dir_is_project_root_data():
    assert storage._default_data_dir() == settings_mod.BASE_DIR.parent / "data" / "uploads"


# --------------------------------------------------------------------------
# Object-store (cloud) backend — cloudpathlib local S3 mock
# --------------------------------------------------------------------------

@pytest.fixture
def cloud_store():
    from cloudpathlib.local import LocalS3Client, LocalS3Path

    LocalS3Client().set_as_default_client()  # fresh temp-backed store per test
    return storage.CloudStorage(LocalS3Path("s3://test-bucket/prefix"))


def test_cloud_roundtrip_and_object_path(cloud_store):
    cloud_store.save("tickets", "9_1_x.png", b"bytes")
    assert cloud_store.exists("tickets", "9_1_x.png")
    with cloud_store.open("tickets", "9_1_x.png") as fh:
        assert fh.read() == b"bytes"

    cloud_store.save("lifecycle", "3/r.pdf", b"%PDF-")
    assert str(cloud_store._resolve("lifecycle", "3/r.pdf")) == "s3://test-bucket/prefix/lifecycle/3/r.pdf"

    cloud_store.delete("tickets", "9_1_x.png")
    assert not cloud_store.exists("tickets", "9_1_x.png")


def test_cloud_has_no_local_path(cloud_store):
    cloud_store.save("tickets", "k.txt", b"x")
    # None is the caller's signal to stream rather than serve off disk.
    assert cloud_store.local_path("tickets", "k.txt") is None


def test_cloud_key_guard(cloud_store):
    with pytest.raises(storage.StorageError):
        cloud_store._resolve("lifecycle", "../escape")


# --------------------------------------------------------------------------
# serve_stored_file: FileResponse for local, StreamingResponse for remote
# --------------------------------------------------------------------------

def test_serve_local_returns_file_response(monkeypatch, local_store):
    from fastapi.responses import FileResponse

    local_store.save("tickets", "s.txt", b"disk-bytes")
    monkeypatch.setattr(storage, "get_storage", lambda: local_store)
    resp = storage.serve_stored_file("tickets", "s.txt", filename="s.txt", media_type="text/plain")
    assert isinstance(resp, FileResponse)


def test_serve_remote_returns_streaming_response(monkeypatch, cloud_store):
    from fastapi.responses import StreamingResponse

    cloud_store.save("tickets", "s.txt", b"streamed-bytes")
    monkeypatch.setattr(storage, "get_storage", lambda: cloud_store)
    resp = storage.serve_stored_file(
        "tickets", "s.txt", filename="s.txt", media_type="text/plain",
        disposition="inline", extra_headers={"X-Content-Type-Options": "nosniff"},
    )
    assert isinstance(resp, StreamingResponse)
    assert resp.headers["content-disposition"].startswith("inline")
    assert resp.headers["x-content-type-options"] == "nosniff"


def test_serve_missing_file_raises_not_found(monkeypatch, cloud_store):
    monkeypatch.setattr(storage, "get_storage", lambda: cloud_store)
    with pytest.raises(FileNotFoundError):
        storage.serve_stored_file("tickets", "nope.txt", filename="nope.txt", media_type="text/plain")


# --------------------------------------------------------------------------
# Factory: a remote URL without the provider SDK fails with a clear pointer
# --------------------------------------------------------------------------

def test_factory_remote_url_without_sdk_raises(monkeypatch):
    # cloudpathlib core is installed here but boto3 is not, so building the S3
    # path raises MissingDependenciesError, which the factory turns into a clear
    # "install the extra" RuntimeError.
    monkeypatch.setenv("APP_STORAGE_URL", "s3://bucket/prefix")
    storage.get_storage.cache_clear()
    settings_mod.get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError, match=r"\[s3\]"):
            storage.get_storage()
    finally:
        storage.get_storage.cache_clear()
        settings_mod.get_settings.cache_clear()
