"""Unit tests for the pure three-way upload validator.

These tests exercise ``app.core.file_validation.validate_upload`` directly: no
HTTP, no database, no object storage — just bytes in and structured verdicts
out — so they run anywhere with ``python -m pytest`` and need no backend.

They pin both the boolean verdict and the stable machine-readable reason code
for every branch the upload endpoint relies on.
"""

from app.core.file_validation import (
    ALLOWED_FILE_EXTENSIONS,
    CONTENT_SIGNATURE_MISMATCH,
    DECLARED_MIME_CONTENT_MISMATCH,
    DECLARED_MIME_EXTENSION_MISMATCH,
    EMPTY_FILENAME,
    EXTENSION_NOT_ALLOWED,
    OK,
    validate_upload,
)

# Real leading signatures (magic bytes), not just the 4-byte prefix, so the
# ``filetype``-based sniffer recognises them deterministically.
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
PDF_BYTES = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n" + b"rest of document"
# Windows PE / MS-DOS executable: the MZ header is what filetype fingerprints.
EXE_BYTES = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff" + b"\x00" * 32
# OOXML files are ZIP containers; a local file header is a valid zip signature.
ZIP_BYTES = b"PK\x03\x04" + b"\x00" * 64
CSV_BYTES = b"id,name\n1,alice\n2,bob\n"


# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------

def test_valid_png_passes():
    result = validate_upload("shot.png", "image/png", PNG_BYTES)
    assert result.ok
    assert result.reason == OK
    assert result.detected_extension == "png"
    assert result.detected_mime == "image/png"


def test_plain_text_csv_without_signature_passes():
    # Text formats carry no magic bytes: "no signature" is expected and must be
    # accepted for a text extension (the rule inherited from file_security).
    result = validate_upload("data.csv", "text/csv", CSV_BYTES)
    assert result.ok
    assert result.reason == OK
    assert result.detected_extension is None


def test_ooxml_docx_with_plain_zip_signature_passes():
    # A .docx is a ZIP container; a bare zip detection must satisfy it (and the
    # generic zip MIME type is likewise an acceptable declaration).
    result = validate_upload(
        "report.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ZIP_BYTES,
    )
    assert result.ok
    assert result.reason == OK
    assert result.detected_extension == "zip"

    result_zip_mime = validate_upload("report.docx", "application/zip", ZIP_BYTES)
    assert result_zip_mime.ok


def test_octet_stream_declaration_is_neutral_for_valid_png():
    # application/octet-stream means "no type claim"; the extension + signature
    # gates still decide, and the absent MIME claim cannot cause a rejection.
    result = validate_upload("shot.png", "application/octet-stream", PNG_BYTES)
    assert result.ok
    assert result.declared_mime is None


def test_empty_content_type_is_neutral():
    result = validate_upload("notes.txt", "", b"just some text\n")
    assert result.ok
    assert result.declared_mime is None


def test_content_type_parameters_are_stripped():
    result = validate_upload("shot.png", "image/png; charset=binary", PNG_BYTES)
    assert result.ok
    assert result.declared_mime == "image/png"


# ---------------------------------------------------------------------------
# Rejection paths and their stable reason codes
# ---------------------------------------------------------------------------

def test_executable_disguised_as_pdf_is_rejected_with_signature_reason():
    # An .exe renamed to .pdf and even declared as a PDF: the real MZ signature
    # contradicts the extension, and this must win over the spoofed claims.
    result = validate_upload("report.pdf", "application/pdf", EXE_BYTES)
    assert not result.ok
    assert result.reason == CONTENT_SIGNATURE_MISMATCH
    assert result.detected_extension == "exe"
    # The prose still mentions the involved file for human readers.
    assert "report.pdf" in result.message


def test_extension_not_on_allowlist_is_rejected():
    result = validate_upload("malware.exe", "image/png", EXE_BYTES)
    assert not result.ok
    assert result.reason == EXTENSION_NOT_ALLOWED
    assert "unsupported type" in result.message.lower()


def test_allowed_extension_but_conflicting_declared_mime_is_rejected():
    # A genuine PNG named .png but declared as application/pdf: extension and
    # content agree, yet the declared MIME visibly contradicts them.
    result = validate_upload("shot.png", "application/pdf", PNG_BYTES)
    assert not result.ok
    assert result.reason == DECLARED_MIME_EXTENSION_MISMATCH


def test_declared_mime_contradicting_real_content_is_rejected():
    # Real PDF bytes sent under an image MIME but with a .pdf name: the
    # extension-vs-MIME gate catches it first (image/png is not valid for .pdf),
    # and a content-contradicting declaration on a signatureless name also
    # yields a MIME rejection rather than being silently trusted.
    result = validate_upload("doc.pdf", "image/png", PDF_BYTES)
    assert not result.ok
    assert result.reason in (
        DECLARED_MIME_EXTENSION_MISMATCH,
        DECLARED_MIME_CONTENT_MISMATCH,
    )


