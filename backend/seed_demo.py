"""Load an optional, realistic demo dataset into an install.

Unlike the perf seed (scripts/seed_perf.py), which exists only to stress
endpoints against its own throwaway database, this script is meant to run
against a *real* install right after init_db, so a newcomer opens the app and
sees how a populated workspace looks instead of an empty board: several
projects with their own boards and active sprints, epics with linked work (so
both the board cards and the dedicated Epics page fill in), a few releases with
changelogs and deployments, and a filled notification bell for the admin.

    python seed_demo.py                       # seed the modest demo (default)
    python seed_demo.py --scale large         # team-sized volumes (~thousands of tickets)
    python seed_demo.py --remove              # remove everything this script created
    python seed_demo.py --owner you@acme.com  # who owns/sees the demo projects
    python seed_demo.py --yes                 # skip the confirmation prompt (CI)

It reads the connection from backend/.env (APP_MONGODB_URI, APP_MONGODB_DB_NAME),
so it targets whatever init_db set up. Because that may be a production database,
it asks for confirmation before writing unless the name looks like a dev one or
--yes is passed.

Every document it writes carries seed_source: "demo", which is how --remove finds
them. A seed run purges any previous demo data first, so re-running never piles
up duplicates. The people are invented and the data is fictional — none of it is
real, and nothing here is used by the app itself.
"""

import argparse
import asyncio
import random
import sys
from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument

from app.core.settings import get_settings
from app.routes.projects import get_next_project_number, seed_default_statuses
from app.routes.tickets import generate_ticket_key

# Tag written on every seeded document, so --remove can find exactly what this
# script created and nothing else.
SEED_SOURCE = "demo"
SEED = {"seed_source": SEED_SOURCE}

# Invented demo people — created only when this script runs, never real users and
# never referenced by the app. @example.com by RFC 2606, so nothing can be emailed.
ROSTER = [
    ("Alice Nguyen", "alice@example.com"),
    ("Ben Carter", "ben@example.com"),
    ("Carla Diaz", "carla@example.com"),
    ("Dana Lee", "dana@example.com"),
    ("Evan Brooks", "evan@example.com"),
    ("Fatima Noor", "fatima@example.com"),
    ("Grace Kim", "grace@example.com"),
    ("Hiro Tanaka", "hiro@example.com"),
    ("Ivan Petrov", "ivan@example.com"),
    ("Julia Santos", "julia@example.com"),
    ("Kofi Mensah", "kofi@example.com"),
    ("Lena Vogel", "lena@example.com"),
    ("Marco Rossi", "marco@example.com"),
    ("Nadia Hassan", "nadia@example.com"),
    ("Omar Khan", "omar@example.com"),
    ("Priya Rao", "priya@example.com"),
    ("Quinn Walsh", "quinn@example.com"),
    ("Rafael Cruz", "rafael@example.com"),
    ("Sofia Alvarez", "sofia@example.com"),
    ("Tomas Novak", "tomas@example.com"),
    ("Uma Patel", "uma@example.com"),
    ("Viktor Ivanov", "viktor@example.com"),
    ("Wei Chen", "wei@example.com"),
    ("Xena Georgiou", "xena@example.com"),
    ("Yara Haddad", "yara@example.com"),
    ("Zane Mitchell", "zane@example.com"),
    ("Aditi Sharma", "aditi@example.com"),
    ("Bruno Costa", "bruno@example.com"),
    ("Chloe Martin", "chloe@example.com"),
    ("Diego Torres", "diego@example.com"),
    ("Elena Popova", "elena@example.com"),
    ("Finn O'Brien", "finn@example.com"),
    ("Gita Desai", "gita@example.com"),
    ("Hana Suzuki", "hana@example.com"),
    ("Ravi Menon", "ravi@example.com"),
    ("Sara Lindqvist", "sara@example.com"),
    ("Theo Dubois", "theo@example.com"),
    ("Nour El-Sayed", "nour@example.com"),
    ("Paulo Silva", "paulo@example.com"),
    ("Mei Lin", "mei@example.com"),
]

