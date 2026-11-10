from datetime import datetime, timezone

from fastapi import FastAPI, Request, Response
from jose import JWTError, jwt

from .security import ALGORITHM, _live_role, create_session_token, set_session_cookie
from .settings import get_settings


def add_session_renewal_middleware(app: FastAPI) -> None:
  """Slide the session forward while the user is active.

  The session token is otherwise only minted in the Google OAuth callback, so it was a
  hard cutoff: every user got bounced to /login once it lapsed, however active they were.
  Renewing on activity turns session_expiry_minutes into an idle window instead.
  """
  settings = get_settings()
  # Only re-mint once the session is past its halfway point, so a busy client isn't
  # handed a fresh Set-Cookie on every single request.
  renew_below_seconds = settings.session_expiry_minutes * 60 / 2

  @app.middleware("http")
  async def renew_session(request: Request, call_next):  # type: ignore[override]
    response: Response = await call_next(request)

    token = request.cookies.get(settings.session_cookie_name)
    if not token:
      return response

    # Never fight an endpoint that deliberately set or cleared the cookie itself —
    # without this, /auth/logout would be immediately undone by the renewal below.
    prefix = f"{settings.session_cookie_name}="
    if any(h.startswith(prefix) for h in response.headers.getlist("set-cookie")):
      return response

    try:
      payload = jwt.decode(token, settings.secret_key.get_secret_value(), algorithms=[ALGORITHM])
    except JWTError:
      # Expired or tampered with; leave it alone so the 401 stands and the user re-auths.
      return response

    expires_at = payload.get("exp")
    if not isinstance(expires_at, (int, float)):
      return response

    remaining = expires_at - datetime.now(timezone.utc).timestamp()
    # Use the token's stored duration to decide the renewal threshold; fall back to
    # the global setting so tokens minted before this change still renew correctly.
    token_duration_seconds = payload.get("dur", settings.session_expiry_minutes) * 60
    threshold = token_duration_seconds / 2
    if remaining > threshold:
      return response

    # Re-read the role from the DB rather than copying the old token's role forward, so a
    # renewed session carries the user's current role (not a stale one). A user who has
    # been deactivated/deleted resolves to None: leave the cookie as-is instead of
    # extending it — get_current_user will reject the next request anyway.
    user_id = int(payload.get("sub", 0))
    role = await _live_role(user_id)
    if role is None:
      return response

    remember_me = payload.get("dur", settings.session_expiry_minutes) > settings.session_expiry_minutes
    set_session_cookie(
      response,
      create_session_token(
        user_id=user_id,
        role=role,
        email=str(payload.get("email", "")),
        name=payload.get("name"),
        remember_me=remember_me,
      ),
      remember_me=remember_me,
    )
    return response


def add_security_middleware(app: FastAPI) -> None:
  # connect-src is built from the configured base URLs (APP_BACKEND_BASE_URL /
  # APP_FRONTEND_BASE_URL) rather than hardcoded hosts, so a self-hoster's own
  # domains are allowed and no company domain ships in the header. dict.fromkeys
  # de-dupes (same-origin deploys) while keeping order.
  settings = get_settings()
  connect_origins = list(dict.fromkeys(
    origin for origin in (
      "'self'",
      str(settings.backend_base_url).rstrip("/"),
      str(settings.frontend_base_url).rstrip("/"),
    ) if origin
  ))
  csp = (
    "default-src 'self'; img-src 'self' data: https:; script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; connect-src " + " ".join(connect_origins) + ";"
  )

  @app.middleware("http")
  async def security_headers(request: Request, call_next):  # type: ignore[override]
    response: Response = await call_next(request)

    response.headers.setdefault("Content-Security-Policy", csp)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")

    return response


