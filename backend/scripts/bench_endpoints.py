"""Time the list endpoints that the board, backlog and breakdown modal depend on.

Operational script, like the other scripts here — not part of the app.

Calls the real endpoints in-process over an ASGI transport (the same way the
tests do), so the numbers include access checks, the Mongo round trips and
response serialisation — everything except the network hop to the browser.
Alongside each timing it reports how many queries the endpoint issued, which is
the number that actually explains a slow list: the command counter comes from
MongoDB itself, so it counts round trips rather than trusting the code to say.

Point it at a benchmark database built by seed_perf.py:

    python scripts/seed_perf.py
    python scripts/bench_endpoints.py                     # busiest project
    python scripts/bench_endpoints.py --project 7 --runs 5
    python scripts/bench_endpoints.py --db stratzi_dev --read-only

--read-only is for measuring a database you must not write to; it skips nothing
today (every endpoint here is a GET) but makes the intent explicit, and refuses
any database whose name isn't a benchmark one unless you pass it.
"""

import argparse
import asyncio
import statistics
import sys
import time
from pathlib import Path

import httpx
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.settings import get_settings  # noqa: E402

DEFAULT_DB = "stratzi_perf"


async def _command_count(db) -> int:
    """Total commands this mongod has served, used as a before/after delta."""
    stats = await db.client.admin.command("serverStatus")
    opcounters = stats.get("opcounters", {})
    return int(opcounters.get("query", 0)) + int(opcounters.get("command", 0))


async def _time_call(client, db, method: str, url: str, runs: int) -> dict:
    """Run one endpoint `runs` times, reporting the median and the query count."""
    timings = []
    queries = 0
    status = None
    size = 0

    for attempt in range(runs):
        before = await _command_count(db)
        started = time.perf_counter()
        response = await client.request(method, url, timeout=600.0)
        elapsed = (time.perf_counter() - started) * 1000
        after = await _command_count(db)

        status = response.status_code
        size = len(response.content)
        timings.append(elapsed)
        # The serverStatus calls themselves are two of the commands counted.
        if attempt == 0:
            queries = max(0, after - before - 2)

    return {
        "url": url,
        "status": status,
        "median_ms": statistics.median(timings),
        "min_ms": min(timings),
        "max_ms": max(timings),
        "queries": queries,
        "kb": size / 1024,
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--project", type=int, default=None, help="project id (default: the one with most tickets)")
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--read-only", action="store_true", help="allow a database that isn't a benchmark one")
    parser.add_argument("--label", default="", help="tag for this run, printed in the header")
    args = parser.parse_args()

    if not args.read_only and "perf" not in args.db and "bench" not in args.db:
        raise SystemExit(
            f'refusing to benchmark "{args.db}" without --read-only: the name is not a benchmark database.'
        )

    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    db = client[args.db]
    await client.admin.command("ping")

    project_id = args.project
    if project_id is None:
        busiest = await db["tickets"].aggregate([
            {"$group": {"_id": "$project_id", "n": {"$sum": 1}}},
            {"$sort": {"n": -1}},
            {"$limit": 1},
        ]).to_list(1)
        if not busiest:
            raise SystemExit(f'no tickets in "{args.db}" — run seed_perf.py first')
        project_id = int(busiest[0]["_id"])

    totals = {
        "tickets in project": await db["tickets"].count_documents({"project_id": project_id}),
        "epics in project": await db["tickets"].count_documents({"project_id": project_id, "type": "epic"}),
        "tickets in database": await db["tickets"].count_documents({}),
    }

    # Bind the app to this database and to an admin, the way the test fixtures do,
    # so the endpoints run exactly as they do in the app.
    from app.core.security import CurrentUser, get_current_user
    from app.db.mongo import get_mongo_db
    from app.main import app

    async def _db():
        yield db

    app.dependency_overrides[get_mongo_db] = _db
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=1, email="perf1@example.com", name="Perf User 1", role="admin"
    )

    calls = [
        ("GET", f"/projects/{project_id}/tickets"),
        ("GET", f"/projects/{project_id}/tickets?include_subtasks=true"),
        ("GET", f"/projects/{project_id}/epics"),
    ]

    header = f'{args.db} | project {project_id} | {args.runs} runs'
    if args.label:
        header = f"{args.label} — {header}"
    print(header)
    for k, v in totals.items():
        print(f"  {k:22} {v:,}")
    print()
    print(f'{"endpoint":52} {"median":>9} {"min":>8} {"max":>8} {"queries":>8} {"size":>9}')
    print("-" * 100)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://bench") as api:
        for method, url in calls:
            result = await _time_call(api, db, method, url, args.runs)
            label = url if len(url) <= 50 else url[:49] + "..."
            if result["status"] != 200:
                print(f'{label:52} FAILED with HTTP {result["status"]}')
                continue
            print(
                f'{label:52} {result["median_ms"]:8.0f}ms {result["min_ms"]:7.0f}ms '
                f'{result["max_ms"]:7.0f}ms {result["queries"]:8,} {result["kb"]:8.0f}KB'
            )

    app.dependency_overrides.clear()
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
