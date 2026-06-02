-- Incremento atómico del contador de submissions de un form público.
create or replace function public.increment_form_submissions(p_form_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.lead_capture_forms
  set submissions_count = submissions_count + 1
  where id = p_form_id;
$$;

grant execute on function public.increment_form_submissions(uuid) to anon, authenticated;
