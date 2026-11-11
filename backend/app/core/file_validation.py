"""Three-way consistency validation for uploaded files.

An upload carries three claims about what a file is:

1. its **name** — specifically the extension, checked against an allowlist;
2. its client-declared **MIME type** (``Content-Type`` / ``UploadFile.content_type``);
3. its **real contents** — identified from the leading "magic" bytes.

The extension and the declared MIME type are both supplied by the client and are
trivially spoofable, so neither is trusted on its own. :func:`validate_upload`
cross-checks all three and returns a *structured* verdict
(:class:`FileValidationResult`) carrying a stable machine-readable reason code,
so callers (and their front ends) can distinguish rejection reasons instead of
parsing human-readable text.

Reason codes (see also the module-level constants):

``ok``
    The three claims are consistent and the extension is allowed.
``empty_filename``
    No usable filename after stripping directory components.
``extension_not_allowed``
    The extension is not on :data:`ALLOWED_FILE_EXTENSIONS`.
``content_signature_mismatch``
    The real byte signature contradicts the extension.
``declared_mime_extension_mismatch``
    The declared MIME type is not a valid type for the extension.
``declared_mime_content_mismatch``
    The declared MIME type contradicts the real byte signature.

Signature semantics are deliberately *not* redefined here. The
content-vs-extension decision delegates to
:func:`app.core.file_security.signature_mismatch`, which already encodes the
established rules this module must preserve and must never loosen:

* genuinely text-based extensions (``.txt``/``.csv``/``.json``/``.md``/``.svg``
  …) have no magic bytes, so "no signature found" is normal and accepted;
* OOXML files (``.docx``/``.xlsx``/``.pptx``) are ZIP containers, so a plain
  ``zip`` signature is accepted for them;
* legacy OLE Office files (``.doc``/``.xls``/``.ppt``) share one signature and
  are mutually interchangeable.

Policy for ``application/octet-stream`` and empty content types
---------------------------------------------------------------

Both represent "the client makes no meaningful type claim" — browsers send
``application/octet-stream`` (or omit the header) for unknown/attachment files.
They are treated **neutrally**:

* they are normalised to ``None`` and never fail a MIME check on their own — a
  missing claim cannot contradict anything, so we do not reject legitimate
  uploads just because the browser did not know the type;
* the extension allowlist and the content-signature gate still apply in full,
  so the spoofable/absent MIME field cannot weaken those checks.

This is the single, consistent rule everywhere in this module: an empty or
octet-stream declaration is the absence of a claim, not a false one.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import AbstractSet, FrozenSet, Optional

from .file_security import signature_mismatch, sniff

# ---------------------------------------------------------------------------
# Stable machine-readable reason codes. Treat these as part of the public API:
# front ends branch on them, so never renumber/rename a value — only add new
# ones. HTTP detail strings, by contrast, are free-form prose.
# ---------------------------------------------------------------------------
OK = "ok"
EMPTY_FILENAME = "empty_filename"
EXTENSION_NOT_ALLOWED = "extension_not_allowed"
CONTENT_SIGNATURE_MISMATCH = "content_signature_mismatch"
DECLARED_MIME_EXTENSION_MISMATCH = "declared_mime_extension_mismatch"
DECLARED_MIME_CONTENT_MISMATCH = "declared_mime_content_mismatch"

#: HTTP header the upload route uses to expose the reason code to clients.
REASON_HEADER = "X-File-Validation-Error"

# Curated allowlist of attachment extensions. Mirrors the list the tickets
# upload route historically held; living here keeps the allowlist next to the
# validator that enforces it (the route re-exports it for backwards
# compatibility).
ALLOWED_FILE_EXTENSIONS: FrozenSet[str] = frozenset(
    {
        # Images
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg",
        # Documents
        ".pdf", ".md", ".markdown", ".txt", ".log", ".rtf",
        ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
        # Data / archives
        ".csv", ".json", ".zip",
    }
)

# Declared MIME types accepted for each allowed extension. Built from the same
# family groups as file_security's signature whitelist, so the MIME policy can
# never drift from the signature policy:
#   * OOXML (.docx/.xlsx/.pptx) accept the generic ZIP container type too;
#   * legacy OLE Office (.doc/.xls/.ppt) share one signature and are mutually
#     interchangeable, so any of their MIME types is accepted for any of them;
#   * text-based types accept text/plain (browsers commonly send that for
#     .csv/.log/.md/...) and the signatureless rule still means no bytes are
#     demanded from them.
_DECLARED_MIME_BY_EXTENSION = {
    # Images
    ".png": frozenset({"image/png", "image/apng"}),
    ".jpg": frozenset({"image/jpeg"}),
    ".jpeg": frozenset({"image/jpeg"}),
    ".gif": frozenset({"image/gif"}),
    ".webp": frozenset({"image/webp"}),
    ".bmp": frozenset({"image/bmp", "image/x-bmp"}),
    ".svg": frozenset({"image/svg+xml", "text/plain", "text/xml", "application/xml"}),
    # Documents
    ".pdf": frozenset({"application/pdf"}),
    ".md": frozenset({"text/markdown", "text/plain"}),
    ".markdown": frozenset({"text/markdown", "text/plain"}),
    ".txt": frozenset({"text/plain"}),
    ".log": frozenset({"text/plain"}),
    ".rtf": frozenset({"application/rtf", "text/rtf"}),
    # Legacy OLE Office: one shared signature -> mutually recognised.
    ".doc": frozenset({"application/msword",
                       "application/vnd.ms-excel",
                       "application/vnd.ms-powerpoint"}),
    ".xls": frozenset({"application/msword",
                       "application/vnd.ms-excel",
                       "application/vnd.ms-powerpoint"}),
    ".ppt": frozenset({"application/msword",
                       "application/vnd.ms-excel",
                       "application/vnd.ms-powerpoint"}),
    # OOXML: ZIP containers, so the generic zip type is valid too.
    ".docx": frozenset({"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        "application/zip"}),
    ".xlsx": frozenset({"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "application/zip"}),
    ".pptx": frozenset({"application/vnd.openxmlformats-officedocument.presentationml.presentation",
                        "application/zip"}),
    # Data / archives
    ".csv": frozenset({"text/csv", "application/csv", "text/plain"}),
    ".json": frozenset({"application/json", "text/plain"}),
    ".zip": frozenset({"application/zip", "application/x-zip-compressed"}),
}

# MIME types consistent with a *detected* signature, keyed by the extension
# filetype reports for the bytes. This is the content-side mirror of the
# signature whitelist in file_security (not of the declared-extension table):
#   * a bare ``zip`` detection backs both real .zip files and every OOXML
#     container, so all four declared types are consistent with zip bytes;
#   * the OLE trio shares one detected signature, so any OLE MIME is consistent
#     with those bytes;
#   * jpg bytes back both .jpg and .jpeg names, so image/jpeg is listed once.
# Used only for the declared-MIME-vs-real-content check, keeping it exactly as
# permissive as the established signature rules — never looser.
_CONTENT_MIME_BY_DETECTED_EXTENSION = {
    "png": frozenset({"image/png", "image/apng"}),
    "apng": frozenset({"image/png", "image/apng"}),
    "jpg": frozenset({"image/jpeg"}),
    "gif": frozenset({"image/gif"}),
    "webp": frozenset({"image/webp"}),
    "bmp": frozenset({"image/bmp", "image/x-bmp"}),
    "pdf": frozenset({"application/pdf"}),
    "rtf": frozenset({"application/rtf", "text/rtf"}),
    "zip": frozenset(
        {
            "application/zip",
            "application/x-zip-compressed",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        }
    ),
    # Legacy OLE Office: one shared signature -> mutually recognised.
    "doc": frozenset(
        {
            "application/msword",
            "application/vnd.ms-excel",
            "application/vnd.ms-powerpoint",
        }
    ),
    "xls": frozenset(
        {
            "application/msword",
            "application/vnd.ms-excel",
            "application/vnd.ms-powerpoint",
        }
    ),
    "ppt": frozenset(
        {
            "application/msword",
            "application/vnd.ms-excel",
            "application/vnd.ms-powerpoint",
        }
    ),
}


def _normalise_content_type(content_type: Optional[str]) -> Optional[str]:
    """Normalise a client-declared MIME type.

    Lower-cases and strips parameters (``; charset=...``). An empty string or
    ``application/octet-stream`` becomes ``None``: per the module docstring both
    mean "no meaningful type claim" and are checked neutrally.
    """
    if not content_type:
        return None
    mime = content_type.split(";", 1)[0].strip().lower()
    if not mime or mime == "application/octet-stream":
        return None
    return mime


@dataclass(frozen=True)
class FileValidationResult:
    """Structured verdict from :func:`validate_upload`.

    ``ok`` is ``True`` only when the extension is allowed and the declared MIME
    type, the extension and the real content signature are all consistent.
    ``reason`` is one of the module-level ``*`` reason-code constants;
    ``message`` is human-readable prose (not for machine branching).
    """

    ok: bool
    reason: str
    message: str
    filename: str
    extension: str
    declared_mime: Optional[str]
    detected_extension: Optional[str]
    detected_mime: Optional[str]


def _reject(
    reason: str,
    message: str,
    *,
    filename: str,
    extension: str,
    declared_mime: Optional[str],
    detected_extension: Optional[str],
    detected_mime: Optional[str],
) -> FileValidationResult:
    return FileValidationResult(
        ok=False,
        reason=reason,
        message=message,
        filename=filename,
        extension=extension,
        declared_mime=declared_mime,
        detected_extension=detected_extension,
        detected_mime=detected_mime,
    )


def validate_upload(
    filename: Optional[str],
    content_type: Optional[str],
    content: bytes,
    *,
    allowed_extensions: Optional[AbstractSet[str]] = None,
) -> FileValidationResult:
    """Validate one upload from its name, declared MIME type and raw bytes.

    Pure function: no I/O, no storage, no database — bytes in, a verdict out,
    so it is trivially unit-testable without any backend.

    Checks run in a fixed priority order; the first failure is the returned
    reason:

    1. a usable filename exists (directory components are stripped first);
    2. the extension is on the allowlist;
    3. the real content signature matches the extension — delegated to
       :func:`app.core.file_security.signature_mismatch`, whose text/OOXML/OLE
       rules are reused unchanged;
    4. the declared MIME type is valid for the extension;
    5. when a binary signature is present, the declared MIME type is also valid
       for the *detected* content.

    An empty or ``application/octet-stream`` ``content_type`` is normalised to
    ``None`` and skips checks 4–5 (see the module docstring for the policy).

    ``allowed_extensions`` overrides the default allowlist and is intended for
    tests / other callers with a narrower or wider policy.
    """
    allowlist = frozenset(allowed_extensions) if allowed_extensions is not None else ALLOWED_FILE_EXTENSIONS

    # Strip smuggled directory components the same way the route does; only a
    # bare basename is ever considered.
    safe_filename = Path(str(filename or "").replace("\\", "/")).name
    ext = Path(safe_filename).suffix.lower()
    declared_mime = _normalise_content_type(content_type)
    detected_ext, detected_mime = sniff(content or b"")

    def reject(reason: str, message: str) -> FileValidationResult:
        return _reject(
            reason,
            message,
            filename=safe_filename,
            extension=ext,
            declared_mime=declared_mime,
            detected_extension=detected_ext,
            detected_mime=detected_mime,
        )

    # 1. Name ----------------------------------------------------------------
    if not safe_filename:
        return reject(EMPTY_FILENAME, "File is missing a name.")

    # 2. Extension allowlist -------------------------------------------------
    if ext not in allowlist:
        return reject(
            EXTENSION_NOT_ALLOWED,
            f"File {safe_filename} has an unsupported type "
            f"({ext or 'no extension'}).",
        )

    # 3. Real content signature vs extension. Reuse the existing semantics
    #    verbatim (text-without-signature OK, OOXML-zip OK, OLE trio mutual).
    mismatch = signature_mismatch(safe_filename, content or b"")
    if mismatch:
        return reject(CONTENT_SIGNATURE_MISMATCH, mismatch)

    # 4 & 5 only apply when the client actually made a type claim. Missing /
    # octet-stream declarations are neutral and cannot contradict anything.
    if declared_mime is not None:
        # 4. Declared MIME vs extension -------------------------------------
        acceptable_for_ext = _DECLARED_MIME_BY_EXTENSION.get(ext, frozenset())
        if declared_mime not in acceptable_for_ext:
            return reject(
                DECLARED_MIME_EXTENSION_MISMATCH,
                f"File {safe_filename} is named with extension {ext} but its "
                f"declared content type is {declared_mime}.",
            )

        # 5. Declared MIME vs the *detected* content. Only binary signatures
        #    can be contradicted; a signatureless (text) file has nothing to
        #    compare against and check 3 already accepted it. The acceptable
        #    set mirrors file_security's signature whitelist (zip bytes back
        #    OOXML, OLE bytes back the Office trio), so this stays exactly as
        #    permissive as the established rules — never looser.
        if detected_ext is not None and detected_mime is not None:
            acceptable_for_content = _CONTENT_MIME_BY_DETECTED_EXTENSION.get(
                detected_ext, frozenset()
            )
            if declared_mime not in acceptable_for_content:
                return reject(
                    DECLARED_MIME_CONTENT_MISMATCH,
                    f"File {safe_filename} declares {declared_mime} but its "
                    f"contents are actually {detected_mime} "
                    f"(detected .{detected_ext}).",
                )

    return FileValidationResult(
        ok=True,
        reason=OK,
        message="",
        filename=safe_filename,
        extension=ext,
        declared_mime=declared_mime,
        detected_extension=detected_ext,
        detected_mime=detected_mime,
    )
