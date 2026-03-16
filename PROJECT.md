# DRA Transaction Reconciliation Platform

**Agency:** Data Revolt Agency (DRA)
**Brand color:** `#dd3333`

## Purpose

Multi-tenant SaaS platform that reconciles ecommerce backend transaction data against Google Analytics 4 (GA4) tracking. Identifies tracking gaps, missing revenue, and provides actionable recommendations. Supports ~40 clients with automated reporting, a client portal, and a full admin dashboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19.2.3 + Next.js 16 (TypeScript, `output: "standalone"`) |
| Styling | Tailwind CSS 4 + PostCSS |
| Backend | FastAPI (Python 3.12) + Uvicorn + SQLAlchemy async |
| Database | PostgreSQL 16 + asyncpg + Alembic migrations |
| Auth | JWT (httpOnly cookies) + bcrypt + `jose` (edge-compatible) |
| Scheduling | APScheduler 3 (in-process, AsyncIOScheduler) |
| Credential encryption | Fernet symmetric (`cryptography` library) |
| PDF Export | jsPDF 2.5.1 (client-side) |
| Data Processing | Pandas 2.2.3 + openpyxl 3.1.5 |
| Deployment | Docker Compose (db, api, web, nginx) |

---

## Directory Structure

```
/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx         # Public login page
│   │   ├── (admin)/                   # Admin shell (sidebar nav)
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx     # Overview stats + recent jobs
│   │   │   ├── clients/
│   │   │   │   ├── page.tsx           # Client list
│   │   │   │   ├── new/page.tsx       # Create client + portal login
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx       # Client detail + trigger reports
│   │   │   │       └── credentials/page.tsx  # WooCommerce/Shopify/GA4 keys
│   │   │   ├── jobs/page.tsx          # All jobs + status filter
│   │   │   └── manual/page.tsx        # 3-step CSV reconciliation tool
│   │   ├── (client)/                  # Client portal (minimal header)
│   │   │   ├── layout.tsx
│   │   │   └── reports/
│   │   │       ├── page.tsx           # Report list + generate button
│   │   │       └── [id]/page.tsx      # Report viewer + export
│   │   ├── api/auth/
│   │   │   ├── login/route.ts         # Sets httpOnly JWT cookies
│   │   │   └── logout/route.ts        # Revokes refresh token, clears cookies
│   │   ├── layout.tsx                 # Root layout + metadata
│   │   ├── page.tsx                   # Redirect → /dashboard
│   │   └── globals.css                # CSS variables + global styles
│   ├── components/
│   │   └── reports/ReportViewer.tsx   # Full report display component
│   ├── lib/
│   │   ├── api.ts                     # Typed fetch wrapper (Bearer token)
│   │   ├── auth.ts                    # Client-side JWT helpers
│   │   ├── generatePdf.ts             # Client-side PDF generation (680 lines)
│   │   └── types.ts                   # Shared TypeScript interfaces
│   └── middleware.ts                  # JWT cookie validation + role routing
├── backend/
│   ├── app/                           # New FastAPI app (multi-tenant)
│   │   ├── main.py                    # App factory + scheduler startup
│   │   ├── config.py                  # Pydantic BaseSettings (.env)
│   │   ├── database.py                # Async SQLAlchemy engine
│   │   ├── deps.py                    # get_current_user, require_admin
│   │   ├── models/                    # SQLAlchemy ORM models (6 tables)
│   │   ├── schemas/                   # Pydantic I/O schemas
│   │   ├── routers/
│   │   │   ├── auth.py                # login, refresh, logout, me
│   │   │   ├── admin/                 # clients, users, credentials, jobs
│   │   │   └── client/                # reports, upload, analyze
│   │   ├── services/
│   │   │   ├── analysis.py            # Core reconciliation logic (extracted)
│   │   │   ├── encryption.py          # Fernet encrypt/decrypt
│   │   │   ├── woocommerce.py         # REST v3 → DataFrame
│   │   │   ├── shopify.py             # Admin API → DataFrame
│   │   │   ├── ga4.py                 # GA4 Data API v1 → DataFrame
│   │   │   ├── report_runner.py       # fetch → analyze → persist
│   │   │   └── scheduler.py           # APScheduler 4 cron jobs
│   │   └── migrations/                # Alembic (0001_initial.py)
│   ├── main.py                        # Legacy single-session API (kept)
│   ├── seed.py                        # Bootstrap initial admin user
│   ├── requirements.txt               # Extended with 12 new packages
│   ├── Dockerfile
│   └── tests/test_analysis.py         # Regression tests (14 cases)
├── test_data/
│   ├── ga4_enriched.csv               # 52,123 rows
│   └── backend_enriched.csv           # 85,000 rows
├── docker-compose.yml                 # db, api, web, nginx
├── Dockerfile.web                     # 3-stage Next.js build
├── nginx.conf                         # SSL termination + reverse proxy
├── .env.example                       # Root env template (docker-compose)
├── next.config.ts                     # output: "standalone"
└── package.json
```

