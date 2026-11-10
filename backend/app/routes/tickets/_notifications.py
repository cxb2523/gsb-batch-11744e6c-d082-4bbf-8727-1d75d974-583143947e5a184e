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


from ._shared import *  # noqa: F401,F403
from ._notifications import *  # noqa: F401,F403

def extract_mentions(text: str) -> Set[str]:
    """Extract @mentioned usernames from text.

    Supports both formats:
      - @john.doe  (local part only — frontend inserts this)
      - @john.doe@example.com  (full email — backwards compat)
    Returns a set of local parts (e.g. {"john.doe"}).
    """
    if not text:
        return set()
    # Descriptions may now contain rich-text HTML. Replace tags with spaces so a
    # mention sitting right after a tag boundary (e.g. "<div>@john.doe</div>") is
    # still preceded by whitespace and matched by the regex below.
    text = re.sub(r"<[^>]+>", " ", text)
    # Match @word (stop at whitespace). Handles both @local and @local@domain.
    raw = set(re.findall(r"(?:^|(?<=\s))@([\w.+-]+(?:@[\w.-]+)?)", text))
    # Normalize: strip domain if full email was used
    local_parts = set()
    for m in raw:
        local_parts.add(m.split("@")[0] if "@" in m else m)
    return local_parts


async def resolve_mentioned_user_ids(
    db: AsyncIOMotorDatabase, mentions: Set[str]
) -> list[dict]:
    """Resolve mention local parts to user docs by matching email prefix."""
    if not mentions:
        return []
    # Build regex patterns to match emails starting with these local parts
    regexes = [re.compile(f"^{re.escape(m)}@", re.IGNORECASE) for m in mentions]
    # Query all users and filter — for small orgs this is fine
    all_users = await db["users"].find(
        {"is_active": {"$ne": False}},
        {"user_number": 1, "email": 1, "name": 1},
    ).to_list(length=None)
    matched = []
    for user in all_users:
        email = user.get("email", "")
        for rx in regexes:
            if rx.match(email):
                matched.append(user)
                break
    return matched


