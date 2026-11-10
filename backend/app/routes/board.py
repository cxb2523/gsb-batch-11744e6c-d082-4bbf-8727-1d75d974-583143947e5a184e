"""The board, as one request.

A board is not a list. It is a set of columns, each of which shows its first
few cards and how many it holds in total, and that shape is why paging the flat
ticket list never helped it: the first fifty tickets of a project are not the
first fifty of any column. Asking for every ticket and grouping them in the
browser worked while projects were small, and stopped working at the size where
it mattered.

This endpoint does the grouping where the data is. One aggregation returns, per
column, the first N cards and the column's full count. "Load more" on a single
column then goes to the flat list endpoint, filtered to that column and resumed
from the cursor this response handed back — so there is exactly one cursor
implementation, in tickets.py, rather than a second one here.
"""

from datetime import datetime, timezone
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..core.security import CurrentUser, get_current_user
from ..db.mongo import get_mongo_db
from ..schemas.board import BoardColumn, BoardResponse
from ..db.queries import NOT_ARCHIVED
from .tickets import (
    build_ticket_lookups,
    build_ticket_query,
    encode_cursor,
    verify_project_access,
    _done_status_ids,
    _ticket_out,
)

router = APIRouter(prefix="/projects", tags=["board"])

# What the board can be grouped by, and the ticket field each one groups on.
GROUP_BY_FIELD = {
    "status": "status_id",
    "epic": "epic_id",
    "priority": "priority",
    "assignee": None,  # resolved below: the column is a person, the field an address
}

# Columns a card falls into when the field it groups on is empty. These match the
# ids the board already uses for its catch-all columns.
UNGROUPED_KEY = {
    "status": "0",
    "epic": "no-epic",
    "priority": "no-priority",
    "assignee": "unassigned",
}

DEFAULT_COLUMN_LIMIT = 50

# The oldest possible sort value, used when a card has no usable created_at.
_MIN_CREATED_AT = datetime.min.replace(tzinfo=timezone.utc)


def _sort_created_at(value) -> datetime:
    """Coerce a card's created_at into a comparable, tz-aware datetime.

    Most cards store a datetime, but tickets brought in by the migration carry
    whatever the source held - sometimes an ISO string, sometimes nothing. A
    column that merged a string-dated card with a datetime-dated one would make
    Python compare str against datetime and raise, 500-ing the whole board, so
    everything is normalised here before it is sorted.
    """
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return _MIN_CREATED_AT
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return _MIN_CREATED_AT


def _group_expression(group_by: str):
    """The aggregation expression that puts a ticket in a column.

    Assignee is the awkward one. A column is a person, but a ticket carries an
    address — and older tickets carry a numeric id instead. Both are tagged here
    so the two kinds cannot collide, and resolved to one person afterwards.
    """
    if group_by == "assignee":
        return {
            "$cond": [
                {"$ifNull": ["$assignee_email", False]},
                {"$concat": ["e:", "$assignee_email"]},
                {
                    "$cond": [
                        {"$ifNull": ["$assignee_id", False]},
                        {"$concat": ["n:", {"$toString": "$assignee_id"}]},
                        "unassigned",
                    ]
                },
            ]
        }
    return f"${GROUP_BY_FIELD[group_by]}"


async def _column_keys(db: AsyncIOMotorDatabase, group_by: str, raw_keys: List) -> dict:
    """Map each raw group value to the column id the board uses.

    For assignee that means turning an address or a legacy number into the
    person's user_number, so two tickets on the same person land in one column
    however they happen to reference them.
    """
    if group_by != "assignee":
        return {
            key: (UNGROUPED_KEY[group_by] if key in (None, "") else str(key))
            for key in raw_keys
        }

    emails = [key[2:] for key in raw_keys if isinstance(key, str) and key.startswith("e:")]
    by_email = {}
    if emails:
        async for user in db["users"].find({"email": {"$in": emails}}, {"email": 1, "user_number": 1}):
            if user.get("user_number") is not None:
                by_email[user["email"]] = str(user["user_number"])

    resolved = {}
    for key in raw_keys:
        if not isinstance(key, str) or key == "unassigned":
            resolved[key] = "unassigned"
        elif key.startswith("e:"):
            # An address with no user record behind it still groups: the board
            # would otherwise drop those cards rather than show them somewhere.
            resolved[key] = by_email.get(key[2:], "unassigned")
        elif key.startswith("n:"):
            resolved[key] = key[2:]
        else:
            resolved[key] = "unassigned"
    return resolved


async def _board_card(db, project_id: int, row: dict, lookups, subtask_totals: dict) -> dict:
    """One card: the ticket as the list serializes it, plus its subtask rollup."""
    card = await _ticket_out(db, project_id, row, lookups)
    counts = subtask_totals.get(row.get("ticket_number"))
    if counts:
        card["subtasks_count"] = counts["total"]
        card["subtasks_completed"] = counts["completed"]
    return card


