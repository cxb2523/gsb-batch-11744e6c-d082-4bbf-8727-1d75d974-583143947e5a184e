import secrets
from datetime import datetime, timezone
from typing import Annotated
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from authlib.integrations.starlette_client import OAuth
from pymongo import ReturnDocument

from ..core.settings import get_settings
from ..core.crypto import encrypt
from ..core.security import create_session_token, set_session_cookie, get_current_user, CurrentUser
from ..core.passwords import hash_password, verify_password
from ..db.mongo import get_mongo_db
from ..schemas.auth import ChangePasswordIn, DevLoginIn, LoginIn, UserOut, UserSelfUpdate

router = APIRouter(prefix="/auth", tags=["auth"])

oauth = OAuth()
settings = get_settings()

# Asked for at sign-in, so everything here is on the consent screen every user sees.
# The Admin SDK scope is the exception: it reads the whole company directory, only the
# user sync uses it, and an account with no Google Workspace behind it cannot grant it
# at all. Requesting it unconditionally therefore showed people an alarming permission
# that this install may have no use for - so it is added only when a Workspace domain
# is configured. Signing in with Google does not otherwise depend on that setting.
_BASE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
]
_WORKSPACE_SCOPES = ["https://www.googleapis.com/auth/admin.directory.user.readonly"]

_scopes = _BASE_SCOPES + (_WORKSPACE_SCOPES if settings.google_workspace_domain else [])

oauth.register(
  name="google",
  client_id=settings.google_client_id,
  client_secret=settings.google_client_secret.get_secret_value(),
  server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
  client_kwargs={
    "scope": " ".join(_scopes),
    "access_type": "offline",  # Request refresh token
    "prompt": "consent"  # Force consent screen to get refresh token
  },
)


@router.get("/google/login")
async def google_login(request: Request):
  # Strip trailing slash from base URL to avoid double slashes
  base_url = str(settings.backend_base_url).rstrip("/")
  redirect_uri = f"{base_url}/auth/google/callback"
  return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(
  request: Request,
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
  token = await oauth.google.authorize_access_token(request)
  user_info = token.get("userinfo")
  if user_info is None:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No user info from Google")

  email = user_info["email"]

  # Domain allow-list: if APP_ALLOWED_DOMAINS is set, only those domains may sign in.
  # Empty (the default) means any Google account is accepted.
  allowed_domains_raw = settings.allowed_domains.strip()
  if allowed_domains_raw:
    allowed = {d.strip().lower() for d in allowed_domains_raw.split(",") if d.strip()}
    email_domain = email.split("@")[-1].lower() if "@" in email else ""
    if email_domain not in allowed:
      raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Access restricted to: {', '.join(sorted(allowed))}",
      )

  # users collection in MongoDB
  users = db["users"]
  counters = db["counters"]

  # Extract Google OAuth tokens for API access (Drive, Directory, etc.).
  # access_token and refresh_token are bearer credentials, so they are encrypted
  # at rest (app/core/crypto.py); token_type/expires_at are not secret and stay
  # plaintext. This dict feeds both the insert and the returning-user $set below,
  # so encrypting here covers every write path. encrypt(None) passes None through.
  google_oauth_tokens = {
    "access_token": encrypt(token.get("access_token")),
    "refresh_token": encrypt(token.get("refresh_token")),
    "token_type": token.get("token_type"),
    "expires_at": token.get("expires_at"),
  }

  user = await users.find_one({"email": email})
  user_name: str
  if not user:
    # Generate a numeric user id using a counters collection so the rest of the app
    # can continue to treat user ids as integers.
    counter = await counters.find_one_and_update(
      {"_id": "users"},
      {"$inc": {"seq": 1}},
      upsert=True,
      return_document=ReturnDocument.AFTER,
    )
    user_number = int(counter.get("seq", 1))

    # New users default to normal "user" role; admins are managed via DB
    user_name = user_info.get("name") or email.split("@")[0]
    doc = {
      "email": email,
      "name": user_name,
      "role": "user",
      "created_at": datetime.now(timezone.utc),
      "last_login_at": datetime.now(timezone.utc),
      "user_number": user_number,
      "google_oauth_tokens": google_oauth_tokens,  # Store full OAuth token info for Drive, Directory, etc.
    }
    await users.insert_one(doc)
    role = "user"
  else:
    user_number = int(user.get("user_number", 0))
    user_name = user.get("name") or email.split("@")[0]
    role = user.get("role", "user")

    # Only update refresh_token if we got a new one (Google doesn't always return it)
    update_data = {
      "last_login_at": datetime.now(timezone.utc),
      "google_oauth_tokens.access_token": google_oauth_tokens["access_token"],
      "google_oauth_tokens.token_type": google_oauth_tokens["token_type"],
      "google_oauth_tokens.expires_at": google_oauth_tokens["expires_at"],
    }
    if google_oauth_tokens["refresh_token"]:
      update_data["google_oauth_tokens.refresh_token"] = google_oauth_tokens["refresh_token"]

    await users.update_one(
      {"_id": user["_id"]},
      {"$set": update_data},
    )

  # Activate any pending project memberships for this user
  members_collection = db["project_members"]
  await members_collection.update_many(
    {
      "email": email,
      "active": False,
      "user_id": None
    },
    {
      "$set": {
        "active": True,
        "user_id": user_number,
        "joined_at": datetime.now(timezone.utc)
      }
    }
  )

  session_token = create_session_token(
    user_id=user_number,
    role=role,
    email=email,
    name=user_name,
  )
  # After login, land on dashboard
  frontend_base = str(settings.frontend_base_url).rstrip("/")
  response = RedirectResponse(url=f"{frontend_base}/dashboard")
  set_session_cookie(response, session_token)
  return response


