<div align="center">
<img src="docs/assets/README%20banner.png" alt="GRID: open-source project management" width="100%">
</div>

# GRID

**Open-source, self-hosted project management**, by [Stratzi](http://stratzi.ai/).

<p>
  <a href="https://github.com/Stratzi-Tech/grid/actions/workflows/ci.yml"><img src="https://github.com/Stratzi-Tech/grid/actions/workflows/ci.yml/badge.svg?branch=develop" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/version-1.0.0-orange.svg" alt="Version 1.0.0">
  <img src="https://img.shields.io/badge/python-3.11%2B-3776AB?logo=python&logoColor=white" alt="Python 3.11+">
  <img src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white" alt="Next.js 15">
  <img src="https://img.shields.io/badge/MongoDB-7.x-47A248?logo=mongodb&logoColor=white" alt="MongoDB 7.x">
  <img src="https://img.shields.io/badge/docker-compose-2496ED?logo=docker&logoColor=white" alt="Docker Compose">
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome"></a>
</p>

GRID is a self-hosted project tracker for teams who have outgrown a spreadsheet and
don't want a per-seat bill. Boards, sprints, epics and the agile reports people
actually open, running on your own MongoDB, with your data staying on your own
hardware.

Built with FastAPI and Next.js. One command to start, one script to create the
first admin, no SaaS account anywhere in the loop.

> **Status: v1.0.0, first public release.** It has been in daily use by a small
> team for months, which is a different thing from being battle-tested
> everywhere. If you hit a rough edge, please report it.

---

## Why GRID

- **Your data, your hardware.** It runs on your own MongoDB. No SaaS account,
  no telemetry in the loop, no per-seat bill.
- **Workflow is yours.** Columns and statuses come from a per-project workflow
  you define, not a fixed To Do / In Progress / Done.
- **Roles are enforced server-side**, not just hidden in the UI.
- **Small to run.** Three containers (MongoDB, backend, frontend) and one
  command to create the first admin.

**Not (yet):**

- There is no hosted or multi-tenant SaaS version; you run it yourself.
- Integrations are limited to Google sign-in/Workspace sync and Slack.
- It has run in production on one team's setup so far; see the status note above.

---

## Screenshot

[![GRID board view](docs/assets/Product%20preview.png)](docs/assets/Product%20preview.png)

---

## Features

**Planning**

- **Boards**: drag-and-drop columns driven by a per-project workflow you
  define yourself, not a fixed To Do / In Progress / Done.
- **Sprints**: multiple sprints can run at once, which matters if your team
  splits across workstreams. Start, complete, and roll incomplete work forward.
- **Backlog**: ranked, with drag-to-prioritise and bulk edits.
- **Epics and subtasks**: group work above and below the ticket.
- **Timeline**: a cross-project timeline with search, filtering and sorting.
- **Releases**: cut a version, see what landed in it.
- **Issue links**: blocks, duplicates, relates-to, across projects.
- **Create a project from a spreadsheet**: upload an Excel/CSV export and it
  becomes a project with one ticket per row; columns like Title, Assignee, Due
  Date and Status map automatically. Include an **email** column for reliable
  assignee matching; names are matched best-effort and left blank when ambiguous.

**Tracking**

- **Reports**: burndown and velocity, plus a sprint report. All exportable.
- **Standups**: an async standup screen with history.
- **Lifecycle**: track a project through its stages, separately from ticket
  status.
- **Watchers and notifications**: follow a ticket, get told when it moves.
- **Search and saved filters**: a query language over tickets, with filters
  you can name and reuse.

**Team**

- **Projects with per-project membership** and roles that are actually enforced
  server-side, not just hidden in the UI.
- **Admin screens** for users, teams, workflows and organization settings.

**Optional integrations**: all off unless you configure them, and nothing
breaks when they are off:

- **Google sign-in** (and optional Workspace user sync)
- **Slack**: ticket notifications and a `/create-ticket` command

---

## Quick start

The fast path, with Docker. For the manual setup, a real domain, Google
sign-in, or anything that isn't localhost, read
**[docs/self-hosting.md](docs/self-hosting.md)** instead; this section is the
short version of it.

**You'll need** Docker Engine with Compose v2.24 or newer. Nothing else.

**1. Set up the database and your admin account.**

```bash
docker compose run --rm init --email <ADMIN_EMAIL> --password <PASSWORD>
```

That starts MongoDB, creates every index, seeds the master data and creates
your account, then exits. A fresh database has no accounts and there is no
sign-up link; this one invites everyone else. It is idempotent, so re-run it
whenever you like. With no arguments it prompts instead.

**2. Start everything.**

```bash
docker compose up --build
```

The app is on <http://localhost:3000>, the API on <http://localhost:8000>. Sign
in at `/login` with the credentials from step 1.

That is the whole of it on a fresh clone: `init` needs nothing but the
database. The **backend** does need configuration before you run this against
anything real: copy `backend/.env.example` to `backend/.env` and set
`APP_ENVIRONMENT`, `APP_SECRET_KEY` and `APP_MONGODB_URI`. The app
refuses to boot outside `development` while the secret key is still the
placeholder: it signs every session cookie, so a shared default would let
anyone forge a login. See
[docs/self-hosting.md](docs/self-hosting.md#before-you-go-to-production).

### Try it with demo data

A fresh install is an empty board. To see a populated workspace first, load the
fictional demo dataset (several projects, sprints, epics and releases). It is
not part of the Docker image, so run it from a manual setup (below), from
`backend/` inside the virtualenv:

```bash
python seed_demo.py
```

`python seed_demo.py --remove` takes it back out again and leaves your real
data alone. Details in
[docs/self-hosting.md](docs/self-hosting.md#load-demo-data-optional).

### Running without Docker

You'll need Python 3.11+, Node 22+, and a MongoDB 7.x that is **already running
and reachable**; this path does not start one for you. Setup is one command
from the repository root:

```bash
./scripts/setup.sh --email <ADMIN_EMAIL> --password <PASSWORD>
```

On Windows use `scripts/setup.ps1`. It takes the same options but with
PowerShell syntax, `-Email` / `-Password` with a single dash, **not** the
`--email` / `--password` of the shell script:

```powershell
.\scripts\setup.ps1 -Email <ADMIN_EMAIL> -Password <PASSWORD>
```

The wrapper creates `backend/.env`, builds the virtualenv, installs the
dependencies and creates your admin account; leave the flags off and it
prompts. Then start the two servers: backend from `backend/`, frontend from
`frontend/`:

```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
npm ci && npm run dev
```

On Windows, call the virtualenv's Python directly so the command doesn't depend
on activation or your `PATH`:

```powershell
cd backend ; .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Note that this seeds whatever `APP_MONGODB_URI` points at, by default your
local MongoDB, which is **not** the one `docker compose up` runs. The two are
separate databases.

[docs/self-hosting.md](docs/self-hosting.md#path-b--manual) has the full
walkthrough, including the mistakes that cost people an afternoon.

---

## Configuration

Backend settings live in `backend/.env`, all prefixed `APP_`.
`backend/.env.example` is the annotated list;
[docs/self-hosting.md](docs/self-hosting.md#configuration) covers what actually
matters.

Two worth knowing about before you expose an instance:

- **`APP_ALLOWED_DOMAINS`** is empty by default, and empty means **any**
  Google account on the internet can sign in to your instance. Set it to your
  own domains.
- **`APP_SERVICE_KEY`** enables service-to-service impersonation: anyone
  holding it can act as any user, including an admin. Leave it empty, which
  disables it.

Uploaded files go to local disk by default; point `APP_STORAGE_URL` at an
`s3://`, `az://` or `gs://` bucket to use object storage instead. See
[File storage](docs/self-hosting.md#file-storage) in the self-hosting guide.

Settings are read once at import, so restart the backend after editing `.env`.

The frontend reads `frontend/.env` (copy `frontend/.env.example`). It needs only
`NEXT_PUBLIC_API_URL` (where the backend is) and `NEXT_PUBLIC_FRONTEND_URL`
(where the app is served). Both are baked in at build time, so rebuild after
changing them.

A fresh install starts empty. To see a populated workspace first, load the
optional demo data, see
[Load demo data](docs/self-hosting.md#load-demo-data-optional).

---

## Tech stack

| | |
|---|---|
| Backend | Python 3.11+, FastAPI, Motor (async MongoDB), Pydantic v2, Authlib |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Recharts |
| Database | MongoDB 7.x |
| Auth | Session cookies, bcrypt password hashing, optional Google OAuth |

---

## Repository layout

```
backend/            FastAPI application
  app/routes/       HTTP endpoints, one module per feature area
  app/services/     Business logic
  app/db/           Index definitions and bootstrap
  scripts/init_db.py  First-run setup: indexes, master data, first admin
  tests/            pytest suite
frontend/           Next.js application
  src/app/          App Router pages
  src/components/   Shared components
  src/design-system/  Primitives and tokens
docs/               Self-hosting guide and friends
scripts/            setup.sh / setup.ps1 wrappers around init_db
docker-compose.yml  mongo + backend + frontend
```

---

## Development

To work on GRID, set it up without Docker (see
[Running without Docker](#running-without-docker)) and start the two servers
with hot reload: `uvicorn ... --reload` for the backend and `npm run dev` for
the frontend. [CONTRIBUTING.md](CONTRIBUTING.md#getting-set-up) has the detail.

Backend tests run against a real MongoDB, each in a throwaway database that is
dropped afterwards:

```bash
cd backend && python -m pytest
```

Use `python -m pytest`, not bare `pytest`; the application package is resolved
relative to the working directory.

---

## Contributing

Issues and pull requests are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, branch and PR flow, and code
style.

Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) too; it is the
Contributor Covenant, and it is short.

## Security

Please do not open a public issue for a vulnerability. Report it through GitHub
private vulnerability reporting, or by email as described in
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE).

---

<div align="center">
<a href="http://stratzi.ai/"><img src="docs/assets/logo.png" alt="Stratzi" width="140"></a>
</div>
