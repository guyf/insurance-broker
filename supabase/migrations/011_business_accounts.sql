-- 011_business_accounts.sql
-- Real business accounts, replacing the unauthenticated free-text tenant_id
-- string (added in 008 for the standalone xero-insurance project) with a
-- proper FK-backed model. tenant_id / metadata->>'tenant_id' are left in
-- place and still accepted by the RPCs below for backward compatibility
-- during the migration; business_id is what new code should write and read.
--
-- Auth itself is Supabase Auth (auth.users) — this migration only adds the
-- business-side tables. It does not add per-row RLS beyond the existing
-- service-role-only policy: the Worker derives business_id from the
-- session server-side and is the only holder of the service-role key, so
-- authorization stays at the application layer for this first cut (see
-- plan doc — real auth.uid()-scoped RLS is a follow-up, not in scope here).

CREATE TABLE IF NOT EXISTS public.businesses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS businesses_owner_user_id_idx ON public.businesses (owner_user_id);

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.businesses;
CREATE POLICY "service_role_all" ON public.businesses
  USING (auth.role() = 'service_role');

-- One row per linked accounting provider. A business can link both Xero
-- and QuickBooks, or none (email-only signup with manually entered info).
CREATE TABLE IF NOT EXISTS public.business_connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  provider           text NOT NULL CHECK (provider IN ('xero', 'quickbooks')),
  external_tenant_id text NOT NULL,  -- Xero tenantId / QuickBooks realmId
  access_token       text,
  refresh_token      text,
  token_expires_at   timestamptz,
  connected_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, provider)
);

CREATE INDEX IF NOT EXISTS business_connections_business_id_idx ON public.business_connections (business_id);

ALTER TABLE public.business_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.business_connections;
CREATE POLICY "service_role_all" ON public.business_connections
  USING (auth.role() = 'service_role');

-- Latest financials snapshot per business — re-fetched and upserted on
-- each accounting-provider login rather than kept as history (see plan
-- doc: "refresh on login", no scheduler in this first cut).
CREATE TABLE IF NOT EXISTS public.business_financials (
  business_id   uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  source        text NOT NULL CHECK (source IN ('xero', 'quickbooks', 'manual')),
  revenue       numeric,
  employees     int,
  fixed_assets  numeric,
  payroll       numeric,
  industry      text,
  raw           jsonb NOT NULL DEFAULT '{}'::jsonb,  -- full captured payload, future-proofing
  fetched_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_financials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.business_financials;
CREATE POLICY "service_role_all" ON public.business_financials
  USING (auth.role() = 'service_role');

-- documents: add the real FK alongside the legacy metadata->>'tenant_id'.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS documents_business_id_idx ON public.documents (business_id);

-- coverage_analysis (009): add business_id alongside the existing tenant_id
-- PK. New writes should upsert on business_id; tenant_id stays for any
-- existing xero-insurance rows until that data is backfilled/retired.
ALTER TABLE public.coverage_analysis
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS coverage_analysis_business_id_idx
  ON public.coverage_analysis (business_id) WHERE business_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RPCs: add p_business_id alongside the existing p_tenant_id param.
-- Both accepted (NULL = no filter, matching existing backward-compat
-- behaviour); mcp-server moves to passing p_business_id going forward.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.list_policies(text);

CREATE FUNCTION public.list_policies(p_tenant_id text DEFAULT NULL, p_business_id uuid DEFAULT NULL)
RETURNS TABLE (
  doc_type       text,
  policy_type    text,
  policy_types   text[],
  insured_entity text,
  filename       text,
  source_path    text,
  provider       text,
  underwriter    text,
  asset_name     text,
  asset_value    text,
  premium        text,
  renewal_date   text
)
LANGUAGE sql AS $$
  SELECT DISTINCT ON (metadata->>'source_path')
    metadata->>'doc_type',
    COALESCE(
      (SELECT t FROM jsonb_array_elements_text(metadata->'policy_types') t LIMIT 1),
      metadata->>'policy_type'
    ),
    CASE
      WHEN metadata ? 'policy_types' THEN
        ARRAY(SELECT jsonb_array_elements_text(metadata->'policy_types'))
      WHEN metadata->>'policy_type' IS NOT NULL THEN
        ARRAY[metadata->>'policy_type']
      ELSE NULL
    END,
    metadata->>'insured_entity',
    metadata->>'filename',
    metadata->>'source_path',
    metadata->>'provider',
    metadata->>'underwriter',
    metadata->>'asset_name',
    metadata->>'asset_value',
    metadata->>'premium',
    metadata->>'renewal_date'
  FROM public.documents
  WHERE (p_tenant_id IS NULL OR metadata->>'tenant_id' = p_tenant_id)
    AND (p_business_id IS NULL OR business_id = p_business_id)
  ORDER BY metadata->>'source_path';
$$;

DROP FUNCTION IF EXISTS public.get_renewal_calendar(text);

CREATE FUNCTION public.get_renewal_calendar(p_tenant_id text DEFAULT NULL, p_business_id uuid DEFAULT NULL)
RETURNS TABLE (
  policy_type    text,
  insured_entity text,
  filename       text,
  renewal_date   text,
  premium        text
)
LANGUAGE sql AS $$
  SELECT DISTINCT ON (metadata->>'source_path')
    metadata->>'policy_type',
    metadata->>'insured_entity',
    metadata->>'filename',
    metadata->>'renewal_date',
    metadata->>'premium'
  FROM public.documents
  WHERE metadata ? 'renewal_date'
    AND (p_tenant_id IS NULL OR metadata->>'tenant_id' = p_tenant_id)
    AND (p_business_id IS NULL OR business_id = p_business_id)
  ORDER BY metadata->>'source_path', metadata->>'renewal_date';
$$;

DROP FUNCTION IF EXISTS public.search_documents(extensions.vector, int, jsonb);

CREATE OR REPLACE FUNCTION public.search_documents(
  query_embedding  extensions.vector(1536),
  match_count      int   DEFAULT 5,
  filter_metadata  jsonb DEFAULT NULL,
  p_business_id    uuid  DEFAULT NULL
)
RETURNS TABLE (id uuid, content text, metadata jsonb, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT d.id, d.content, d.metadata,
         1 - (d.embedding <=> query_embedding) AS similarity
  FROM public.documents d
  WHERE (filter_metadata IS NULL OR d.metadata @> filter_metadata)
    AND (p_business_id IS NULL OR d.business_id = p_business_id)
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END; $$;

-- ---------------------------------------------------------------------------
-- Storage bucket for uploaded policy PDFs (doesn't exist today — only
-- extracted/chunked text is kept, so there was nothing for a hosted
-- multi-tenant UI to show the user what they actually uploaded).
-- Private bucket; the Worker issues short-lived signed URLs to display
-- files, matching the service-role-only access model used everywhere else
-- in this migration.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('policy-documents', 'policy-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Named per-bucket (not "service_role_all") since storage.objects is a
-- single shared table across every bucket in the project — a generic name
-- here would risk colliding with policies for other buckets later.
DROP POLICY IF EXISTS "service_role_all_policy_documents" ON storage.objects;
CREATE POLICY "service_role_all_policy_documents" ON storage.objects
  FOR ALL
  USING (bucket_id = 'policy-documents' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'policy-documents' AND auth.role() = 'service_role');
