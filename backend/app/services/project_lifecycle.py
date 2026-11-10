"""The lifecycle every project runs through, and the record of how it went.

A service project moves through the same funnel each time: the client's
requirement becomes a PRD, design draws it, product reviews the design, it is
handed to development, scoped into modules, and the modules are built and handed
back for QA. This module owns that default flow and the document that tracks one
project's progress through it.

The flow is a starting point, not a cage: a project can rename, reorder, add or
drop stages, and any member can move the project to any stage. What matters is
the record: when each stage started, when it finished, how long it took, and
who changed what.

One document per project in `project_lifecycles`, with the stages embedded: a
project has a handful of stages, they are always read together, and keeping them
in one document means a stage move is a single atomic write.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from .standup_time import ist_today, to_ist_date

LIFECYCLES = "project_lifecycles"
MODULES = "project_modules"
EVENTS = "project_lifecycle_events"
# What a stage carries beside its dates: the running remarks, and the files and
# links that prove the work. Both keyed by (project_id, stage_key).
REMARKS = "project_stage_remarks"
ATTACHMENTS = "project_stage_attachments"

# The company flow, in order. Each stage has a codename the team can say out loud
# ("we're in Calibrate") and the plain name underneath, so nobody has to decode it.
# `team` is who usually owns the stage; it is a label, not a permission, so any
# project member can move any stage.
DEFAULT_STAGES: List[Dict[str, Any]] = [
    {"key": "prd_received", "codename": "Signal", "name": "Requirement Intake", "team": "Account",
     "description": "The brief, RFP or DPR arrives from the client and is logged with whatever came with it."},
    {"key": "product_prd", "codename": "Blueprint", "name": "Discovery & PRD", "team": "Product",
     "description": "Product digs into the requirement and writes the PRD: scope, flows, edge cases, what is out of scope."},
    {"key": "design", "codename": "Canvas", "name": "UX & UI Design", "team": "Design",
     "description": "Design turns the PRD into screens and clickable prototypes."},
    {"key": "design_review", "codename": "Calibrate", "name": "Design Review", "team": "Product",
     "description": "Product and the client review the designs; changes go round until everyone agrees on them."},
    {"key": "design_approval", "codename": "Verdict", "name": "Product Design Approval", "team": "Product",
     "description": "Product formally approves the final designs. Nothing reaches development until this is recorded.",
     "milestone": True},
    {"key": "dev_handoff", "codename": "Handshake", "name": "Development Handoff", "team": "Product",
     "description": "Approved PRD and designs are formally handed to the development team.", "milestone": True},
    {"key": "dev_review", "codename": "Recon", "name": "Technical Review", "team": "Development",
     "description": "Developers read the handoff, raise questions and flag anything that needs to change before work starts."},
    {"key": "scoping", "codename": "Atlas", "name": "Scoping & Estimation", "team": "Development",
     "description": "Work is split into modules and ordered by priority, each with an owner and a deadline."},
    # Two streams run side by side here, so this stage keeps a separate record for each.
    {"key": "module_development", "codename": "Forge", "name": "Build", "team": "Development",
     "description": "Frontend and backend build the modules one at a time, handing each to QA as it is finished.",
     "tracks": ["Frontend", "Backend"]},
    {"key": "uat_deployment", "codename": "Proving Ground", "name": "QA & UAT", "team": "QA",
     "description": "Deployed to dev/UAT for QA and the client to test in a real environment.", "milestone": True},
    {"key": "prod_deployment", "codename": "Launch", "name": "Production Release", "team": "Development",
     "description": "Released to production.", "milestone": True},
    {"key": "delivery", "codename": "Summit", "name": "Handover & Sign-off", "team": "Account",
     "description": "Documentation, walkthrough and the client's sign-off that the work is delivered.", "milestone": True},
]

# Lifecycles created before codenames and milestones existed fall back to these on read.
DEFAULT_CODENAMES: Dict[str, str] = {stage["key"]: stage["codename"] for stage in DEFAULT_STAGES}
DEFAULT_MILESTONES = {stage["key"] for stage in DEFAULT_STAGES if stage.get("milestone")}

STAGE_STATES = ("not_started", "in_progress", "done", "blocked", "skipped")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def new_stage(definition: Dict[str, Any], position: int) -> Dict[str, Any]:
    return {
        "key": definition["key"],
        "codename": definition.get("codename"),
        "name": definition["name"],
        # Streams that run side by side inside this stage, each keeping its own
        # remarks and documents. Empty for a stage with a single thread of work.
        "tracks": list(definition.get("tracks") or []),
        # A checkpoint the whole team watches for, flagged on the route.
        "is_milestone": bool(definition.get("milestone")),
        "team": definition.get("team"),
        "description": definition.get("description"),
        "position": position,
        "state": "not_started",
        # Everyone carrying this stage. Stages written before this was a list
        # still hold a single `owner_email`, which is read as a one-item list.
        "assignees": [],
        "target_date": None,
        "note": None,
        "started_at": None,
        "completed_at": None,
        # Days already spent in earlier visits, so a stage reopened after being
        # done doesn't lose the days it took the first time.
        "elapsed_days": 0,
    }


def default_stages() -> List[Dict[str, Any]]:
    return [new_stage(definition, position) for position, definition in enumerate(DEFAULT_STAGES)]


def new_lifecycle(project_id: int, created_by: Optional[str]) -> Dict[str, Any]:
    now = _now()
    return {
        "project_id": project_id,
        "stages": default_stages(),
        "created_at": now,
        "updated_at": now,
        "created_by": created_by,
    }


def _follow_company_flow(stages: List[Dict[str, Any]]) -> Optional[List[Dict[str, Any]]]:
    """Bring a project still on the company flow up to date with it.

    Stages the flow has gained are added in order, and names, codenames, teams and
    descriptions are refreshed: the wording of a step changes, what happened in it
    does not, so state and dates are kept. A project that tailored its own flow is
    marked `customised` and never touched here.
    """
    keys = [stage["key"] for stage in stages]
    default_keys = [definition["key"] for definition in DEFAULT_STAGES]
    if any(key not in default_keys for key in keys):
        return None

    by_key = {stage["key"]: dict(stage) for stage in stages}
    changed = False
    for definition in DEFAULT_STAGES:
        stage = by_key.get(definition["key"])
        if stage is None:
            by_key[definition["key"]] = new_stage(definition, 0)
            changed = True
            continue
        wording = {
            "codename": definition.get("codename"),
            "name": definition["name"],
            "team": definition.get("team"),
            "description": definition.get("description"),
            "is_milestone": bool(definition.get("milestone")),
            "tracks": list(definition.get("tracks") or []),
        }
        if any(stage.get(field) != value for field, value in wording.items()):
            stage.update(wording)
            changed = True

    ordered = [by_key[key] for key in default_keys if key in by_key]
    for position, stage in enumerate(ordered):
        if stage.get("position") != position:
            changed = True
        stage["position"] = position
    return ordered if changed else None


async def get_or_create(db: AsyncIOMotorDatabase, project_id: int, created_by: Optional[str] = None) -> Dict[str, Any]:
    """The project's lifecycle, started from the company flow the first time it is opened."""
    existing = await db[LIFECYCLES].find_one({"project_id": project_id})
    if existing:
        topped_up = None if existing.get("customised") else _follow_company_flow(existing.get("stages") or [])
        if topped_up:
            now = _now()
            await db[LIFECYCLES].update_one(
                {"project_id": project_id}, {"$set": {"stages": topped_up, "updated_at": now}},
            )
            # The caller's copy must match what is now stored: `updated_at` is read
            # back as an optimistic-lock guard when two people move a stage at once.
            existing["stages"] = topped_up
            existing["updated_at"] = now
        return existing

    document = new_lifecycle(project_id, created_by)
    await db[LIFECYCLES].update_one(
        {"project_id": project_id}, {"$setOnInsert": document}, upsert=True,
    )
    # Re-read rather than trusting the local copy: another request may have won the race.
    return await db[LIFECYCLES].find_one({"project_id": project_id})


