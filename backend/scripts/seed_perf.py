"""Seed a large, synthetic dataset for performance work.

Operational script, like the other scripts here — not part of the app.

The dev database holds a few thousand tickets, which is not enough to tell a
fast endpoint from a slow one: a query that scans the whole collection still
answers in milliseconds at that size. This builds the dataset a larger
organisation would have, so the list endpoints can be measured under a load
that makes their cost visible (see bench_endpoints.py).

Writes to its own database — NEVER the dev or production one — so a benchmark
run can never disturb real data. The name must contain "perf" or "bench".

    python scripts/seed_perf.py                          # 100 projects, 50k tickets
    python scripts/seed_perf.py --projects 10 --tickets-per-project 200
    python scripts/seed_perf.py --drop                   # remove the database

Every run is deterministic: the same arguments produce the same data, so two
measurements are comparable.
"""

import argparse
import asyncio
import random
import sys
from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))

from app.core.settings import get_settings  # noqa: E402
from app.db.indexes import ensure_indexes  # noqa: E402

DEFAULT_DB = "stratzi_perf"
RANDOM_SEED = 20261027

# The default workflow a project is created with, mirroring seed_default_statuses.
STATUSES = [
    ("Backlog", "#94a3b8"),
    ("To Do", "#64748b"),
    ("In Progress", "#3b82f6"),
    ("In Review", "#a855f7"),
    ("Blocked", "#ef4444"),
    ("Testing", "#f59e0b"),
    ("Done", "#22c55e"),
]

TYPES = ["task", "bug", "story"]
PRIORITIES = ["lowest", "low", "medium", "high", "highest"]
LABEL_POOL = [
    "frontend", "backend", "infra", "security", "performance", "ux",
    "tech-debt", "customer", "regression", "docs",
]

TITLE_VERBS = ["Fix", "Add", "Refactor", "Investigate", "Remove", "Document", "Migrate", "Tune"]
TITLE_NOUNS = [
    "login flow", "board filters", "sprint rollover", "webhook retries", "audit log",
    "ticket search", "epic progress", "notification digest", "import parser", "status mapping",
]

# Written on every document so --drop and any later cleanup can find them, and so
# a stray perf document is recognisable if one ever ends up somewhere it shouldn't.
SEED_MARKER = "perf"


def _check_db_name(name: str) -> None:
    """Refuse any database that isn't obviously a throwaway benchmark one."""
    if "perf" not in name and "bench" not in name:
        raise SystemExit(
            f'refusing to touch database "{name}": the name must contain "perf" or "bench".\n'
            "This script writes tens of thousands of documents and is never meant to run "
            "against a dev or production database."
        )


async def _insert_many(collection, docs, batch: int = 2000) -> None:
    """Insert in batches so a large seed doesn't build one enormous command."""
    for start in range(0, len(docs), batch):
        await collection.insert_many(docs[start:start + batch], ordered=False)


