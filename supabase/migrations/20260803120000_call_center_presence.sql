-- ============================================================================
-- Call center: presencia de vendedores ("Activo") + asignación round-robin.
--
-- Por defecto un vendedor NO recibe conversaciones. Si se marca "Activo"
-- (inbox_available), entra al reparto: cuando llega una conversación nueva, se
-- asigna round-robin (menor carga) entre los vendedores activos de la sucursal
-- de esa conversación (o de cualquiera si es "general" = branch_id null). Si no
-- hay activos, cae al pool (modelo de "tomar" actual).
--
-- La presencia se auto-apaga por inactividad: un heartbeat refresca
-- inbox_available_at; si está viejo (>15 min) el vendedor cuenta como inactivo.
-- ============================================================================

alter table public.profiles
  add column if not exists inbox_available boolean not null default false;
alter table public.profiles
  add column if not exists inbox_available_at timestamptz;

-- Índice parcial: buscar vendedores activos es barato.
create index if not exists profiles_inbox_available_idx
  on public.profiles (company_id, branch_id)
  where inbox_available = true;

-- Asigna una conversación a un vendedor activo por round-robin (menor carga).
-- Devuelve el vendedor asignado, o null si no hay activos (→ queda en el pool).
create or replace function public.assign_conversation_to_active_vendor(
  p_conversation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
  v_assignee uuid;
  v_stale timestamptz := now() - interval '15 minutes';
begin
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found or v_conv.assigned_user_id is not null then
    return null;
  end if;

  -- Vendedor activo (presencia fresca) de la sucursal de la conversación, o de
  -- cualquier sucursal si la conversación es general (branch_id null). Round-
  -- robin por menor carga de conversaciones abiertas + azar en empate.
  select p.id into v_assignee
  from public.profiles p
  where p.company_id = v_conv.company_id
    and p.role = 'sales'::public.user_role
    and p.status = 'active'
    and p.inbox_available = true
    and p.inbox_available_at is not null
    and p.inbox_available_at > v_stale
    and (v_conv.branch_id is null or p.branch_id = v_conv.branch_id)
  order by (
    select count(*) from public.conversations c2
    where c2.assigned_user_id = p.id
      and c2.status <> 'closed'::public.conversation_status
  ) asc, random()
  limit 1;

  if v_assignee is null then
    return null;
  end if;

  update public.conversations
  set assigned_user_id = v_assignee,
      claimed_at = now()
  where id = p_conversation_id
    and assigned_user_id is null;

  return v_assignee;
end;
$$;

grant execute on function public.assign_conversation_to_active_vendor(uuid)
  to authenticated, service_role;
