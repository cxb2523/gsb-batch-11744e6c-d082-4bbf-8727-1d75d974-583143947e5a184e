from functools import lru_cache
from pathlib import Path
from dotenv import load_dotenv
from pydantic import AliasChoices, AnyHttpUrl, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Find the .env file in the backend directory (parent of app directory)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"

# Mirror the .env file into os.environ so the few direct os.getenv callers (e.g.
# the service key in core.security) see it in development. pydantic-settings reads
# the file directly for the Settings fields below; this covers the rest. Real
# environment variables (Docker / production) take precedence and are untouched.
load_dotenv(ENV_FILE)


class Settings(BaseSettings):
  app_name: str = "GRID API"
  environment: str = "development"

  backend_base_url: AnyHttpUrl = "http://localhost:8000"
  frontend_base_url: AnyHttpUrl = "http://localhost:3000"

  secret_key: SecretStr = SecretStr("change-me")  # override in en
  session_cookie_name: str = "pm_session"
  # Idle window, not a hard cap: the session slides forward on activity
  # (see core.middleware.add_session_renewal_middleware).
  session_expiry_minutes: int = 60 * 24 * 7
  # How long a user's role/active status is cached in-process before it is re-read
  # from the DB. Bounds how long a demotion or deactivation can lag (see
  # core.security.get_current_user). Set to 0 to re-read on every request.
  role_cache_ttl_seconds: int = 60

  # Encrypts OAuth/Slack bearer tokens before they are written to Mongo, so a
  # leaked database or backup does not expose live credentials (see
  # app/core/crypto.py). A url-safe base64 32-byte Fernet key; several may be
  # given comma-separated (first encrypts, any decrypts) for rotation. Empty
  # (the default) stores tokens in plaintext and logs a warning — fine for a
  # local dev clone, but set a real key before production.
  token_encryption_key: SecretStr = SecretStr("")

  google_client_id: str = ""
  google_client_secret: SecretStr = SecretStr("")
  # Comma-separated list of allowed email domains, e.g. "example.com,another.org".
  # Empty (default) means any Google account can sign in.
  allowed_domains: str = ""
  # Your Google Workspace primary domain, e.g. "example.com". Empty (default) means
  # this install has no Workspace: the user-sync screens are hidden, /google-sync is
  # a 404, and sign-in stops asking for the Admin SDK scope it could never use.
  # Signing in with Google does not depend on this - only the directory sync does.
  google_workspace_domain: str = ""

  # MongoDB configuration
  mongodb_uri: str = "mongodb://localhost:27017"
  mongodb_db_name: str = "project_management"

  # File storage (uploaded attachments). See app/core/storage.py.
  # STORAGE_URL chooses where files live; empty (default) means local disk.
  # A bare path or file:// is also local; s3:// / az:// / gs:// select a remote
  # backend (added in a later phase). DATA_DIR is the local root when STORAGE_URL
  # is empty: it defaults to a `data/uploads` folder at the project root (outside
  # the source tree, same path on every OS); Docker sets it to /app/uploads.
  storage_url: str = ""
  data_dir: str = ""

  # Integration provider secrets. Convention: APP_<PROVIDER>_<KEY> (the APP_
  # prefix is the app-wide env_prefix below). See app/integrations/README.md.
  # Slack integration
  slack_client_id: str = ""
  slack_client_secret: SecretStr = SecretStr("")
  slack_signing_secret: SecretStr = SecretStr("")

  # Local-only email/password login. OAuth cannot complete against localhost, so
  # this lets a developer sign in as an existing user. It is enabled only when all
  # of: environment == "development", this password is set, and the backend URL is
  # localhost. Production never sets it, so the endpoint stays a 404 there even
  # though `environment` defaults to "development".
  dev_login_password: SecretStr = SecretStr("")

  model_config = SettingsConfigDict(
    env_file=str(ENV_FILE),
    env_file_encoding="utf-8",
    env_prefix="APP_",
    case_sensitive=False,
    extra="ignore",
  )

  @model_validator(mode="after")
  def _require_real_secret_key_outside_dev(self) -> "Settings":
    """Fail fast: never boot a non-development environment on the placeholder secret_key.

    The default signs every JWT and session cookie, so running with it outside
    development would let anyone forge sessions. Development is left alone so a fresh
    clone still runs with zero setup.
    """
    if self.environment != "development" and self.secret_key.get_secret_value() == "change-me":
      raise ValueError(
        f"APP_SECRET_KEY is still the default 'change-me' but environment is "
        f"'{self.environment}'. Set a real APP_SECRET_KEY before starting outside development."
      )
    return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
  return Settings()


