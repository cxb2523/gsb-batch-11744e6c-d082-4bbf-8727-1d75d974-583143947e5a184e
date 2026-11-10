"""Board response shapes.

A column, not a page: the board's unit is a column with its own count and its
own continuation, because that is what a board shows.
"""

from typing import List, Optional

from pydantic import BaseModel

from .tickets import TicketOut


class BoardColumn(BaseModel):
    """One column's first cards, and how many it holds in all."""
    # Matches the column ids the board builds for itself: a status id, a user
    # number, an epic id or a priority, as a string; or the catch-all for cards
    # whose grouping field is empty ("unassigned", "no-epic", "no-priority").
    key: str
    items: List[TicketOut]
    # Every card in this column matching the filters, not just the ones returned.
    total: int
    # Present when the column holds more than was returned. Pass it to the ticket
    # list, with this column's filter and the board's own, to continue it.
    next_cursor: Optional[str] = None


class BoardResponse(BaseModel):
    group_by: str
    # Only columns that hold something; the board knows which columns exist.
    columns: List[BoardColumn]
