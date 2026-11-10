"""Index definitions, created once at application startup.

Single source of truth: app startup and scripts/init_db.py both call
ensure_indexes, so a definition can never drift between what a fresh install
gets and what a long-running app creates.

create_index is a no-op when an index with the same keys already exists, so
this is safe to run on every boot. A failure is logged and skipped rather than
raised: a pre-existing duplicate must never stop the server from starting.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

IndexSpec = Tuple[List[Tuple[str, int]], Dict[str, Any]]
IndexGroup = Dict[str, List[IndexSpec]]


# The board reads a day of activity per roster member. Without these, every
# board load scans ticket_history, ticket_comments and worklogs in full. The
# unique ones are what hold under concurrent writes, so a pin or a carry
# forward clicked twice at once cannot land twice.
STANDUP_INDEXES: IndexGroup = {
  "ticket_history": [
    ([("changed_by", 1), ("changed_at", -1)], {}),
    ([("ticket_id", 1), ("changed_at", -1)], {}),
  ],
  "ticket_comments": [
    ([("author_email", 1), ("created_at", -1)], {}),
  ],
  "worklogs": [
    ([("author_email", 1), ("started_at", -1)], {}),
    ([("author_email", 1), ("created_at", -1)], {}),
  ],
  "tickets": [
    ([("assignee_email", 1), ("archived", 1)], {}),
    ([("reporter_email", 1), ("created_at", -1)], {}),
    ([("completed_at", -1)], {}),
  ],
  "sprints": [
    ([("state", 1)], {}),
  ],
  "standup_today_items": [
    ([("email", 1), ("date", 1), ("ticket_id", 1)], {"unique": True, "name": "standup_today_unique"}),
    ([("date", 1)], {}),
  ],
  "standup_added_items": [
    ([("email", 1), ("date", 1), ("section", 1), ("ticket_id", 1)], {"unique": True, "name": "standup_added_items_unique"}),
    ([("date", 1)], {}),
  ],
  "standup_tasks": [
    ([("email", 1), ("date", 1), ("created_at", 1)], {}),
    ([("carried_from", 1)], {
      "unique": True, "name": "standup_tasks_carried_from_unique",
      "partialFilterExpression": {"carried_from": {"$type": "string"}},
    }),
  ],
  "standup_day_seeds": [
    ([("email", 1), ("date", 1)], {"unique": True, "name": "standup_day_seeds_unique"}),
  ],
  "standup_blocker_notes": [
    ([("email", 1), ("date", 1), ("created_at", 1)], {}),
  ],
}


# Every read of a project's lifecycle looks up one document by project, counts
# the remarks and documents per stage, and lists the modules in order. Without
# these, each of those is a full collection scan.
LIFECYCLE_INDEXES: IndexGroup = {
  # One lifecycle per project: the lookup on every page load.
  "project_lifecycles": [
    ([("project_id", 1)], {"unique": True, "name": "project_lifecycles_project_unique"}),
  ],
  # Listed in priority order, and the number is how a module is addressed.
  "project_modules": [
    ([("project_id", 1), ("position", 1)], {}),
    ([("project_id", 1), ("module_number", 1)], {"unique": True, "name": "project_modules_number_unique"}),
  ],
  # The activity trail, always read newest first for one project.
  "project_lifecycle_events": [
    ([("project_id", 1), ("at", -1)], {}),
  ],
  # Remarks and documents are counted per stage for the board, then read per stage.
  "project_stage_remarks": [
    ([("project_id", 1), ("stage_key", 1), ("created_at", -1)], {}),
    ([("project_id", 1), ("remark_number", 1)], {"unique": True, "name": "project_stage_remarks_number_unique"}),
  ],
  "project_stage_attachments": [
    ([("project_id", 1), ("stage_key", 1), ("created_at", -1)], {}),
    ([("project_id", 1), ("attachment_number", 1)], {"unique": True, "name": "project_stage_attachments_number_unique"}),
  ],
}


# Single-use OAuth state nonces. The TTL index is what sweeps expired and
# abandoned attempts; the unique index makes a nonce impossible to issue twice.
OAUTH_INDEXES: IndexGroup = {
  "oauth_states": [
    ([("state", 1)], {"unique": True, "name": "oauth_states_state_unique"}),
    ([("expires_at", 1)], {"expireAfterSeconds": 0, "name": "oauth_states_ttl"}),
  ],
}


# The team view fetches assigned tickets across every accessible project, always
# filtered by project_id and optionally by assignee. project_id is the selective
# filter, so it leads every key here.
TEAM_VIEW_INDEXES: IndexGroup = {
  "tickets": [
    ([("project_id", 1)], {}),
    # assignee_email is the modern assignee key...
    ([("project_id", 1), ("assignee_email", 1)], {}),
    # ...and assignee_id the legacy numeric one, still read by older rows.
    ([("project_id", 1), ("assignee_id", 1)], {}),
  ],
}


# The issue lists behind the board, backlog, sprint and breakdown views. Every
# one of these fields was queried without an index: a ticket looked up by its
# own ticket_number, or an epic's children, meant a full scan of the tickets
# collection, repeated once per row of the list being built. The leading
# project_id is the selective filter on a shared collection, and the pairs below
# are the exact shapes those endpoints query by.
ISSUE_LIST_INDEXES: IndexGroup = {
  "tickets": [
    # The ticket's own id. Read on every single-ticket fetch, move, update and
    # subtask rollup, so this is the most-used lookup in the app. Not unique:
    # an install carrying duplicate numbers from an older import must still boot.
    ([("ticket_number", 1)], {}),
    # Epic children, counted for every epic in a list. get_epic_stats queries by
    # epic_id alone (no project_id), so that one-field index has to stand by itself.
    ([("epic_id", 1)], {}),
    ([("project_id", 1), ("epic_id", 1)], {}),
    # Subtasks under their parents: the rollup in list_tickets, and the nesting
    # the breakdown modal and epic detail rely on.
    ([("project_id", 1), ("parent_id", 1)], {}),
    # The backlog (no sprint) and the sprint board (one sprint).
    ([("project_id", 1), ("sprint_id", 1)], {}),
    # Board columns, and the status filter.
    ([("project_id", 1), ("status_id", 1)], {}),
    # Epics are tickets with type=epic, so listing them filters on type.
    ([("project_id", 1), ("type", 1)], {}),
    # The list sort. ticket_number breaks ties on created_at, which is what makes
    # paging stable: without it two tickets written in the same instant can be
    # returned on both sides of a page boundary, or on neither.
    ([("project_id", 1), ("created_at", -1), ("ticket_number", -1)], {}),
  ],
  # Resolved once per ticket today, and by status_number — which had no index, so
  # every resolution scanned the collection.
  "ticket_statuses": [
    ([("status_number", 1)], {}),
    ([("project_id", 1), ("position", 1)], {}),
    ([("project_id", 1), ("name", 1)], {}),
  ],
}


# The identity and addressing constraints. These are what make a duplicate
# account or a reused project key impossible under concurrent writes, so they
# matter on a single-user install as much as a busy one. Previously created
# inline in main.py's startup hook; defined here so init_db and the running app
# cannot disagree about them.
CORE_INDEXES: IndexGroup = {
  "users": [
    ([("email", 1)], {"unique": True, "name": "users_email_unique"}),
    ([("user_number", 1)], {"unique": True, "name": "users_user_number_unique"}),
  ],
  "projects": [
    ([("key", 1)], {"unique": True, "name": "projects_key_unique"}),
    ([("project_number", 1)], {"unique": True, "name": "projects_number_unique"}),
  ],
  # One settings document per organization (the app is single-org: id 1).
  "organization_settings": [
    ([("organization_id", 1)], {"unique": True, "name": "organization_settings_unique"}),
  ],
}


def _merge(*groups: IndexGroup) -> IndexGroup:
  merged: IndexGroup = {}
  for group in groups:
    for collection, specs in group.items():
      merged.setdefault(collection, []).extend(specs)
  return merged


ALL_INDEXES: IndexGroup = _merge(
  CORE_INDEXES, STANDUP_INDEXES, LIFECYCLE_INDEXES, TEAM_VIEW_INDEXES, OAUTH_INDEXES,
  ISSUE_LIST_INDEXES,
)


async def ensure_indexes(db: AsyncIOMotorDatabase, groups: Optional[IndexGroup] = None) -> int:
  """Create every index the app relies on; returns how many were confirmed.

  Each failure is logged and skipped so one bad collection (duplicates blocking
  a unique index, say) cannot stop the rest, or the server, from starting.
  """
  confirmed = 0
  for collection, specs in (ALL_INDEXES if groups is None else groups).items():
    for keys, options in specs:
      try:
        await db[collection].create_index(keys, **options)
        confirmed += 1
      except Exception as exc:
        logger.warning("could not create index on %s %s: %s", collection, keys, exc)
  return confirmed
