"""Ticket API endpoints for Kanban board and ticket management."""

import asyncio
import base64
import logging
import re
from typing import Annotated, List, Optional, Set, Union
from datetime import datetime, timezone
import os
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File as FastAPIFile
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from ...core.file_security import signature_mismatch
from ...core.storage import get_storage, serve_stored_file
from ...db.mongo import get_mongo_db
from ...db.queries import NOT_ARCHIVED
from ...core.security import get_current_user, CurrentUser, require_admin
from ...schemas.tickets import (
    TicketPage,
    TicketPromote,
    TicketCreate,
    TicketUpdate,
    TicketOut,
    TicketMoveRequest,
    TicketBulkUpdateRequest,
    TicketBulkUpdateResult,
    TicketBulkDeleteRequest,
    TicketBulkDeleteResult,
    TicketDeleteImpact,
    TicketCommentCreate,
    TicketCommentOut,
    TicketFileOut,
    TicketHistoryOut,
)
from ..watchers import ensure_watcher
from ...services.status_category import categorize_status
from ...utils.date_rules import (
    due_before_start_error,
    not_in_past_error,
    same_date,
    MSG_DUE_REQUIRED,
)


router = APIRouter(prefix="/projects", tags=["tickets"])



# ========== Helper Functions ==========

async def verify_project_access(
    project_id: int,
    user_email: str,
    db: AsyncIOMotorDatabase,
    user_role: str = "user",
    user_id: Optional[int] = None,
) -> None:
    """Verify that the user has access to the project (is an active member or admin). Raises 403 if not.

    Membership is matched by `user_email` first, with a fallback to legacy `user_id` rows.
    """
    # Admins have access to all projects
    if user_role == "admin":
        return

    members_collection = db["project_members"]

    or_clauses: list = [{"user_email": user_email}]
    if user_id is not None:
        or_clauses.append({"user_id": user_id})

    member = await members_collection.find_one({
        "project_id": project_id,
        "$or": or_clauses,
        "$and": [{"$or": [{"active": True}, {"active": {"$exists": False}}]}],
    })

    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )


def _initials(name):
    return "".join([n[0].upper() for n in (name or "U U").split()[:2]])


# The three formatters below define the serialized shape of a status and a user,
# including what each looks like when the record is missing. They take a document
# rather than fetching one, so the per-row helpers and the batched TicketLookups
# produce identical output from the same code: the fallbacks are the easiest thing
# to let drift apart, and the hardest to notice when they do.

def format_status_meta(status: Optional[dict]) -> dict:
    name = status.get("name", "Unknown") if status else "Unknown"
    return {
        "name": name,
        "color": status.get("color") if status else None,
        "category": categorize_status(name),
    }


def format_user_by_email(email: str, user: Optional[dict]) -> dict:
    if not user:
        local = email.split("@")[0] if "@" in email else email
        return {
            "id": None,
            "email": email,
            "name": local,
            "initials": (local[:2] or "U U").upper(),
        }
    name = user.get("name") or email.split("@")[0]
    return {
        "id": user.get("user_number"),
        "email": email,
        "name": name,
        "initials": _initials(name),
    }


def format_user_by_number(user_id: int, user: Optional[dict]) -> dict:
    if not user:
        return {"id": user_id, "name": "Unknown User", "email": "unknown@example.com"}
    return {
        "id": user_id,
        "name": user.get("name", "Unknown"),
        "email": user.get("email", "unknown@example.com"),
        "initials": _initials(user.get("name", "U U")),
    }


async def get_user_info(db: AsyncIOMotorDatabase, user_id: int) -> dict:
    """Get user information by user_id.

    TODO: remove once no documents reference users by integer id. `current_user.id`
    still uses this for things like history entries and notifications.
    """
    user = await db["users"].find_one({"user_number": user_id})
    return format_user_by_number(user_id, user)


async def get_user_info_by_email(db: AsyncIOMotorDatabase, email: Optional[str]) -> Optional[dict]:
    """Get user information by email. Returns None if email is falsy."""
    if not email:
        return None
    user = await db["users"].find_one({"email": email})
    return format_user_by_email(email, user)


