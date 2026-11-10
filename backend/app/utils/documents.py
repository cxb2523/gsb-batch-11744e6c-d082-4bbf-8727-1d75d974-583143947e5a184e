"""File-type detection for uploaded documents.

Used by the spreadsheet project import to resolve an upload to a known type
before reading it.
"""

from typing import Optional

# Extensions we can read, mapped to the internal type name used below.
SUPPORTED_EXTENSIONS = {
    "txt": "txt",
    "md": "txt",
    "markdown": "txt",
    "text": "txt",
    "pdf": "pdf",
    "docx": "docx",
    "csv": "csv",
    "tsv": "csv",
    "xlsx": "xlsx",
    "xlsm": "xlsx",
}

# Content types are unreliable (browsers send octet-stream for .md and .xlsx
# routinely), so the filename extension is the primary signal and this is a
# fallback for the cases where the extension is missing.
CONTENT_TYPE_HINTS = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xlsx",
    "text/csv": "csv",
    "text/tab-separated-values": "csv",
    "text/markdown": "txt",
    "text/plain": "txt",
}


class UnsupportedDocumentError(Exception):
    """Raised when a file's type can't be read."""


def detect_file_type(filename: Optional[str], content_type: Optional[str]) -> str:
    """Resolve a file to one of the internal type names, or raise."""
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].strip().lower()
        if ext in SUPPORTED_EXTENSIONS:
            return SUPPORTED_EXTENSIONS[ext]

    if content_type:
        hint = CONTENT_TYPE_HINTS.get(content_type.split(";")[0].strip().lower())
        if hint:
            return hint

    raise UnsupportedDocumentError(
        f"Unsupported file: {filename or 'unnamed'} ({content_type or 'unknown type'}). "
        "Supported: PDF, DOCX, XLSX, CSV, TXT, Markdown."
    )
