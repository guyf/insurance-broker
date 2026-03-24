-- Fix list_policies() to return exactly one row per source_path.
-- Previously SELECT DISTINCT on all columns caused duplicates when different
-- chunks of the same file had slightly different metadata values.

DROP FUNCTION IF EXISTS public.list_policies();

CREATE FUNCTION public.list_policies()
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
  ORDER BY metadata->>'source_path';
$$;
