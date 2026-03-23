"""Add section_notes JSONB column to report_results

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("report_results", sa.Column("section_notes", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("report_results", "section_notes")