# (key, name) — a believable spread of software-team projects.
PROJECTS = [
    ("STR", "Storefront"),
    ("PAY", "Payments Platform"),
    ("DOC", "Docs & Help Center"),
    ("MOB", "Mobile App"),
    ("API", "Public API"),
    ("ANA", "Analytics"),
    ("BIL", "Billing"),
    ("NOT", "Notifications"),
    ("INF", "Infrastructure"),
    ("GRW", "Growth Experiments"),
    ("SUP", "Support Tools"),
    ("IDN", "Identity & Access"),
    ("SRCH", "Search"),
    ("DSN", "Design System"),
    ("INT", "Integrations"),
    ("DAT", "Data Pipeline"),
]

STATUS_ORDER = ["Backlog", "Ready to Pick", "In Progress", "In Review", "Testing", "Done", "Blocked"]
# How tickets spread across the board — weighted so most work is in flight or done.
STATUS_WEIGHTS = [18, 10, 16, 8, 8, 32, 8]

TYPES = ["story", "task", "bug"]
TYPE_WEIGHTS = [38, 42, 20]
PRIORITIES = ["urgent", "high", "medium", "low"]  # canonical set (app/core/priority.py)
PRIORITY_WEIGHTS = [10, 28, 42, 20]
STORY_POINTS = [1, 2, 3, 5, 8]

TITLE_VERBS = ["Fix", "Add", "Refactor", "Investigate", "Remove", "Document",
               "Migrate", "Tune", "Redesign", "Simplify", "Harden", "Audit"]
TITLE_NOUNS = [
    "login flow", "board filters", "sprint rollover", "webhook retries", "audit log",
    "ticket search", "epic progress", "notification digest", "import parser", "status mapping",
    "pagination", "date handling", "role checks", "empty states", "error toasts",
    "keyboard shortcuts", "bulk actions", "CSV export", "dark mode", "mobile layout",
    "rate limiting", "session renewal", "file uploads", "comment threads", "saved views",
]
EPIC_NAMES = [
    "Onboarding overhaul", "Billing v2", "Search relevance", "Mobile parity",
    "Performance budget", "Accessibility pass", "Reporting suite", "Self-serve signup",
    "Workflow automation", "API rate limits", "Realtime updates", "Data retention",
]
EPIC_COLORS = ["#155dfc", "#7c3aed", "#0891b2", "#ea580c", "#16a34a", "#db2777"]

LABEL_POOL = ["frontend", "backend", "infra", "security", "performance", "ux",
              "tech-debt", "customer", "regression", "docs"]

CHANGELOG_CATEGORIES = ["feature", "fix", "enhancement", "docs", "breaking", "other"]

# Volume knobs per scale. "small" is the demo a newcomer wants; "large" mirrors the
# team-sized stress data the old team-view seed produced.
SCALES = {
    "small": dict(projects=12, members=24, tickets_per_project=14,
                  epics_per_project=2, sprints_per_project=3, releases=6),
    "large": dict(projects=16, members=40, tickets_per_project=240,
                  epics_per_project=4, sprints_per_project=4, releases=12),
}


def weighted(rng, choices, weights):
    return rng.choices(choices, weights=weights, k=1)[0]