async def _resolve_assignee(db: AsyncIOMotorDatabase, doc: dict) -> Optional[dict]:
    """Read assignee preferring `assignee_email`, falling back to legacy `assignee_id`."""
    email = doc.get("assignee_email")
    if email:
        return await get_user_info_by_email(db, email)
    legacy_id = doc.get("assignee_id")
    if legacy_id:
        return await get_user_info(db, legacy_id)
    return None


async def _resolve_reporter(db: AsyncIOMotorDatabase, doc: dict) -> Optional[dict]:
    """Read reporter preferring `reporter_email`, falling back to legacy `reporter_id`."""
    email = doc.get("reporter_email")
    if email:
        return await get_user_info_by_email(db, email)
    legacy_id = doc.get("reporter_id")
    if legacy_id:
        return await get_user_info(db, legacy_id)
    return None


async def get_status_meta(db: AsyncIOMotorDatabase, status_id: int) -> dict:
    """Return {name, color, category} for a status in one doc fetch.

    The status doc is the single source of a status's visual: callers get the
    configured colour and a category derived once (via categorize_status) so every
    surface can paint a status the same way instead of re-guessing from the name.
    """
    status = await db["ticket_statuses"].find_one({"status_number": status_id})
    return format_status_meta(status)


async def get_status_name(db: AsyncIOMotorDatabase, status_id: int) -> str:
    """Get status name by status_id."""
    return (await get_status_meta(db, status_id))["name"]


# Statuses that count as "done" throughout the ticket routes.
DONE_STATUS_NAMES = ["Done", "Closed", "Completed"]

# Statuses that require evidence of the work (an MR link or a comment) before a ticket
# may enter them. Done statuses always have; In Review and Testing were added so the
# review/QA hand-offs carry the same proof of what was done. Kept separate from
# DONE_STATUS_NAMES so genuinely done-only behaviour (e.g. completed_at) is untouched.
EVIDENCE_REQUIRED_STATUS_NAMES = DONE_STATUS_NAMES + ["In Review", "Testing"]

# Shown to the user when they try to move a ticket into an evidence-required status
# (In Review, Testing, Done, …) with no evidence of the work.
DONE_EVIDENCE_MESSAGE = (
    "This ticket needs a merge request link or a comment describing the work "
    "before it can move to this status. Add a merge request link in the ticket "
    "details, or leave a comment, then try again."
)


async def ticket_has_done_evidence(
    db: AsyncIOMotorDatabase, ticket: dict, effective_mr_url: Optional[str]
) -> bool:
    """A ticket may enter an evidence-required status only if it has a non-empty MR link OR >=1 comment.

    ``effective_mr_url`` is the merge-request URL the ticket will have after the current
    request (which may set it in the same call), so evidence added in the same request counts.
    """
    if (effective_mr_url or "").strip():
        return True
    comment_count = await db["ticket_comments"].count_documents(
        {"ticket_id": ticket.get("ticket_number")}
    )
    return comment_count > 0


# Status names treated as out-of-flow: they sit outside the linear pipeline and are
# excluded from the one-step-forward math (a ticket can be Blocked at any stage).
OUT_OF_FLOW_STATUS_NAMES = {"blocked"}

# Item types that are exempt from the transition cap (subtasks are a binary checkbox,
# epics use a coarser status vocabulary and have their own child-completion gate).
STATUS_CAP_EXEMPT_TYPES = {"epic", "subtask"}

# Shown when a user tries to jump more than one step forward in the pipeline.
STATUS_STEP_MESSAGE = (
    "You can only move a ticket one step forward. "
    "Move it to \"{next_status}\" first, then continue."
)


async def get_ordered_statuses(db: AsyncIOMotorDatabase, project_id: int) -> List[dict]:
    """Return a project's statuses sorted by pipeline position."""
    return await db["ticket_statuses"].find(
        {"project_id": project_id}
    ).sort("position", 1).to_list(length=None)


def _is_out_of_flow(name: Optional[str]) -> bool:
    return (name or "").strip().lower() in OUT_OF_FLOW_STATUS_NAMES


