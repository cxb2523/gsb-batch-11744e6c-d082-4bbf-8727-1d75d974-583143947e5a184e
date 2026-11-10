#!/usr/bin/env bash
#
# First-run setup: create the database indexes, master data and global admin.
#
# A thin wrapper around backend/scripts/init_db.py. It finds (or creates) the
# backend virtualenv, installs dependencies, collects the admin credentials and
# hands them to init_db through environment variables so they never appear in
# the process list or your shell history.
#
# This is the path for a MongoDB you are running yourself. If you want Docker to
# run MongoDB too, use the one-shot init service instead - it needs no venv:
#
#   docker compose run --rm init --email you@example.com --password '...'
#
# Safe to run more than once: init_db is idempotent.
#
#   ./scripts/setup.sh                                 prompt for everything
#   ./scripts/setup.sh --email you@example.com         prompt for the password only
#   ./scripts/setup.sh --email you@... --password '...'   no prompts (CI, Ansible)
#   ./scripts/setup.sh --skip-admin                    indexes and master data only
#   ./scripts/setup.sh --email you@... --reset-password
#   ./scripts/setup.sh --uri mongodb://host:27017 --db mydb
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
VENV_PYTHON="$BACKEND/.venv/bin/python"

EMAIL=""
PASSWORD=""
NAME="Administrator"
SKIP_ADMIN=false
RESET_PASSWORD=false
# Passed straight through to init_db, which uses them in place of backend/.env.
PASSTHROUGH=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email)          EMAIL="$2"; shift 2 ;;
    --password)       PASSWORD="$2"; shift 2 ;;
    --name)           NAME="$2"; shift 2 ;;
    --skip-admin)     SKIP_ADMIN=true; shift ;;
    --reset-password) RESET_PASSWORD=true; shift ;;
    --uri)            PASSTHROUGH+=(--uri "$2"); MONGO_URI_OVERRIDE="$2"; shift 2 ;;
    --db)             PASSTHROUGH+=(--db "$2"); shift 2 ;;
    -h|--help)        sed -n '2,23p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)                echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

[[ -d "$BACKEND" ]] || {
  echo "No backend directory at $BACKEND. Run this from a checkout of the repository." >&2
  exit 1
}

# backend/.env holds the Mongo URI init_db connects with. Without it the
# defaults (localhost:27017) apply, which is usually right for a local install
# but never right for Docker, so say so rather than failing cryptically later.
if [[ ! -f "$BACKEND/.env" ]]; then
  if [[ -f "$BACKEND/.env.example" ]]; then
    echo "No backend/.env yet - copying .env.example."
    cp "$BACKEND/.env.example" "$BACKEND/.env"
    echo "Edit backend/.env before going to production (APP_SECRET_KEY especially)."
  else
    echo "No backend/.env found; using built-in defaults (mongodb://localhost:27017)."
  fi
fi

# The URI init_db will use, for the pre-flight check and the closing message.
MONGO_URI="mongodb://localhost:27017"
if [[ -n "${MONGO_URI_OVERRIDE:-}" ]]; then
  MONGO_URI="$MONGO_URI_OVERRIDE"
elif [[ -f "$BACKEND/.env" ]]; then
  FROM_ENV="$(grep -E '^[[:space:]]*APP_MONGODB_URI=' "$BACKEND/.env" | tail -1 | cut -d= -f2- | tr -d '"'"'"' \r' || true)"
  [[ -n "$FROM_ENV" ]] && MONGO_URI="$FROM_ENV"
fi

# Fail early and usefully when MongoDB is not up. init_db would report it too,
# but only after building the venv, and without naming the Docker alternative.
# Only the plain mongodb://host:port form is checked; anything fancier (SRV,
# credentials, a replica set) is left to init_db's own connection attempt.
if [[ "$MONGO_URI" =~ ^mongodb://([A-Za-z0-9._-]+)(:([0-9]+))?/?$ ]]; then
  MONGO_HOST="${BASH_REMATCH[1]}"
  MONGO_PORT="${BASH_REMATCH[3]:-27017}"
  if ! (exec 3<>"/dev/tcp/$MONGO_HOST/$MONGO_PORT") 2>/dev/null; then
    cat >&2 <<EOF
Nothing is listening at $MONGO_HOST:$MONGO_PORT, so there is no database to set up.

Either start MongoDB yourself and re-run this, or let Docker run the whole
thing - mongo included - with the one-shot init service:

  docker compose run --rm init --email you@example.com --password '...'

(APP_MONGODB_URI in backend/.env is what this script connects to.)
EOF
    exit 1
  fi
fi

if [[ ! -x "$VENV_PYTHON" ]]; then
  echo "Creating virtualenv in backend/.venv ..."
  SYSTEM_PYTHON="$(command -v python3 || command -v python || true)"
  [[ -n "$SYSTEM_PYTHON" ]] || { echo "python3 not found on PATH. Install Python 3.11+." >&2; exit 1; }
  "$SYSTEM_PYTHON" -m venv "$BACKEND/.venv"
  echo "Installing dependencies ..."
  "$VENV_PYTHON" -m pip install --upgrade pip --quiet
  "$VENV_PYTHON" -m pip install -r "$BACKEND/requirements.txt" --quiet
fi

ARGS=(-m scripts.init_db "${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"}")

if [[ "$SKIP_ADMIN" == true ]]; then
  ARGS+=(--skip-admin)
else
  if [[ -z "$EMAIL" ]]; then
    read -r -p "Admin email: " EMAIL
  fi

  # -s keeps the password off the screen; it goes to the child through the
  # environment, never argv. --password skips the prompt for unattended runs.
  if [[ -z "$PASSWORD" ]]; then
    read -r -s -p "Admin password: " PASSWORD; echo
    read -r -s -p "Confirm password: " PASSWORD_CONFIRM; echo
    [[ "$PASSWORD" == "$PASSWORD_CONFIRM" ]] || { echo "Passwords did not match." >&2; exit 1; }
    unset PASSWORD_CONFIRM
  fi
  (( ${#PASSWORD} >= 8 )) || { echo "Password must be at least 8 characters." >&2; exit 1; }

  export APP_INIT_ADMIN_EMAIL="$EMAIL"
  export APP_INIT_ADMIN_PASSWORD="$PASSWORD"
  export APP_INIT_ADMIN_NAME="$NAME"
  unset PASSWORD

  [[ "$RESET_PASSWORD" == true ]] && ARGS+=(--reset-password)
fi

# Never leave the password in the environment, whatever the exit path.
cleanup() { unset APP_INIT_ADMIN_PASSWORD APP_INIT_ADMIN_EMAIL APP_INIT_ADMIN_NAME; }
trap cleanup EXIT

cd "$BACKEND"
"$VENV_PYTHON" "${ARGS[@]}"

cat <<EOF

Setup complete. Start the app:

  cd backend  && .venv/bin/python -m uvicorn app.main:app --port 8000
  cd frontend && npm ci && npm run dev

This set up the database at $MONGO_URI. Note that 'docker compose up' runs its
own MongoDB inside the Compose network, which is NOT the one above and has not
been touched - to set that one up instead:

  docker compose run --rm init --email you@example.com --password '...'
EOF
