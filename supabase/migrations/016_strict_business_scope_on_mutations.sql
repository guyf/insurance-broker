-- 016_strict_business_scope_on_mutations.sql
-- Migration 012 scoped update_policy_metadata / delete_documents_by_source_path to a
-- business, but its predicate also matched legacy rows with business_id NULL
-- (`business_id IS NULL OR business_id = p_business_id`). Those are the original
-- personal-era documents, so any business could mutate or delete them by guessing a
-- source_path. When a business id is given, only that business's own rows match now.
-- p_business_id NULL is still the unscoped internal/admin path; the mcp-server HTTP
-- endpoints now refuse to call these without a business id.

CREATE OR REPLACE FUNCTION public.update_policy_metadata(
  p_source_paths text[],
  p_updates      jsonb,
  p_business_id  uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql AS $$
  UPDATE public.documents
  SET metadata = metadata || p_updates
  WHERE metadata->>'source_path' = ANY(p_source_paths)
    AND (p_business_id IS NULL OR business_id = p_business_id);
$$;

CREATE OR REPLACE FUNCTION public.delete_documents_by_source_path(
  p_source_path  text,
  p_business_id  uuid DEFAULT NULL
)
RETURNS int
LANGUAGE sql AS $$
  WITH deleted AS (
    DELETE FROM public.documents
    WHERE metadata->>'source_path' = p_source_path
      AND (p_business_id IS NULL OR business_id = p_business_id)
    RETURNING id
  )
  SELECT count(*)::int FROM deleted;
$$;
