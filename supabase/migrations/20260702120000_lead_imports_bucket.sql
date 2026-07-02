-- ============================================================================
-- Storage bucket: "lead-imports" (privado) para la carga de leads con IA.
-- El usuario sube el archivo crudo (CSV/Excel); el server lo baja, lo parsea y
-- lo mapea con IA. Path = {company_id}/{uuid}.{ext} para scopear por empresa.
-- Se borra el archivo tras un commit exitoso; igual conviene retención corta.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('lead-imports', 'lead-imports', false)
on conflict (id) do nothing;

-- Roles que importan leads: admin, manager, supervisor, data_provider. La RLS
-- de storage sólo scopea por company_id (el path arranca con el company_id);
-- el gate por rol vive en las server actions (requireRole).
create policy "lead_imports_select_same_company"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'lead-imports'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_company_id()::text
    )
  );

create policy "lead_imports_insert_same_company"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lead-imports'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

create policy "lead_imports_update_same_company"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'lead-imports'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

create policy "lead_imports_delete_same_company"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'lead-imports'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );
