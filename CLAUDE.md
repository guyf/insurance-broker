# Insurance Broker — Claude Code Guide

## What This Project Is

**Mid-pivot.** Originally a RAG pipeline for one person's own insurance policies (personal
home/car/pet/travel/phone cover). Being rebuilt into **Denney Insurance's SME/commercial
insurance broker product**: businesses register or log in (email OTP, or "Continue with Xero" /
"Continue with QuickBooks"), and if they connect an accounting system, their financial data
(revenue, employees, assets) is pulled automatically to drive coverage analysis and quotes for
four UK commercial lines (public liability, employers' liability, professional indemnity,
cyber). Personal-insurance use is being dropped from the product surface going forward — see
`/admin/architecture.html` (Build Status section) for exactly what's live vs. still being built.

A sibling project, `xero-insurance` (`../xero-insurance`), prototyped the Xero-login + commercial
broker idea separately. That work is being **merged into this repo and the sibling retired** —
its Xero OAuth flow and coverage-checklist UI are being ported in here rather than maintained as
a second codebase.

## Architecture

```
INGESTION (one-off, run locally — personal use only, out of scope for SME product)
────────────────────────────────────────────────────────────────────────────────
Google Drive PDFs
       │
       ▼
ingestion/ingest.py          ← chunks + embeds via OpenAI text-embedding-3-small
       │
       ▼
Supabase (vector DB)         ← hosted, always on


WEB FRONTEND (primary interface)
─────────────────────────────────
Browser
       │  React SPA
       ▼
Cloudflare Worker            ← broker.denney.insure — static SPA assets + /api/* routes
                                (git-connected via Cloudflare Workers Builds)
       │
       ├─ /api/auth/otp-request, /otp-verify, /logout ──► Supabase Auth ──► Resend (SMTP)
       │                                                        │
       │                                                        ▼
       │                                             businesses row created on first login
       │                                             (getOrCreateBusinessForUser)
       │
       ├─ /api/business ──► Supabase (businesses / business_connections / business_financials)
       │
       ├─ /api/policies, /api/upload, /api/update-policy, /api/delete-policy ──────┐
       │                                                                            │
       │                                                                            ▼
       │                                                         Broker MCP Server (Railway)
       │                                                         mcp-server/server.py
       │                                                                            │
       │                                                                            ▼
       │                                                         Supabase (vector DB + business data)
       │
       └─ /api/chat ──► Anthropic API (claude-sonnet-4-6)
                              │  agentic tool-use loop
                              ├─► Broker MCP Server (Railway) ──► Supabase
                              └─► Quote MCP Server (Railway)  ──► OpenAI (GPT-4o-mini, photo analysis)
                                  mcp-quote/server.py

  NOTE: existing routes (chat/policies/upload/etc.) are session-gated and derive business_id
  from the session server-side — see /admin/architecture.html Build Status for what's next.


CLAUDE DESKTOP (legacy — personal-broker interface, being phased out with the SME pivot)
──────────────────────────────────────────────────────────────────────────────────────
Claude Desktop
       │
       ▼
supergateway (local npx)     ← stdio↔streamable-http bridge
       │
       ├─► Broker MCP Server (Railway) ──► Supabase
       └─► Quote MCP Server (Railway)  ──► OpenAI
```

**Full architecture detail (live vs. in-progress vs. planned, every service/table/route):
see `/admin/architecture.html`** — kept up to date as this pivot progresses; this file stays a
concise guide, that one is the exhaustive reference.

## Repository Layout

