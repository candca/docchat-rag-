"""add knowledge bases

Revision ID: 202605250002
Revises: 202605240001
Create Date: 2026-05-25
"""

from alembic import op
import sqlalchemy as sa


revision = "202605250002"
down_revision = "202605240001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "knowledge_bases",
        sa.Column("knowledge_base_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("knowledge_base_id"),
    )
    op.create_index("ix_knowledge_bases_user_id", "knowledge_bases", ["user_id"])
    op.add_column("documents", sa.Column("knowledge_base_id", sa.String(), nullable=False, server_default="default"))
    op.add_column("documents", sa.Column("parse_status", sa.String(), nullable=False, server_default="ready"))
    op.create_index("ix_documents_knowledge_base_id", "documents", ["knowledge_base_id"])


def downgrade() -> None:
    op.drop_index("ix_documents_knowledge_base_id", table_name="documents")
    op.drop_column("documents", "parse_status")
    op.drop_column("documents", "knowledge_base_id")
    op.drop_index("ix_knowledge_bases_user_id", table_name="knowledge_bases")
    op.drop_table("knowledge_bases")
