"""Encryption for secrets we must store but never want readable in the database.

OAuth access/refresh tokens (Google) and bot tokens (Slack) are *bearer*
credentials: whoever holds the string can act as that user or workspace. We keep
them in Mongo so background sync and notifications work without a human present,
which means a leaked database or backup would otherwise hand an attacker live
access to every connected account.

This module wraps them with Fernet (AES-128-CBC + HMAC) so the stored value is
ciphertext, and the key that unlocks it lives in the process environment
(``APP_TOKEN_ENCRYPTION_KEY``), never in the database. Steal the DB without the
key and the tokens are useless.

Three properties the rest of the app relies on:

  * **Tagged ciphertext.** Encrypted values carry an ``enc:v1:`` prefix, so
    :func:`decrypt` can tell an encrypted value from a legacy plaintext one and
    pass the latter through untouched. That is what lets encryption roll out over
    a database that already holds plaintext tokens: old rows keep working, new
    writes are encrypted, and a one-off backfill can re-encrypt the rest at any
    time without a flag day.
  * **Key rotation.** ``APP_TOKEN_ENCRYPTION_KEY`` may hold several comma-
    separated keys. The first encrypts; any of them can decrypt (``MultiFernet``).
    Rotating is: prepend a new key, redeploy, backfill, then drop the old key.
  * **No key = passthrough.** With no key configured, :func:`encrypt` returns the
    value unchanged and logs one warning. A fresh dev clone keeps running with
    zero setup; production is expected to set the key (and the self-hosting docs
    say so).

Only wrap genuine secrets. ``token_type`` / ``expires_at`` and the like are not
secret and stay plaintext so they remain queryable.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from .settings import get_settings

logger = logging.getLogger(__name__)

# Marker on every value this module encrypts. The version lets us change the
# scheme later while still recognising old values; decrypt() treats anything
# without this prefix as legacy plaintext and returns it unchanged.
_PREFIX = "enc:v1:"


class EncryptionError(RuntimeError):
    """Encryption or decryption was required but could not be completed —
    a misconfigured key, or ciphertext that no configured key can open."""


@lru_cache(maxsize=1)
def _cipher() -> Optional[MultiFernet]:
    """Build the ``MultiFernet`` from ``APP_TOKEN_ENCRYPTION_KEY``, or ``None``.

    Cached like :func:`get_settings`: the key is read once per process, so a
    change needs a restart (tests call ``_cipher.cache_clear()``). Several keys
    may be given comma-separated — the first encrypts, any can decrypt — to
    support rotation. An empty/whitespace value means "no key configured".
    """
    raw = get_settings().token_encryption_key.get_secret_value().strip()
    if not raw:
        return None
    keys = [k.strip() for k in raw.split(",") if k.strip()]
    try:
        return MultiFernet([Fernet(k) for k in keys])
    except (ValueError, TypeError) as exc:
        # A malformed key is a config error we must surface loudly: silently
        # falling back to None would store tokens in plaintext.
        raise EncryptionError(
            "APP_TOKEN_ENCRYPTION_KEY is set but is not a valid Fernet key "
            "(expected url-safe base64, 32 bytes). Generate one with: "
            'python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        ) from exc


def encryption_enabled() -> bool:
    """True when a key is configured, i.e. values will actually be encrypted."""
    return _cipher() is not None


def encrypt(value: Optional[str]) -> Optional[str]:
    """Return an ``enc:v1:`` token for ``value``, or the value unchanged.

    Passes ``None`` and ``""`` through (nothing to protect) and, when no key is
    configured, the plaintext itself (with a one-time warning). Idempotent: a
    value that is already encrypted is returned as-is, so re-running a backfill
    or accidentally double-wrapping is safe.
    """
    if not value or value.startswith(_PREFIX):
        return value
    cipher = _cipher()
    if cipher is None:
        _warn_no_key()
        return value
    token = cipher.encrypt(value.encode("utf-8")).decode("ascii")
    return _PREFIX + token


def decrypt(value: Optional[str]) -> Optional[str]:
    """Reverse :func:`encrypt`.

    A value without the ``enc:v1:`` prefix is legacy plaintext and is returned
    unchanged — this is what makes the rollout non-breaking. A tagged value is
    decrypted; if no key (or no matching key) is configured that is a real error
    (the data is unreadable), so we raise rather than hand back ciphertext that a
    caller would mistake for a usable token.
    """
    if not value or not value.startswith(_PREFIX):
        return value
    cipher = _cipher()
    if cipher is None:
        raise EncryptionError(
            "Found an encrypted token but APP_TOKEN_ENCRYPTION_KEY is not set. "
            "Set the key that was used to encrypt it."
        )
    token = value[len(_PREFIX):].encode("ascii")
    try:
        return cipher.decrypt(token).decode("utf-8")
    except InvalidToken as exc:
        raise EncryptionError(
            "Could not decrypt a token: the current APP_TOKEN_ENCRYPTION_KEY "
            "does not match the key it was encrypted with."
        ) from exc


_warned_no_key = False


def _warn_no_key() -> None:
    """Warn exactly once that tokens are being stored unencrypted."""
    global _warned_no_key
    if not _warned_no_key:
        _warned_no_key = True
        logger.warning(
            "APP_TOKEN_ENCRYPTION_KEY is not set: OAuth and Slack tokens are "
            "being stored in PLAINTEXT. Set a key before production; see "
            "docs/self-hosting.md."
        )
