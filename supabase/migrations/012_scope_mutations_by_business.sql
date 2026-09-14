-- 012_scope_mutations_by_business.sql
-- update_policy_metadata and delete_documents_by_source_path previously had
-- no ownership check at all — any caller could mutate/delete any document
-- by source_path, globally. Add an optional p_business_id: when given, only
-- rows matching that business (or legacy rows with no business_id yet) are
-- affected. NULL preserves the old unscoped behaviour for internal/admin
-- callers that don't pass it.

DROP FUNCTION IF EXISTS public.update_policy_metadata(text[], jsonb);

CREATE FUNCTION public.update_policy_metadata(
  p_source_paths text[],
  p_updates      jsonb,
  p_business_id  uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql AS $$
  UPDATE public.documents
  SET metadata = metadata || p_updates
  WHERE metadata->>'source_path' = ANY(p_source_paths)
    AND (p_business_id IS NULL OR business_id IS NULL OR business_id = p_business_id);
$$;

DROP FUNCTION IF EXISTS public.delete_documents_by_source_path(text);

CREATE FUNCTION public.delete_documents_by_source_path(
  p_source_path  text,
  p_business_id  uuid DEFAULT NULL
)
RETURNS int
LANGUAGE sql AS $$
  WITH deleted AS (
    DELETE FROM public.documents
    WHERE metadata->>'source_path' = p_source_path
      AND (p_business_id IS NULL OR business_id IS NULL OR business_id = p_business_id)
    RETURNING id
  )
  SELECT count(*)::int FROM deleted;
$$;
