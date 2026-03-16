"""
APScheduler setup for automated report generation.
Runs 4 job types: daily, 3-month, 6-month, 12-month.
"""
from datetime import date, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler(timezone="UTC")


def start_scheduler() -> None:
    scheduler.add_job(
        run_all_scheduled_reports,
        trigger=CronTrigger(hour=2, minute=0),
        args=["daily"],
        id="daily_reports",
        replace_existing=True,
    )
    scheduler.add_job(
        run_all_scheduled_reports,
        trigger=CronTrigger(day=1, hour=3, minute=0),
        args=["3month"],
        id="3month_reports",
        replace_existing=True,
    )
    scheduler.add_job(
        run_all_scheduled_reports,
        trigger=CronTrigger(day=1, hour=3, minute=30),
        args=["6month"],
        id="6month_reports",
        replace_existing=True,
    )
    scheduler.add_job(
        run_all_scheduled_reports,
        trigger=CronTrigger(day=1, hour=4, minute=0),
        args=["12month"],
        id="12month_reports",
        replace_existing=True,
    )
    scheduler.start()


async def run_all_scheduled_reports(period_type: str) -> None:
    """
    Query all active API-connected clients and spawn a report job for each.
    """
    from app.database import AsyncSessionLocal
    from app.models.client import Client
    from app.models.report_job import ReportJob
    from app.services.report_runner import run_report_job
    from sqlalchemy import select

    date_from, date_to = _compute_date_range(period_type, date.today())

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Client).where(
                Client.is_active == True,
                Client.platform != "manual",
                Client.platform != None,
            )
        )
        clients = result.scalars().all()

        for client in clients:
            job = ReportJob(
                client_id=client.id,
                triggered_by=None,  # scheduler-triggered
                period_type=period_type,
                date_from=date_from,
                date_to=date_to,
                status="pending",
                source_type="api",
            )
            db.add(job)
            await db.flush()
            job_id = job.id

        await db.commit()

    # Run jobs outside the DB session
    for client in clients:
        # Re-query last job for this client + period (just created above)
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select
            result = await db.execute(
                select(ReportJob)
                .where(
                    ReportJob.client_id == client.id,
                    ReportJob.period_type == period_type,
                    ReportJob.status == "pending",
                )
                .order_by(ReportJob.created_at.desc())
                .limit(1)
            )
            job = result.scalar_one_or_none()
            if job:
                try:
                    await run_report_job(job.id)
                except Exception as e:
                    print(f"Scheduled report failed for client {client.id}: {e}")


def _compute_date_range(period_type: str, today: date) -> tuple[date, date]:
    if period_type == "daily":
        d = today - timedelta(days=1)
        return d, d
    elif period_type == "3month":
        return today - timedelta(days=90), today
    elif period_type == "6month":
        return today - timedelta(days=180), today
    elif period_type == "12month":
        return today - timedelta(days=365), today
    raise ValueError(f"Unknown period_type: {period_type}")