def banked_days(stage: Dict[str, Any]) -> int:
    """Days already spent in this stage before the run it is on now.

    Stages banked before days were counted this way hold seconds instead, which
    are read back at whole days so nothing recorded is lost.
    """
    days = stage.get("elapsed_days")
    if days is None:
        return int(stage.get("elapsed_seconds") or 0) // 86400
    return int(days)


def days_in_stage(stage: Dict[str, Any], now: Optional[datetime] = None) -> int:
    """How long this stage has been worked on, counting a run still open.

    Counted as days on the Indian calendar rather than as 24-hour blocks: work
    started last evening is a day old this morning, which is how the team talks
    about it and how the standup already counts.
    """
    total = banked_days(stage)
    started = to_ist_date(stage.get("started_at"))
    if stage.get("state") == "in_progress" and started:
        today = to_ist_date(now) if now is not None else ist_today()
        if today:
            total += max(0, (today - started).days)
    return total


def apply_state(stage: Dict[str, Any], state: str, now: Optional[datetime] = None) -> None:
    """Move a stage into `state`, keeping its clock honest.

    Entering `in_progress` starts a run; leaving it banks the time. Reopening a
    finished stage keeps what it already cost and starts a new run.
    """
    moment = now or _now()
    previous = stage.get("state") or "not_started"
    if previous == state:
        return

    if previous == "in_progress":
        stage["elapsed_days"] = days_in_stage(stage, moment)
        stage.pop("elapsed_seconds", None)   # superseded by the day count
        stage["started_at"] = stage.get("started_at")

    if state == "in_progress":
        stage["started_at"] = moment
        stage["completed_at"] = None
    elif state == "done":
        stage["completed_at"] = moment
        if not stage.get("started_at"):
            # Marked done without ever being started: the record shows it took no time.
            stage["started_at"] = moment
    elif state == "not_started":
        stage["started_at"] = None
        stage["completed_at"] = None
        stage["elapsed_days"] = 0
        stage.pop("elapsed_seconds", None)
    else:  # blocked, skipped
        stage["completed_at"] = None

    stage["state"] = state


async def record_event(
    db: AsyncIOMotorDatabase,
    project_id: int,
    *,
    action: str,
    actor: str,
    stage_key: Optional[str] = None,
    stage_name: Optional[str] = None,
    field: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    note: Optional[str] = None,
) -> None:
    """Append to the project's activity trail. Never raises: a lost log line must not fail a move."""
    await db[EVENTS].insert_one({
        "project_id": project_id,
        "action": action,
        "stage_key": stage_key,
        "stage_name": stage_name,
        "field": field,
        "old_value": old_value,
        "new_value": new_value,
        "note": note,
        "actor": actor,
        "at": _now(),
    })
