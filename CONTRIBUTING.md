# Contributing

Thanks for being here. Issues and pull requests are both welcome — this is a
small project and a good bug report is worth as much as a patch.

- [Ways to help](#ways-to-help)
- [Getting set up](#getting-set-up)
- [Running the checks](#running-the-checks)
- [Branches and pull requests](#branches-and-pull-requests)
- [Code style](#code-style)
- [Reporting a bug](#reporting-a-bug)
- [Security](#security)

---

## Ways to help

- **Report a bug.** Especially one you hit while self-hosting — we run this on
  a narrow set of configurations and the gaps show up on yours first.
- **Improve the docs.** If something in the
  [self-hosting guide](docs/self-hosting.md) cost you an hour, say so. That is
  a real bug.
- **Pick up an issue.** Anything labelled `good first issue` is self-contained
  and has enough context in the issue to start from.
- **Send a patch.** See below.

If you are planning something large — a new integration, a schema change, a
refactor across both halves of the app — **open an issue first and let's agree
on the shape of it.** That is not a formality. It is much easier to say "that
should live in a service, not a route" before you have written it.

---

## Getting set up

You need a MongoDB you can write to, Python 3.11+ and Node 22+. Then, from the
repository root:

```bash
./scripts/setup.sh
```

There is a `scripts/setup.ps1` for PowerShell. It creates `backend/.env`,
builds the virtualenv, installs the backend dependencies and prompts you for
the admin account to create. `npm ci` in `frontend/` covers the other half.
The [self-hosting guide](docs/self-hosting.md#path-b--manual) has the detail,
including how to do it by hand.

Once that works, start the two halves in separate terminals, both with hot
reload. From `backend/`, inside the virtualenv:

```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

And from `frontend/`:

```bash
npm ci && npm run dev
```

The app is on <http://localhost:3000>. This is for development only; it is not
how a deployed instance runs.

---

## Running the checks

CI runs the backend tests and the frontend type-check, lint and build on every
pull request. Run the first two locally before you open one so you are not
waiting on CI to find out. Both should be clean.

**Backend tests:**

```bash
cd backend && python -m pytest
```

Use `python -m pytest`, not bare `pytest` — the `app` package is resolved
relative to the working directory, and the bare command will not find it.

The suite needs a **real MongoDB**, the one in your `backend/.env`. Each test
gets its own throwaway database, which is dropped afterwards, so it will not
touch your development data. It will not run against no database at all.

**Frontend types:**

```bash
cd frontend && npx tsc --noEmit
```

This is currently clean, and a pull request should keep it that way.

**Linters.** The frontend runs `npm run lint` (ESLint) in CI. `ruff` and `mypy`
are listed as optional backend dev dependencies but are not configured or
enforced yet. Please don't reformat files wholesale to satisfy a linter you ran
locally — a diff full of whitespace changes buries the actual change.
Configuring the backend linters properly is an open task and a genuinely useful
contribution.

---

## Branches and pull requests

Branch off `develop`, and open the pull request against `develop`.

Name the branch after what it does — `sprint-rollover-fix`,
`configurable-upload-dir`. There is no enforced prefix scheme.

**One topic per pull request.** A fix plus an unrelated cleanup is two pull
requests. It is not bureaucracy — a reviewer who has to hold two unrelated
changes in their head at once reviews both of them worse.

**Commit messages** are a short sentence in the imperative, describing what the
change does to the software rather than what you did:

```
Let project members manage issue links again
Cap and verify project-creation document uploads
Close the profile dropdown when one of its links is clicked
```

No `feat:`/`fix:` prefix is required. If a commit relates to an issue, put the
number in the body.

**What makes a pull request easy to merge:**

- It says what problem it solves, and how you know it is solved.
- It touches one thing.
- Tests pass, and types are clean.
- New behaviour on the backend comes with a test. The suite lives in
  `backend/tests/`, and `conftest.py` already gives you a client and a clean
  database — copying the nearest existing test is usually the fastest start.
- If it changes a setting, `backend/.env.example` is updated too, with a
  comment saying what the setting does and what happens when it is unset.
- If it changes setup or deployment, the
  [self-hosting guide](docs/self-hosting.md) is updated in the same pull
  request. Documentation that lands separately usually does not land.

Maintainers review on a best-effort basis — this is not anyone's full-time
job. If a pull request goes quiet for two weeks, please nudge it. A missed
notification is far more likely than a silent rejection.

---

## Code style

**The first rule is to match the file you are editing.** Backend indentation
in particular is not consistent across the codebase — most modules use four
spaces, a fair number use two — so follow whatever the surrounding code does
rather than normalising it. Converting a file's indentation is its own pull
request, if it is worth doing at all.

Beyond that:

**Backend** — FastAPI. Routes in `app/routes/` stay thin: parse, authorise,
delegate. Business logic belongs in `app/services/`. Every endpoint that
touches project data must check membership and role server-side; never rely on
the frontend having hidden the button. Settings go through
`app/core/settings.py` with the `APP_` prefix, and anything secret is a
`SecretStr`. To work against a populated database, run `python seed_demo.py`
from `backend/` (add `--scale large` for team-sized volumes, `--remove` to clear
it); `scripts/seed_perf.py` is the separate tool for benchmarking against a large
synthetic dataset.

**Frontend** — Next.js App Router with TypeScript. Prefer the primitives in
`src/design-system/` and the shared components in `src/components/` over new
one-off styling. Tailwind for layout. If you find yourself duplicating a
component that already exists in a slightly different form, the better change
is usually to make the existing one handle your case.

Route protection is UX, not a security boundary. The `(protected)` and `admin`
layouts redirect in the browser — they hide pages, they do not gate them, and
there is deliberately no Next.js `middleware.ts`. The frontend and backend run
on separate origins, so the `pm_session` cookie the backend sets is not visible
to the frontend's server, which is where middleware would have to read it.
Authorization lives entirely in the backend (`require_admin` and per-project
membership checks, with the role read live from the database rather than trusted
from the token). If you add a new admin or project-scoped screen, protect its
*data* on the server; the client-side redirect is only there to avoid a flash of
a page the user can't use.

**Both** — no secrets, no real names, no internal hostnames, and no personal
data in code, tests, fixtures or screenshots. This repository is public.

---

## Reporting a bug

Open an issue with:

- what you expected and what happened instead,
- the steps to reproduce it,
- whether you are on Docker or a manual install, and roughly which version or
  commit,
- anything from the backend log or the browser console that looks relevant.

Please redact your secret key, tokens and real email addresses before pasting
logs or configuration.

If you are not sure whether something is a bug or your own misconfiguration,
open the issue anyway. If the guide let you misconfigure it that easily, that
is worth knowing.

---

## Security

**Do not open a public issue for a security problem.** Report it privately —
[SECURITY.md](SECURITY.md) explains how, and what to expect afterwards.

---

## Conduct and licensing

Participating here means following the
[Code of Conduct](CODE_OF_CONDUCT.md).

Contributions are accepted under the [MIT License](LICENSE), the same licence
as the project. By opening a pull request you confirm you have the right to
contribute the code and are happy for it to go out under those terms. There is
no CLA.
