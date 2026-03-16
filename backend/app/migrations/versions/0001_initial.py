"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-03-16

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False, server_default=""),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "clients",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), unique=True, nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("platform", sa.String(50), nullable=True),
        sa.Column("timezone", sa.String(100), nullable=False, server_default="UTC"),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False, server_default="19.0"),
        sa.Column("ga4_includes_vat", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("backend_includes_vat", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "credentials",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("client_id", sa.String(36), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", sa.String(50), nullable=False),
        sa.Column("wc_site_url", sa.String(500), nullable=True),
        sa.Column("wc_consumer_key_enc", sa.String(1000), nullable=True),
        sa.Column("wc_consumer_secret_enc", sa.String(1000), nullable=True),
        sa.Column("shopify_store_domain", sa.String(255), nullable=True),
        sa.Column("shopify_access_token_enc", sa.String(1000), nullable=True),
        sa.Column("ga4_property_id", sa.String(50), nullable=True),
        sa.Column("ga4_service_account_json_enc", sa.String(10000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("client_id", "platform"),
    )

    op.create_table(
        "report_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("client_id", sa.String(36), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("triggered_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("period_type", sa.String(20), nullable=False),
        sa.Column("date_from", sa.Date(), nullable=False),
        sa.Column("date_to", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("source_type", sa.String(20), nullable=False, server_default="api"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_report_jobs_client_id", "report_jobs", ["client_id"])
    op.create_index("idx_report_jobs_status", "report_jobs", ["status"])

    op.create_table(
        "report_results",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("job_id", sa.String(36), sa.ForeignKey("report_jobs.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("client_id", sa.String(36), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("result_json", postgresql.JSONB(), nullable=False),
        sa.Column("specialist_notes", sa.Text(), nullable=True),
        sa.Column("row_count_backend", sa.Integer(), nullable=True),
        sa.Column("row_count_ga4", sa.Integer(), nullable=True),
        sa.Column("match_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_report_results_client_id", "report_results", ["client_id"])
    op.create_index("idx_report_results_created_at", "report_results", ["created_at"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), unique=True, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_refresh_tokens_user_id", "refresh_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_table("refresh_tokens")
    op.drop_table("report_results")
    op.drop_table("report_jobs")
    op.drop_table("credentials")
    op.drop_table("clients")
    op.drop_table("users")
