# Nutri B2C Backend

A production‑ready REST API powering the Nutri B2C app (personalized recipe discovery and nutrition guidance). Auth is handled by **Appwrite**; data is stored in **Supabase Postgres**. Search is fully server‑side via a SQL RPC (`search_recipes`) with deterministic ranking and filters.

> **Status:** MVP v1.0 (per‑serving, US‑only). This README documents the architecture, setup, env, run, and key endpoints.

---

## Table of Contents
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Directory Layout](#directory-layout)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Local Setup](#local-setup)
- [Database Schema (overview)](#database-schema-overview)
- [SQL RPCs](#sql-rpcs)
- [API](#api)
  - [Auth](#auth)
  - [Errors](#errors)
  - [Pagination](#pagination)
  - [Rate Limits](#rate-limits)
  - [Idempotency](#idempotency)
  - [Endpoints](#endpoints)
- [Observability & Ops](#observability--ops)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security Notes](#security-notes)
- [License](#license)

---

## Features
- 🔐 Appwrite‑backed authentication (JWT passed to backend via `X-Appwrite-JWT`).
- 🗄️ Supabase Postgres as the system of record (per‑serving nutrition; US market focus).
- 🔎 Server‑side search via SQL RPC (`search_recipes`) with:
  - Diet filters (AND), allergen exclusion, cuisines (OR)
  - Numeric filters (calories, protein_min, sugar_max, sodium_max, fiber_min, optional saturated_fat)
  - Time filter (`time_max`)
  - Deterministic ranking: FTS + diet/cuisine boosts + recency + popularity − repeat penalty
- ⭐ Saves, 👀 History (viewed/cooked), and personalized feed RPC
- 🧰 RFC 9457/7807 Problem Details for errors, idempotent writes, rate‑limit headers
- 📈 Health endpoints and basic metrics hooks

## Architecture
- **Auth/Appwrite**: Clients obtain JWT via `account.createJWT()` and send it as `X-Appwrite-JWT` on every API call.
- **API/Node**: REST under `/api/v1`. JSON only.
- **Data/Supabase**: Postgres tables for `recipes`, `saved_recipes`, `recipe_history`, `user_recipes` + taxonomies. Materialized view for 30‑day popularity.
- **Search**: SQL RPC (`search_recipes`) executes filters + ranking on DB. Deterministic order with stable tie‑breakers.

## Tech Stack
- Node.js 20+ / TypeScript
- Express (or Fastify) + Zod (validation)
- Supabase (Postgres, Storage optional)
- Appwrite (Auth)

> **Note:** If your local copy uses a different HTTP framework, the env and contracts below still apply.

## Directory Layout
```
.
├─ server/
│  ├─ index.ts                # app bootstrap
│  ├─ routes/                 # route handlers (/api/v1/*)
│  ├─ lib/                    # appwrite, supabase, auth, utils
│  ├─ middleware/             # auth, rate limit, problem-details
│  └─ workers/                # (optional) async jobs
├─ db/
│  ├─ schema.sql              # tables, indexes, policies
│  ├─ functions.sql           # RPCs (search_recipes, personalized_feed)
│  └─ seed.sql                # mock/dev data
├─ .env.example
├─ package.json
└─ README.md
```

## Prerequisites
- Node.js >= 20, npm or pnpm
- Supabase project (US region), **Database URL** + service role key
- Appwrite project, API endpoint, project ID

## Environment Variables
Create `.env.local` from `.env.example`.

```dotenv
# App
PORT=5001
HOST=127.0.0.1
NODE_ENV=development

# Appwrite (Auth)
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=xxxxx
APPWRITE_API_KEY= # optional if server verifies JWT only
APPWRITE_JWT_AUDIENCE=nutri-b2c

# Supabase / Postgres
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/dbname
# Optional read replica (falls back to primary if not set)
DATABASE_REPLICA_URL=

# Supabase keys (if you call edge funcs/storage)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE=eyJhbGciOi...
SUPABASE_ANON_KEY=eyJhbGciOi...

# Observability
LOG_LEVEL=info
```

> **Why `DATABASE_URL`?** The backend connects directly to Postgres (not via Supabase REST), so a Postgres connection string is required.

## Local Setup
```bash
# install deps
npm i

# (optional) generate types, run migrations
# psql "$DATABASE_URL" -f db/schema.sql
# psql "$DATABASE_URL" -f db/functions.sql
# psql "$DATABASE_URL" -f db/seed.sql

# run dev
npm run dev
# build + start
npm run build && npm start
```

## Database Schema (overview)
**Core tables** (condensed):
- `recipes` (per‑serving nutrition; cuisines[]; diet_tags[]; flag_tags[]; allergens[]; search_text/tsv; status/version; source_user_recipe_id; US‑only)
- `user_recipes` (owner_user_id; same fields; visibility/share_slug; review_status; submitted/reviewed)
- `saved_recipes` (user_id, recipe_id, created_at)
- `recipe_history` (user_id, recipe_id, event {viewed,cooked}, created_at)
- `tax_*` (allergens Big‑9 incl. sesame; diets; cuisines; flags)
- `mv_recipe_popularity_30d` materialized view

**Indexes**: GIN on arrays (`cuisines`, `diet_tags`, `flag_tags`, `allergens`, `tsv`); BTREE on numeric filters and `updated_at`.

**RLS**: enabled on user‑scoped tables (`saved_recipes`, `recipe_history`, `user_recipes`).

## API
### Auth
- Clients **must** send `X-Appwrite-JWT: <token>` header on protected routes.
- The server verifies the JWT with Appwrite project settings.

### Errors
- RFC 9457/7807 Problem Details (JSON). Example:
```json
{
  "type": "about:blank",
  "title": "Invalid request",
  "status": 400,
  "detail": "'protein_min' must be >= 0",
  "instance": "/api/v1/recipes"
}
```

### Pagination
- Offset pagination: `limit` (default 50, max 200) and `offset`.

### Rate Limits
- Default: 60 rpm per user (reads). Heavy writes: 6 rpm. Uses `RateLimit-*` headers.

### Idempotency
- Use `Idempotency-Key` on POST/PUT/PATCH (24h replay window). Server returns the same result for duplicate keys.

### Endpoints
> Base path: `/api/v1` (JSON only)

#### Recipes
- **GET** `/recipes` — list/search
  - Query: `q`, `diets`, `allergens`, `cuisines`, `calories_min`, `calories_max`, `protein_min`, `fiber_min`, `sugar_max`, `sodium_max`, `time_max`, `sort`, `limit`, `offset`
- **GET** `/recipes/:id` — detail
- **POST** `/recipes/:id/save` — toggle save (idempotent)
- **GET** `/recipes/saved` — list saved

#### History
- **POST** `/recipes/:id/history` — log `{event: viewed|cooked}` (idempotent per hour for `viewed`)
- **GET** `/recipes/history` — list history (last 180d)

#### User Recipes (UGC)
- **POST** `/user-recipes` — create (private by default)
- **PATCH** `/user-recipes/:id` — update
- **POST** `/user-recipes/:id/share` — rotate/revoke share slug
- **POST** `/user-recipes/:id/submit` — submit for curation

#### Admin
- **POST** `/admin/recipes/:id/approve` — publish curated copy
- **POST** `/admin/recipes/:id/reject` — reject with reason
- **POST** `/admin/recipes/:id/hide` — soft hide on reports

#### Health
- **GET** `/healthz` — liveness
- **GET** `/readyz` — readiness

### cURL Examples
```bash
# Search
curl -H "X-Appwrite-JWT: $JWT" \
  "http://localhost:5001/api/v1/recipes?q=salad&protein_min=20&time_max=30&limit=50"

# Save a recipe
curl -X POST -H "X-Appwrite-JWT: $JWT" \
  "http://localhost:5001/api/v1/recipes/abc123/save"

# Log a view event
curl -X POST -H "Content-Type: application/json" -H "X-Appwrite-JWT: $JWT" \
  -d '{"event":"viewed"}' \
  "http://localhost:5001/api/v1/recipes/abc123/history"
```

## Observability & Ops
- **SLOs**: P95 ≤ 500 ms (search/detail), P99 ≤ 900 ms
- **Logs**: structured JSON with `request_id`, `user_id`, `route`, `latency`, `db_time`
- **Metrics**: req_count/latency/errors, DB time, cache hits
- **Health**: `/healthz`, `/readyz`

## Testing
```bash
npm run lint
npm run test
```
- Unit tests for route validators and services
- Integration tests for search filters & toggles

## Deployment
- **Container**: build minimal Node image; expose `PORT`
- **Secrets**: inject via platform (never commit `.env`)
- **DB Migrations**: run `db/schema.sql` and `db/functions.sql` during release
- **Regions**: keep Appwrite + Supabase + API in the same geographic region where possible

## Security Notes
- Enforce HTTPS and HSTS in production
- Validate `X-Appwrite-JWT` and audience/issuer
- Apply RLS on user‑scoped tables
- Never log PII; audit all admin actions

## License
MIT (or project default).