async def next_counter(db, counter_id: str) -> int:
    doc = await db["counters"].find_one_and_update(
        {"_id": counter_id}, {"$inc": {"seq": 1}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    return int(doc["seq"])


async def next_ticket_number(db) -> int:
    """Global ticket counter kept ahead of the real max — same scheme as create_ticket,
    so demo ids never collide with ids the app later assigns."""
    result = await db["tickets"].aggregate(
        [{"$group": {"_id": None, "m": {"$max": "$ticket_number"}}}]
    ).to_list(1)
    max_existing = result[0]["m"] if result and result[0].get("m") else 0
    doc = await db["counters"].find_one_and_update(
        {"_id": "tickets"},
        [{"$set": {"seq": {"$max": [{"$add": [{"$ifNull": ["$seq", 0]}, 1]}, max_existing + 1]}}}],
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    return int(doc["seq"])


async def resolve_owner(db, owner_email):
    """Pick the account that owns the demo projects and gets the notifications.

    Prefers --owner; otherwise the first admin created by init_db. Returns the user
    doc or None (the seed still runs, just without an owner member/notifications)."""
    if owner_email:
        user = await db["users"].find_one({"email": owner_email.lower()})
        if not user:
            print(f"Warning: --owner {owner_email} not found; seeding without an owner.")
        return user
    return await db["users"].find_one({"role": "admin"})


async def remove(db) -> None:
    """Delete everything a previous demo seed created (idempotent)."""
    project_ids = [p["project_number"] async for p in db["projects"].find(SEED, {"project_number": 1})]
    counts = {}
    for collection in ("tickets", "sprints", "project_members", "releases",
                       "release_tickets", "notifications", "users"):
        counts[collection] = (await db[collection].delete_many(SEED)).deleted_count
    if project_ids:
        # Statuses are created by seed_default_statuses, which does not tag them,
        # so they are removed by the seeded projects' ids instead.
        counts["ticket_statuses"] = (
            await db["ticket_statuses"].delete_many({"project_id": {"$in": project_ids}})
        ).deleted_count
    counts["projects"] = (await db["projects"].delete_many(SEED)).deleted_count
    removed = ", ".join(f"{name} {count}" for name, count in counts.items() if count)
    print(f"Removed previous demo data: {removed or 'nothing to remove'}")


async def seed(db, cfg: dict, owner) -> None:
    rng = random.Random(42)  # deterministic: same scale always yields the same data
    now = datetime.now(timezone.utc)

    owner_email = owner["email"] if owner else None
    owner_id = owner["user_number"] if owner else None

    # ---- people ----
    roster = ROSTER[: cfg["members"]]
    user_id_by_email = {}
    first_number = 20000  # well clear of real accounts; advanced per insert
    number = first_number
    for name, email in roster:
        existing = await db["users"].find_one({"email": email})
        if existing:
            user_id_by_email[email] = existing["user_number"]
            continue
        await db["users"].insert_one({
            "email": email, "name": name, "role": "user",
            "user_number": number, "created_at": now, **SEED,
        })
        user_id_by_email[email] = number
        number += 1
    emails = list(user_id_by_email.keys())

    projects_cfg = PROJECTS[: cfg["projects"]]
    totals = {"projects": 0, "epics": 0, "tickets": 0, "sprints": 0, "releases": 0}
    done_name = "Done"

    for key, pname in projects_cfg:
        # ---- project + statuses ----
        pnum = await get_next_project_number(db)
        await db["projects"].insert_one({
            "project_number": pnum, "key": key, "name": pname,
            "description": f"{pname} — demo project.", "visibility": "private",
            "status": "active", "created_at": now - timedelta(days=90), **SEED,
        })
        totals["projects"] += 1
        await seed_default_statuses(db, pnum)
        status_id = {s["name"]: s["status_number"]
                     async for s in db["ticket_statuses"].find({"project_id": pnum})}

        # ---- members: a random slice of the roster, plus the owner as admin ----
        member_emails = rng.sample(emails, k=min(len(emails), rng.randint(5, 9)))
        for i, email in enumerate(member_emails):
            await db["project_members"].insert_one({
                "project_id": pnum, "user_email": email, "user_id": user_id_by_email[email],
                "role": "admin" if i == 0 else "member", "active": True,
                "joined_at": now - timedelta(days=80), **SEED,
            })
        if owner and owner_email not in member_emails:
            await db["project_members"].insert_one({
                "project_id": pnum, "user_email": owner_email, "user_id": owner_id,
                "role": "admin", "active": True, "joined_at": now - timedelta(days=80), **SEED,
            })

        # ---- sprints: one active, the rest closed ----
        sprint_ids = []
        n_sprints = cfg["sprints_per_project"]
        for s in range(n_sprints):
            from_end = n_sprints - s  # sprint 0 oldest, last one current
            snum = await next_counter(db, f"sprints_{pnum}")
            active = s == n_sprints - 1
            await db["sprints"].insert_one({
                "sprint_number": snum, "project_id": pnum, "name": f"{key} Sprint {snum}",
                "goal": f"{pname} iteration {snum}",
                "state": "active" if active else "closed",
                "start_date": now - timedelta(days=14 * from_end),
                "end_date": now - timedelta(days=14 * (from_end - 1)),
                "created_at": now - timedelta(days=14 * from_end), **SEED,
            })
            sprint_ids.append(snum)
            totals["sprints"] += 1
        active_sprint = sprint_ids[-1]

        # ---- epics first: tickets below point at them via epic_id ----
        epic_numbers = []
        for e in range(cfg["epics_per_project"]):
            tnum = await next_ticket_number(db)
            await db["tickets"].insert_one({
                "ticket_number": tnum, "project_id": pnum,
                "key": await generate_ticket_key(db, pnum),
                "title": rng.choice(EPIC_NAMES), "description": None, "type": "epic",
                "status_id": status_id["In Progress"],
                "priority": weighted(rng, PRIORITIES, PRIORITY_WEIGHTS),
                "assignee_email": None, "reporter_email": rng.choice(member_emails),
                "due_date": None, "labels": [], "epic_id": None, "parent_id": None,
                "sprint_id": None, "story_points": None, "time_spent_seconds": 0,
                "epic_color": rng.choice(EPIC_COLORS), "epic_position": e,
                "created_at": now - timedelta(days=rng.randint(40, 85)),
                "updated_at": None, **SEED,
            })
            epic_numbers.append(tnum)
            totals["epics"] += 1

        # ---- regular tickets ----
        project_ticket_numbers = []
        for _ in range(cfg["tickets_per_project"]):
            tnum = await next_ticket_number(db)
            status_name = weighted(rng, STATUS_ORDER, STATUS_WEIGHTS)
            ttype = weighted(rng, TYPES, TYPE_WEIGHTS)
            assignee = rng.choice(member_emails + [None])  # some unassigned, as in real life
            # ~80% belong to an epic; ~30% sit in the active sprint.
            epic_id = rng.choice(epic_numbers) if epic_numbers and rng.random() < 0.8 else None
            sprint_id = active_sprint if rng.random() < 0.3 else None
            created_days = rng.randint(1, 60)
            # A believable minority have due dates, some of them overdue / due today.
            due_date = None
            if rng.random() < 0.45:
                due_date = now + timedelta(days=rng.choice([-5, -2, -1, 0, 0, 1, 3, 7, 14]))

            doc = {
                "ticket_number": tnum, "project_id": pnum,
                "key": await generate_ticket_key(db, pnum),
                "title": f"{rng.choice(TITLE_VERBS)} {rng.choice(TITLE_NOUNS)}",
                "description": None, "type": ttype,
                "status_id": status_id[status_name],
                "priority": weighted(rng, PRIORITIES, PRIORITY_WEIGHTS),
                "assignee_email": assignee,
                "reporter_email": rng.choice(member_emails),
                "due_date": due_date,
                "labels": rng.sample(LABEL_POOL, k=rng.randint(0, 2)),
                "epic_id": epic_id, "parent_id": None, "sprint_id": sprint_id,
                "story_points": rng.choice(STORY_POINTS),
                "time_spent_seconds": rng.choice([0, 0, 1800, 3600, 7200]),
                "created_at": now - timedelta(days=created_days), "updated_at": None, **SEED,
            }
            if status_name == done_name:
                doc["completed_at"] = now - timedelta(days=rng.randint(0, created_days))
            await db["tickets"].insert_one(doc)
            project_ticket_numbers.append(tnum)
            totals["tickets"] += 1

        # ---- releases for a subset of projects ----
        if totals["releases"] < cfg["releases"] and project_ticket_numbers:
            for v in range(rng.randint(1, 2)):
                if totals["releases"] >= cfg["releases"]:
                    break
                rel_num = await next_counter(db, "releases")
                rstatus = rng.choice(["planned", "in-progress", "released"])
                major, minor = 1, totals["releases"]
                released = rstatus == "released"
                included = rng.sample(project_ticket_numbers,
                                      k=min(len(project_ticket_numbers), rng.randint(3, 6)))
                changelog = [{
                    "category": rng.choice(CHANGELOG_CATEGORIES),
                    "description": f"{rng.choice(TITLE_VERBS)} {rng.choice(TITLE_NOUNS)}",
                    "ticket_key": None, "ticket_id": tid, "commit_hash": None,
                } for tid in included[:3]]
                deployments = []
                if rstatus in ("in-progress", "released"):
                    deployments.append({
                        "environment": "staging",
                        "deployed_at": now - timedelta(days=rng.randint(1, 20)),
                        "deployed_by_email": rng.choice(member_emails),
                        "deployed_by_name": None, "status": "success",
                        "commit_hash": None, "notes": None,
                    })
                if released:
                    deployments.append({
                        "environment": "production",
                        "deployed_at": now - timedelta(days=rng.randint(1, 10)),
                        "deployed_by_email": rng.choice(member_emails),
                        "deployed_by_name": None, "status": "success",
                        "commit_hash": None, "notes": None,
                    })
                await db["releases"].insert_one({
                    "release_number": rel_num, "project_id": pnum,
                    "name": f"{pname} {major}.{minor}.0",
                    "version": f"{major}.{minor}.0",
                    "description": f"Release for {pname}.",
                    "release_notes": None,
                    "release_date": (now - timedelta(days=rng.randint(1, 10))) if released else None,
                    "git_merge_mr": None, "status": rstatus,
                    "created_by_email": owner_email or rng.choice(member_emails),
                    "created_at": now - timedelta(days=rng.randint(10, 30)),
                    "updated_at": None, "git_tag": None, "git_branch": None, "commits": [],
                    "deployments": deployments, "changelog_items": changelog,
                    "auto_generated_changelog": False, "first_commit_date": None,
                    "release_completed_date": (now - timedelta(days=rng.randint(1, 10))) if released else None,
                    **SEED,
                })
                for tid in included:
                    await db["release_tickets"].insert_one({
                        "release_id": rel_num, "project_id": pnum, "ticket_id": tid,
                        "added_at": now, "added_by_email": owner_email or rng.choice(member_emails),
                        **SEED,
                    })
                totals["releases"] += 1

    # ---- notifications for the owner, so the bell is populated ----
    if owner:
        sample = [t async for t in db["tickets"].find(
            {**SEED, "type": {"$ne": "epic"}},
            {"ticket_number": 1, "key": 1, "title": 1, "project_id": 1},
        ).limit(8)]
        templates = [
            ("ticket_assigned", "{who} assigned {key} to you: '{title}'", False, 5),
            ("comment_added", "{who} commented on {key}: 'Can we push this to next sprint?'", False, 18),
            ("ticket_updated", "{key} priority changed to Urgent by {who}", False, 45),
            ("mention", "{who} mentioned you in {key}", False, 90),
            ("ticket_updated", "{key} moved to 'In Review' by {who}", False, 130),
            ("ticket_assigned", "You were assigned {key}: '{title}'", True, 300),
            ("comment_added", "{who} replied on {key}: 'Done, deployed to staging'", True, 480),
            ("ticket_updated", "{key} closed by {who}", True, 1440),
        ]
        names = [n for n, _ in ROSTER]
        for tkt, (ntype, tmpl, read, mins) in zip(sample, templates):
            who = rng.choice(names).split()[0]
            await db["notifications"].insert_one({
                "notification_number": await next_counter(db, "notifications"),
                "user_id": owner_id, "project_id": tkt["project_id"],
                "ticket_id": tkt["ticket_number"], "ticket_key": tkt["key"],
                "type": ntype,
                "message": tmpl.format(who=who, key=tkt["key"], title=tkt.get("title", "")),
                "read": read, "created_at": now - timedelta(minutes=mins), **SEED,
            })

    print(
        f"Seeded {len(roster)} people, {totals['projects']} projects, "
        f"{totals['epics']} epics, {totals['tickets']} tickets, "
        f"{totals['sprints']} sprints, {totals['releases']} releases"
        + (f", notifications for {owner_email}." if owner else " (no owner found — skipped notifications).")
    )
    print("Remove with: python seed_demo.py --remove")


def looks_like_dev(db_name: str) -> bool:
    return any(marker in db_name.lower() for marker in ("dev", "test", "local", "demo"))


async def main() -> None:
    parser = argparse.ArgumentParser(description="Load optional demo data into an install.")
    parser.add_argument("--scale", choices=list(SCALES), default="small",
                        help="small = modest demo (default); large = team-sized volumes")
    parser.add_argument("--remove", action="store_true", help="remove all demo data, seed nothing")
    parser.add_argument("--owner", help="email of the account that owns the demo projects")
    parser.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    args = parser.parse_args()

    settings = get_settings()
    db_name = settings.mongodb_db_name

    # This script is meant to be able to touch a real install, so confirm before
    # writing to anything that does not obviously look like a dev database.
    if not args.remove and not args.yes and not looks_like_dev(db_name):
        reply = input(f"About to write demo data to database '{db_name}'. Continue? [y/N] ").strip().lower()
        if reply not in ("y", "yes"):
            print("Aborted.")
            sys.exit(1)

    client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    db = client[db_name]
    try:
        await remove(db)  # always purge prior demo data first (idempotent)
        if not args.remove:
            owner = await resolve_owner(db, args.owner)
            await seed(db, SCALES[args.scale], owner)
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