---

## Authentication & Routing

Two roles: **admin** (internal team) and **client** (portal-only).

| Path prefix | Required role |
|---|---|
| `/dashboard`, `/clients`, `/jobs`, `/manual` | `admin` |
| `/reports`, `/generate` | `client` or `admin` |
| `/login`, `/api/auth/*` | public |

JWT stored as httpOnly cookie (`access_token`, 1h). Refresh token (7d) rotated on each use. Next.js middleware validates the cookie server-side before any page renders — unauthenticated requests redirect to `/login`.

---

## PostgreSQL Schema

```
users          (id, email, password_hash, name, role, is_active, timestamps)
clients        (id, user_id→users, name, slug, platform, timezone, vat_rate,
                ga4_includes_vat, backend_includes_vat, is_active, timestamps)
credentials    (id, client_id, platform: woocommerce|shopify|ga4,
                encrypted API keys/tokens/service account JSON)
report_jobs    (id, client_id, triggered_by→users, period_type, date_from, date_to,
                status: pending|running|completed|failed, source_type: api|csv,
                error_message, started_at, completed_at)
report_results (id, job_id unique, client_id, result_json JSONB, specialist_notes,
                row_count_backend, row_count_ga4, match_rate)
refresh_tokens (id, user_id, token_hash, expires_at, revoked)
```

---

## API Endpoints

```
# Auth (public)
POST  /auth/login            { email, password } → tokens
POST  /auth/refresh
POST  /auth/logout
GET   /auth/me

# Admin
GET   /admin/clients
POST  /admin/clients
GET   /admin/clients/{id}
PUT   /admin/clients/{id}
GET   /admin/clients/{id}/credentials
PUT   /admin/clients/{id}/credentials/{platform}   # encrypts on write
DELETE /admin/clients/{id}/credentials/{platform}
GET   /admin/users
POST  /admin/users
PUT   /admin/users/{id}
GET   /admin/jobs
POST  /admin/jobs/{client_id}/trigger

# Client portal
GET   /reports               # scoped to caller's client_id
GET   /reports/{id}
PUT   /reports/{id}/notes
POST  /reports/generate
GET   /reports/{id}/export/csv
GET   /reports/{id}/export/xlsx

# Manual CSV (auth-gated, admin only)
POST  /upload/ga4
POST  /upload/backend
POST  /analyze
```

---

## Automated Integrations

All three return `(ga4_df, backend_df)` DataFrames feeding `run_analysis()`.

| Platform | Library | Auth | Pagination |
|---|---|---|---|
| WooCommerce | `woocommerce==3.0.0` | consumer key + secret | `X-WP-TotalPages`, 100/page |
| Shopify | `ShopifyAPI==12.6.0` | access token | cursor (`has_next_page`) |
| GA4 | `google-analytics-data==0.18.3` | service account JSON | offset, limit=100,000 |

