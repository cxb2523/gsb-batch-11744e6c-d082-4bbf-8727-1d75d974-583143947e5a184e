"""Tests for app/core/crypto.py — token encryption at rest.

Both get_settings() and crypto._cipher() are lru_cached (the key is read once
per process), so every test sets APP_TOKEN_ENCRYPTION_KEY via monkeypatch and
clears both caches. The `cipher_env` fixture does that and resets the one-time
"no key" warning flag, so tests don't leak state into each other.
"""

import pytest
from cryptography.fernet import Fernet

from app.core import crypto
from app.core import settings as settings_mod


def _reset_caches():
    settings_mod.get_settings.cache_clear()
    crypto._cipher.cache_clear()
    crypto._warned_no_key = False


@pytest.fixture
def cipher_env(monkeypatch):
    """Configure one or more Fernet keys and rebuild the cached cipher.

    Yields a setter: `set_key(value)` puts `value` in APP_TOKEN_ENCRYPTION_KEY
    (use "" for the no-key case) and clears the caches so the next crypto call
    sees it. Caches are reset again on teardown.
    """
    def set_key(value: str):
        monkeypatch.setenv("APP_TOKEN_ENCRYPTION_KEY", value)
        _reset_caches()

    yield set_key
    monkeypatch.delenv("APP_TOKEN_ENCRYPTION_KEY", raising=False)
    _reset_caches()


# --------------------------------------------------------------------------
# With a key configured
# --------------------------------------------------------------------------

def test_roundtrip_with_key(cipher_env):
    cipher_env(Fernet.generate_key().decode())
    secret = "ya29.a0AfB_byReal-Looking-Token"
    enc = crypto.encrypt(secret)
    assert enc != secret
    assert enc.startswith("enc:v1:")
    assert crypto.decrypt(enc) == secret


def test_encryption_is_non_deterministic(cipher_env):
    # Fernet embeds a random IV + timestamp, so the same plaintext encrypts to
    # different ciphertext each time — both must still decrypt back.
    cipher_env(Fernet.generate_key().decode())
    a = crypto.encrypt("same")
    b = crypto.encrypt("same")
    assert a != b
    assert crypto.decrypt(a) == crypto.decrypt(b) == "same"


def test_encrypt_is_idempotent(cipher_env):
    # Double-wrapping must not re-encrypt an already-tagged value, so a backfill
    # that runs twice (or over a half-migrated collection) stays safe.
    cipher_env(Fernet.generate_key().decode())
    once = crypto.encrypt("tok")
    twice = crypto.encrypt(once)
    assert twice == once
    assert crypto.decrypt(twice) == "tok"


def test_encryption_enabled_reflects_key(cipher_env):
    cipher_env(Fernet.generate_key().decode())
    assert crypto.encryption_enabled() is True
    cipher_env("")
    assert crypto.encryption_enabled() is False


@pytest.mark.parametrize("empty", [None, ""])
def test_empty_values_pass_through(cipher_env, empty):
    cipher_env(Fernet.generate_key().decode())
    assert crypto.encrypt(empty) == empty
    assert crypto.decrypt(empty) == empty


# --------------------------------------------------------------------------
# Legacy plaintext (no prefix) — the non-breaking rollout guarantee
# --------------------------------------------------------------------------

def test_decrypt_passes_through_legacy_plaintext(cipher_env):
    # A value already in the DB from before encryption has no enc: prefix and
    # must come back untouched even with a key configured.
    cipher_env(Fernet.generate_key().decode())
    assert crypto.decrypt("xoxb-legacy-plaintext-token") == "xoxb-legacy-plaintext-token"


# --------------------------------------------------------------------------
# No key configured — passthrough with a warning
# --------------------------------------------------------------------------

def test_no_key_stores_plaintext_and_warns(cipher_env, caplog):
    cipher_env("")
    with caplog.at_level("WARNING"):
        out = crypto.encrypt("tok")
    assert out == "tok"  # unchanged, no prefix
    assert any("PLAINTEXT" in r.message for r in caplog.records)


def test_no_key_warns_only_once(cipher_env, caplog):
    cipher_env("")
    with caplog.at_level("WARNING"):
        crypto.encrypt("a")
        crypto.encrypt("b")
    warnings = [r for r in caplog.records if "PLAINTEXT" in r.message]
    assert len(warnings) == 1


def test_decrypt_without_key_raises_on_ciphertext(cipher_env):
    # Encrypt with a key, then drop the key: the ciphertext is now unreadable,
    # and we must raise rather than hand back the enc:... blob as if it were a token.
    cipher_env(Fernet.generate_key().decode())
    enc = crypto.encrypt("tok")
    cipher_env("")
    with pytest.raises(crypto.EncryptionError):
        crypto.decrypt(enc)


# --------------------------------------------------------------------------
# Key rotation and misconfiguration
# --------------------------------------------------------------------------

def test_rotation_new_key_encrypts_old_key_still_decrypts(cipher_env):
    old = Fernet.generate_key().decode()
    cipher_env(old)
    enc_old = crypto.encrypt("tok")

    new = Fernet.generate_key().decode()
    # New key first (encrypts), old key second (still decrypts existing values).
    cipher_env(f"{new},{old}")
    assert crypto.decrypt(enc_old) == "tok"           # old ciphertext still readable
    enc_new = crypto.encrypt("tok2")
    assert crypto.decrypt(enc_new) == "tok2"          # new writes readable too


def test_wrong_key_cannot_decrypt(cipher_env):
    cipher_env(Fernet.generate_key().decode())
    enc = crypto.encrypt("tok")
    cipher_env(Fernet.generate_key().decode())  # unrelated key
    with pytest.raises(crypto.EncryptionError):
        crypto.decrypt(enc)


def test_malformed_key_raises(cipher_env):
    cipher_env("not-a-valid-fernet-key")
    with pytest.raises(crypto.EncryptionError):
        crypto.encrypt("tok")
