"""Content-signature ("magic byte") checks for uploaded files.

Uploads are already restricted by extension (tickets) or declared MIME type
(lifecycle), but both of those are supplied by the client: a file named
``report.pdf``, or sent with ``content_type: image/png``, can hold anything.
These helpers read a file's real signature — the handful of leading bytes that
identify its true format — so an upload whose contents contradict what it claims
is rejected before we ever store it.

We use ``filetype``, which is pure Python: it adds no system dependency (unlike
``python-magic``, which needs ``libmagic`` installed on the host).

Note what a signature can and cannot prove. Binary formats (PNG, PDF, ZIP, the
Office formats, …) have signatures and are verified here. Genuinely text-based
formats (``.txt``, ``.csv``, ``.md``, ``.json``, ``.svg``) have *no* magic bytes,
so a "no signature found" result is expected and allowed for those extensions —
their safety rests on the serving rules (attachment by default; the inline path
ships a sandbox CSP + ``nosniff``), not on a signature.
"""

from pathlib import Path
from typing import Optional, Tuple

import filetype


def sniff(content: bytes) -> Tuple[Optional[str], Optional[str]]:
    """Detect the true (extension, mime) from a file's leading bytes.

    Returns ``(None, None)`` when no known binary signature is present — the
    normal case for text files, which have none. ``filetype`` only inspects the
    first few hundred bytes, so passing the whole buffer (or just the head) is
    equally fine.
    """
    kind = filetype.guess(content)
    return (kind.extension, kind.mime) if kind else (None, None)


# For each extension we accept, the ``filetype`` signatures that legitimately back
# it. OOXML Office files (docx/xlsx/pptx) are ZIP containers, so a plain ``zip``
# detection is also valid for them. Legacy OLE Office files (doc/xls/ppt) all
# share one signature, so any of the three satisfies any of the three.
_SIGNATURE_WHITELIST = {
    ".png": {"png", "apng"},
    ".jpg": {"jpg"},
    ".jpeg": {"jpg"},
    ".gif": {"gif"},
    ".webp": {"webp"},
    ".bmp": {"bmp"},
    ".pdf": {"pdf"},
    ".zip": {"zip"},
    ".docx": {"docx", "zip"},
    ".xlsx": {"xlsx", "zip"},
    ".pptx": {"pptx", "zip"},
    ".doc": {"doc", "xls", "ppt"},
    ".xls": {"doc", "xls", "ppt"},
    ".ppt": {"doc", "xls", "ppt"},
    ".rtf": {"rtf"},
}

# Extensions whose contents are plain text / XML and carry no magic bytes. A
# "no signature" result is correct for these; a *detected* binary signature on
# one of them means the contents don't match the name, and is still rejected.
# doc/xls/ppt/rtf also appear here: some valid files of those types fail to
# fingerprint, and we'd rather accept those than reject real documents.
_SIGNATURELESS_EXTENSIONS = {
    ".md", ".markdown", ".txt", ".log", ".csv", ".json", ".svg",
    ".rtf", ".doc", ".xls", ".ppt",
}


def signature_mismatch(filename: str, content: bytes) -> Optional[str]:
    """Check a file's bytes against its claimed extension.

    Returns a human-readable rejection message when the contents contradict the
    extension, or ``None`` when the file is consistent (and may be stored).
    """
    ext = Path(filename or "").suffix.lower()
    detected, _ = sniff(content)

    if detected is None:
        # No signature: fine for text-based types, suspicious for anything that
        # must have magic bytes (image / pdf / zip / Office).
        if ext in _SIGNATURELESS_EXTENSIONS:
            return None
        return (
            f"{filename} does not look like a real {ext or 'file'} "
            f"(its contents carry no matching file signature)."
        )

    if detected not in _SIGNATURE_WHITELIST.get(ext, set()):
        return (
            f"{filename} is labelled {ext or '(no extension)'} but its contents "
            f"are a {detected} file."
        )
    return None
