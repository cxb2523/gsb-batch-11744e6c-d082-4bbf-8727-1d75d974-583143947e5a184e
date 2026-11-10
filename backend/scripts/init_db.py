"""Prepare a database for a fresh install: indexes, master data, first admin.

This is the one script a new install runs. It replaces the scattered
migrate_add_*_indexes.py scripts, which only ever created a subset by hand.

    python -m scripts.init_db --email you@example.com
    python -m scripts.init_db --email you@example.com --password "..." --name "Ada"
    python -m scripts.init_db --skip-admin

Run it from the backend/ directory, inside the virtualenv. The wrappers in
scripts/setup.ps1 and scripts/setup.sh do that for you.

Idempotent: safe to re-run after a failure, after an upgrade, or just to
confirm the state of a database. An admin account that already exists is
promoted and reactivated if needed, but its password is left alone unless
--reset-password is passed.

Connection details come from backend/.env (APP_MONGODB_URI,
APP_MONGODB_DB_NAME) unless --uri / --db override them.
"""

import argparse
import asyncio
import getpass
import os
import re
import sys
from pathlib import Path
from typing import Optional

# Make `python scripts/init_db.py` work as well as `python -m scripts.init_db`.
# The -m form puts the working directory on sys.path; running the file directly
# puts only scripts/ there, so `import app` fails unless the project happens to
# be pip-installed into the venv. Someone setting this up for the first time
# should not have to know which of the two forms they picked.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.settings import get_settings
from app.db.bootstrap import bootstrap

# Deliberately loose: Mongo does not care, and a regex strict enough to reject
# a real address is worse than one that lets a typo through to the login page.
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

MIN_PASSWORD_LENGTH = 8

# Env fallbacks, so a container can be initialized without an interactive TTY
# and without the password appearing in the process list.
ENV_EMAIL = "APP_INIT_ADMIN_EMAIL"
ENV_PASSWORD = "APP_INIT_ADMIN_PASSWORD"
ENV_NAME = "APP_INIT_ADMIN_NAME"


def parse_args(argv: Optional[list] = None) -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    prog="init_db",
    description="Create indexes, seed master data and the first global admin.",
  )
  parser.add_argument("--email", help=f"Admin email (or ${ENV_EMAIL}).")
  parser.add_argument(
    "--password",
    help=(
      f"Admin password (or ${ENV_PASSWORD}; prompted for if neither is set). "
      "Prefer the env var or the prompt: an argument is visible to anyone who "
      "can list processes."
    ),
  )
  parser.add_argument("--name", help=f"Admin display name (or ${ENV_NAME}).")
  parser.add_argument(
    "--reset-password",
    action="store_true",
    help="Overwrite the password if the account already exists.",
  )
  parser.add_argument(
    "--skip-admin",
    action="store_true",
    help="Only create indexes and master data.",
  )
  parser.add_argument("--uri", help="MongoDB URI (overrides APP_MONGODB_URI).")
  parser.add_argument("--db", help="Database name (overrides APP_MONGODB_DB_NAME).")
  return parser.parse_args(argv)


def resolve_admin(args: argparse.Namespace) -> tuple:
  """Work out the admin email, password and name, prompting where needed.

  Raises SystemExit with a readable message rather than a traceback, since the
  usual caller is a person running setup for the first time.
  """
  email = (args.email or os.environ.get(ENV_EMAIL) or "").strip()
  if not email:
    if not sys.stdin.isatty():
      raise SystemExit(
        f"No admin email. Pass --email, set ${ENV_EMAIL}, or use --skip-admin."
      )
    email = input("Admin email: ").strip()
  if not EMAIL_RE.match(email):
    raise SystemExit(f"{email!r} does not look like an email address.")

  password = args.password or os.environ.get(ENV_PASSWORD) or ""
  if not password:
    if not sys.stdin.isatty():
      raise SystemExit(
        f"No admin password. Pass --password, set ${ENV_PASSWORD}, or use --skip-admin."
      )
    password = getpass.getpass("Admin password: ")
    if password != getpass.getpass("Confirm password: "):
      raise SystemExit("Passwords did not match.")
  if len(password) < MIN_PASSWORD_LENGTH:
    raise SystemExit(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")

  name = (args.name or os.environ.get(ENV_NAME) or "").strip() or "Administrator"
  return email, password, name


async def run(args: argparse.Namespace) -> int:
  settings = get_settings()
  uri = args.uri or settings.mongodb_uri
  db_name = args.db or settings.mongodb_db_name

  if args.skip_admin:
    email = password = None
    name = "Administrator"
  else:
    email, password, name = resolve_admin(args)

  # Short timeout: "mongo is not running" is the most common failure here, and
  # the default 30s of silence is a bad first experience.
  client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)
  try:
    try:
      await client.admin.command("ping")
    except Exception as exc:
      raise SystemExit(f"Could not reach MongoDB at {uri}: {exc}")

    print(f"Initializing {db_name} at {uri}")
    summary = await bootstrap(
      client[db_name],
      admin_email=email,
      admin_password=password,
      admin_name=name,
      reset_password=args.reset_password,
    )
  finally:
    client.close()

  print(f"  indexes confirmed: {summary['indexes']}")
  print(f"  users counter:     {summary['counter']}")
  print(f"  master data:       {summary['master_data']}")
  print(f"  admin:             {summary['admin']}" + (f" ({email})" if email else ""))

  # A bordered banner at the very end, so the outcome - and, crucially, which
  # database it wrote to - stays readable even when it has scrolled past under
  # Docker's interleaved log output. "App is up but login fails" almost always
  # turns out to be an admin created in a different database than the app reads,
  # so the URI and db name are spelled out here on purpose.
  rule = "-" * 68
  print(f"\n{rule}")
  if summary["admin"] == "created":
    print(f"Admin created:  {email}")
    print(f"  in database:  {db_name}")
    print(f"  at:           {uri}")
    print("Sign in with those credentials. If login rejects them, confirm the")
    print("app is reading THIS database and URI, not another MongoDB.")
  elif summary["admin"] == "unchanged":
    print(f"Admin {email} already existed in {db_name} - left as it is.")
    print("Re-run with --reset-password to set a new password for it.")
  else:
    print(f"Done - indexes and master data ready in {db_name} at {uri}.")
    print("No admin was created (--skip-admin); create one before anyone can log in.")
  print(rule)
  return 0


def main() -> int:
  return asyncio.run(run(parse_args()))


if __name__ == "__main__":
  sys.exit(main())
