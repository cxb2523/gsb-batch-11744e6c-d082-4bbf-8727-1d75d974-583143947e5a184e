# Self-hosting

Everything needed to run your own instance. Pick one of the two paths below —
Docker if you just want it running, manual if you want to develop against it.

- [Before you start](#before-you-start)
- [Path A — Docker](#path-a--docker)
- [Path B — manual](#path-b--manual)
- [Creating the first admin](#creating-the-first-admin)
- [Configuration](#configuration)
- [Google sign-in](#google-sign-in)
- [Troubleshooting](#troubleshooting)
- [Upgrading and backups](#upgrading-and-backups)

---

## Before you start

| | Docker path | Manual path |
|---|---|---|
| Docker Engine + Compose v2.24+ | required | — |
| Python | — | 3.11 or newer |
| Node.js | — | 22 or newer |
| MongoDB | started for you | 7.x, running and reachable |

You will also need a MongoDB instance you can write to, and — only if you want
Google sign-in — a Google Cloud project. Everything else is optional.

---

## Path A — Docker

From the repository root, setup is one command:

```bash
docker compose run --rm init --email you@example.com --password 'choose-a-real-one'
```

That starts MongoDB, creates every index, seeds the master data and creates
your admin account, then exits. It is idempotent — re-run it as often as you
like. Then start the stack:

```bash
docker compose up --build
```

The frontend is on <http://localhost:3000>, the backend on
<http://localhost:8000>. Sign in at `/login` with the email and password above.

> `init` sits behind a Compose profile, so `docker compose up` never starts it.
> It accepts everything `init_db.py` does — `--name`, `--skip-admin`,
> `--reset-password`, `--uri`, `--db`. With no arguments at all it prompts.
> See [Creating the first admin](#creating-the-first-admin).

### Before you go to production

The command above works on a fresh clone because `init` needs nothing but the
database. The **backend** does need config, so before `docker compose up` on
anything real:

```bash
cp backend/.env.example backend/.env
```

Open it and change three values:

```ini
APP_ENVIRONMENT=production
APP_SECRET_KEY=<paste a generated key, see below>
APP_MONGODB_URI=mongodb://mongo:27017
```

Generate the key with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

The app **refuses to start** outside `development` while the secret key is
still the placeholder. That is deliberate — the key signs every session
cookie, so a shared default would let anyone forge a login.

Inside the Compose network MongoDB answers to `mongo`, not `localhost`. If you
leave the URI pointing at localhost the backend starts and then fails to reach
the database.

### Serving it on a real domain

`docker-compose.yml` ships with localhost URLs. If this instance is reachable
at an actual address, two places need to change.

In `backend/.env` (or the `environment:` block):

```ini
APP_BACKEND_BASE_URL=https://api.example.com
APP_FRONTEND_BASE_URL=https://app.example.com
```

And in `docker-compose.yml`, the frontend's `build.args`:

```yaml
    build:
      args:
        NEXT_PUBLIC_API_URL: https://api.example.com
        NEXT_PUBLIC_FRONTEND_URL: https://app.example.com
```

Those two are **baked into the JavaScript bundle at build time**, not read from
the container's environment. An image built for one address cannot be
re-pointed at another by changing environment variables — it has to be rebuilt.
This is the single most common reason a deployed frontend loads but cannot talk
to its backend.

---

## Path B — manual

For developing against the app, or for running it against a MongoDB you manage
yourself. You need MongoDB 7.x already running and reachable.

### Backend

From the repository root, setup is one command:

```bash
./scripts/setup.sh --email you@example.com --password 'choose-a-real-one'
```

```powershell
.\scripts\setup.ps1 -Email you@example.com -Password 'choose-a-real-one'
```

The wrapper creates `backend/.env` from the example if it is missing, builds
`backend/.venv`, installs the dependencies, and runs
[`init_db.py`](#creating-the-first-admin) — indexes, master data and your admin
account. It is idempotent, so re-run it whenever you like.

Leave `--password` off and it prompts for the password twice, hidden; leave
`--email` off too and it prompts for both. Prefer that interactively: anything
on a command line is visible to other users on the machine via the process
list, and lands in your shell history. `--name`, `--skip-admin`,
`--reset-password`, `--uri` and `--db` (`-Database` in PowerShell) are passed
through to `init_db`.

If MongoDB is not running the wrapper says so and stops before building
anything, since there would be no database to set up.

> This seeds whatever `APP_MONGODB_URI` in `backend/.env` points at —
> `mongodb://localhost:27017` by default. That is **not** the MongoDB
> `docker compose up` runs, which lives in the Compose network with its own
> volume. The two are separate databases; use `docker compose run --rm init`
> for that one.

Then start the backend. On macOS / Linux, activate the virtualenv and run it:

```bash
cd backend
source .venv/bin/activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The leading `source` (or `.`) matters. Running `.venv/bin/activate` on its own
gives you `command not found`. **If your prompt already shows a `(venv)` or
`(.venv)` prefix, skip the activation** — you are in one.

On Windows, skip activation entirely and call the virtualenv's Python directly.
That never depends on `PATH` or on the `uvicorn.exe` shim, both of which are
common ways this fails:

```powershell
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Edit `backend/.env` as described under [Configuration](#configuration) before
running it against anything real.

On every start the app re-confirms the indexes it needs. That is idempotent and
safe. It also warns in the log if the database it is reading has no admin
account, naming that database and URI — a quick way to catch a skipped setup
step or an admin created in the wrong MongoDB.

#### Doing it by hand

The wrapper is only a convenience; nothing stops you from doing the same
steps yourself:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python scripts/init_db.py
```

### Frontend

In a second terminal:

```bash
cd frontend
npm ci
cp .env.example .env
```

`.env` needs to point at wherever the backend is actually listening:

```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000
```

```bash
npm run dev
```

> **Developing on this project rather than deploying it?** See
> [CONTRIBUTING.md](../CONTRIBUTING.md#getting-set-up) for the hot-reload setup.

---

## Creating the first admin

A fresh database has no accounts, and there is no "sign up" link. You create
the first global admin with a script; that account then invites everyone else
from the admin screens.

`backend/scripts/init_db.py` is that script. The three entry points above all
run it, and all take the same options:

| | |
|---|---|
| Docker | `docker compose run --rm init --email ... --password ...` |
| Shell | `./scripts/setup.sh --email ... --password ...` |
| PowerShell | `.\scripts\setup.ps1 -Email ... -Password ...` |

Or call it directly, from the `backend` directory with the virtualenv active:

```bash
python scripts/init_db.py
```

It asks for the email, then the password twice, with the password hidden:

```
Admin email: you@example.com
Admin password:
Confirm password:
```

That is the whole thing. It creates the indexes, seeds the organization
settings document, and creates the account. You can then sign in at `/login`
with those credentials — **no Google account is needed**, and the password is
not a temporary one you are forced to change.

### If you cannot type at a prompt

In CI, over SSH, from Ansible, or inside a container there is no terminal to
prompt at. Pass the values through the environment instead:

```bash
APP_INIT_ADMIN_EMAIL=you@example.com \
APP_INIT_ADMIN_PASSWORD='choose-a-real-one' \
python scripts/init_db.py
```

There are `--email` and `--password` flags too, but prefer the environment
variables: anything in a command line is visible to every other user on the
machine via the process list, and lands in your shell history.

### Options

| Flag | What it does |
|---|---|
| `--email`, `--password`, `--name` | Supply values instead of being asked |
| `--skip-admin` | Indexes and master data only, no account |
| `--reset-password` | Overwrite the password if the account already exists |
| `--uri`, `--db` | Override the connection from `.env` for this run |

### Re-running it

It is idempotent — run it as often as you like. A second run reports
`unchanged` and does nothing.

An account that already exists is **not** touched, apart from being promoted to
admin and reactivated if it somehow was not. Its password is left alone unless
you pass `--reset-password`. Re-running setup must never silently change
credentials someone is already using.

---

## Load demo data (optional)

A fresh install starts empty — every board and project is blank until you create
them. If you would rather see what a populated workspace looks like first, or you
are evaluating the app, load the optional demo dataset:

```bash
python seed_demo.py
```

Run it from `backend/`, inside the virtualenv, after setup. It reads the same
`backend/.env` connection, so it writes to whatever database you just
initialised — and because that might be a real one, it asks for confirmation
before writing unless the database name obviously looks like a dev one (pass
`--yes` to skip the prompt in CI). It invents a few dozen fictional people and
fills in several projects, each with its own board, an active sprint, epics with
linked tickets, a release or two, and a populated notification bell for the admin
account. None of it is real data and nothing in the app depends on it.

| Flag | What it does |
|---|---|
| `--scale large` | Team-sized volumes (thousands of tickets) instead of the modest default |
| `--owner you@example.com` | The account that owns the demo projects and receives the notifications (defaults to the first admin) |
| `--remove` | Delete everything the demo seed created, and nothing else |
| `--yes` | Skip the confirmation prompt |

Every document it writes is tagged, so `--remove` takes the demo data back out
cleanly and leaves your real projects untouched. Re-running the seed replaces the
previous demo data rather than duplicating it.

> For generating a large synthetic dataset to benchmark the API against, see
> `backend/scripts/seed_perf.py` instead — that one writes to its own throwaway
> database and is a developer tool, not a demo.

---

## Configuration

All backend settings live in `backend/.env` and are prefixed `APP_`. The
full annotated list is in `backend/.env.example`; this is what actually
matters.

### Must change

| Variable | Why |
|---|---|
| `APP_SECRET_KEY` | Signs sessions and JWTs. The app will not boot outside `development` on the default. |
| `APP_MONGODB_URI` | `mongodb://mongo:27017` under Docker, `mongodb://localhost:27017` otherwise. |
| `APP_ENVIRONMENT` | `production` for a real instance. |
| `APP_BACKEND_BASE_URL` | The address browsers reach the API at. Used to build OAuth callbacks. |
| `APP_FRONTEND_BASE_URL` | The address browsers reach the app at. Drives the CORS allowlist and the post-login redirect. |

Both base URLs are **origins**, not pages — `https://app.example.com`, never
`https://app.example.com/login`. A path here breaks CORS and sends people to a
dead address after signing in.

### Should set

| Variable | Why |
|---|---|
| `APP_ALLOWED_DOMAINS` | Comma-separated email domains allowed to sign in with Google. **Empty by default, and empty means any Google account on the internet can create an account on your instance.** |

### Optional

| Variable | Why |
|---|---|
| `APP_GOOGLE_WORKSPACE_DOMAIN` | Your Google Workspace primary domain. Set it only if you have Workspace and want to import users from its directory. Empty (the default) hides the sync screens and disables the endpoints behind them; Google sign-in is unaffected either way. |

### Leave empty

| Variable | Why |
|---|---|
| `APP_SERVICE_KEY` | Service-to-service impersonation. Anyone holding this value can act as **any** user, including an admin, on every endpoint, with no scoping and no audit trail. Empty disables it. Only ever set it on a network-restricted instance. |

### Optional integrations

Google OAuth and Slack keys are all optional. Leaving them unset disables that
feature; nothing else breaks.

### File storage

Uploaded attachments (ticket files, lifecycle documents) are stored
on **local disk by default**, under a `data/uploads` folder at the project root
— outside the source tree, and the same path on Linux, Windows and macOS. Under
Docker that path is `/app/uploads`, the named volume, so it is already covered
by your backups.

| Variable | Why |
|---|---|
| `APP_DATA_DIR` | Local storage root. Empty (default) is `data/uploads` at the project root; Docker sets it to `/app/uploads`. Point it elsewhere to keep uploads on another disk or mount. |
| `APP_STORAGE_URL` | Empty (default) is local disk. Set a cloud URL to use object storage instead. |

To store files in the cloud, set `APP_STORAGE_URL` to one of:

| Provider | URL | Install | Credentials from |
|---|---|---|---|
| Amazon S3 (or S3-compatible) | `s3://bucket/prefix` | `pip install '.[s3]'` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` |
| Azure Blob Storage | `az://container/prefix` | `pip install '.[azure]'` | `AZURE_STORAGE_CONNECTION_STRING` |
| Google Cloud Storage | `gs://bucket/prefix` | `pip install '.[gcs]'` | `GOOGLE_APPLICATION_CREDENTIALS` (path to a service-account JSON) |

Credentials go in the provider's own environment variables, **never in the
URL** — a secret in a URL ends up in logs. Set a cloud URL without installing
its extra and the backend refuses to start, naming the extra to install.
Existing local files are **not** moved automatically; relocate them yourself if
you switch an instance that already has uploads.

### After changing `.env`

**Restart the backend.** Settings are read once at import time, so a running
process will not pick up an edit.

---

## Google sign-in

Optional. Without it, people sign in with email and password created by an
admin; with it, anyone on an allowed domain can sign themselves in.

**1.** In the [Google Cloud Console](https://console.cloud.google.com/), create
an OAuth 2.0 Client ID of type *Web application*.

**2.** Under **Authorized redirect URIs**, add your backend base URL plus
`/auth/google/callback`:

```
https://api.example.com/auth/google/callback
```

This has to match what the backend sends, character for character. `http` vs
`https`, the port, an IP instead of a hostname, and a trailing slash are all
different URIs to Google.

**3.** Put the client id and secret in `backend/.env`:

```ini
APP_GOOGLE_CLIENT_ID=...
APP_GOOGLE_CLIENT_SECRET=...
APP_ALLOWED_DOMAINS=example.com
```

**4.** Restart the backend.

Someone signing in with Google for the first time gets an account
automatically, with the ordinary `user` role, and any project memberships
already waiting on their email address are activated. Promote them from the
admin screens.

Sign-in works with any Google account. Syncing your staff list from a company
directory is a separate feature with its own setting — see below.

---

## Google Workspace user sync

Optional, and separate from Google sign-in: this is the one that reads your
company's user directory and creates matching accounts in bulk. It needs an
actual Google Workspace account — a personal Gmail account has no directory
behind it.

Leave `APP_GOOGLE_WORKSPACE_DOMAIN` empty and the feature is simply not
there: the admin screen is unreachable, the `/google-sync` endpoints return
404, and sign-in stops asking people for permission to read a directory this
install will never read. That is the default.

To turn it on:

**1.** Set up Google sign-in first (above) — the sync reuses the same OAuth
client and the signed-in admin's own Google credentials.

**2.** Set your Workspace primary domain in `backend/.env`:

```ini
APP_GOOGLE_WORKSPACE_DOMAIN=example.com
```

**3.** Set the OAuth consent screen's **User Type** to **Internal**. With the
domain set, the app requests `admin.directory.user.readonly`, which Google
classes as a *restricted* scope: on an *External* consent screen that means
either full app verification or only hand-listed test users can sign in.
Internal sidesteps verification entirely.

**4.** Restart the backend, then **sign out and back in** — your existing
session was granted before the directory permission was requested, so it does
not carry it.

**5.** The sync lives at **Profile → Google Workspace**, with a *Test
Connection* button to check the setup before importing anyone.

To turn it off again, empty the setting and restart. Nothing is deleted; users
already imported stay exactly as they are.

---

## Troubleshooting

**`Nothing is listening at localhost:27017, so there is no database to set up`**
The manual path (`setup.sh` / `setup.ps1`) does not start MongoDB — it only sets
up a database that is already running. Start MongoDB 7.x first (`mongod`, `brew
services start mongodb-community`, or your service manager) and re-run, or use
the Docker path, which runs Mongo for you.

**PowerShell: `'--email' does not look like an email address`**
You passed the shell script's flags to the PowerShell script. `setup.ps1` uses
PowerShell parameters — `-Email`, `-Password` (a single dash) — not `--email` /
`--password`. PowerShell binds `--email` as a positional value, so the literal
string `--email` becomes the admin email. Use
`.\scripts\setup.ps1 -Email you@example.com -Password '...'`.

**Windows: `uvicorn : The term 'uvicorn' is not recognized`, or it runs the wrong one**
The virtualenv is not activated / not on `PATH`, or the `uvicorn.exe` shim points
at a venv that has moved. Call the virtualenv's Python directly from `backend\`,
which sidesteps both:
`.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload`.

**Everything is up, but login says "Email or password is incorrect" for your admin**
That message is deliberately the same for a wrong password and an account that
does not exist, so the form can't be used to discover accounts — so it is also
what you see when the admin was **never created in the database the app reads**.
Two usual causes:

- The admin step was skipped. `docker compose up` does **not** create it;
  `docker compose run --rm init …` does. Run that.
- The admin landed in a *different* MongoDB. The manual scripts seed
  `localhost:27017`; `docker compose up` runs its own Mongo inside the Compose
  network. If you created the admin one way and run the app the other way, it
  is in the wrong database. The backend logs a `No admin account exists in
  database … at …` **warning on startup** that names the exact database and URI
  it reads — check that against where `init_db` said it wrote (its closing
  banner prints the same). Count what is actually there:

  ```bash
  docker compose exec mongo mongosh project_management --quiet --eval "db.users.countDocuments()"
  mongosh project_management --quiet --eval "db.users.countDocuments()"   # a local Mongo
  ```

**`ModuleNotFoundError: No module named 'app'`**
You are running the script from the wrong directory. `cd backend` first —
`init_db.py` finds the application relative to its own location, but only once
you are inside the backend tree.

**`-bash: venv: command not found`**
You ran the activation script without `source`. Use `source .venv/bin/activate`.

**The backend exits immediately with a message about `APP_SECRET_KEY`**
Working as intended. Generate a real key — see [Before you go to production](#before-you-go-to-production).

**`Error 400: redirect_uri_mismatch` when signing in with Google**
The redirect URI is not registered on your OAuth client, or does not match
exactly. The URI the backend sent is visible in the `redirect_uri=` parameter
of the failing URL in your address bar — register that exact string. See
[Google sign-in](#google-sign-in).

**Frontend loads but every request fails, or you are bounced to login**
`NEXT_PUBLIC_API_URL` was wrong when the frontend was *built*. It is compiled
into the bundle and cannot be changed at runtime; rebuild the image.

**`Could not reach MongoDB at ...`**
MongoDB is not running, or the URI is wrong. Under Docker the hostname is
`mongo`, not `localhost`.

**`bad interpreter: /usr/bin/env bash^M`**
A shell script was checked out with Windows line endings. The repository pins
`*.sh` to LF via `.gitattributes`; if you hit this, your clone predates that —
pull and re-checkout the file.

---

## Upgrading and backups

**Upgrading.** Pull, rebuild, restart. New indexes are created automatically on
boot. If an upgrade adds master data, re-run `init_db.py --skip-admin` — it is
idempotent and will not touch existing accounts.

**Backups.** Everything lives in MongoDB except uploaded files.

```bash
mongodump --uri "$APP_MONGODB_URI" --out backup/
```

Uploaded attachments are written to `/app/uploads` in the backend container,
held in the `uploads` volume under Docker. Back that up too — and on
Kubernetes it must be a PersistentVolume or object storage, or files vanish
with the pod and are invisible to other replicas.
