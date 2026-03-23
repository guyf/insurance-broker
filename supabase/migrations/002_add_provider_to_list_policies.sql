-- Add provider and underwriter fields to list_policies() return type
create or replace function public.list_policies()
returns table (policy_type text, property text, filename text, source_path text, provider text, underwriter text)
language sql as $$
  select distinct
    metadata->>'policy_type', metadata->>'property',
    metadata->>'filename',    metadata->>'source_path',
    metadata->>'provider',    metadata->>'underwriter'
  from public.documents order by 1, 2, 3; $$;