@router.get("/{project_id}/board", response_model=BoardResponse)
async def get_board(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    group_by: str = Query("status", pattern="^(status|assignee|epic|priority)$"),
    column_limit: int = Query(DEFAULT_COLUMN_LIMIT, ge=1, le=200),
    assignee_email: Optional[str] = Query(None),
    assignee_id: Optional[int] = Query(None),
    epic_id: Optional[int] = Query(None),
    sprint_id: Optional[int] = Query(None),
    type: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    label: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    include_archived: bool = Query(False),
):
    """The first `column_limit` cards of every column, with each column's total.

    Filters are the ticket list's, and mean the same thing here because both
    build their query with the same function. Columns with nothing in them are
    absent from the response: the board already knows which columns exist - its
    statuses, members, epics or priorities - and an empty one needs no rows.

    Each column carries a `next_cursor` when it holds more than was returned.
    Feeding that to the ticket list, with the same filters plus this column's
    own, continues that column and nothing else.
    """
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    query, _ = await build_ticket_query(
        db,
        project_id,
        assignee_email=assignee_email,
        assignee_id=assignee_id,
        epic_id=epic_id,
        sprint_id=sprint_id,
        type=type,
        priority=priority,
        label=label,
        q=q,
        include_archived=include_archived,
    )

    group_key = _group_expression(group_by)
    # One pass over the matching tickets, split two ways: every column's count,
    # and the first rows of each. $documentNumber ranks within a column without
    # collecting the column first, so a column of 10,000 costs no more to read
    # the top of than a column of 10.
    pipeline = [
        {"$match": query},
        {"$facet": {
            "counts": [
                {"$group": {"_id": group_key, "total": {"$sum": 1}}},
            ],
            "rows": [
                # $documentNumber takes a single sort key, and the order needs two.
                # An object compares field by field, so packing them into one gives
                # the same ordering as sorting by (created_at, ticket_number).
                {"$addFields": {"_sort_key": {"c": "$created_at", "n": "$ticket_number"}}},
                {"$setWindowFields": {
                    "partitionBy": group_key,
                    "sortBy": {"_sort_key": -1},
                    "output": {"_rank": {"$documentNumber": {}}},
                }},
                # One past the limit, to learn whether the column has more.
                {"$match": {"_rank": {"$lte": column_limit + 1}}},
            ],
        }},
    ]

    [result] = await db["tickets"].aggregate(pipeline, allowDiskUse=True).to_list(length=1)
    counts = result["counts"]
    rows = result["rows"]

    key_map = await _column_keys(db, group_by, [row["_id"] for row in counts])

    totals: dict = {}
    raw_groups_for: dict = {}
    for row in counts:
        column = key_map.get(row["_id"], UNGROUPED_KEY[group_by])
        totals[column] = totals.get(column, 0) + row["total"]
        raw_groups_for.setdefault(column, set()).add(row["_id"])

    # Rows come back ranked within their column; keep that order when bucketing.
    # The window stage doesn't carry the partition value out, so each row's column
    # is re-derived from the document - by the same rule the expression used.
    rows.sort(key=lambda row: row.get("_rank", 0))
    grouped: dict = {}
    for row in rows:
        if group_by == "assignee":
            if row.get("assignee_email"):
                raw = f"e:{row['assignee_email']}"
            elif row.get("assignee_id"):
                raw = f"n:{row['assignee_id']}"
            else:
                raw = "unassigned"
        else:
            raw = row.get(GROUP_BY_FIELD[group_by])
        column = key_map.get(raw, UNGROUPED_KEY[group_by])
        grouped.setdefault(column, []).append(row)

    # Two raw groups can resolve to one column - the same person referenced by
    # address on one ticket and by legacy id on another - and each was ranked
    # inside its own partition, so the merged column arrives as two ordered runs
    # rather than one. Re-sorting is only meaningful work for those columns, but
    # it is cheap here: there are at most column_limit + 1 rows per raw group.
    for column_rows in grouped.values():
        column_rows.sort(
            key=lambda row: (_sort_created_at(row.get("created_at")),
                             row.get("ticket_number") or 0),
            reverse=True,
        )

    lookups = await build_ticket_lookups(db, rows)

    # Subtask counts for the cards on show, as one aggregation rather than a
    # query per card - the same rollup the ticket list does, and the reason a
    # card can say "2/3" without its subtasks being fetched.
    parent_ids = [row["ticket_number"] for row in rows if row.get("ticket_number") is not None]
    subtask_totals: dict = {}
    if parent_ids:
        done_status_ids = await _done_status_ids(db, project_id)
        rollup = await db["tickets"].aggregate([
            {"$match": {"project_id": project_id, "parent_id": {"$in": parent_ids}, **NOT_ARCHIVED}},
            {"$group": {
                "_id": "$parent_id",
                "total": {"$sum": 1},
                "completed": {"$sum": {"$cond": [{"$in": ["$status_id", done_status_ids]}, 1, 0]}},
            }},
        ]).to_list(length=None)
        subtask_totals = {r["_id"]: r for r in rollup}

    columns: List[BoardColumn] = []
    for column, column_rows in grouped.items():
        has_more = len(column_rows) > column_limit
        visible = column_rows[:column_limit]
        next_cursor = None
        # Continuing a column means re-querying the flat list by that column's
        # own filter, and "assignee" there means an address. A column that merged
        # a legacy numeric reference into it cannot be expressed that way, so it
        # is not offered a cursor rather than offered one that would skip those
        # rows. Legacy references are a migration leftover; when they are gone so
        # is this case.
        if group_by == "assignee" and len(raw_groups_for.get(column, ())) > 1:
            has_more = False
        if has_more and visible:
            last = visible[-1]
            next_cursor = encode_cursor([
                last.get("created_at").isoformat() if last.get("created_at") else None,
                last.get("ticket_number"),
            ])
        columns.append(BoardColumn(
            key=column,
            total=totals.get(column, len(visible)),
            next_cursor=next_cursor,
            items=[await _board_card(db, project_id, row, lookups, subtask_totals) for row in visible],
        ))

    return BoardResponse(group_by=group_by, columns=columns)
