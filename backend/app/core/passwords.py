"""Password hashing for email/password (admin-provisioned) accounts.

Google-OAuth users have no password; these helpers are only for accounts an admin
creates and for the forced first-login password change.
"""

from __future__ import annotations

import bcrypt

# bcrypt hashes the first 72 bytes of the input; that limit is acceptable here.


def hash_password(plain: str) -> str:
    """Return a bcrypt hash (utf-8 string) for a plaintext password."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    """Check a plaintext password against a stored bcrypt hash. False if no/invalid hash."""
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False
