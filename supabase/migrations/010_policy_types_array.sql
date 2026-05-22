-- 010_policy_types_array.sql
-- Adds policy_types (text[]) to list_policies RPC.
-- New uploads store policy_types as a JSONB array in metadata.
-- Existing docs have policy_type (single text); the RPC wraps it transparently.

DROP FUNCTION IF EXISTS public.list_policies(text);

CREATE FUNCTION public.list_policies(p_tenant_id text DEFAULT NULL)
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
    -- policy_type: first element of array, or legacy single value
    COALESCE(
      (SELECT t FROM jsonb_array_elements_text(metadata->'policy_types') t LIMIT 1),
      metadata->>'policy_type'
    ),
    -- policy_types: array from new format, or wrap legacy single value
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
  WHERE p_tenant_id IS NULL
     OR metadata->>'tenant_id' = p_tenant_id
  ORDER BY metadata->>'source_path';
$$;
