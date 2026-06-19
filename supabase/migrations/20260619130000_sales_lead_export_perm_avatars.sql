-- Tanda 2 (pedido Salvador):
--   #2  El vendedor puede crear leads (autoasignados a sí mismo).
--   #14 Permiso de descarga de base: solo admin/superadmin por default; el admin
--       puede habilitar a un gerente. Columna can_export_leads en profiles.
--   #1  Bucket de Storage 'avatars' para foto de perfil de cualquier usuario.

-- ============================================================================
-- #2 — INSERT de leads para vendedores (deben quedar asignados a sí mismos).
-- ============================================================================

create policy "leads_insert_sales"
  on public.leads for insert to authenticated
  with check (
    public.current_role() = 'sales'
    and company_id = public.current_company_id()
    and assigned_user_id = auth.uid()
  );

-- ============================================================================
-- #14 — Permiso de descarga de base.
-- ============================================================================

alter table public.profiles
  add column can_export_leads boolean not null default false;

-- ============================================================================
-- #1 — Bucket de avatares (lectura pública, escritura del propio usuario).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read"
  on storage.objects for select to public
  using (bucket_id = 'avatars');

create policy "avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
