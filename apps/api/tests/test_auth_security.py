import pytest
from airgrid.core.security import (
    hash_password,
    verify_password,
    generate_session_token,
    hash_session_token,
    generate_csrf_token,
    verify_csrf_token,
)


def test_argon2id_password_hashing():
    raw_password = "SuperSecureCampusPassword2026!"
    hashed = hash_password(raw_password)

    # Must be valid Argon2id hash format
    assert hashed.startswith("$argon2id$")
    assert hashed != raw_password

    # Verification must succeed
    assert verify_password(raw_password, hashed) is True

    # Incorrect password must fail
    assert verify_password("WrongPassword123!", hashed) is False
    assert verify_password("", hashed) is False

    # Invalid hash format must safely return False without crashing
    assert verify_password(raw_password, "not-a-valid-hash") is False


def test_session_token_entropy_and_hashing():
    token1 = generate_session_token()
    token2 = generate_session_token()

    assert len(token1) >= 40
    assert token1 != token2

    hash1 = hash_session_token(token1)
    hash2 = hash_session_token(token2)

    assert len(hash1) == 64  # sha256 hex
    assert hash1 != hash2

    # Deterministic hash for same token
    assert hash_session_token(token1) == hash1


def test_csrf_token_generation_and_validation():
    session_id = "test-session-uuid-12345"
    csrf_token = generate_csrf_token(session_id)

    assert isinstance(csrf_token, str)
    assert len(csrf_token) > 20

    # Valid session ID verification
    assert verify_csrf_token(csrf_token, session_id) is True

    # Tampered or different session ID must fail
    assert verify_csrf_token(csrf_token, "different-session-uuid") is False
    assert verify_csrf_token("tampered-token", session_id) is False
    assert verify_csrf_token("", session_id) is False


def test_login_rate_limiter():
    from airgrid.services.auth_service import LoginRateLimiter

    limiter = LoginRateLimiter(max_attempts=3, window_seconds=2)
    key = "ip:192.168.1.100"

    # Initially not rate limited
    is_limited, _ = limiter.is_rate_limited(key)
    assert is_limited is False

    # Record 2 failures
    limiter.record_failure(key)
    limiter.record_failure(key)
    is_limited, _ = limiter.is_rate_limited(key)
    assert is_limited is False

    # 3rd failure reaches limit
    limiter.record_failure(key)
    is_limited, retry_after = limiter.is_rate_limited(key)
    assert is_limited is True
    assert retry_after > 0

    # Reset clears limit
    limiter.reset(key)
    is_limited, _ = limiter.is_rate_limited(key)
    assert is_limited is False


@pytest.mark.asyncio
async def test_audit_log_redaction():
    from unittest.mock import AsyncMock, MagicMock
    from airgrid.services.auth_service import log_auth_audit_event

    mock_db = MagicMock()
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    payload_with_secrets = {
        "email": "test@airgrid.local",
        "password": "SecretPassword123!",
        "raw_token": "secret-session-token",
        "secret": "my-secret-key",
    }

    await log_auth_audit_event(
        db=mock_db,
        action="auth.login.attempt",
        ip_address="127.0.0.1",
        payload=payload_with_secrets,
    )

    # Verify add was called
    assert mock_db.add.called
    added_entry = mock_db.add.call_args[0][0]
    assert added_entry.payload["password"] == "[REDACTED]"
    assert added_entry.payload["raw_token"] == "[REDACTED]"
    assert added_entry.payload["secret"] == "[REDACTED]"
    assert added_entry.payload["email"] == "test@airgrid.local"

