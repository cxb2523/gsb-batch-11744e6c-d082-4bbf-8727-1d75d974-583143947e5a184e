import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import Cookie, Depends, HTTPException, Request, Response, status
from jose import JWTError, jwt

from .settings import get_settings


ALGORITHM = "HS256"
_settings = get_settings()
SessionCookie = Cookie(alias=_settings.session_cookie_name)


REMEMBER_ME_DAYS = 30


def set_session_cookie(response: Response, token: str, remember_me: bool = False) -> None:
  settings = get_settings()
  max_age = REMEMBER_ME_DAYS * 86400 if remember_me else settings.session_expiry_minutes * 60
  response.set_cookie(
    key=settings.session_cookie_name,
    value=token,
    httponly=True,
    secure=True,
    samesite="lax",
    # Persist across browser restarts; kept in lockstep with the token's own "exp"
    # so the cookie and the JWT expire together.
    max_age=max_age,
  )


def create_session_token(
  user_id: int,
  role: str,
  email: str,
  name: Optional[str] = None,
  remember_me: bool = False,
) -> str:
  settings = get_settings()
  duration_minutes = REMEMBER_ME_DAYS * 24 * 60 if remember_me else settings.session_expiry_minutes
  expire = datetime.now(timezone.utc) + timedelta(minutes=duration_minutes)
  payload = {
    "sub": str(user_id),
    "role": role,
    "email": email,
    "name": name or email.split("@")[0],
    "exp": expire,
    # Store intended duration so the renewal middleware renews to the same window,
    # not the global default — preserves remember-me sessions across renewals.
    "dur": duration_minutes,
  }
  return jwt.encode(payload, settings.secret_key.get_secret_value(), algorithm=ALGORITHM)


def decode_session_token(token: str) -> dict:
  settings = get_settings()
  try:
    return jwt.decode(token, settings.secret_key.get_secret_value(), algorithms=[ALGORITHM])
  except JWTError as exc:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session") from exc


class CurrentUser:
  id: int
  email: str
  name: str
  role: str

  def __init__(self, user_id: int, email: str, name: str, role: str) -> None:
    self.id = user_id
    self.email = email
    self.name = name
    self.role = role


# In-process cache of each user's live role, so role changes (especially demotions and
# deactivations) take effect without waiting for the JWT to expire — the token is only
# trusted for identity (sub), never for authorization (role). Keyed by user_id; each
# entry is (role_or_None, monotonic_timestamp). role is None when the user is gone or
# deactivated. This is a per-process dict, not a shared store: with multiple workers each
# caches independently, so a change is reflected within role_cache_ttl_seconds on every
# worker. No new infrastructure (no Redis) by design.
_role_cache: dict[int, tuple[Optional[str], float]] = {}


def invalidate_role_cache(user_id: Optional[int] = None) -> None:
  """Drop a cached role so the next request re-reads it from the DB immediately.

  Call after changing a user's role or active status to make the change instant instead
  of waiting out the TTL. With no argument, clears the whole cache.
  """
  if user_id is None:
    _role_cache.clear()
  else:
    _role_cache.pop(user_id, None)


async def _live_role(user_id: int) -> Optional[str]:
  """Return the user's current role from the DB, cached for role_cache_ttl_seconds.

  Returns None if the user no longer exists or has been deactivated.
  """
  settings = get_settings()
  ttl = settings.role_cache_ttl_seconds
  now = time.monotonic()

  cached = _role_cache.get(user_id)
  if cached is not None and ttl > 0 and (now - cached[1]) < ttl:
    return cached[0]

  from ..db.mongo import get_mongo_client

  db = get_mongo_client()[settings.mongodb_db_name]
  doc = await db["users"].find_one(
    {"user_number": user_id},
    {"role": 1, "is_active": 1},
  )
  if not doc or doc.get("is_active") is False:
    role: Optional[str] = None
  else:
    role = str(doc.get("role", "user"))

  _role_cache[user_id] = (role, now)
  return role


async def get_current_user(
  request: Request,
  session: Annotated[Optional[str], SessionCookie] = None,
) -> CurrentUser:
  # Service-to-service: a trusted caller presents the service key plus the email of the
  # user it is acting for, and is then treated as that user (for internal automation /
  # service accounts). DISABLED unless APP_SERVICE_KEY is set, which it is not by
  # default. WARNING: whoever holds this key can act as ANY existing user, admin
  # included — only enable it on a trusted, network-restricted instance, never a shared
  # one (see backend/.env.example). A properly scoped, audited redesign is tracked in
  # POST_V1_FOLLOWUPS.md.
  service_key = os.getenv("APP_SERVICE_KEY", "")
  presented = request.headers.get("X-API-Key")
  if service_key and presented and secrets.compare_digest(presented, service_key):
    email = (request.headers.get("X-On-Behalf-Of") or "").strip().lower()
    if not email:
      raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="X-On-Behalf-Of (user email) required with service key",
      )
    # Restrict the on-behalf email to the configured org domains when set; empty
    # (the default) places no domain restriction. No hardcoded company domain.
    allowed_raw = _settings.allowed_domains.strip()
    if allowed_raw:
      allowed = {d.strip().lower() for d in allowed_raw.split(",") if d.strip()}
      if email.split("@")[-1] not in allowed:
        raise HTTPException(
          status_code=status.HTTP_403_FORBIDDEN,
          detail="on-behalf email domain is not allowed",
        )
    # Resolve the REAL Grid user so we act as *them*. Project membership is keyed on
    # numeric user_id (== users.user_number); a synthetic user_id=0 matches no
    # memberships, which is why on-behalf callers saw none of their projects.
    from ..db.mongo import get_mongo_client

    db = get_mongo_client()[_settings.mongodb_db_name]
    grid_user = await db["users"].find_one({"email": email})
    if grid_user:
      return CurrentUser(
        user_id=int(grid_user.get("user_number") or 0),
        email=email,
        name=grid_user.get("name") or email.split("@")[0],
        role=str(grid_user.get("role", "user")),
      )
    # Unknown to Grid yet (never logged in) — still allow email-keyed create/update.
    return CurrentUser(user_id=0, email=email, name=email.split("@")[0], role="user")

  if not session:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

  payload = decode_session_token(session)
  user_id = int(payload.get("sub", 0))
  email = str(payload.get("email", "user@example.com"))
  name = str(payload.get("name", email.split("@")[0]))
  # Authorization comes from the DB, not the token: the role baked into the JWT at login
  # is ignored so demotions/deactivations take effect within role_cache_ttl_seconds
  # instead of lasting until the (up to 7-day) token expires. A user who has been deleted
  # or deactivated resolves to None and is rejected outright.
  role = await _live_role(user_id)
  if role is None:
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Session is no longer valid",
    )
  return CurrentUser(user_id=user_id, email=email, name=name, role=role)


async def require_admin(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
  if user.role != "admin":
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
  return user


async def require_project_admin(
  project_id: int,
  current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CurrentUser:
  """Pass if global admin, or a project member whose role is 'admin'."""
  if current_user.role == "admin":
    return current_user
  from ..db.mongo import get_mongo_client
  db = get_mongo_client()[_settings.mongodb_db_name]
  member = await db["project_members"].find_one({
    "project_id": project_id,
    "user_id": current_user.id,
    "role": "admin",
  })
  if not member:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project admin privileges required")
  return current_user


