"""add_users_and_document_owners

Revision ID: 202605240001
Revises: 040b0da03c42
Create Date: 2026-05-24 00:01:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
import sqlmodel


revision: str = "202605240001"
down_revision: Union[str, Sequence[str], None] = "040b0da03c42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("username", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("password_hash", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("created_at", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.add_column(
        "documents",
        sa.Column("user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default="legacy"),
    )
    op.add_column(
        "documents",
        sa.Column("summary_json", sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default="{}"),
    )
    op.create_index("ix_documents_user_id", "documents", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_documents_user_id", table_name="documents")
    op.drop_column("documents", "summary_json")
    op.drop_column("documents", "user_id")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