```
insurance-broker/
├── SKILL.md                          # Claude's broker instructions (also at ~/.claude/skills/) — personal-broker era, being superseded
├── frontend/                         # React SPA + Cloudflare Worker, deployed to broker.denney.insure
│   ├── src/
│   │   ├── components/LoginGate/     # Email-OTP + "Continue with Xero" (live) / QuickBooks (disabled)
│   │   ├── components/BusinessPanel/ # SME dashboard: coverage checklist, policy uploads — replaces FilingCabinet
│   │   └── lib/auth.ts               # requestOtp / verifyOtp / logout / getCurrentBusiness
│   ├── worker/src/
│   │   ├── index.ts                  # Worker entry point: routes /api/*, else serves dist/ via ASSETS
│   │   ├── mcp-client.ts             # Shared stateless MCP (streamable-http) client
│   │   ├── lib/supabase.ts           # Service-role Supabase client (auth + table access)
│   │   ├── auth/session.ts           # httpOnly session cookie: read/issue/clear, auto-refresh
│   │   ├── auth/business.ts          # getOrCreateBusinessForUser — one business per user, created on first login
│   │   └── routes/
│   │       ├── auth/                 # otp-request, otp-verify, logout
│   │       ├── business.ts           # GET current business + connections + financials
│   │       └── ...                   # chat, policies, requote, upload, delete-policy, update-policy
│   ├── public/admin/index.html       # Admin hub — links to Architecture + Market Policy Registry
│   ├── public/admin/architecture.html # Full architecture reference (copied from docs/ at build time)
│   ├── public/admin/market-policies.html # Market Policy Registry ingestion tool (formerly served at /admin itself)
│   └── wrangler.toml                 # main + [assets] + [build] + [vars] — deployed via Cloudflare Workers Builds
├── supabase/
│   └── migrations/
│       ├── 001_create_documents.sql  # vector table, HNSW index, RLS, RPCs
│       └── 011_business_accounts.sql # businesses / business_connections / business_financials, documents.business_id,
│                                      # coverage_analysis.business_id, p_business_id on RPCs, policy-documents Storage bucket
├── ingestion/                        # personal-use only; out of scope for the SME product
│   ├── ingest.py                     # CLI entry point
│   ├── chunk.py                      # PDF extraction + chunking (pdfplumber + tiktoken)
│   ├── embed.py                      # OpenAI embeddings, batched
│   ├── store.py                      # Supabase upsert with dedup
│   ├── requirements.txt
│   └── .env.example
├── mcp-server/
│   ├── server.py                     # FastMCP streamable-http server, 4 MCP tools + 3 HTTP endpoints
│   ├── market_policies.py            # Curated registry of UK insurer policy booklet URLs
│   ├── requirements.txt              # mcp<2.0.0 pinned — v2 renamed FastMCP, see git history
│   ├── Procfile                      # Railway start command
│   ├── railway.toml
│   └── .env.example
├── docs/
│   └── architecture.html             # Source of truth for the architecture doc; copied to frontend/public/admin/
└── mcp-quote/
    ├── server.py                     # FastMCP streamable-http, 8 tools (4 personal + 4 commercial)
    ├── pricer.py                     # Deterministic pricing (home/motor/pet + commercial lines)
    ├── photo_analyzer.py             # GPT-4o-mini vision → asset details
    ├── requirements.txt              # mcp<2.0.0 pinned
    ├── Procfile
    ├── railway.toml
    └── .env.example
```

## Auth

**Email OTP (passwordless) via Supabase Auth — no passwords anywhere in this system.**
`signInWithOtp` sends a 6-digit code, `verifyOtp` redeems it. Xero/QuickBooks login (planned,
not built) will bridge into the same Supabase Auth identity store via the Admin API, so every
login method ends in the same kind of session regardless of how someone signed up.

- **Session**: httpOnly, Secure cookie (`ib_session`) wrapping the Supabase access + refresh
  tokens. Verified via `supabase.auth.getUser()` on each request; transparently refreshed via
  `refreshSession()` when expired (`frontend/worker/src/auth/session.ts`).
- **First login**: `getOrCreateBusinessForUser` creates a `businesses` row for the user if one
  doesn't exist yet — every authenticated user has exactly one business (v1; no team members /
  multiple businesses per user yet).
- **Mail delivery**: Resend, SMTP relay (`smtp.resend.com`), sending domain `auth.denney.insure`
  (DKIM/SPF/MX verified). Supabase's default built-in mailer is demo-only (~2 emails/hour,
  delivers only to project-team addresses) — don't rely on it past initial local testing.
- **Worker holds `SUPABASE_SERVICE_ROLE_KEY`** (new — previously only `mcp-server` had it) for
  both the Auth admin calls and direct table reads/writes (`businesses`, `business_connections`,
  `business_financials`). `SUPABASE_URL` is a plain (non-secret) `[vars]` entry in `wrangler.toml`.
- **Authorization model (v1)**: the Worker derives `business_id` from the verified session only —
  never trusts a client-supplied id. No per-row Postgres RLS beyond service-role-only yet (that's
  a deliberate deferral, not an oversight — see `/admin/architecture.html`).

