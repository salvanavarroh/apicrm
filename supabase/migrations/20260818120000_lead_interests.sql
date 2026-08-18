-- ============================================================================
-- Intereses personales del lead.
--
-- Datos que el vendedor usa para romper el hielo: de qué cuadro es, cuándo
-- cumple años, cómo se llama la hija, a qué hora NO llamarlo.
--
-- Por qué una tabla y no columnas en `leads`:
--   - Consultable: "leads de Boca en Centro" es un where, no un like sobre notas.
--   - Extensible: sumar un tipo es un valor del enum, no una migración de tabla.
--   - Auditable: queda quién cargó cada dato y cuándo.
--
-- Privacidad (Ley 25.326): el enum es CERRADO a propósito. No incluye religión,
-- salud, ideología política, orientación sexual ni afiliación sindical, y no hay
-- campo libre sin etiquetar donde alguien pueda cargarlas. `detail` es contexto
-- del dato, no un cajón de sastre.
--
-- El cumpleaños se guarda como día + mes SIN año: alcanza para el saludo y evita
-- almacenar la edad, que no necesitamos.
-- ============================================================================

create type public.interest_kind as enum (
  'cuadro',           -- club de fútbol
  'cumpleanos',       -- día + mes
  'familia',          -- "Sofía (hija)"
  'hobby',
  'mascota',
  'profesion',
  'vehiculo_actual',  -- qué maneja hoy
  'no_molestar',      -- "no llamar antes de las 10"
  'otro'
);

create table public.lead_interests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,

  kind public.interest_kind not null,
  value text not null check (length(trim(value)) > 0),
  detail text,

  -- Sólo para kind = 'cumpleanos'.
  day int check (day between 1 and 31),
  month int check (month between 1 and 12),

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  -- Un mismo dato no se carga dos veces (case-insensitive vía índice de abajo).
  constraint lead_interests_birthday_complete check (
    kind <> 'cumpleanos' or (day is not null and month is not null)
  )
);

create index lead_interests_lead_idx on public.lead_interests (lead_id);
create index lead_interests_company_kind_idx
  on public.lead_interests (company_id, kind);
-- Para el recordatorio de cumpleaños del mes.
create index lead_interests_birthday_idx
  on public.lead_interests (company_id, month, day)
  where kind = 'cumpleanos';
-- Dedup case-insensitive del mismo dato en el mismo lead.
create unique index lead_interests_unique_idx
  on public.lead_interests (lead_id, kind, lower(trim(value)));

alter table public.lead_interests enable row level security;

-- ----------------------------------------------------------------------------
-- RLS: scoped por visibilidad del lead, igual que lead_notes / lead_tasks /
-- visits. La policy de `leads` ya acota por rol (admin y gerente ven su
-- empresa/gerencia, el vendedor sus asignados), así que apoyarse en un exists
-- sobre leads hereda ese alcance sin duplicar la lógica.
-- ----------------------------------------------------------------------------

create policy "lead_interests_select_by_lead"
  on public.lead_interests for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));

create policy "lead_interests_insert_by_lead"
  on public.lead_interests for insert to authenticated
  with check (
    company_id = (select public.current_company_id())
    and exists (select 1 from public.leads l where l.id = lead_id)
  );

create policy "lead_interests_update_by_lead"
  on public.lead_interests for update to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id))
  with check (exists (select 1 from public.leads l where l.id = lead_id));

create policy "lead_interests_delete_by_lead"
  on public.lead_interests for delete to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));

comment on table public.lead_interests is
  'Datos personales del lead para humanizar la atención. Enum cerrado por '
  'privacidad: no admite categorías sensibles (Ley 25.326).';
comment on column public.lead_interests.day is
  'Día del cumpleaños. Sin año: no guardamos la edad.';
