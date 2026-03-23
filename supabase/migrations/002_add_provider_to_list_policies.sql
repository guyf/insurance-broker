-- Add provider and underwriter fields to list_policies() return type
-- Must drop first as return type is changing
DROP FUNCTION IF EXISTS public.list_policies();

CREATE OR REPLACE FUNCTION public.list_policies()
RETURNS TABLE (policy_type text, property text, filename text, source_path text, provider text, underwriter text)
LANGUAGE sql AS $$
  SELECT DISTINCT
    metadata->>'policy_type', metadata->>'property',
    metadata->>'filename',    metadata->>'source_path',
    metadata->>'provider',    metadata->>'underwriter'
  FROM public.documents ORDER BY 1, 2, 3;
$$;
