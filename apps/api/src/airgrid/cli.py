import argparse
import asyncio
import getpass
import os
import sys
from typing import Optional
from sqlalchemy import select
from airgrid.core.database import AsyncSessionLocal
from airgrid.core.security import hash_password
from airgrid.models.all_models import User
from airgrid.schemas.auth import EMAIL_REGEX, UserRole
from airgrid.services.auth_service import log_auth_audit_event


def get_secure_password(prompt_text: str = "Enter administrator password (min 8 chars): ") -> str:
    """
    Securely prompts for administrator password using getpass or environment variable.
    Prevents password exposure in process tables (ps aux) and shell history.
    """
    env_password = os.environ.get("AIRGRID_BOOTSTRAP_PASSWORD")
    if env_password:
        return env_password

    if not sys.stdin.isatty():
        # Non-interactive piped input (e.g. echo "secret" | python -m airgrid.cli ...)
        line = sys.stdin.readline()
        return line.strip("\r\n")

    pw1 = getpass.getpass(prompt_text)
    pw2 = getpass.getpass("Confirm administrator password: ")
    if pw1 != pw2:
        print("Error: Passwords do not match.", file=sys.stderr)
        sys.exit(1)
    return pw1


async def bootstrap_admin_account(
    email: str,
    password: str,
    full_name: str,
    confirm_overwrite: bool = False,
) -> int:
    """
    Creates an initial platform administrator with Argon2id password hashing.
    Enforces minimum 8-character password length and valid email format.
    Safeguards existing administrators from silent overwrites without explicit confirmation.
    """
    clean_email = email.strip().lower()
    clean_name = full_name.strip()

    if not EMAIL_REGEX.match(clean_email):
        print(f"Error: '{clean_email}' is not a valid email address.", file=sys.stderr)
        return 1

    if len(password) < 8:
        print("Error: Password must be at least 8 characters in length.", file=sys.stderr)
        return 1

    if not clean_name:
        clean_name = "Administrator"

    if AsyncSessionLocal is None:
        print("Error: Database connection is not configured.", file=sys.stderr)
        return 1

    async with AsyncSessionLocal() as session:
        # Check if user with this email already exists
        stmt = select(User).where(User.email == clean_email)
        res = await session.execute(stmt)
        existing_user = res.scalar_one_or_none()

        if existing_user:
            if not confirm_overwrite:
                print(
                    f"Security Alert: User with email '{clean_email}' already exists (Role: {existing_user.role}). "
                    "Operation aborted to prevent silent overwrite. "
                    "Pass --confirm-overwrite to explicitly reset this administrator's password.",
                    file=sys.stderr,
                )
                return 1
            else:
                existing_user.hashed_password = hash_password(password)
                existing_user.full_name = clean_name
                existing_user.role = UserRole.ADMINISTRATOR.value
                existing_user.is_active = True
                await session.commit()
                await log_auth_audit_event(
                    db=session,
                    action="auth.bootstrap.password_reset",
                    actor_id=existing_user.id,
                    payload={"email": clean_email, "role": existing_user.role},
                )
                print(f"Success: Password for administrator '{clean_email}' has been updated.")
                return 0

        # Check if platform already has active administrators
        admin_stmt = select(User).where(User.role == UserRole.ADMINISTRATOR.value)
        admin_res = await session.execute(admin_stmt)
        existing_admins = admin_res.scalars().all()
        if existing_admins and not confirm_overwrite:
            print(
                f"Security Alert: Platform already has {len(existing_admins)} registered administrator(s). "
                "Operation aborted to prevent unauthorized privilege provisioning. "
                "Pass --confirm-overwrite to explicitly create an additional administrator.",
                file=sys.stderr,
            )
            return 1

        hashed_pw = hash_password(password)
        new_admin = User(
            email=clean_email,
            hashed_password=hashed_pw,
            full_name=clean_name,
            role=UserRole.ADMINISTRATOR.value,
            is_active=True,
        )
        session.add(new_admin)
        await session.commit()
        await session.refresh(new_admin)

        await log_auth_audit_event(
            db=session,
            action="auth.bootstrap.created",
            actor_id=new_admin.id,
            payload={"email": clean_email, "role": new_admin.role},
        )

        print(f"Success: Initial administrator '{clean_email}' created successfully.")
        return 0


def main():
    parser = argparse.ArgumentParser(
        prog="airgrid-admin",
        description="AirGrid Platform Administration CLI",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # bootstrap-admin (NOTE: No command-line password argument to prevent process table / shell history leaks)
    bootstrap_parser = subparsers.add_parser(
        "bootstrap-admin",
        help="Securely bootstrap or update the platform administrator account",
    )
    bootstrap_parser.add_argument(
        "--email",
        required=True,
        help="Administrator email address (e.g. admin@airgrid.local)",
    )
    bootstrap_parser.add_argument(
        "--name",
        default="Platform Administrator",
        help="Administrator full display name",
    )
    bootstrap_parser.add_argument(
        "--confirm-overwrite",
        action="store_true",
        help="Explicit confirmation required to overwrite an existing administrator or provision additional administrators",
    )

    args = parser.parse_args()

    if args.command == "bootstrap-admin":
        try:
            password = get_secure_password()
        except ValueError as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)

        code = asyncio.run(
            bootstrap_admin_account(
                email=args.email,
                password=password,
                full_name=args.name,
                confirm_overwrite=args.confirm_overwrite,
            )
        )
        sys.exit(code)


if __name__ == "__main__":
    main()
