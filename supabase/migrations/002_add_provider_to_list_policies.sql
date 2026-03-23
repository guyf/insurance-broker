-- Add provider field to list_policies() return type
create or replace function public.list_policies()
returns table (policy_type text, property text, filename text, source_path text, provider text)
language sql as $$
  select distinct
    metadata->>'policy_type', metadata->>'property',
    metadata->>'filename',    metadata->>'source_path',
    metadata->>'provider'
  from public.documents order by 1, 2, 3; $$;
