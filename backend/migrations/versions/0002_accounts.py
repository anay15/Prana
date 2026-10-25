"""Accounts (email/password + Google), login sessions and profile fields.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-25
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.alter_column("token_hash", existing_type=sa.String(64), nullable=True)
        batch.add_column(sa.Column("is_guest", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.add_column(sa.Column("email", sa.String(254), nullable=True))
        batch.add_column(sa.Column("password_hash", sa.String(255), nullable=True))
        batch.add_column(sa.Column("google_sub", sa.String(64), nullable=True))
        batch.add_column(sa.Column("display_name", sa.String(60), nullable=True))
        batch.add_column(sa.Column("experience_level", sa.String(20), nullable=False, server_default="beginner"))
        batch.add_column(sa.Column("weekly_goal_days", sa.Integer(), nullable=False, server_default="3"))
        batch.create_index("ix_users_email", ["email"], unique=True)
        batch.create_index("ix_users_google_sub", ["google_sub"], unique=True)

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_auth_sessions_token_hash", "auth_sessions", ["token_hash"], unique=True)
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_table("auth_sessions")
    with op.batch_alter_table("users") as batch:
        batch.drop_index("ix_users_google_sub")
        batch.drop_index("ix_users_email")
        for col in (
            "weekly_goal_days",
            "experience_level",
            "display_name",
            "google_sub",
            "password_hash",
            "email",
            "is_guest",
        ):
            batch.drop_column(col)
        batch.alter_column("token_hash", existing_type=sa.String(64), nullable=False)