async def validate_status_transition(
    db: AsyncIOMotorDatabase,
    project_id: int,
    old_status_id: Optional[int],
    new_status_id: int,
    ticket: dict,
) -> dict:
    """Enforce the one-step-forward status cap.

    A ticket may move any number of steps BACKWARD but at most one step FORWARD
    through the pipeline (statuses ordered by ``position``, with out-of-flow statuses
    like "Blocked" removed). "Blocked" is a side-state: entering it is always allowed
    and remembers the pre-block status; when leaving it, the cap is measured from that
    remembered status so a ticket can't be parked in Blocked to skip stages.

    Raises HTTPException(400) on an illegal forward jump. Returns a dict of extra
    fields the caller should merge into its update payload (to set/clear
    ``pre_block_status_id``); an empty dict means "nothing extra to persist".
    """
    # No-op transition: nothing to check, nothing to persist.
    if old_status_id == new_status_id:
        return {}

    statuses = await get_ordered_statuses(db, project_id)
    name_by_id = {s.get("status_number"): s.get("name", "") for s in statuses}
    # The "flow" is the ordered pipeline with out-of-flow statuses removed; a status's
    # position in this list is its flow index (robust to non-contiguous position values).
    flow = [s for s in statuses if not _is_out_of_flow(s.get("name"))]
    flow_index = {s.get("status_number"): i for i, s in enumerate(flow)}

    new_name = name_by_id.get(new_status_id, "")
    old_name = name_by_id.get(old_status_id, "") if old_status_id is not None else ""

    # Entering Blocked (or any out-of-flow status): always allowed. Remember the
    # in-flow status we came from so the cap can resume from there on the way out.
    if _is_out_of_flow(new_name):
        if old_status_id in flow_index:
            return {"pre_block_status_id": old_status_id}
        return {}

    # Pick the reference flow index. Leaving Blocked resumes from the remembered
    # pre-block status (falling back to the first flow status if none was recorded).
    leaving_block = _is_out_of_flow(old_name)
    if leaving_block:
        reference_id = ticket.get("pre_block_status_id")
        fi_from = flow_index.get(reference_id, 0 if flow else None)
    else:
        fi_from = flow_index.get(old_status_id)
    fi_to = flow_index.get(new_status_id)

    # Unknown/custom target, or no usable reference: don't false-block; just tidy up.
    if fi_to is None or fi_from is None:
        return {"pre_block_status_id": None} if leaving_block else {}

    # Illegal only when moving MORE than one step forward. Backward is always fine.
    if fi_to > fi_from + 1:
        next_status = flow[fi_from + 1].get("name", "the next status")
        raise HTTPException(
            status_code=400,
            detail=STATUS_STEP_MESSAGE.format(next_status=next_status),
        )

    # Legal move — clear the remembered pre-block status now that we're back in flow.
    return {"pre_block_status_id": None} if leaving_block else {}