def _dev_login_enabled() -> bool:
  """Fail-closed: every condition must hold, so a missing prod setting never enables it."""
  current = get_settings()
  host = urlparse(str(current.backend_base_url)).hostname
  return (
    current.environment == "development"
    and bool(current.dev_login_password.get_secret_value())
    and host in {"localhost", "127.0.0.1"}
  )


@router.post("/dev-login", response_model=UserOut)
async def dev_login(
  payload: DevLoginIn,
  response: Response,
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
  """Local development only: sign in as an existing user with the shared dev password.

  Google OAuth can't complete against a localhost callback that isn't registered,
  which leaves developers unable to reach any authenticated screen. Returns 404
  whenever it is not enabled, so it is invisible outside a local setup.
  """
  if not _dev_login_enabled():
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

  current = get_settings()
  email = payload.email.strip().lower()
  user = await db["users"].find_one({"email": email})

  # One message for both failures, so the form can't be used to discover accounts.
  password_ok = secrets.compare_digest(payload.password.encode(), current.dev_login_password.get_secret_value().encode())
  if not user or not password_ok or user.get("is_active") is False or user.get("user_number") is None:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect")

  now = datetime.now(timezone.utc)
  await db["users"].update_one({"_id": user["_id"]}, {"$set": {"last_login_at": now}})

  token = create_session_token(
    user_id=user["user_number"],
    role=user.get("role", "user"),
    email=email,
    name=user.get("name"),
  )
  set_session_cookie(response, token)
  return UserOut(
    id=user["user_number"],
    email=email,
    name=user.get("name") or email.split("@")[0],
    role=user.get("role", "user"),
    department=user.get("department"),
    designation=user.get("designation"),
    profile_photo=user.get("profile_photo"),
    last_login_at=now,
    created_at=user.get("created_at"),
    must_change_password=bool(user.get("must_change_password", False)),
  )


@router.post("/login", response_model=UserOut)
async def login(
  payload: LoginIn,
  response: Response,
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
  """Email + password sign-in for admin-provisioned accounts.

  Only works for users that have a password set (admins create them via
  POST /admin/users). Google-OAuth-only users have no password and fail here.
  One generic error for every failure so the form can't probe for accounts.
  """
  email = payload.email.strip().lower()
  user = await db["users"].find_one({"email": email})

  password_ok = bool(user) and verify_password(payload.password, user.get("password_hash"))
  if (
    not user
    or not password_ok
    or user.get("is_active") is False
    or user.get("user_number") is None
  ):
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect")

  now = datetime.now(timezone.utc)
  await db["users"].update_one({"_id": user["_id"]}, {"$set": {"last_login_at": now}})

  token = create_session_token(
    user_id=user["user_number"],
    role=user.get("role", "user"),
    email=email,
    name=user.get("name"),
    remember_me=payload.remember_me,
  )
  set_session_cookie(response, token, remember_me=payload.remember_me)
  return UserOut(
    id=user["user_number"],
    email=email,
    name=user.get("name") or email.split("@")[0],
    role=user.get("role", "user"),
    department=user.get("department"),
    designation=user.get("designation"),
    profile_photo=user.get("profile_photo"),
    last_login_at=now,
    created_at=user.get("created_at"),
    must_change_password=bool(user.get("must_change_password", False)),
  )


@router.post("/change-password", response_model=UserOut)
async def change_password(
  payload: ChangePasswordIn,
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
  current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
  """Change the signed-in user's password; clears the forced-reset flag.

  Used for the forced first-login reset of an admin-created account, and for any later
  voluntary change. Requires the current password.
  """
  user = await db["users"].find_one({"email": current_user.email})
  if not user or not verify_password(payload.current_password, user.get("password_hash")):
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
  if payload.new_password == payload.current_password:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Choose a password different from your current one",
    )

  await db["users"].update_one(
    {"_id": user["_id"]},
    {"$set": {"password_hash": hash_password(payload.new_password), "must_change_password": False}},
  )
  return UserOut(
    id=user["user_number"],
    email=user["email"],
    name=user.get("name") or user["email"].split("@")[0],
    role=user.get("role", "user"),
    department=user.get("department"),
    designation=user.get("designation"),
    profile_photo=user.get("profile_photo"),
    last_login_at=user.get("last_login_at"),
    created_at=user.get("created_at"),
    must_change_password=False,
  )


@router.get("/me", response_model=UserOut)
async def me(
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
  current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
  doc = await db["users"].find_one({"email": current_user.email}) or {}
  return UserOut(
    id=current_user.id,
    email=current_user.email,
    name=doc.get("name") or current_user.name,
    role=doc.get("role") or current_user.role,
    department=doc.get("department"),
    designation=doc.get("designation"),
    profile_photo=doc.get("profile_photo"),
    last_login_at=doc.get("last_login_at"),
    created_at=doc.get("created_at"),
    must_change_password=bool(doc.get("must_change_password", False)),
  )


@router.patch("/me", response_model=UserOut)
async def update_me(
  payload: UserSelfUpdate,
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
  current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
  update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
  if update:
    await db["users"].update_one({"email": current_user.email}, {"$set": update})
  doc = await db["users"].find_one({"email": current_user.email}) or {}
  return UserOut(
    id=current_user.id,
    email=current_user.email,
    name=doc.get("name") or current_user.name,
    role=doc.get("role") or current_user.role,
    department=doc.get("department"),
    designation=doc.get("designation"),
    profile_photo=doc.get("profile_photo"),
    last_login_at=doc.get("last_login_at"),
    created_at=doc.get("created_at"),
    must_change_password=bool(doc.get("must_change_password", False)),
  )


@router.post("/logout")
async def logout(response: Response):
  response = Response(status_code=status.HTTP_204_NO_CONTENT)
  response.delete_cookie(key=settings.session_cookie_name)
  return response


