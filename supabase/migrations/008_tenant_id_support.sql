-- 008_tenant_id_support.sql
-- Adds optional tenant_id filtering to list_policies and get_renewal_calendar.
-- tenant_id is stored inside the metadata JSONB alongside other fields.
-- Existing personal documents have no tenant_id in metadata and are returned
-- unchanged when p_tenant_id IS NULL (backward-compatible).
-- For search_documents, pass {"tenant_id": "..."} inside filter_metadata directly.

DROP FUNCTION IF EXISTS public.list_policies();

CREATE FUNCTION public.list_policies(p_tenant_id text DEFAULT NULL)
RETURNS TABLE (
  doc_type       text,
  policy_type    text,
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
    metadata->>'policy_type',
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
  WHERE p_tenant_id IS NULL
     OR metadata->>'tenant_id' = p_tenant_id
  ORDER BY metadata->>'source_path';
$$;

DROP FUNCTION IF EXISTS public.get_renewal_calendar();

CREATE FUNCTION public.get_renewal_calendar(p_tenant_id text DEFAULT NULL)
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
  ORDER BY metadata->>'source_path', metadata->>'renewal_date';
$$;
