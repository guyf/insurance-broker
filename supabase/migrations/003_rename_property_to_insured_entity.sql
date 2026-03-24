-- Rename metadata key 'property' -> 'insured_entity' for all existing rows
UPDATE public.documents
SET metadata = (metadata - 'property') || jsonb_build_object('insured_entity', metadata->>'property')
WHERE metadata ? 'property';

-- list_policies(): return insured_entity instead of property
DROP FUNCTION IF EXISTS public.list_policies();
CREATE FUNCTION public.list_policies()
RETURNS TABLE (policy_type text, insured_entity text, filename text, source_path text, provider text, underwriter text)
LANGUAGE sql AS $$
  SELECT DISTINCT
    metadata->>'policy_type', metadata->>'insured_entity',
    metadata->>'filename',    metadata->>'source_path',
    metadata->>'provider',    metadata->>'underwriter'
  FROM public.documents ORDER BY 1, 2, 3;
$$;

-- get_renewal_calendar(): return insured_entity instead of property
DROP FUNCTION IF EXISTS public.get_renewal_calendar();
CREATE FUNCTION public.get_renewal_calendar()
RETURNS TABLE (policy_type text, insured_entity text, filename text, renewal_date text, premium text)
LANGUAGE sql AS $$
  SELECT DISTINCT
    metadata->>'policy_type', metadata->>'insured_entity',
    metadata->>'filename',    metadata->>'renewal_date',
    metadata->>'premium'
  FROM public.documents
  WHERE metadata ? 'renewal_date'
  ORDER BY metadata->>'renewal_date';
$$;

-- Merge-update metadata fields for all chunks matching the given source paths
CREATE OR REPLACE FUNCTION public.update_policy_metadata(
  p_source_paths text[],
  p_updates      jsonb
)
RETURNS void
LANGUAGE sql AS $$
  UPDATE public.documents
  SET metadata = metadata || p_updates
  WHERE metadata->>'source_path' = ANY(p_source_paths);
$$;
