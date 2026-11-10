"""Where uploaded files live — one place that decides, one guard that protects.

Every upload in the app (ticket attachments, lifecycle stage attachments) goes
through this module instead of each route computing its own directory. That gives
us:

  * one setting that chooses the location (``APP_STORAGE_URL`` — see
    ``app/core/settings.py``), rather than three hard-coded paths, two of which
    used to sit inside the source tree and one in ``/tmp``;
  * one path guard, so a stored key can never resolve outside its folder (the
    path-traversal protection each route used to re-implement by hand).

Layout. Files are grouped by *category* (``tickets`` / ``lifecycle``) and
addressed by a *key* within that category::

    <root>/<category>/<key>

The key is usually a bare filename, though a category may use ``<sub>/<name>`` to
keep related files together. Keys are treated as relative and sanitised — any
``..`` or absolute component is rejected — so a value read back from the database
can never point at an arbitrary file on disk.

Backends. The location comes from ``APP_STORAGE_URL``:

  * empty (the default), a bare path, or a ``file://`` URL → local disk, which
    adds no new dependencies;
  * ``s3://`` / ``az://`` / ``gs://`` → an object store via cloudpathlib.
    cloudpathlib and the provider SDK install only via extras (``.[s3]`` /
    ``.[azure]`` / ``.[gcs]``); without them such a URL fails at startup with a
    clear pointer rather than silently writing somewhere wrong. Credentials come
    from each provider's own environment (``AWS_*``, ``AZURE_STORAGE_*``,
    ``GOOGLE_APPLICATION_CREDENTIALS``), never from the URL.

For the local backend the default root is a ``data/uploads`` folder at the
project root — a single relative path that resolves the same on Linux, Windows
and macOS, and lives *outside* the backend source tree. ``APP_DATA_DIR``
overrides it (Docker sets it to ``/app/uploads``, the mounted volume).

Serving. A local file is served straight off disk, so callers ask for its real
filesystem path with :meth:`local_path` and hand that to ``FileResponse`` — no
behaviour change from the old code. A future remote backend returns ``None``
there, and the route streams the bytes via :meth:`open` instead.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import BinaryIO, Optional
from urllib.parse import urlparse

from .settings import BASE_DIR, get_settings

# The categories the app stores files under. Kept explicit so a typo in a route
# ("ticket" vs "tickets") fails loudly instead of creating a stray folder.
CATEGORIES = ("tickets", "lifecycle")


class StorageError(RuntimeError):
    """A storage operation was refused — e.g. a key that escapes its folder."""


def _clean_key(category: str, key: str) -> str:
    """Validate ``(category, key)`` and return a normalised relative key.

    Rejects an unknown category, an empty key, and any key containing a ``..``
    segment — cloud path objects *resolve* ``..`` on join, so ``../x`` would
    otherwise climb out of the category folder. Back-slashes are normalised to
    ``/`` and empty / ``.`` segments dropped, so an absolute-looking or
    Windows-style value is pinned to a plain relative key inside the category.
    ``key`` may legitimately carry sub-folders (e.g. ``<sub>/<name>``).
    """
    if category not in CATEGORIES:
        raise StorageError(f"Unknown storage category: {category!r}")
    parts = [p for p in str(key or "").replace("\\", "/").split("/") if p not in ("", ".")]
    if not parts:
        raise StorageError("Empty storage key")
    if ".." in parts:
        raise StorageError(f"Refusing storage key with '..': {key!r}")
    return "/".join(parts)


class LocalStorage:
    """Stores files on the local filesystem under ``<root>/<category>/<key>``."""

    def __init__(self, root: Path) -> None:
        self._root = Path(root).resolve()

    def _resolve(self, category: str, key: str) -> Path:
        """Absolute on-disk path for ``(category, key)``, guaranteed to stay
        inside the category's folder (``_clean_key`` plus a resolved-path check
        as belt and braces against symlinks)."""
        rel = _clean_key(category, key)
        base = (self._root / category).resolve()
        candidate = (base / rel).resolve()
        if candidate != base and base not in candidate.parents:
            raise StorageError(f"Refusing path outside {category} storage: {key!r}")
        return candidate

    def save(self, category: str, key: str, data: bytes) -> None:
        """Write ``data`` for ``(category, key)``, creating parent folders."""
        path = self._resolve(category, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(data)

    def open(self, category: str, key: str) -> BinaryIO:
        """Open the stored object for binary reading."""
        return open(self._resolve(category, key), "rb")

    def exists(self, category: str, key: str) -> bool:
        return self._resolve(category, key).is_file()

    def delete(self, category: str, key: str) -> None:
        """Remove the stored object. A missing file is not an error."""
        path = self._resolve(category, key)
        if path.is_file():
            path.unlink()

    def local_path(self, category: str, key: str) -> Optional[Path]:
        """The real filesystem path, for serving via ``FileResponse`` or staging
        a file another service (e.g. Google Drive) needs by path.

        The local backend always returns a path; a remote backend returns
        ``None``, which is the caller's cue to stream via :meth:`open` instead.
        """
        return self._resolve(category, key)


class CloudStorage:
    """Stores files in an object store (S3 / Azure Blob / GCS) via cloudpathlib.

    Addressed exactly like the local backend — ``<root>/<category>/<key>`` — where
    ``root`` is a cloudpathlib ``CloudPath`` built from ``STORAGE_URL`` (bucket +
    optional prefix). Object stores have no real directories, so ``save`` just
    writes the key. ``local_path`` returns ``None``: a remote object has no
    filesystem path, so callers stream it via :meth:`open` instead of serving a
    file off disk.
    """

    def __init__(self, root) -> None:
        self._root = root  # a cloudpathlib CloudPath (or a local test double)

    def _resolve(self, category: str, key: str):
        # Join one segment at a time so a multi-part key can't be misread, and
        # _clean_key has already stripped any ".." / absolute parts.
        path = self._root / category
        for part in _clean_key(category, key).split("/"):
            path = path / part
        return path

    def save(self, category: str, key: str, data: bytes) -> None:
        self._resolve(category, key).write_bytes(data)

    def open(self, category: str, key: str) -> BinaryIO:
        return self._resolve(category, key).open("rb")

    def exists(self, category: str, key: str) -> bool:
        return self._resolve(category, key).exists()

    def delete(self, category: str, key: str) -> None:
        path = self._resolve(category, key)
        if path.exists():
            path.unlink()

    def local_path(self, category: str, key: str) -> Optional[Path]:
        return None


def _default_data_dir() -> Path:
    """``<project_root>/data/uploads`` — ``BASE_DIR`` is the ``backend/`` dir, so
    its parent is the project root. Outside the source tree, same on every OS."""
    return BASE_DIR.parent / "data" / "uploads"


@lru_cache(maxsize=1)
def get_storage() -> "LocalStorage | CloudStorage":
    """The configured storage backend, built once from settings.

    Mirrors ``get_settings()``: settings are read at import time, so the backend
    is fixed for the life of the process and a change needs a restart.
    """
    settings = get_settings()
    url = (settings.storage_url or "").strip()

    # Local: empty, a bare filesystem path, or an explicit file:// URL.
    if not url or url.startswith("file:") or "://" not in url:
        if url.startswith("file:"):
            root = Path(urlparse(url).path)
        elif url:
            root = Path(url)
        elif settings.data_dir:
            root = Path(settings.data_dir)
        else:
            root = _default_data_dir()
        return LocalStorage(root)

    # A real remote scheme (s3://, az://, gs://, …): build a CloudPath root.
    # cloudpathlib and the provider SDK install via extras (.[s3] / .[azure] /
    # .[gcs]); a local-only install has neither, so fail with a clear pointer
    # rather than an opaque ImportError.
    try:
        from cloudpathlib import AnyPath, CloudPath
        from cloudpathlib.exceptions import MissingDependenciesError
    except ImportError as exc:
        raise RuntimeError(
            f"APP_STORAGE_URL={url!r} selects remote storage, but cloudpathlib "
            "is not installed. Install the matching extra: pip install '.[s3]' "
            "(or '.[azure]' / '.[gcs]')."
        ) from exc
    try:
        root = AnyPath(url)
    except MissingDependenciesError as exc:
        raise RuntimeError(
            f"APP_STORAGE_URL={url!r} needs its provider SDK. Install the "
            "matching extra: pip install '.[s3]' (or '.[azure]' / '.[gcs]')."
        ) from exc
    if not isinstance(root, CloudPath):
        # Past the '://' check this shouldn't happen, but never silently treat a
        # non-cloud path as remote — fall back to local.
        return LocalStorage(Path(str(root)))
    return CloudStorage(root)


def serve_stored_file(
    category: str,
    key: str,
    *,
    filename: str,
    media_type: str,
    disposition: str = "attachment",
    extra_headers: Optional[dict] = None,
):
    """Return a Starlette response that serves a stored file, backend-agnostic.

    Local backend: a ``FileResponse`` straight off disk (unchanged behaviour).
    Remote backend (``local_path`` is ``None``): a ``StreamingResponse`` that
    reads the object in chunks and closes the handle when done. Either way the
    same ``Content-Disposition`` (``disposition`` + ``filename``) and any
    ``extra_headers`` (e.g. ``nosniff`` and the inline sandbox CSP) are applied.

    Raises ``FileNotFoundError`` when the file is absent, which callers translate
    to HTTP 404 — the same response they returned before.
    """
    from fastapi.responses import FileResponse, StreamingResponse

    store = get_storage()
    headers = dict(extra_headers or {})

    local = store.local_path(category, key)
    if local is not None:
        if not local.is_file():
            raise FileNotFoundError(key)
        return FileResponse(
            path=str(local),
            filename=filename,
            media_type=media_type,
            content_disposition_type=disposition,
            headers=headers,
        )

    if not store.exists(category, key):
        raise FileNotFoundError(key)
    headers.setdefault("Content-Disposition", f'{disposition}; filename="{filename}"')

    def _stream():
        handle = store.open(category, key)
        try:
            while True:
                chunk = handle.read(65536)
                if not chunk:
                    break
                yield chunk
        finally:
            handle.close()

    return StreamingResponse(_stream(), media_type=media_type, headers=headers)
