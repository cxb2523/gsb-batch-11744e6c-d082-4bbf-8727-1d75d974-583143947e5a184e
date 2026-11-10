"""Tests for the hardened ticket file-upload endpoint.

Covers the behaviour that changed when validation moved from the spoofable
content_type to a curated extension allowlist, plus the path-traversal fix:

* a listed extension is accepted,
* a disallowed extension is rejected even when the content_type is faked,
* a filename carrying directory components is stripped to its basename and can
  never escape the tickets storage folder,
* oversize files and nameless files are rejected.

Uploads go through the shared storage backend (``app/core/storage.py``); each
test points it at a throwaway directory so real uploads are never touched.
"""

import pytest

from app.core import settings as settings_mod
from app.core import storage as storage_mod

pytestmark = pytest.mark.anyio

PROJECT = 9001
TICKET = 7001
URL = f"/projects/{PROJECT}/tickets/{TICKET}/files"


@pytest.fixture(autouse=True)
def storage_tmp(tmp_path, monkeypatch):
    """Point file storage at a throwaway dir so tests never touch real uploads."""
    monkeypatch.setenv("APP_STORAGE_URL", "")
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path / "uploads"))
    storage_mod.get_storage.cache_clear()
    settings_mod.get_settings.cache_clear()
    yield
    storage_mod.get_storage.cache_clear()
    settings_mod.get_settings.cache_clear()


@pytest.fixture
async def seeded(mongo_db):
    """A project + ticket the upload endpoint can attach files to."""
    await mongo_db.projects.insert_one({"project_id": PROJECT, "name": "Uploads"})
    await mongo_db.tickets.insert_one(
        {"ticket_number": TICKET, "project_id": PROJECT, "key": "UP-1",
         "title": "Upload target", "status_id": 1},
    )
    yield mongo_db


async def test_allowed_extension_is_accepted(api, seeded):
    resp = await api.post(
        URL, files=[("files", ("shot.png", b"\x89PNG fake bytes", "image/png"))]
    )
    assert resp.status_code == 200, resp.text
    stored = await seeded.ticket_files.find_one({"ticket_id": TICKET})
    assert stored is not None
    assert stored["filename"] == "shot.png"
    # The bytes really landed in the tickets storage folder.
    assert storage_mod.get_storage().exists("tickets", stored["file_path"])


async def test_disallowed_extension_rejected_even_with_faked_content_type(api, seeded):
    # .exe is not on the allowlist; the image/png content_type must not save it.
    resp = await api.post(
        URL, files=[("files", ("malware.exe", b"MZ...", "image/png"))]
    )
    assert resp.status_code == 400
    assert "unsupported type" in resp.json()["detail"].lower()
    assert await seeded.ticket_files.count_documents({"ticket_id": TICKET}) == 0


async def test_path_traversal_filename_is_sanitised(api, seeded):
    # Carry a real PNG signature so the upload clears the content-signature gate
    # and the test actually exercises the path-traversal sanitisation.
    resp = await api.post(
        URL,
        files=[("files", ("../../../../etc/evil.png", b"\x89PNG fake bytes", "image/png"))],
    )
    assert resp.status_code == 200, resp.text
    stored = await seeded.ticket_files.find_one({"ticket_id": TICKET})
    # The directory components are gone: only the basename survives.
    assert stored["filename"] == "evil.png"
    # Stored as a bare key (no directory parts) and the physical file lives inside
    # the tickets storage folder — the backend's guard keeps it there.
    key = stored["file_path"]
    assert "/" not in key and "\\" not in key
    path = storage_mod.get_storage().local_path("tickets", key)
    assert path.is_file() and path.parent.name == "tickets"


async def test_oversize_file_rejected(api, seeded):
    too_big = b"0" * (10 * 1024 * 1024 + 1)
    resp = await api.post(URL, files=[("files", ("big.pdf", too_big, "application/pdf"))])
    assert resp.status_code == 400
    assert "10mb" in resp.json()["detail"].lower()
    assert await seeded.ticket_files.count_documents({"ticket_id": TICKET}) == 0


async def test_nameless_upload_is_rejected(api, seeded):
    resp = await api.post(URL, files=[("files", ("", b"data", "image/png"))])
    # Starlette parses an empty-filename part as a plain form field, so it never
    # satisfies List[UploadFile] (422) and the handler's own basename guard (400)
    # is the backstop for a genuinely None filename. Either way nothing is stored.
    assert resp.status_code in (400, 422)
    assert await seeded.ticket_files.count_documents({"ticket_id": TICKET}) == 0