async def create_ticket_notifications(
    db: AsyncIOMotorDatabase,
    project_id: int,
    ticket_doc: dict,
    event_type: str,
    message: str,
    actor_user_id: int,
    mention_text: Optional[str] = None,
) -> None:
    """Create notifications for ticket-related events.

    - Admins: get notifications for all changes in the project.
    - Members: get notifications for tickets they are assigned to.
    """
    notifications_collection = db["notifications"]
    preferences_collection = db["notification_preferences"]
    members_collection = db["project_members"]
    projects_collection = db["projects"]
    counters_collection = db["counters"]

    project = await projects_collection.find_one({"project_number": project_id})
    owner_id = project.get("owner_id") if project else None

    # Find admin users for this project (including owner)
    admin_members = await members_collection.find({
        "project_id": project_id,
        "role": "admin",
        "$or": [
            {"active": True},
            {"active": {"$exists": False}}
        ]
    }).to_list(length=None)

    admin_user_ids = {m.get("user_id") for m in admin_members if m.get("user_id")}
    if owner_id:
        admin_user_ids.add(owner_id)

    # Resolve assignee user_number for notifications (notifications collection still keys on user_id)
    assignee_email = ticket_doc.get("assignee_email")
    assignee_id = None
    if assignee_email:
        au = await db["users"].find_one({"email": assignee_email})
        if au:
            assignee_id = au.get("user_number")
    if assignee_id is None:
        assignee_id = ticket_doc.get("assignee_id")

    # Resolve watchers once. Each watcher gets an in-app notification for every event,
    # and a Slack DM for the high-signal events (assign / status change / comment).
    # Watching is the opt-in, so watcher notifications ignore notification_preferences.
    watcher_docs = await db["issue_watchers"].find({
        "issue_id": ticket_doc.get("ticket_number")
    }).to_list(length=None)
    watchers: list[dict] = []  # [{"user_id": int|None, "email": str|None}]
    for w in watcher_docs:
        w_email = w.get("user_email")
        w_user_id = None
        if w_email:
            wu = await db["users"].find_one({"email": w_email})
            w_user_id = wu.get("user_number") if wu else None
        else:
            w_user_id = w.get("user_id")
        watchers.append({"user_id": w_user_id, "email": w_email})

    # Helper to decide if a non-admin should be notified based on preferences and event type
    async def should_notify_non_admin(user_id: int) -> bool:
        prefs = await preferences_collection.find_one({"user_id": user_id}) or {}

        if event_type in {"ticket_created", "ticket_assigned"}:
            return prefs.get("issue_assignments", True)
        if event_type in {"ticket_status_changed", "ticket_updated"}:
            return prefs.get("status_changes", True)
        if event_type == "ticket_commented":
            return prefs.get("comments", True)
        # Fallback: notify
        return True

    async def create_notification_for_user(user_id: int, bypass_prefs: bool = False) -> None:
        if not user_id or user_id == actor_user_id:
            return

        is_admin_recipient = user_id in admin_user_ids
        if not is_admin_recipient and not bypass_prefs:
            # Non-admins: only notify if preferences allow
            if not await should_notify_non_admin(user_id):
                return

        # Generate notification id
        counter = await counters_collection.find_one_and_update(
            {"_id": "notifications"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        notification_number = int(counter.get("seq", 1))

        await notifications_collection.insert_one({
            "notification_number": notification_number,
            "user_id": user_id,
            "project_id": project_id,
            "ticket_id": ticket_doc.get("ticket_number"),
            "ticket_key": ticket_doc.get("key"),
            "type": event_type,
            "message": message,
            "read": False,
            "created_at": datetime.now(timezone.utc),
        })

    # Notify all admins
    for admin_id in admin_user_ids:
        await create_notification_for_user(admin_id)

    # Notify assignee (if not already notified as admin)
    if assignee_id and assignee_id not in admin_user_ids:
        await create_notification_for_user(assignee_id)

    # Notify @mentioned users (in-app notification)
    notified_user_ids = admin_user_ids | ({assignee_id} if assignee_id else set())
    if mention_text:
        mentioned_emails = extract_mentions(mention_text)
        if mentioned_emails:
            mentioned_users = await resolve_mentioned_user_ids(db, mentioned_emails)
            for mu in mentioned_users:
                mu_id = mu.get("user_number")
                if mu_id and mu_id not in notified_user_ids:
                    await create_notification_for_user(mu_id)
                    notified_user_ids.add(mu_id)

    # Notify watchers (in-app, every event) — ignoring preferences since watching is opt-in
    for w in watchers:
        w_id = w.get("user_id")
        if w_id and w_id not in notified_user_ids:
            await create_notification_for_user(w_id, bypass_prefs=True)
            notified_user_ids.add(w_id)

    # --- Outbound integrations (Slack, webhook, …) ---
    # Resolve *who* to notify here (provider-agnostic); each enabled integration
    # decides *how* to deliver. See app/integrations.
    try:
        from ...integrations import (
            dispatch_notification,
            NotificationEvent,
            Recipient,
            KIND_ASSIGNEE,
            KIND_MENTION,
            KIND_WATCHER,
        )
        from ...core.settings import get_settings as _get_settings

        actor_doc = await db["users"].find_one({"user_number": actor_user_id})
        actor_name = actor_doc.get("name", "Someone") if actor_doc else "Someone"
        actor_email = actor_doc.get("email") if actor_doc else None

        frontend = str(_get_settings().frontend_base_url).rstrip("/")
        ticket_url = f"{frontend}/projects/{project_id}/board"

        # De-dup across recipient kinds; never notify the actor about their own action.
        seen_emails: set = set()
        if actor_email:
            seen_emails.add(actor_email)
        recipients: list = []

        # Assignee — direct message only on assignment.
        if event_type == "ticket_assigned" and assignee_id:
            assignee_doc = await db["users"].find_one({"user_number": assignee_id})
            a_email = assignee_doc.get("email") if assignee_doc else None
            if a_email and a_email not in seen_emails:
                seen_emails.add(a_email)
                recipients.append(Recipient(email=a_email, kind=KIND_ASSIGNEE))

        # @mentioned users.
        if mention_text:
            local_parts = extract_mentions(mention_text)
            if local_parts:
                for mu in await resolve_mentioned_user_ids(db, local_parts):
                    if mu.get("user_number") == actor_user_id:
                        continue
                    m_email = mu.get("email")
                    if m_email and m_email not in seen_emails:
                        seen_emails.add(m_email)
                        recipients.append(Recipient(email=m_email, kind=KIND_MENTION))

        # Watchers — high-signal events only.
        if event_type in {"ticket_assigned", "ticket_status_changed", "ticket_commented"}:
            for w in watchers:
                w_email = w.get("email")
                if w_email and w_email not in seen_emails:
                    seen_emails.add(w_email)
                    recipients.append(Recipient(email=w_email, kind=KIND_WATCHER))

        await dispatch_notification(db, NotificationEvent(
            project_id=project_id,
            type=event_type,
            message=message,
            ticket_key=ticket_doc.get("key", ""),
            ticket_title=ticket_doc.get("title", ""),
            ticket_url=ticket_url,
            actor_name=actor_name,
            recipients=recipients,
        ))
    except Exception as _notify_err:
        logger.warning("Integration notifications failed: %s", _notify_err, exc_info=True)


# ========== Archival ==========



__all__ = [
    "extract_mentions",
    "resolve_mentioned_user_ids",
    "create_ticket_notifications",
]
