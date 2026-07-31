-- ============================================================================
-- Inbox por sucursal (segregación RLS de conversations).
--
-- Cada canal (número) puede tener branch_id (routing por defecto). Las
-- conversaciones ahora llevan su propio branch_id (heredado del canal en el
-- inbound) y segregamos la VISIBILIDAD del inbox por sucursal, con la excepción
-- de los números "generales" (branch_id IS NULL): esos los ve/toma cualquiera de
-- cualquier sucursal (comportamiento pool actual).
--
-- Reglas:
--   admin / super_admin  → todas las de su empresa.
--   manager              → generales + las de las sucursales que gerencia.
--   supervisor           → idem, vía acting_manager_id().
--   sales                → las suyas (asignadas) + del pool (sin asignar) que
--                          sean generales o de SU sucursal.
--
-- Las escrituras de conversations van por service-role (server actions), no por
-- RLS (no hay policy de insert/update), así que solo tocamos el SELECT.
-- ============================================================================

-- 1) Columna branch_id en conversations (la conversación hereda la sucursal del
--    número por el que entró).
alter table public.conversations
  add column if not exists branch_id uuid references public.branches(id) on delete set null;

-- 2) Backfill: conversaciones existentes toman el branch de su canal (si tiene).
update public.conversations c
set branch_id = ch.branch_id
from public.messaging_channels ch
where ch.id = c.channel_id
  and c.branch_id is null
  and ch.branch_id is not null;

create index if not exists conversations_branch_idx on public.conversations (branch_id);

-- 3) SELECT segregado por sucursal (generales = branch_id null → visibles a todos).
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated
  using (
    (select public.is_super_admin())
    or (
      company_id = (select public.current_company_id())
      and (
        (select public.current_role()) = 'admin'::public.user_role
        or (
          (select public.current_role()) = 'manager'::public.user_role
          and (
            branch_id is null
            or exists (
              select 1 from public.managements m
              where m.manager_id = (select auth.uid())
                and m.branch_id = conversations.branch_id
            )
          )
        )
        or (
          (select public.current_role()) = 'supervisor'::public.user_role
          and (
            branch_id is null
            or exists (
              select 1 from public.managements m
              where m.manager_id = (select public.acting_manager_id())
                and m.branch_id = conversations.branch_id
            )
          )
        )
        or (
          (select public.current_role()) = 'sales'::public.user_role
          and (
            assigned_user_id = (select auth.uid())
            or (
              assigned_user_id is null
              and (
                branch_id is null
                or branch_id = (
                  select p.branch_id from public.profiles p
                  where p.id = (select auth.uid())
                )
              )
            )
          )
        )
      )
    )
  );
