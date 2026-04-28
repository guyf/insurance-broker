# Insurance Broker — Claude Code Guide

## What This Project Is

A RAG pipeline that embeds personal insurance policy PDFs into a Supabase vector store,
then exposes them to Claude via an MCP server. Claude acts as a personal insurance broker,
answering coverage questions, flagging renewal dates, and identifying gaps.

## Architecture

```
INGESTION (one-off, run locally)
────────────────────────────────
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
Cloudflare Pages             ← static frontend + serverless Functions
       │
       ├─ /api/policies ──────────────────────────────────────────────┐
       │                                                               │
       ├─ /api/upload ────────────────────────────────────────────────┤
       │                                                               ▼
       │                                                    Broker MCP Server (Railway)
       │                                                    mcp-server/server.py
       │                                                               │
       │                                                               ▼
       │                                                    Supabase (vector DB)
       │
       └─ /api/chat ──► Anthropic API (claude-sonnet-4-6)
                              │  agentic tool-use loop
                              ├─► Broker MCP Server (Railway) ──► Supabase
                              └─► Quote MCP Server (Railway)  ──► OpenAI (GPT-4o-mini, photo analysis)
                                  mcp-quote/server.py


CLAUDE DESKTOP (alternative interface)
───────────────────────────────────────
Claude Desktop
       │
       ▼
supergateway (local npx)     ← stdio↔streamable-http bridge
       │
       ├─► Broker MCP Server (Railway) ──► Supabase
       └─► Quote MCP Server (Railway)  ──► OpenAI
```

## Repository Layout

```
insurance-broker/
├── SKILL.md                          # Claude's broker instructions (also at ~/.claude/skills/)
├── supabase/
│   └── migrations/
│       └── 001_create_documents.sql  # vector table, HNSW index, RLS, RPCs
├── ingestion/
│   ├── ingest.py                     # CLI entry point
│   ├── chunk.py                      # PDF extraction + chunking (pdfplumber + tiktoken)
│   ├── embed.py                      # OpenAI embeddings, batched
│   ├── store.py                      # Supabase upsert with dedup
│   ├── requirements.txt
│   └── .env.example
├── mcp-server/
│   ├── server.py                     # FastMCP streamable-http server, 4 MCP tools + 3 HTTP endpoints
│   ├── market_policies.py            # Curated registry of UK insurer policy booklet URLs
│   ├── requirements.txt
│   ├── Procfile                      # Railway start command
│   ├── railway.toml
│   └── .env.example
├── docs/
│   ├── architecture.html             # Architecture diagrams (source; copied to frontend/public/)
│   └── pitch.html                    # Pitch presentation (source; copied to frontend/public/)
└── mcp-quote/
    ├── server.py                     # FastMCP streamable-http, 4 tools
    ├── pricer.py                     # Deterministic home/motor/pet pricing
    ├── photo_analyzer.py             # GPT-4o-mini vision → asset details
    ├── requirements.txt
    ├── Procfile
    ├── railway.toml
    └── .env.example
```

## MCP Server (Railway)

**URL:** `https://insurance-broker-production-85e3.up.railway.app/sse`

**Four MCP tools:**
- `search_insurance_docs(query, policy_type?, limit?)` — semantic search across all docs (personal + market)
- `list_policies()` — inventory of all ingested documents
- `get_renewal_calendar()` — renewal dates, flags within 60 days
- `ingest_market_policies(policy_type, provider?)` — download & ingest public policy booklets from major UK insurers; `policy_type`: car/home/pet; `provider` optional (e.g. "Admiral")

**Three HTTP endpoints (non-MCP):**
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
- `user_id` — null in Phase 1, ready for Phase 2 multiuser

`doc_type` values: `policy` (insurance policies, warranties), `invoice` (purchase receipts), `other` (manuals, correspondence — not shown in UI cards).

Migrations: 001 create, 002 add provider, 003 rename property→insured_entity + add update_policy_metadata RPC, 004 add doc_type/asset_name/asset_value, 005 add premium/renewal_date, 006 fix list_policies DISTINCT ON source_path, 007 add delete_documents_by_source_path RPC.

RLS is enabled from day one. Phase 1 allows service role only.

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

Market policy paths (`market/…`) are filtered out of the Filing Cabinet UI — they live in the DB for comparison queries only. Ingestion status is visible at `/admin`.

## Quote MCP Server (Railway)

**URL:** `https://alluring-prosperity-production-5644.up.railway.app/mcp`

**Four tools:**
- `get_home_quote(...)` — illustrative home/buildings/contents quote (3 insurers)
- `get_motor_quote(...)` — illustrative motor insurance quote (3 insurers)
- `get_pet_quote(...)` — illustrative pet insurance quote (3 insurers)
- `analyze_photo(image_url, asset_type)` — GPT-4o-mini vision → asset details JSON

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

## Phase 2 (Future)

- Add per-user RLS policies to `documents` table
- Swap `SUPABASE_ANON_KEY` for user JWT in MCP server
- Web frontend calling Supabase RPCs directly via Anthropic API
- `user_id` column and RLS scaffolding already in place