## MCP Server (Railway)

**URL:** `https://insurance-broker-production-85e3.up.railway.app/sse`

**Four MCP tools** (each accepts both `tenant_id` — legacy free-text scoping from the
`xero-insurance` prototype, kept for backward compat — and `business_id`, the real FK the Worker
now derives from the session and passes on every call):
- `search_insurance_docs(query, policy_type?, limit?, tenant_id?, business_id?)` — semantic search across all docs (personal + market)
- `list_policies(tenant_id?, business_id?)` — inventory of all ingested documents
- `get_renewal_calendar(tenant_id?, business_id?)` — renewal dates, flags within 60 days
- `ingest_market_policies(policy_type, provider?)` — download & ingest public policy booklets from major UK insurers; `policy_type`: car/home/pet; `provider` optional (e.g. "Admiral") — global market data, deliberately not business-scoped

**Three HTTP endpoints (non-MCP)**, all accepting an optional `business_id` (`/upload` as a
query param, the other two in the JSON body) — migration 012 made the latter two actually
enforce it, closing a real gap where **no ownership check existed at all**: any caller could
previously mutate or delete any document by source_path, globally:
- `POST /upload` — PDF ingestion (chunked, embedded, upserted)
- `PATCH /update-policy` — merge-update metadata fields for a set of source_paths
- `DELETE /delete-policy` — delete all chunks for a set of source_paths

**Claude Desktop config** uses `supergateway` as a stdio↔streamable-http bridge:
```json
"insurance-broker-mcp": {
  "command": "npx",
  "args": ["-y", "supergateway", "--streamableHttp", "https://insurance-broker-production-85e3.up.railway.app/mcp"]
}
```

**Environment variables** (set in Railway dashboard, not committed):
- `OPENAI_API_KEY` — for embedding queries at search time
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — safe to expose in client code; RLS enforces access

**Deployment:** Railway auto-deploys `mcp-server/` on every push to `main`. To deploy a change, commit and `git push origin main` — Railway picks it up automatically (no manual trigger needed).

## Ingestion Pipeline

**Docs root:** `~/Library/CloudStorage/GoogleDrive-guyfarley@gmail.com/My Drive/AI Broker/personal data/`

**Run ingestion:**
```bash
cd ingestion
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in keys

python ingest.py --dry-run          # preview, no API calls
python ingest.py                    # full ingest
python ingest.py --path "Insurance/Car"  # single subfolder
python ingest.py --force            # re-embed everything
python ingest.py --enrich           # backfill LLM-extracted metadata (provider, premium, etc.) for existing records
python ingest.py --prune            # delete DB records whose source_path no longer exists on disk
```

**Ingestion uses service role key** (`SUPABASE_SERVICE_ROLE_KEY`) — never commit this.

**Deduplication:** chunks are skipped if their `sha256(source_path|page_num|chunk_index)`
hash already exists in the DB. Re-running on unchanged files costs $0.

## Supabase Schema

Table: `public.documents`
- `embedding` — `vector(1536)`, HNSW index with cosine ops
- `metadata` — JSONB with GIN index; fields: `doc_type`, `policy_type`, `insured_entity`,
  `filename`, `source_path`, `page_num`, `chunk_index`, `renewal_date`, `premium`,
  `provider`, `underwriter`, `asset_name`, `asset_value`
