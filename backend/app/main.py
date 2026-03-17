from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth
from app.routers.admin import clients, users, credentials, jobs, notifications, audit
from app.routers.client import reports, upload, analyze
from app.routers import shares
from app.services.scheduler import start_scheduler


def create_app() -> FastAPI:
    app = FastAPI(
        title="DRA SaaS API",
        description="Multi-tenant transaction reconciliation platform",
        version="2.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Auth
    app.include_router(auth.router, prefix="/auth", tags=["Auth"])

    # Admin routes
    app.include_router(clients.router, prefix="/admin")
    app.include_router(users.router, prefix="/admin")
    app.include_router(credentials.router, prefix="/admin")
    app.include_router(jobs.router, prefix="/admin")
    app.include_router(notifications.router, prefix="/admin")
    app.include_router(audit.router, prefix="/admin")

    # Client routes
    app.include_router(reports.router)
    app.include_router(upload.router)
    app.include_router(analyze.router)

    # Public share routes (no prefix — /share/{token} and /admin/jobs/{job_id}/share)
    app.include_router(shares.router)

    @app.get("/")
    def root():
        return {"status": "ok", "message": "DRA SaaS API v2"}

    @app.on_event("startup")
    async def startup():
        if settings.app_env == "production":
            start_scheduler()

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