async def seed(
    db,
    *,
    projects: int,
    tickets_per_project: int,
    epics_per_project: int,
    users: int,
    sprints_per_project: int,
) -> dict:
    rng = random.Random(RANDOM_SEED)
    now = datetime.now(timezone.utc)

    user_docs = [
        {
            "user_number": i,
            "email": f"perf{i}@example.com",
            "name": f"Perf User {i}",
            "role": "admin" if i == 1 else "member",
            "is_active": True,
            "created_at": now - timedelta(days=400),
            "seed": SEED_MARKER,
        }
        for i in range(1, users + 1)
    ]
    emails = [u["email"] for u in user_docs]
    await _insert_many(db["users"], user_docs)

    project_docs = []
    member_docs = []
    status_docs = []
    sprint_docs = []
    ticket_docs = []
    counter_docs = []

    status_seq = 0
    ticket_seq = 0
    subtask_total = 0

    for p in range(1, projects + 1):
        key = f"PF{p}"
        project_docs.append({
            "project_number": p,
            "key": key,
            "name": f"Perf Project {p}",
            "description": "Synthetic project for performance measurement.",
            "visibility": "private",
            "status": "active",
            "owner_id": 1,
            "created_at": now - timedelta(days=365),
            "deadline": now + timedelta(days=rng.randint(10, 200)) if p % 3 else None,
            "seed": SEED_MARKER,
        })

        # Everyone is a member of every project: membership is not what we're measuring,
        # and it keeps access checks out of the benchmark's way.
        for u in user_docs:
            member_docs.append({
                "project_id": p,
                "user_id": u["user_number"],
                "email": u["email"],
                "role": "admin" if u["user_number"] == 1 else "member",
                "active": True,
                "created_at": now - timedelta(days=360),
                "seed": SEED_MARKER,
            })

        project_status_ids = []
        for position, (name, color) in enumerate(STATUSES, start=1):
            status_seq += 1
            project_status_ids.append(status_seq)
            status_docs.append({
                "status_number": status_seq,
                "project_id": p,
                "name": name,
                "color": color,
                "position": position,
                "created_at": now - timedelta(days=365),
                "seed": SEED_MARKER,
            })

        project_sprint_ids = []
        for s in range(1, sprints_per_project + 1):
            project_sprint_ids.append(s)
            sprint_docs.append({
                "sprint_number": s,
                "project_id": p,
                "name": f"{key} Sprint {s}",
                "goal": None,
                "state": "active" if s == sprints_per_project else "closed",
                "start_date": now - timedelta(days=14 * (sprints_per_project - s + 1)),
                "end_date": now - timedelta(days=14 * (sprints_per_project - s)),
                "created_by_email": emails[0],
                "created_at": now - timedelta(days=14 * (sprints_per_project - s + 1)),
                "committed_points": 0,
                "completed_points": 0,
                "seed": SEED_MARKER,
            })

        # Epics first: tickets below point at them.
        project_epic_ids = []
        for e in range(1, epics_per_project + 1):
            ticket_seq += 1
            project_epic_ids.append(ticket_seq)
            ticket_docs.append({
                "ticket_number": ticket_seq,
                "project_id": p,
                "key": f"{key}-E{e}",
                "title": f"Epic {e}: {rng.choice(TITLE_NOUNS)}",
                "description": "Synthetic epic.",
                "type": "epic",
                "status_id": rng.choice(project_status_ids),
                "priority": rng.choice(PRIORITIES),
                "assignee_email": rng.choice(emails),
                "reporter_email": rng.choice(emails),
                "due_date": now + timedelta(days=rng.randint(-30, 120)),
                "start_date": None,
                "labels": [],
                "epic_id": None,
                "parent_id": None,
                "sprint_id": None,
                "epic_color": "#155dfc",
                "epic_position": e,
                "time_spent_seconds": 0,
                "created_at": now - timedelta(days=rng.randint(60, 360)),
                "updated_at": now - timedelta(days=rng.randint(0, 60)),
                "seed": SEED_MARKER,
            })

        project_ticket_ids = []
        for t in range(1, tickets_per_project + 1):
            ticket_seq += 1
            project_ticket_ids.append(ticket_seq)
            # Most tickets belong to an epic and a minority sit in a sprint, which is
            # roughly how a real backlog looks and is what the board/backlog split hinges on.
            epic_id = rng.choice(project_epic_ids) if project_epic_ids and rng.random() < 0.8 else None
            sprint_id = rng.choice(project_sprint_ids) if rng.random() < 0.3 else None
            ticket_docs.append({
                "ticket_number": ticket_seq,
                "project_id": p,
                "key": f"{key}-{t}",
                "title": f"{rng.choice(TITLE_VERBS)} {rng.choice(TITLE_NOUNS)} ({t})",
                "description": "Synthetic ticket body. " * rng.randint(3, 30),
                "type": rng.choice(TYPES),
                "status_id": rng.choice(project_status_ids),
                "priority": rng.choice(PRIORITIES),
                "assignee_email": rng.choice(emails) if rng.random() < 0.85 else None,
                "reporter_email": rng.choice(emails),
                "due_date": now + timedelta(days=rng.randint(-60, 120)) if rng.random() < 0.6 else None,
                "start_date": None,
                "labels": rng.sample(LABEL_POOL, rng.randint(0, 3)),
                "epic_id": epic_id,
                "parent_id": None,
                "sprint_id": sprint_id,
                "story_points": rng.choice([None, 1, 2, 3, 5, 8]),
                "time_spent_seconds": 0,
                "archived": rng.random() < 0.05,
                "created_at": now - timedelta(days=rng.randint(0, 365), seconds=rng.randint(0, 86399)),
                "updated_at": now - timedelta(days=rng.randint(0, 30)),
                "seed": SEED_MARKER,
            })

        # A tenth of the tickets have subtasks, one level deep (the app forbids more).
        for parent_id in project_ticket_ids:
            if rng.random() >= 0.1:
                continue
            for _ in range(rng.randint(1, 3)):
                ticket_seq += 1
                subtask_total += 1
                ticket_docs.append({
                    "ticket_number": ticket_seq,
                    "project_id": p,
                    "key": f"{key}-{ticket_seq}",
                    "title": f"Subtask of {parent_id}",
                    "description": "Synthetic subtask.",
                    "type": rng.choice(TYPES),
                    "status_id": rng.choice(project_status_ids),
                    "priority": rng.choice(PRIORITIES),
                    "assignee_email": rng.choice(emails),
                    "reporter_email": rng.choice(emails),
                    "due_date": None,
                    "start_date": None,
                    "labels": [],
                    "epic_id": None,
                    "parent_id": parent_id,
                    "sprint_id": None,
                    "time_spent_seconds": 0,
                    "archived": False,
                    "created_at": now - timedelta(days=rng.randint(0, 200)),
                    "updated_at": now - timedelta(days=rng.randint(0, 30)),
                    "seed": SEED_MARKER,
                })

        counter_docs.append({"_id": f"tickets_{p}", "seq": tickets_per_project + epics_per_project})
        counter_docs.append({"_id": f"sprints_{p}", "seq": sprints_per_project})
        counter_docs.append({"_id": f"epic_key_{p}", "seq": epics_per_project})

        # Flush periodically so memory stays flat on a large seed.
        if len(ticket_docs) >= 20000:
            await _insert_many(db["tickets"], ticket_docs)
            ticket_docs = []

    await _insert_many(db["projects"], project_docs)
    await _insert_many(db["project_members"], member_docs)
    await _insert_many(db["ticket_statuses"], status_docs)
    await _insert_many(db["sprints"], sprint_docs)
    if ticket_docs:
        await _insert_many(db["tickets"], ticket_docs)

    # The app allocates ids from these, so leave them past everything written here.
    counter_docs += [
        {"_id": "users", "seq": users},
        {"_id": "projects", "seq": projects},
        {"_id": "ticket_statuses", "seq": status_seq},
        {"_id": "tickets", "seq": ticket_seq},
    ]
    await _insert_many(db["counters"], counter_docs)

    return {
        "projects": projects,
        "users": users,
        "epics": projects * epics_per_project,
        "tickets": projects * tickets_per_project,
        "subtasks": subtask_total,
        "statuses": status_seq,
        "total_ticket_docs": ticket_seq,
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", default=DEFAULT_DB, help=f'database name (default: {DEFAULT_DB})')
    parser.add_argument("--projects", type=int, default=100)
    parser.add_argument("--tickets-per-project", type=int, default=500)
    parser.add_argument("--epics-per-project", type=int, default=20)
    parser.add_argument("--sprints-per-project", type=int, default=5)
    parser.add_argument("--users", type=int, default=50)
    parser.add_argument("--drop", action="store_true", help="drop the database and exit")
    parser.add_argument(
        "--no-indexes",
        action="store_true",
        help="skip index creation (to measure how the endpoints behave without them)",
    )
    args = parser.parse_args()

    _check_db_name(args.db)
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    await client.admin.command("ping")

    if args.drop:
        await client.drop_database(args.db)
        print(f"dropped {args.db}")
        client.close()
        return

    # Start from empty so a re-run is a replacement, not an accumulation.
    await client.drop_database(args.db)
    db = client[args.db]

    print(f"seeding {args.db} at {settings.mongodb_uri} ...")
    started = datetime.now(timezone.utc)
    stats = await seed(
        db,
        projects=args.projects,
        tickets_per_project=args.tickets_per_project,
        epics_per_project=args.epics_per_project,
        users=args.users,
        sprints_per_project=args.sprints_per_project,
    )
    elapsed = (datetime.now(timezone.utc) - started).total_seconds()

    if not args.no_indexes:
        confirmed = await ensure_indexes(db)
        print(f"confirmed {confirmed} indexes")

    print(f"seeded in {elapsed:.1f}s:")
    for k, v in stats.items():
        print(f"  {k:20} {v:,}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