def test_declared_mime_content_mismatch_branch_fires_on_table_divergence(monkeypatch):
    # With the production tables aligned, the declared-MIME-vs-content check is
    # a defense-in-depth layer that only fires if the two MIME tables drift.
    # Simulate that drift (a declared type accepted for the extension but not
    # consistent with the detected bytes) and pin the reason code it produces.
    from app.core import file_validation as fv

    monkeypatch.setitem(fv._DECLARED_MIME_BY_EXTENSION, ".png", frozenset({"image/png", "application/zip"}))
    result = validate_upload("pic.png", "application/zip", PNG_BYTES)
    assert not result.ok
    assert result.reason == DECLARED_MIME_CONTENT_MISMATCH
    assert result.detected_extension == "png"


def test_png_named_png_but_declared_as_octet_stream_with_exe_content_still_rejected():
    # A neutral MIME claim must not weaken the content-signature gate.
    result = validate_upload("shot.png", "application/octet-stream", EXE_BYTES)
    assert not result.ok
    assert result.reason == CONTENT_SIGNATURE_MISMATCH


def test_legacy_ole_office_extensions_are_mutually_recognised():
    # .doc/.xls/.ppt share one OLE signature; declarations across the trio must
    # be accepted (never loosen the established rule).
    ole_bytes = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 64
    for name, mime in (
        ("sheet.doc", "application/vnd.ms-excel"),
        ("deck.xls", "application/vnd.ms-powerpoint"),
        ("doc.ppt", "application/msword"),
    ):
        result = validate_upload(name, mime, ole_bytes)
        assert result.ok, (name, result.reason, result.message)


# ---------------------------------------------------------------------------
# Boundary cases: empty name and empty bytes
# ---------------------------------------------------------------------------

def test_empty_filename_is_rejected_with_dedicated_reason():
    result = validate_upload("", "image/png", PNG_BYTES)
    assert not result.ok
    assert result.reason == EMPTY_FILENAME

    result_none = validate_upload(None, "image/png", PNG_BYTES)
    assert not result_none.ok
    assert result_none.reason == EMPTY_FILENAME


def test_directory_components_are_stripped_before_validation():
    # Basename reduction happens inside the validator, so a traversal-style name
    # is validated (and reported) under its bare basename.
    result = validate_upload("../../etc/shot.png", "image/png", PNG_BYTES)
    assert result.ok
    assert result.filename == "shot.png"


def test_empty_bytes_for_binary_extension_is_signature_mismatch():
    # Zero bytes carry no signature; a type that must have magic bytes fails the
    # (unchanged) signature_mismatch rule rather than being silently stored.
    result = validate_upload("shot.png", "image/png", b"")
    assert not result.ok
    assert result.reason == CONTENT_SIGNATURE_MISMATCH
    assert result.detected_extension is None


def test_empty_bytes_for_text_extension_passes():
    # An empty text/csv file is a legitimate (if vacuous) upload: text types
    # need no signature, so empty content is accepted for them.
    result = validate_upload("blank.csv", "text/csv", b"")
    assert result.ok
    assert result.reason == OK
    assert result.detected_extension is None


def test_empty_bytes_with_neutral_mime_on_text_extension_passes():
    result = validate_upload("blank.txt", "application/octet-stream", b"")
    assert result.ok
    assert result.declared_mime is None


# ---------------------------------------------------------------------------
# General contract checks
# ---------------------------------------------------------------------------

def test_every_allowed_extension_has_a_mime_mapping():
    # Guards against adding an extension to the allowlist without teaching the
    # validator which MIME types are legitimate for it (which would make every
    # non-neutral declaration for that extension fail spuriously).
    from app.core.file_validation import _DECLARED_MIME_BY_EXTENSION

    missing = ALLOWED_FILE_EXTENSIONS - set(_DECLARED_MIME_BY_EXTENSION)
    assert not missing


def test_reason_codes_are_stable_strings():
    # The codes are part of the public contract; pin their literal values so a
    # careless rename can't silently break front ends branching on them.
    assert OK == "ok"
    assert EMPTY_FILENAME == "empty_filename"
    assert EXTENSION_NOT_ALLOWED == "extension_not_allowed"
    assert CONTENT_SIGNATURE_MISMATCH == "content_signature_mismatch"
    assert DECLARED_MIME_EXTENSION_MISMATCH == "declared_mime_extension_mismatch"
    assert DECLARED_MIME_CONTENT_MISMATCH == "declared_mime_content_mismatch"
