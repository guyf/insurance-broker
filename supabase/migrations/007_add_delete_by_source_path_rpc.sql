-- RPC to safely delete all document chunks for a given source_path.
-- Used by ingest.py --prune to remove orphaned records.

CREATE OR REPLACE FUNCTION public.delete_documents_by_source_path(p_source_path text)
RETURNS int
LANGUAGE sql AS $$
  WITH deleted AS (
    DELETE FROM public.documents
    WHERE metadata->>'source_path' = p_source_path
    RETURNING id
  )
  SELECT count(*)::int FROM deleted;
$$;
