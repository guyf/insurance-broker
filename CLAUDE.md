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
│   ├── server.py                     # FastMCP SSE server, 3 tools
│   ├── requirements.txt
│   ├── Procfile                      # Railway start command
│   ├── railway.toml
│   └── .env.example
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

**Three tools:**
- `search_insurance_docs(query, policy_type?, limit?)` — semantic search
- `list_policies()` — inventory of all ingested documents
- `get_renewal_calendar()` — renewal dates, flags within 60 days

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
```

**Ingestion uses service role key** (`SUPABASE_SERVICE_ROLE_KEY`) — never commit this.

**Deduplication:** chunks are skipped if their `sha256(source_path|page_num|chunk_index)`
hash already exists in the DB. Re-running on unchanged files costs $0.

## Supabase Schema

Table: `public.documents`
- `embedding` — `vector(1536)`, HNSW index with cosine ops
- `metadata` — JSONB with GIN index; fields: `doc_type`, `policy_type`, `property`,
  `filename`, `source_path`, `page_num`, `chunk_index`, `renewal_date`, `premium`
- `chunk_hash` — unique dedup key
- `user_id` — null in Phase 1, ready for Phase 2 multiuser

RLS is enabled from day one. Phase 1 allows service role only.

## Metadata Conventions

| Path pattern | doc_type | policy_type / asset_category | property |
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

**Deploy:** Add as a second Railway service in the same project, pointing root to `quote-mcp/`.

---

## Phase 2 (Future)

- Add per-user RLS policies to `documents` table
- Swap `SUPABASE_ANON_KEY` for user JWT in MCP server
- Web frontend calling Supabase RPCs directly via Anthropic API
- `user_id` column and RLS scaffolding already in place
