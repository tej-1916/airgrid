import uuid
import pytest
from sqlalchemy import select
from airgrid.core.database import AsyncSessionLocal
from airgrid.core.security import hash_password, generate_session_token, hash_session_token
from airgrid.models.all_models import User, UserSession, AuditLog
from datetime import datetime, timezone, timedelta


@pytest.mark.asyncio
async def test_migration_preserves_user_and_audit_data():
    """
    Verify that existing user and audit records are preserved and maintain referential integrity.
    """
    test_email = f"migrate-data-{uuid.uuid4().hex[:8]}@airgrid.test"
    hashed = hash_password("MigrationPassword2026!")

    async with AsyncSessionLocal() as session:
        # 1. Insert user
        user = User(
            email=test_email,
            hashed_password=hashed,
            full_name="Migration Data Test User",
            role="network_engineer",
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        # 2. Insert audit log bound to user
        audit = AuditLog(
            actor_id=user.id,
            action="system.test.migration",
            resource_type="migration",
            resource_id=str(user.id),
            payload={"test": "data_preservation"},
            ip_address="127.0.0.1",
        )
        session.add(audit)
        await session.commit()
        await session.refresh(audit)

        # 3. Insert user session
        raw_token = generate_session_token()
        sess = UserSession(
            user_id=user.id,
            session_token_hash=hash_session_token(raw_token),
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            is_revoked=False,
        )
        session.add(sess)
        await session.commit()
        await session.refresh(sess)

        user_id = user.id
        audit_id = audit.id
        session_id = sess.id

    # 4. Verify data persistence across transactions
    async with AsyncSessionLocal() as session:
        stmt_user = select(User).where(User.id == user_id)
        res_user = await session.execute(stmt_user)
        persisted_user = res_user.scalar_one_or_none()
        assert persisted_user is not None
        assert persisted_user.email == test_email
        assert persisted_user.role == "network_engineer"

        stmt_audit = select(AuditLog).where(AuditLog.id == audit_id)
        res_audit = await session.execute(stmt_audit)
        persisted_audit = res_audit.scalar_one_or_none()
        assert persisted_audit is not None
        assert persisted_audit.actor_id == user_id
        assert persisted_audit.payload["test"] == "data_preservation"

        stmt_sess = select(UserSession).where(UserSession.id == session_id)
        res_sess = await session.execute(stmt_sess)
        persisted_sess = res_sess.scalar_one_or_none()
        assert persisted_sess is not None
        assert persisted_sess.user_id == user_id

    # 5. Verify referential integrity rules (AuditLog survives user deletion with actor_id=NULL)
    async with AsyncSessionLocal() as session:
        stmt_user = select(User).where(User.id == user_id)
        res_user = await session.execute(stmt_user)
        u = res_user.scalar_one_or_none()
        await session.delete(u)
        await session.commit()

    async with AsyncSessionLocal() as session:
        # Audit log preserved with SET NULL
        stmt_audit = select(AuditLog).where(AuditLog.id == audit_id)
        res_audit = await session.execute(stmt_audit)
        audit_after = res_audit.scalar_one_or_none()
        assert audit_after is not None
        assert audit_after.actor_id is None
        assert audit_after.payload["test"] == "data_preservation"

        # Session cascade-deleted
        stmt_sess = select(UserSession).where(UserSession.id == session_id)
        res_sess = await session.execute(stmt_sess)
        sess_after = res_sess.scalar_one_or_none()
        assert sess_after is None

        # Clean up audit log
        await session.delete(audit_after)
        await session.commit()
