import uuid
import pytest
from sqlalchemy import select
from airgrid.cli import bootstrap_admin_account, main
from airgrid.core.database import AsyncSessionLocal
from airgrid.core.security import verify_password
from airgrid.models.all_models import User


@pytest.mark.asyncio
async def test_bootstrap_admin_weak_password():
    exit_code = await bootstrap_admin_account(
        email="test-admin@airgrid.test",
        password="short",  # < 8 chars
        full_name="Admin",
    )
    assert exit_code == 1


@pytest.mark.asyncio
async def test_bootstrap_admin_invalid_email():
    exit_code = await bootstrap_admin_account(
        email="not-an-email",
        password="SecurePassword2026!",
        full_name="Admin",
    )
    assert exit_code == 1


@pytest.mark.asyncio
async def test_bootstrap_admin_success():
    email = f"bootstrap-{uuid.uuid4().hex[:8]}@airgrid.test"
    password = "BootstrapAdmin2026!"
    name = "Bootstrap Admin"

    exit_code = await bootstrap_admin_account(
        email=email,
        password=password,
        full_name=name,
        confirm_overwrite=True,
    )
    assert exit_code == 0

    # Verify user created in database
    async with AsyncSessionLocal() as session:
        stmt = select(User).where(User.email == email)
        res = await session.execute(stmt)
        user = res.scalar_one_or_none()

        assert user is not None
        assert user.email == email
        assert user.role == "administrator"
        assert user.full_name == name
        assert user.is_active is True
        assert verify_password(password, user.hashed_password) is True

        # Cleanup
        await session.delete(user)
        await session.commit()


@pytest.mark.asyncio
async def test_bootstrap_admin_silent_overwrite_prevention():
    """Verify that bootstrap refuses to overwrite an existing administrator without explicit confirmation."""
    email = f"existing-admin-{uuid.uuid4().hex[:8]}@airgrid.test"
    original_pw = "OriginalPassword2026!"
    attacker_pw = "AttackerPassword2026!"

    # 1. Create original admin
    code1 = await bootstrap_admin_account(
        email=email,
        password=original_pw,
        full_name="Original Admin",
        confirm_overwrite=True,
    )
    assert code1 == 0

    # 2. Attempt silent overwrite without confirm_overwrite -> MUST fail (exit code 1)
    code_silent = await bootstrap_admin_account(
        email=email,
        password=attacker_pw,
        full_name="Hacked Admin",
        confirm_overwrite=False,
    )
    assert code_silent == 1

    # 3. Verify original password remains intact in database
    async with AsyncSessionLocal() as session:
        stmt = select(User).where(User.email == email)
        res = await session.execute(stmt)
        user = res.scalar_one_or_none()
        assert user is not None
        assert verify_password(original_pw, user.hashed_password) is True
        assert verify_password(attacker_pw, user.hashed_password) is False

    # 4. Explicit overwrite with confirm_overwrite=True -> MUST succeed
    code_explicit = await bootstrap_admin_account(
        email=email,
        password=attacker_pw,
        full_name="Updated Admin",
        confirm_overwrite=True,
    )
    assert code_explicit == 0

    async with AsyncSessionLocal() as session:
        stmt = select(User).where(User.email == email)
        res = await session.execute(stmt)
        user = res.scalar_one_or_none()
        assert verify_password(attacker_pw, user.hashed_password) is True

        # Cleanup
        await session.delete(user)
        await session.commit()


def test_cli_rejects_command_line_password_flag(monkeypatch):
    """Verify that --password command-line argument is strictly rejected by the CLI parser."""
    test_args = ["airgrid-admin", "bootstrap-admin", "--email", "test@airgrid.local", "--password", "Secret123!"]
    monkeypatch.setattr("sys.argv", test_args)

    with pytest.raises(SystemExit) as exc_info:
        main()
    # Argparse exits with code 2 on unrecognized arguments
    assert exc_info.value.code == 2
