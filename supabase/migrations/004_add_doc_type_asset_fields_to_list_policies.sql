-- Add doc_type, asset_name, asset_value to list_policies() return type
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
  asset_value    text
)
LANGUAGE sql AS $$
  SELECT DISTINCT
    metadata->>'doc_type',
    metadata->>'policy_type',
    metadata->>'insured_entity',
    metadata->>'filename',
    metadata->>'source_path',
    metadata->>'provider',
    metadata->>'underwriter',
    metadata->>'asset_name',
    metadata->>'asset_value'
  FROM public.documents ORDER BY 1, 2, 3;
$$;