- `chunk_hash` — unique dedup key
- `user_id` — null (unused — see `business_id` below, the FK that's actually being used going forward)
- `business_id` — `uuid` → `businesses.id` (migration 011). New writes should set this; legacy
  rows only have `metadata->>'tenant_id'`, which RPCs still accept for backward compat.

Table: `public.businesses` — `id`, `owner_user_id` (→ `auth.users`, one business per user in v1), `name`.

Table: `public.business_connections` — one row per linked accounting provider (`xero` |
`quickbooks`), `external_tenant_id`, `access_token`/`refresh_token`/`token_expires_at`, unique
per `(business_id, provider)`. No rows written yet — nothing calls this until the Xero/QuickBooks
OAuth bridges are built.

Table: `public.business_financials` — one **upserted** row per business (not a history table —
refreshed on each accounting-provider login): `revenue`, `employees`, `fixed_assets`, `payroll`,
`industry`, `raw` (full captured payload). No rows written yet, same reason as above.

Table: `public.coverage_analysis` — `tenant_id` (legacy PK) and `business_id` (new, nullable
unique), `analysis` jsonb — populated by the (not-yet-ported) Analyse Policies feature.

Storage bucket: `policy-documents` (private) — for uploaded policy PDF originals, so the
rebuilt UI can show users what they uploaded. Created in migration 011; nothing uploads to it
yet (`/api/upload` still only forwards to `mcp-server` for chunking, originals aren't retained).

`doc_type` values: `policy` (insurance policies, warranties), `invoice` (purchase receipts), `other` (manuals, correspondence — not shown in UI cards).

Migrations: 001 create, 002 add provider, 003 rename property→insured_entity + add update_policy_metadata RPC, 004 add doc_type/asset_name/asset_value, 005 add premium/renewal_date, 006 fix list_policies DISTINCT ON source_path, 007 add delete_documents_by_source_path RPC, 008 add tenant_id filtering to list_policies/get_renewal_calendar, 009 add coverage_analysis table, 010 add policy_types array to list_policies, 011 add businesses/business_connections/business_financials, business_id on documents/coverage_analysis, p_business_id on RPCs, policy-documents Storage bucket, 012 add p_business_id ownership enforcement to update_policy_metadata/delete_documents_by_source_path.

RLS is enabled from day one, service-role only throughout (app-layer authorization — the Worker
derives `business_id` from the session, never from client input). Real per-row RLS keyed to
`auth.uid()` is a deliberate near-term follow-up, not yet done.

## Metadata Conventions

| Path pattern | doc_type | policy_type / asset_category | insured_entity |
|---|---|---|---|
| `Insurance/Car/…` | policy | car | — |
| `Insurance/Home/The Barns/…` | policy | home | the_barns |
| `Insurance/Home/Ashley Cottages/…` | policy | home | ashley_cottages |
| `Insurance/Home/Wicks Lane Access/…` | policy | home | wicks_lane_access |
| `Insurance/Breakdown/…` | policy | breakdown | — |
| `Insurance/Life/…` | policy | life | — |
| `Insurance/Phones/…` | policy | phone | — |
| `Insurance/Travel/…` | policy | travel | — |
| `Cars/…` | asset | car | — |
| `Bikes/…` | asset | bike | — |
| `Appliances & Machines/…` | asset | appliance | — |
| `market/{type}/{provider}/…` | policy | car / home / pet | — |

`insured_entity` can also be set freely via the web UI card editor (e.g. "BMW i3") and is persisted back to Supabase via `PATCH /api/update-policy`.

Market policy paths (`market/…`) aren't shown in the current business dashboard UI (`BusinessPanel`, née `FilingCabinet`) — they live in the DB for comparison queries only. Ingestion status is visible at `/admin/market-policies.html`, linked from the `/admin` hub page alongside Architecture. The whole `/admin*` surface is gated by **Cloudflare Access** (Zero Trust — dashboard → Zero Trust → Access → Applications, scoped to `broker.denney.insure/admin*`, email one-time-PIN login). Account-level config, not anything in this repo.

## Quote MCP Server (Railway)

**URL:** `https://alluring-prosperity-production-5644.up.railway.app/mcp`

**Eight tools — four personal (wired into the web chat today), four commercial (built, but
not yet in `chat.ts`'s `TOOLS[]` array — Claude can't call them from the web app yet):**
- `get_home_quote(...)` — illustrative home/buildings/contents quote (3 insurers)
- `get_motor_quote(...)` — illustrative motor insurance quote (3 insurers)
- `get_pet_quote(...)` — illustrative pet insurance quote (3 insurers)
- `analyze_photo(image_url, asset_type)` — GPT-4o-mini vision → asset details JSON
- `get_public_liability_quote(revenue, employees, industry, postcode?, cover_limit?)`
- `get_employers_liability_quote(employees, annual_payroll, industry)`
- `get_professional_indemnity_quote(revenue, profession, cover_limit?)`
- `get_cyber_quote(revenue, employees, industry, data_records_held?)`

**No Supabase needed** — purely stateless, only requires `OPENAI_API_KEY`.

**Claude Desktop config:**
```json
"insurance-quote-mcp": {
  "command": "npx",
  "args": ["-y", "supergateway", "--streamableHttp",
           "https://alluring-prosperity-production-5644.up.railway.app/mcp"]
}
```

**Deployment:** Same as broker — Railway auto-deploys `mcp-quote/` on every push to `main`.

**Initial setup:** Add as a second Railway service in the same project, pointing root to `mcp-quote/`.

---

## SME Rebuild — What's Next

In rough order (see `/admin/architecture.html` Build Status for the live/in-progress/planned
state of each):

1. ~~Session-gate the existing routes~~ **Done** — `chat`, `policies`, `upload`,
   `update-policy`, `delete-policy`, `requote` all require a valid session
   (`requireBusiness()` in `worker/src/auth/require.ts`) and derive `business_id` from it
   server-side; `mcp-server`'s three MCP tools plus `/upload` now accept and use `business_id`
   (migration 012 also closes a real gap: `/update-policy` and `/delete-policy` previously had
   **no ownership check at all** — any caller could mutate/delete any document by source_path).
2. ~~Xero OAuth bridge~~ **Built, not yet credentialed/tested live** — `worker/src/auth/{oauth-xero,xero-data,bridge}.ts` +
   `routes/auth/{xero-start,xero-callback}.ts`. Ported from `xero-insurance/backend/xero_auth.py`/`xero_data.py`, with two
   changes: `state` is actually validated now (the original generated it but never checked it back — a CSRF gap), and
   login identity bridges into a real Supabase Auth session via `bridgeEmailToSession()` (`auth/bridge.ts`) rather than a
   bespoke signed cookie, so it's the same identity store email-OTP users are in. "Continue with Xero" also doubles as
   "connect Xero" for an already-logged-in user — the callback checks for an existing session before deciding whether to
   bridge a new login or just link the connection to the current business. **Needs**: a Xero Developer app
   (`XERO_CLIENT_ID`/`XERO_CLIENT_SECRET` Worker secrets) with `https://broker.denney.insure/api/auth/xero-callback`
   registered as an allowed redirect URI — not yet done.
3. QuickBooks OAuth bridge — blocked on registering an Intuit Developer app (manual step). Should follow the same
   provider-agnostic shape as Xero above once built.
4. ~~Coverage-checklist UI~~ **Done** — `frontend/src/components/BusinessPanel/` replaces the personal-use
   `FilingCabinet`, ported from `xero-insurance`'s `CompanyPanel.tsx`: the 10-risk grid grouped by
   Liability/Property/Cyber/People, "Analyse Policies" (`POST /api/analyse-policies`, ports
   `analyse_tenant_policies`), and upload-time type detection (`POST /api/identify-policy`, ports
   `identify_uploaded_policy`) — both as new Worker routes calling Claude directly (same pattern as
   `chat.ts`), not mcp-server tools. `GET /api/policies` was also rewritten to proxy mcp-server's
   `/list-policies` HTTP endpoint directly instead of the old MCP-tool-text-then-regex round trip,
   which couldn't surface the `policy_types` array the risk grid needs. mcp-server's
   `/coverage-analysis`, `/list-policies`, `/search-docs` endpoints all gained `business_id` support
   alongside legacy `tenant_id`.
5. ~~Full restyle to `denney.insure`'s design system~~ **Done** — `tailwind.config.ts` carries denney's
   exact slate/primary(rose)/accent(teal) palette and `0.85rem`/`1.1rem` radii, Inter + Outfit fonts
   (the unused Cormorant Garamond link is gone). Every component (`LoginGate`, `BusinessPanel`,
   `Broker`, `QuotePanel`) restyled to match. Also fixed in passing: `QuoteTable`'s "Buy Policy" button
   linked to a hardcoded moneysupermarket.com URL that had nothing to do with the illustrative quotes
   this app generates — replaced with a plain "illustrative only, speak to a broker" notice.
6. Decommission `xero-insurance` (Railway backend + Cloudflare Pages frontend) once Xero login above is
   credentialed and verified working end-to-end.

## Future Hardening (not urgent, flagged for later)

- Real per-row Postgres RLS keyed to `auth.uid()`, replacing the current service-role-only /
  app-layer-authorization model
- Passkey/WebAuthn as an optional faster-login upgrade once a user has an OTP-created account
  (Supabase Auth's passkey support is experimental/beta as of writing — not for v1)
