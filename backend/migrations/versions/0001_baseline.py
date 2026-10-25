"""Baseline: anonymous users and practice sessions (schema as of v1.0).

Revision ID: 0001
Revises:
Create Date: 2026-10-25
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_token_hash", "users", ["token_hash"], unique=True)
    op.create_table(
        "practice_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pose_id", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_s", sa.Float(), nullable=False),
        sa.Column("hold_s", sa.Float(), nullable=False),
        sa.Column("avg_score", sa.Float(), nullable=False),
        sa.Column("best_score", sa.Float(), nullable=False),
        sa.Column("joint_scores", sa.JSON(), nullable=False),
    )
    op.create_index("ix_sessions_user_created", "practice_sessions", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_table("practice_sessions")
    op.drop_table("users")
