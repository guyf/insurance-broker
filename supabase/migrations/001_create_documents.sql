create extension if not exists vector with schema extensions;

create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,  -- null in Phase 1
  content     text not null,
  embedding   extensions.vector(1536),
  metadata    jsonb not null default '{}'::jsonb,
  chunk_hash  text not null,   -- sha256(source_path|page_num|chunk_index)
  created_at  timestamptz not null default now()
);

create unique index documents_chunk_hash_idx on public.documents (chunk_hash);
create index documents_metadata_gin_idx on public.documents using gin (metadata);
create index documents_embedding_idx on public.documents
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table public.documents enable row level security;

-- Phase 1: service role only (ingestion script). Phase 2: add per-user policies.
create policy "service_role_all" on public.documents
  using (auth.role() = 'service_role');

-- Vector similarity search with optional jsonb filter
create or replace function public.search_documents(
  query_embedding  extensions.vector(1536),
  match_count      int   default 5,
  filter_metadata  jsonb default null
)
returns table (id uuid, content text, metadata jsonb, similarity float)
language plpgsql as $$
begin
  return query
  select d.id, d.content, d.metadata,
         1 - (d.embedding <=> query_embedding) as similarity
  from public.documents d
  where (filter_metadata is null or d.metadata @> filter_metadata)
  order by d.embedding <=> query_embedding
  limit match_count;
end; $$;

-- Distinct policy/asset list
create or replace function public.list_policies()
returns table (policy_type text, property text, filename text, source_path text)
language sql as $$
  select distinct
    metadata->>'policy_type', metadata->>'property',
    metadata->>'filename',    metadata->>'source_path'
  from public.documents order by 1, 2, 3; $$;

-- Renewal calendar (only rows with renewal_date in metadata)
create or replace function public.get_renewal_calendar()
returns table (policy_type text, property text, filename text, renewal_date text, premium text)
language sql as $$
  select distinct
    metadata->>'policy_type', metadata->>'property',
    metadata->>'filename',    metadata->>'renewal_date',
    metadata->>'premium'
  from public.documents
  where metadata ? 'renewal_date'
  order by metadata->>'renewal_date'; $$;
