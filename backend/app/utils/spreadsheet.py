"""Deterministic reader for tabular uploads (xlsx / csv / tsv).

Reads the sheet as *structured* rows keyed by column header, so a spreadsheet's
columns map straight onto ticket fields. That is what the "create project from
existing data" flow needs: a 1:1, deterministic import of data that already has
clean columns.

Cell values keep their native type where it matters: dates come back as
``datetime`` and numbers as ``int``/``float`` (openpyxl with ``data_only``), so
the field normalisers can consume them directly.
"""

import csv
import io
from typing import Any, Optional

from .documents import UnsupportedDocumentError

# A generous hard ceiling; callers apply their own, smaller row limit on top.
MAX_TABLE_ROWS = 5000


def read_table(content: bytes, file_type: str) -> tuple[list[str], list[dict[str, Any]]]:
    """Read a spreadsheet into ``(headers, rows)``.

    The first non-empty row is the header. Each row is a dict mapping each
    header to that row's cell value (``""`` when blank). Rows that are entirely
    empty are skipped. Raises ``UnsupportedDocumentError`` for a non-tabular
    type or a sheet with no header row.
    """
    if file_type == "csv":
        headers, rows = _read_csv(content)
    elif file_type == "xlsx":
        headers, rows = _read_xlsx(content)
    else:
        raise UnsupportedDocumentError(
            f"{file_type!r} is not a spreadsheet. Upload an .xlsx or .csv file."
        )

    if not headers:
        raise UnsupportedDocumentError("The sheet has no header row.")
    return headers, rows[:MAX_TABLE_ROWS]


def _clean_header(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _read_csv(content: bytes) -> tuple[list[str], list[dict[str, Any]]]:
    # utf-8-sig strips a BOM that Excel-exported CSVs often carry.
    text = content.decode("utf-8-sig", errors="replace")
    try:
        dialect: Any = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)

    headers: list[str] = []
    rows: list[dict[str, Any]] = []
    for raw in reader:
        if not headers:
            if any(_clean_header(cell) for cell in raw):
                headers = [_clean_header(cell) for cell in raw]
            continue
        if not any(str(cell).strip() for cell in raw if cell is not None):
            continue
        rows.append({
            headers[i]: (raw[i].strip() if i < len(raw) and raw[i] is not None else "")
            for i in range(len(headers))
        })
    return headers, rows


def _read_xlsx(content: bytes) -> tuple[list[str], list[dict[str, Any]]]:
    try:
        import openpyxl
    except ImportError:
        raise UnsupportedDocumentError("openpyxl is not installed. Run: pip install openpyxl")

    workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    sheet = workbook.active

    headers: list[str] = []
    rows: list[dict[str, Any]] = []
    for raw in sheet.iter_rows(values_only=True):
        if not headers:
            if any(_clean_header(cell) for cell in raw):
                headers = [_clean_header(cell) for cell in raw]
            continue
        if not any(cell is not None and str(cell).strip() for cell in raw):
            continue
        row: dict[str, Any] = {}
        for i, header in enumerate(headers):
            cell = raw[i] if i < len(raw) else None
            # Keep datetimes/numbers native; trim stray whitespace on text.
            row[header] = cell.strip() if isinstance(cell, str) else (cell if cell is not None else "")
        rows.append(row)
    workbook.close()
    return headers, rows
