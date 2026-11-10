import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .routes import health, capabilities, auth, projects, tickets, dashboard, admin, slack, epics, skills, recommendations, google_sync, status, releases, status_reports, sprints, subtasks, issue_links, watchers, reports, workflows, worklogs, organization, integrations
from .routes import settings as settings_routes
from .routes import project_import
from .routes import lifecycle
from .routes import standup
from .routes import board
from .core.settings import get_settings
from .core.middleware import add_security_middleware, add_session_renewal_middleware
from .db.mongo import get_mongo_client
from .db.bootstrap import sync_user_counter
from .db.indexes import ensure_indexes

logger = logging.getLogger(__name__)


async def _sync_user_counter() -> None:
  """Keep the users counter ahead of any user_number assigned outside it.

  The definition lives in db.bootstrap so scripts/init_db.py runs exactly the
  same thing against a database the app has never started on.
  """
  settings = get_settings()
  db = get_mongo_client()[settings.mongodb_db_name]
  await sync_user_counter(db)


async def _ensure_collection_indexes() -> None:
  """Create every index the queries rely on (db.indexes.ALL_INDEXES).

  These previously lived only in the migrate_add_*_indexes.py scripts, run by
  hand, or were created lazily on the first request that needed them, so a
  fresh install served requests without them. create_index is a no-op once an
  index exists, so this just confirms them on every boot. scripts/init_db.py
  runs the same function against a database the app has never started on.
  """
  settings = get_settings()
  db = get_mongo_client()[settings.mongodb_db_name]
  confirmed = await ensure_indexes(db)
  logger.info("confirmed %d collection indexes", confirmed)


async def _warn_if_no_admin() -> None:
  """Warn loudly when the database the app serves from has no admin account.

  A fresh database has no accounts, and login returns the same generic message
  for an unknown user as for a wrong password (deliberately, so the form can't
  be used to probe for accounts). That makes a skipped setup step - or an admin
  created in a *different* database than this one - look exactly like a login
  bug. Naming the database and URI we actually read from turns that mystery into
  an obvious "you are pointed at an empty database". Only a warning: an
  intentionally empty database mid-setup must still boot.
  """
  settings = get_settings()
  db = get_mongo_client()[settings.mongodb_db_name]
  if await db["users"].count_documents({"role": "admin"}, limit=1) == 0:
    logger.warning(
      "No admin account exists in database %r at %s - login will fail for "
      "everyone until one is created:\n"
      "    docker compose run --rm init --email you@example.com --password '...'\n"
      "  (without Docker: ./scripts/setup.sh  /  .\\scripts\\setup.ps1)\n"
      "  If you did run setup, check it wrote to this same database and URI.",
      settings.mongodb_db_name,
      settings.mongodb_uri,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
  await _sync_user_counter()
  await _ensure_collection_indexes()
  await _warn_if_no_admin()
  yield


def create_app() -> FastAPI:
  settings = get_settings()
  app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

  # Session middleware for OAuth state storage
  app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key.get_secret_value(),
  )

  # Basic CORS for frontend. The deployed frontend origin comes from config
  # (APP_FRONTEND_BASE_URL); localhost entries keep dev working. dict.fromkeys
  # de-dupes while preserving order (e.g. when the configured origin is localhost).
  frontend_origin = str(settings.frontend_base_url).rstrip("/")
  allowed_origins = list(dict.fromkeys([
    frontend_origin,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]))
  app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
  )

  app.include_router(health.router)
  app.include_router(capabilities.router)
  app.include_router(auth.router)
  app.include_router(organization.router)
  app.include_router(projects.router)
  # Register settings router before tickets router to ensure /projects/{id}/settings routes are matched correctly
  app.include_router(settings_routes.router)
  app.include_router(workflows.router)
  app.include_router(epics.router)
  app.include_router(releases.router)
  app.include_router(worklogs.router)
  app.include_router(project_import.router)
  app.include_router(tickets.router)
  app.include_router(board.router)
  app.include_router(subtasks.router)  # Register subtasks after tickets
  app.include_router(issue_links.router)  # Register issue links
  app.include_router(dashboard.router)
  app.include_router(standup.router)
  app.include_router(admin.router)
  app.include_router(slack.router)
  app.include_router(integrations.router)
  app.include_router(skills.router)
  app.include_router(recommendations.router)
  app.include_router(google_sync.router)
  app.include_router(status.router)
  app.include_router(status_reports.router)
  app.include_router(sprints.router)
  app.include_router(lifecycle.router)
  app.include_router(watchers.router)
  app.include_router(reports.router)

  add_security_middleware(app)
  add_session_renewal_middleware(app)

  return app


app = create_app()