async def generate_ticket_key(db: AsyncIOMotorDatabase, project_id: int) -> str:
    """Generate a unique ticket key for a project, synced with actual max in DB."""
    projects_collection = db["projects"]
    tickets_collection = db["tickets"]
    counters_collection = db["counters"]

    # Get project to get the key prefix
    project = await projects_collection.find_one({"project_number": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_key = project.get("key", "PROJ")

    # Find actual max sequence number from existing ticket keys in this project
    # e.g. PROJ-123 -> extract 123
    max_seq = 0
    prefix = f"{project_key}-"
    async for ticket in tickets_collection.find(
        {"project_id": project_id, "key": {"$regex": f"^{re.escape(prefix)}\\d+$"}},
        {"key": 1},
    ):
        key = ticket.get("key", "")
        try:
            seq = int(key[len(prefix):])
            if seq > max_seq:
                max_seq = seq
        except (ValueError, IndexError):
            pass

    # Ensure counter is at least as high as max existing, then increment
    counter = await counters_collection.find_one_and_update(
        {"_id": f"tickets_{project_id}"},
        [{"$set": {"seq": {"$max": [{"$add": [{"$ifNull": ["$seq", 0]}, 1]}, max_seq + 1]}}}],
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )

    ticket_number = int(counter["seq"])
    return f"{project_key}-{ticket_number}"


async def _subtask_ids(db: AsyncIOMotorDatabase, project_id: int, ticket_ids: List[int]) -> List[int]:
    """Ticket numbers of every subtask hanging off the given tickets.

    Subtasks can't themselves have subtasks (create_ticket rejects a subtask as a parent),
    so one level is exhaustive.
    """
    return [
        s["ticket_number"]
        async for s in db["tickets"].find(
            {"project_id": project_id, "parent_id": {"$in": ticket_ids}},
            {"ticket_number": 1},
        )
    ]


def _can_delete(ticket: dict, current_user: CurrentUser) -> bool:
    """Deletion is limited to the ticket's reporter or an admin."""
    is_reporter = (
        ticket.get("reporter_email") == current_user.email
        if ticket.get("reporter_email")
        else ticket.get("reporter_id") == current_user.id
    )
    return current_user.role == "admin" or is_reporter


async def _done_status_ids(db: AsyncIOMotorDatabase, project_id: int) -> List[int]:
    """Status ids that count as finished, for subtask progress on a parent card."""
    statuses = await db["ticket_statuses"].find({"project_id": project_id}).to_list(length=None)
    done = [
        status["status_number"]
        for status in statuses
        if str(status.get("category", "")).lower() == "done"
        or str(status.get("name", "")).strip().lower() in {"done", "completed", "closed", "resolved"}
    ]
    return done


class TicketLookups:
    """The statuses and people a batch of tickets refers to, fetched once.

    Serializing a ticket needs its status and up to two user records. Resolving
    those per ticket meant three awaited round trips per row, so a list of 700
    issued over 2,000 queries in sequence — the single largest cost in loading a
    board. The same list refers to a handful of distinct statuses and users, so
    they are read up front with two queries and looked up here in memory.

    Rows go through the same formatters the per-row helpers use, so a hit and a
    miss serialize identically whichever path produced them.
    """

    def __init__(self, statuses: dict, users_by_email: dict, users_by_number: dict):
        self._statuses = statuses
        self._users_by_email = users_by_email
        self._users_by_number = users_by_number

    def status_meta(self, status_id: Optional[int]) -> dict:
        return format_status_meta(self._statuses.get(status_id))

    def user_by_email(self, email: Optional[str]) -> Optional[dict]:
        if not email:
            return None
        return format_user_by_email(email, self._users_by_email.get(email))

    def user_by_number(self, user_id: Optional[int]) -> Optional[dict]:
        if not user_id:
            return None
        return format_user_by_number(user_id, self._users_by_number.get(user_id))

    def assignee(self, doc: dict) -> Optional[dict]:
        """Prefers `assignee_email`, falling back to legacy `assignee_id`."""
        email = doc.get("assignee_email")
        if email:
            return self.user_by_email(email)
        return self.user_by_number(doc.get("assignee_id"))

    def reporter(self, doc: dict) -> Optional[dict]:
        email = doc.get("reporter_email")
        if email:
            return self.user_by_email(email)
        return self.user_by_number(doc.get("reporter_id"))


async def build_ticket_lookups(db: AsyncIOMotorDatabase, tickets: List[dict]) -> TicketLookups:
    """Read every status and user the given tickets refer to, in two queries."""
    status_ids = {t.get("status_id") for t in tickets if t.get("status_id") is not None}
    emails = {
        email
        for t in tickets
        for email in (t.get("assignee_email"), t.get("reporter_email"))
        if email
    }
    # Legacy numeric references, still present on older documents.
    numbers = {
        number
        for t in tickets
        for number in (
            t.get("assignee_id") if not t.get("assignee_email") else None,
            t.get("reporter_id") if not t.get("reporter_email") else None,
        )
        if number
    }

    statuses: dict = {}
    if status_ids:
        async for status in db["ticket_statuses"].find({"status_number": {"$in": list(status_ids)}}):
            statuses[status["status_number"]] = status

    users_by_email: dict = {}
    users_by_number: dict = {}
    if emails or numbers:
        query: dict = {"$or": []}
        if emails:
            query["$or"].append({"email": {"$in": list(emails)}})
        if numbers:
            query["$or"].append({"user_number": {"$in": list(numbers)}})
        async for user in db["users"].find(query):
            if user.get("email"):
                users_by_email[user["email"]] = user
            if user.get("user_number") is not None:
                users_by_number[user["user_number"]] = user

    return TicketLookups(statuses, users_by_email, users_by_number)


async def _ticket_out(
    db: AsyncIOMotorDatabase,
    project_id: int,
    ticket: dict,
    lookups: Optional[TicketLookups] = None,
) -> dict:
    """Serialize a ticket doc into the TicketOut shape.

    `lookups` is the batch built for a whole list. Without one — the single-ticket
    paths — it is built for this ticket alone, so both routes produce identical
    output from the same code.
    """
    if lookups is None:
        lookups = await build_ticket_lookups(db, [ticket])
    status_meta = lookups.status_meta(ticket.get("status_id"))
    return {
        "id": ticket.get("ticket_number"),
        "project_id": project_id,
        "key": ticket.get("key"),
        "title": ticket.get("title"),
        "description": ticket.get("description"),
        "type": ticket.get("type"),
        "status_id": ticket.get("status_id"),
        "status_name": status_meta["name"],
        "status_color": status_meta["color"],
        "status_category": status_meta["category"],
        "pre_block_status_id": ticket.get("pre_block_status_id"),
        "priority": ticket.get("priority"),
        "assignee": lookups.assignee(ticket),
        "reporter": lookups.reporter(ticket),
        "due_date": ticket.get("due_date"),
        "start_date": ticket.get("start_date"),
        "labels": ticket.get("labels", []),
        "epic_id": ticket.get("epic_id"),
        "parent_id": ticket.get("parent_id"),
        "sprint_id": ticket.get("sprint_id"),
        "story_points": ticket.get("story_points"),
        "original_estimate_seconds": ticket.get("original_estimate_seconds"),
        "time_spent_seconds": ticket.get("time_spent_seconds", 0),
        "remaining_estimate_seconds": ticket.get("remaining_estimate_seconds"),
        "merge_request_url": ticket.get("merge_request_url"),
        "archived": bool(ticket.get("archived", False)),
        "archived_at": ticket.get("archived_at"),
        "created_at": ticket.get("created_at"),
        "updated_at": ticket.get("updated_at"),
    }


async def _add_history(
    db: AsyncIOMotorDatabase,
    project_id: int,
    ticket_id: int,
    field: str,
    old_value: Optional[str],
    new_value: Optional[str],
    changed_by: int,
) -> None:
    """Append one entry to a ticket's history, minting its per-ticket sequence."""
    counter = await db["counters"].find_one_and_update(
        {"_id": f"ticket_history_{ticket_id}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    await db["ticket_history"].insert_one({
        "history_number": int(counter.get("seq", 1)),
        "ticket_id": ticket_id,
        "project_id": project_id,
        "field_name": field,
        "old_value": old_value,
        "new_value": new_value,
        "changed_by": changed_by,
        "changed_at": datetime.now(timezone.utc),
    })


async def _delete_ticket_cascade(
    db: AsyncIOMotorDatabase,
    project_id: int,
    ticket_ids: List[int],
) -> int:
    """Delete tickets, their subtasks, and everything that hangs off them.

    Deleting only the ticket documents leaves subtasks pointing at a parent that no longer
    exists, plus orphaned comments, files, history, watchers, links, worklogs and release
    entries. Returns the number of subtasks deleted.

    Takes a list so a bulk delete costs the same handful of round-trips as a single one.
    """
    subtask_ids = await _subtask_ids(db, project_id, ticket_ids)
    all_ids = [*ticket_ids, *subtask_ids]

    # Disjoint collections with no ordering dependency between them, so fan out.
    await asyncio.gather(
        *(
            db[collection].delete_many({field: {"$in": all_ids}})
            for collection, field in (
                ("ticket_comments", "ticket_id"),
                ("ticket_files", "ticket_id"),
                ("ticket_history", "ticket_id"),
                ("issue_watchers", "issue_id"),
                ("worklogs", "issue_id"),
                ("release_tickets", "ticket_id"),
            )
        ),
        # Links are directional, so a ticket can appear on either end.
        db["issue_links"].delete_many(
            {"$or": [
                {"source_issue_id": {"$in": all_ids}},
                {"target_issue_id": {"$in": all_ids}},
            ]}
        ),
    )

    await db["tickets"].delete_many({
        "project_id": project_id,
        "ticket_number": {"$in": all_ids},
    })

    return len(subtask_ids)


async def build_ticket_query(
    db: AsyncIOMotorDatabase,
    project_id: int,
    *,
    status_id: Optional[int] = None,
    assignee_email: Optional[str] = None,
    assignee_id: Optional[int] = None,
    include_archived: bool = False,
    archived_only: bool = False,
    include_subtasks: bool = False,
    epic_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
    no_sprint: bool = False,
    type: Optional[str] = None,
    types: Optional[List[str]] = None,
    priority: Optional[str] = None,
    label: Optional[str] = None,
    q: Optional[str] = None,
    no_epic: bool = False,
    parent_id: Optional[int] = None,
) -> tuple:
    """Turn the list filters into a Mongo query.

    Returns the query and, separately, the conditions that had to go under $and.
    A caller that narrows the query further - the cursor on a page, a column on
    the board - has to rebuild that $and rather than add to it, so it needs the
    parts rather than the finished object.

    Shared by the flat list and the board so the two cannot disagree about what
    a filter means: the board's "assignee" has to select the same tickets the
    list's does, or a filtered board and a filtered search would quietly differ.
    """
    query: dict = {"project_id": project_id}
    # Conditions that each need their own $or; collected and combined under $and,
    # since a query object can only carry one $or of its own.
    or_conditions: List[dict] = []

    if not include_subtasks:
        # A subtask is defined by having a parent; older documents predate the field.
        or_conditions.append({"$or": [{"parent_id": None}, {"parent_id": {"$exists": False}}]})
    if status_id is not None:
        query["status_id"] = status_id
    if assignee_email is None and assignee_id is not None:
        # Callers that hold a person's id rather than their address - the board,
        # whose assignee columns are people - would otherwise have to resolve it
        # themselves, and can only do so once the member list has loaded.
        user = await db["users"].find_one({"user_number": assignee_id}, {"email": 1})
        # No such user means no tickets, not every ticket.
        assignee_email = user.get("email") if user else "\u0000no-such-user"
    if assignee_email is not None:
        query["assignee_email"] = assignee_email
    if archived_only:
        query["archived"] = True
    elif not include_archived:
        query.update(NOT_ARCHIVED)
    if epic_id is not None:
        query["epic_id"] = epic_id
    if sprint_id is not None:
        query["sprint_id"] = sprint_id
    if no_sprint:
        # Same shape as the subtask exclusion: older documents have no sprint_id field.
        or_conditions.append({"$or": [{"sprint_id": None}, {"sprint_id": {"$exists": False}}]})
    if type is not None:
        query["type"] = type
    elif types:
        # Several acceptable types at once. The pickers need this: "anything that
        # can be a parent" is every type except an epic, which one `type=` cannot say.
        query["type"] = {"$in": types}
    if priority is not None:
        query["priority"] = priority
    if label is not None:
        query["labels"] = label
    if parent_id is not None:
        query["parent_id"] = parent_id
    if no_epic:
        # Same shape as the other "field absent on older documents" filters.
        or_conditions.append({"$or": [{"epic_id": None}, {"epic_id": {"$exists": False}}]})

    if q and q.strip():
        # Case-insensitive substring, matching what the board did in the browser.
        # Escaped, so a search for "WEB-1." looks for that text rather than a pattern.
        pattern = {"$regex": re.escape(q.strip()), "$options": "i"}
        matches = [{"key": pattern}, {"title": pattern}]
        # Assignee is searched by name, which lives on the user and not on the ticket,
        # so the matching people are resolved first and the tickets matched by address.
        emails = [
            user["email"]
            async for user in db["users"].find({"name": pattern}, {"email": 1})
            if user.get("email")
        ]
        if emails:
            matches.append({"assignee_email": {"$in": emails}})
        or_conditions.append({"$or": matches})

    if or_conditions:
        query["$and"] = list(or_conditions)
    return query, or_conditions


def encode_cursor(parts: List) -> str:
    """Pack a row's sort position into an opaque string.

    A cursor is where the previous page stopped, not how many rows preceded it.
    That matters on a collection this size: an offset has to walk every skipped
    row on each request, so deep pages get progressively slower, while a cursor
    seeks straight to its place in the index and costs the same throughout. It
    also can't repeat or drop a row when something is inserted or deleted while
    someone is paging, which an offset silently does.

    Opaque on purpose: it is ours to change, and nothing should build one.
    """
    raw = "|".join("" if part is None else str(part) for part in parts)
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(cursor: str, count: int) -> Optional[List[str]]:
    """Unpack a cursor into `count` parts, or None if it isn't one of ours.

    A malformed cursor returns the first page rather than an error: it means a
    stale or hand-edited link, and starting over is friendlier than a 400.
    """
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        parts = base64.urlsafe_b64decode(padded.encode()).decode().split("|")
    except Exception:
        return None
    return parts if len(parts) == count else None


def _after_condition(created_at: Optional[datetime], ticket_number: int) -> dict:
    """Rows strictly after this position in (created_at desc, ticket_number desc).

    The second key is what makes the boundary exact. Sorting on the timestamp
    alone, every ticket created in the same instant compares equal, so a page
    break inside such a group would re-show some of them on the next page and
    skip others entirely.
    """
    if created_at is None:
        return {"ticket_number": {"$lt": ticket_number}}
    return {
        "$or": [
            {"created_at": {"$lt": created_at}},
            {"created_at": created_at, "ticket_number": {"$lt": ticket_number}},
        ]
    }


# ========== Ticket Endpoints ==========

async def _set_archived(
    db: AsyncIOMotorDatabase,
    project_id: int,
    ticket_id: int,
    archived: bool,
    actor_email: str,
) -> dict:
    """Archive or unarchive a ticket and its subtasks, and record it in history."""
    tickets_collection = db["tickets"]

    ticket = await tickets_collection.find_one({
        "ticket_number": ticket_id,
        "project_id": project_id,
    })
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    now = datetime.now(timezone.utc)
    update = {
        "archived": archived,
        "archived_at": now if archived else None,
        "archived_by_email": actor_email if archived else None,
        "updated_at": now,
    }

    # Subtasks follow their parent: leaving them behind would show a subtask on the board
    # whose parent has vanished from it.
    subtask_ids = await _subtask_ids(db, project_id, [ticket_id])

    await asyncio.gather(
        tickets_collection.update_many(
            {"project_id": project_id, "ticket_number": {"$in": [ticket_id, *subtask_ids]}},
            {"$set": update},
        ),
        db["ticket_history"].insert_one({
            "ticket_id": ticket_id,
            "project_id": project_id,
            "field_name": "archived",
            "old_value": str(bool(ticket.get("archived", False))),
            "new_value": str(archived),
            "changed_by_email": actor_email,
            "created_at": now,
        }),
    )

    # The write is a known $set, so the post-image is the pre-image plus the update -
    # no need to read the document back.
    return {**ticket, **update}



__all__ = [
    "router",
    "verify_project_access",
    "_initials",
    "format_status_meta",
    "format_user_by_email",
    "format_user_by_number",
    "get_user_info",
    "get_user_info_by_email",
    "_resolve_assignee",
    "_resolve_reporter",
    "get_status_meta",
    "get_status_name",
    "DONE_STATUS_NAMES",
    "EVIDENCE_REQUIRED_STATUS_NAMES",
    "DONE_EVIDENCE_MESSAGE",
    "ticket_has_done_evidence",
    "OUT_OF_FLOW_STATUS_NAMES",
    "STATUS_CAP_EXEMPT_TYPES",
    "STATUS_STEP_MESSAGE",
    "get_ordered_statuses",
    "_is_out_of_flow",
    "validate_status_transition",
    "generate_ticket_key",
    "_subtask_ids",
    "_can_delete",
    "_done_status_ids",
    "TicketLookups",
    "build_ticket_lookups",
    "_ticket_out",
    "_add_history",
    "_delete_ticket_cascade",
    "build_ticket_query",
    "encode_cursor",
    "decode_cursor",
    "_after_condition",
    "_set_archived",
]