---

## Scheduled Reports (APScheduler)

| Job | Schedule | Period |
|---|---|---|
| daily_reports | 02:00 UTC every day | Yesterday |
| 3month_reports | 1st of month, 03:00 UTC | Rolling 90 days |
| 6month_reports | 1st of month, 03:30 UTC | Rolling 180 days |
| 12month_reports | 1st of month, 04:00 UTC | Rolling 365 days |

---

## Analysis Logic (backend/app/services/analysis.py)

Extracted from legacy `backend/main.py` — zero logic changes.

1. **Data Cleaning** — strips whitespace from IDs, converts values to numeric
2. **VAT Normalization** — divides by `(1 + vat_rate/100)` for the VAT-inclusive dataset when sources differ
3. **Matching** — set intersection on clean transaction IDs
4. **Value Comparison** — exact match if difference ≤ 1; aggregates by ID before comparing
5. **Segmentation** — payment method, shipping method, order status tracking rates
6. **Tech Analysis** — browser + device breakdown (matched transactions only)
7. **Source/Medium Analysis** — top 15 by volume
8. **Temporal Analysis** — daily match rate for chart
9. **Recommendations Engine:**
   - Payment method 0% tracking → **Critical**
   - Payment method <50% tracking → **High**
   - Overall match rate <80% → **Medium**

---

## PDF Generation (src/lib/generatePdf.ts)

Client-side via jsPDF. Sections: header, hero banner, summary cards, match rate chart, recommendations, status/shipping/payment tables, tech breakdown, source/medium table, specialist notes, footer.

---

## Deployment

### Quick start (Docker Compose)

```bash
cp .env.example .env            # fill in POSTGRES_PASSWORD, JWT_SECRET, ENCRYPTION_KEY, DOMAIN
docker compose up -d db
docker compose run --rm api python seed.py --email admin@example.com --password yourpassword
docker compose up -d
```

### Manual (development)

```bash
# Backend (new multi-tenant app)
cd backend
source venv/bin/activate
alembic upgrade head
uvicorn app.main:app --reload

# Frontend
npm run dev
```

### Server requirements
- Docker + Docker Compose (production)
- Or: Python 3.12+, Node.js 20+, PostgreSQL 16+

---

## Security

- JWT in httpOnly cookies (not localStorage) — XSS-safe
- Passwords hashed with bcrypt (passlib)
- API credentials encrypted at rest with Fernet symmetric encryption
- Next.js middleware enforces auth before any page renders
- Nginx rate-limits auth endpoints: 10 req/min per IP
- CORS restricted to `ALLOWED_ORIGINS` env var in production
- File uploads: 150MB max enforced

---

## Regression Tests

```bash
cd backend
pytest tests/test_analysis.py -v
```

14 test cases covering: summary sanity, value comparison, payment/shipping/status analysis, recommendations, and VAT normalization. Uses real `test_data/` CSVs.

---

## Development Commands

```bash
# Frontend
npm run dev       # Dev server on :3000
npm run build     # Standalone build
npm run lint      # ESLint

# Backend
cd backend
pytest tests/test_analysis.py -v
alembic upgrade head
python seed.py --email admin@example.com --password secret
uvicorn app.main:app --reload
```

---

## Git History

| Commit | Summary |
|---|---|
| `cea52ac` | Security fixes, client-side PDF export, VAT normalization, source/medium analysis |
| `bde0c2b` | Fix: Skip Content-Type header for multipart uploads |
| `0083b75` | Fix: Use query params for API proxy (Nginx blocks PATH_INFO) |
| `a57af50` | Fix: Use api.php proxy for Cloudways Nginx compatibility |
| `d8d3e79` | Feat: Static export with PHP proxy for Cloudways deployment |
| `913f921` | Feat: Interactive chart, specialist notes, GA4 date mapping |
| `338feae` | Initial commit from Create Next App |
