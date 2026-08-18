-- ============================================================================
-- Bot de respuesta automática del inbox — Fase 0: configuración.
--
-- Esta migración NO habilita ninguna respuesta automática. Sólo crea las tablas
-- de configuración y el catálogo de preguntas frecuentes, para que se pueda
-- cargar y revisar antes de que el bot le escriba a un cliente.
--
-- Dos defaults deliberados:
--   · `enabled = false`  → encenderlo es una decisión explícita por sucursal.
--   · `mode = 'draft'`   → el bot SUGIERE y el asesor manda. Nadie recibe una
--                          respuesta automática hasta pasar a 'auto'.
--
-- Ver docs/bot-inbox-respuesta-automatica.md para el diseño completo.
-- ============================================================================

create type public.bot_mode as enum (
  'draft',  -- sugiere la respuesta, el humano la manda
  'auto'    -- responde solo
);

-- ----------------------------------------------------------------------------
-- Configuración por sucursal
-- ----------------------------------------------------------------------------
create table public.bot_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,

  enabled boolean not null default false,
  mode public.bot_mode not null default 'draft',

  -- CUÁNDO interviene. Todo configurable: una concesionaria con guardia
  -- nocturna y otra que cierra a las 18 no necesitan la misma política, y no
  -- queremos un deploy para cambiarla.
  outside_hours boolean not null default true,
  when_nobody_active boolean not null default true,
  -- En horario y con asesores activos: responder si nadie contestó en N minutos.
  -- null = nunca. Resuelve que "activo" no es lo mismo que "disponible".
  idle_trigger_minutes int check (idle_trigger_minutes between 1 and 120),

  -- Tope de respuestas automáticas por conversación. El motivo #1 de bloqueo en
  -- WhatsApp es un bot que no te deja hablar con una persona.
  max_turns int not null default 3 check (max_turns between 1 and 10),

  -- Cómo se presenta. Si es null usa el nombre de la concesionaria.
  greeting_name text,
  -- Si además de responder, pregunta modelo / usado / forma de pago.
  qualify boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (branch_id)
);

create trigger bot_configs_set_updated_at
  before update on public.bot_configs
  for each row execute function public.set_updated_at();

create index bot_configs_company_idx on public.bot_configs (company_id);

-- ----------------------------------------------------------------------------
-- Catálogo de intenciones: la pregunta y LA RESPUESTA QUE ESCRIBIÓ EL HUMANO.
--
-- El bot nunca redacta. La IA sólo elige cuál de estas filas corresponde.
-- ----------------------------------------------------------------------------
create table public.bot_intents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- null = vale para todas las sucursales de la empresa.
  branch_id uuid references public.branches(id) on delete cascade,

  -- Clave estable de la intención ('horarios', 'ubicacion', …). Es lo que
  -- devuelve el clasificador.
  slug text not null,
  label text not null,
  -- Palabras clave para el match por reglas, antes de recurrir al LLM.
  keywords text[] not null default '{}',
  -- Respuesta literal. Admite {nombre}, {sucursal}, {horario}.
  reply text not null check (length(trim(reply)) > 0),

  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, branch_id, slug)
);

create trigger bot_intents_set_updated_at
  before update on public.bot_intents
  for each row execute function public.set_updated_at();

create index bot_intents_lookup_idx
  on public.bot_intents (company_id, branch_id, enabled);

-- ----------------------------------------------------------------------------
-- Estado y log por conversación. Sin esto no hay tope de turnos ni auditoría de
-- "por qué el bot dijo eso", que es la pregunta que va a hacer el gerente.
-- ----------------------------------------------------------------------------
create table public.bot_conversation_state (
  conversation_id uuid primary key
    references public.conversations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  turns_used int not null default 0,
  -- Una vez que contesta un humano, el bot se apaga para siempre en esta
  -- conversación.
  human_replied boolean not null default false,
  handoff_requested boolean not null default false,
  last_bot_reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger bot_conversation_state_set_updated_at
  before update on public.bot_conversation_state
  for each row execute function public.set_updated_at();

create table public.bot_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  inbound_text text,
  -- Qué intención se detectó y con qué método: 'keyword' | 'llm' | 'blacklist'.
  intent_slug text,
  matched_by text,
  reply_sent text,
  -- En modo draft queda como sugerencia sin enviar.
  was_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index bot_messages_company_idx
  on public.bot_messages (company_id, created_at desc);
-- Para la pantalla de "preguntas sin respuesta": lo que cayó en desconocida.
create index bot_messages_unknown_idx
  on public.bot_messages (company_id, created_at desc)
  where intent_slug is null;

-- ----------------------------------------------------------------------------
-- RLS: configuración y catálogo son de la empresa; el log también.
-- Escritura sólo admin (es configuración comercial, no operación diaria).
-- ----------------------------------------------------------------------------
alter table public.bot_configs enable row level security;
alter table public.bot_intents enable row level security;
alter table public.bot_conversation_state enable row level security;
alter table public.bot_messages enable row level security;

create policy "bot_configs_select" on public.bot_configs
  for select to authenticated
  using (company_id = (select public.current_company_id()));
create policy "bot_configs_write" on public.bot_configs
  for all to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.current_role()) = 'admin'
  )
  with check (
    company_id = (select public.current_company_id())
    and (select public.current_role()) = 'admin'
  );

create policy "bot_intents_select" on public.bot_intents
  for select to authenticated
  using (company_id = (select public.current_company_id()));
create policy "bot_intents_write" on public.bot_intents
  for all to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.current_role()) = 'admin'
  )
  with check (
    company_id = (select public.current_company_id())
    and (select public.current_role()) = 'admin'
  );

create policy "bot_state_select" on public.bot_conversation_state
  for select to authenticated
  using (company_id = (select public.current_company_id()));

create policy "bot_messages_select" on public.bot_messages
  for select to authenticated
  using (company_id = (select public.current_company_id()));

comment on table public.bot_configs is
  'Config del bot del inbox por sucursal. Arranca apagado y en modo borrador: '
  'encenderlo es una decisión explícita.';
comment on table public.bot_intents is
  'Preguntas frecuentes y su respuesta LITERAL escrita por el admin. El bot no '
  'redacta: la IA sólo elige cuál de estas filas corresponde.';
comment on column public.bot_configs.idle_trigger_minutes is
  'En horario y con asesores activos, responder si nadie contestó en N minutos. '
  'null = nunca. Cubre el caso de asesor activo pero saturado.';
