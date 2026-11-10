"""Shared Mongo query fragments for the tickets collection."""

# Tickets created before archival existed have no "archived" field at all, so this must
# match on $ne rather than False - {"archived": False} would silently hide every legacy
# ticket. Spread it into a query to keep archived tickets off a work surface.
#
# NOTE: this is applied to the work surfaces only - the ticket list (which backs the board,
# backlog and sprint board), search, subtask lists, epic lists/progress and sprint capacity.
# Reports, dashboards, status pages and standups still count archived tickets.
NOT_ARCHIVED = {"archived": {"$ne": True}}
