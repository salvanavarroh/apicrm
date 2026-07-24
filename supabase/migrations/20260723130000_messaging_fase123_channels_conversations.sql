-- ============================================================================
-- Fases 1-3 — Mensajería omnicanal (Zernio): canales, conversaciones, mensajes,
-- plantillas de WhatsApp y formularios de Lead Ads.
-- Ver docs/mensajeria-zernio-arquitectura.md §3.
-- RLS: SELECT scopeado por empresa/rol; las mutaciones pasan por server actions
-- con el admin client (chequeo explícito de auth/empresa), como notifications.
-- ============================================================================

-- companies.zernio_profile_id (creado on-demand por ensureProfile()).
alter table public.companies
  add column if not exists zernio_profile_id text;
create unique index if not exists companies_zernio_profile_idx
  on public.companies (zernio_profile_id) where zernio_profile_id is not null;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.channel_platform as enum ('whatsapp', 'instagram', 'facebook');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.channel_status as enum ('connecting', 'active', 'disconnected', 'error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.conversation_status as enum ('open', 'snoozed', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_direction as enum ('inbound', 'outbound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_delivery as enum ('queued', 'sent', 'delivered', 'read', 'failed');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- messaging_channels — un canal conectado por concesionaria (WA/IG/FB).
-- ----------------------------------------------------------------------------
create table if not exists public.messaging_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  zernio_account_id text not null unique,
  platform public.channel_platform not null,
  external_ref text,
  display_name text,
  branch_id uuid references public.branches(id) on delete set null,
  product_type_id uuid references public.product_types(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  status public.channel_status not null default 'connecting',
  quality_rating text,
  messaging_limit_tier text,
  name_status text,
  health_checked_at timestamptz,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists messaging_channels_company_idx on public.messaging_channels (company_id);

create trigger messaging_channels_set_updated_at
  before update on public.messaging_channels
  for each row execute function public.set_updated_at();

alter table public.messaging_channels enable row level security;

drop policy if exists channels_select on public.messaging_channels;
create policy channels_select on public.messaging_channels
  for select to authenticated
  using (
    (select public.is_super_admin())
    or company_id = (select public.current_company_id())
  );

-- ----------------------------------------------------------------------------
-- conversations
-- ----------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel_id uuid not null references public.messaging_channels(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  zernio_conversation_id text not null unique,
  platform public.channel_platform not null,
  participant_bsuid text,
  participant_phone_e164 text,
  participant_handle text,
  participant_name text,
  zernio_contact_id text,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  status public.conversation_status not null default 'open',
  window_expires_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_message_preview text,
  unread_count int not null default 0,
  attribution jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_company_status_idx on public.conversations (company_id, status);
create index if not exists conversations_pool_idx on public.conversations (company_id) where assigned_user_id is null;
create index if not exists conversations_assigned_idx on public.conversations (assigned_user_id);
create index if not exists conversations_lead_idx on public.conversations (lead_id);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;

-- Admin/Manager/Supervisor: todas las de su empresa. Sales: las suyas o del pool.
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated
  using (
    (select public.is_super_admin())
    or (
      company_id = (select public.current_company_id())
      and (
        (select public.current_role()) = any (array['admin','manager','supervisor']::public.user_role[])
        or (
          (select public.current_role()) = 'sales'::public.user_role
          and (assigned_user_id = (select auth.uid()) or assigned_user_id is null)
        )
      )
    )
  );

-- ----------------------------------------------------------------------------
-- messages
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  zernio_message_id text unique,
  platform_message_id text,
  direction public.message_direction not null,
  sender_type text not null default 'contact',
  sent_by_user_id uuid references public.profiles(id) on delete set null,
  message_type text not null default 'text',
  body text,
  attachments jsonb not null default '[]',
  template_name text,
  reply_to_message_id uuid references public.messages(id) on delete set null,
  delivery_status public.message_delivery not null default 'queued',
  error_code text,
  error_detail text,
  platform_timestamp timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists messages_delivery_idx on public.messages (delivery_status) where delivery_status in ('queued','sent');

alter table public.messages enable row level security;

-- Visible para quien ve la conversación (delega en la RLS de conversations).
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = messages.conversation_id));

-- ----------------------------------------------------------------------------
-- whatsapp_templates — por WABA/canal, con estado de aprobación de Meta.
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel_id uuid not null references public.messaging_channels(id) on delete cascade,
  zernio_template_name text not null,
  language text not null,
  category text not null,
  is_standard boolean not null default false,
  source_message_template_id uuid references public.message_templates(id) on delete set null,
  body_preview text,
  variables jsonb not null default '[]',
  status text not null default 'PENDING',
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, zernio_template_name, language)
);
create index if not exists whatsapp_templates_company_idx on public.whatsapp_templates (company_id);

create trigger whatsapp_templates_set_updated_at
  before update on public.whatsapp_templates
  for each row execute function public.set_updated_at();

alter table public.whatsapp_templates enable row level security;

drop policy if exists wt_select on public.whatsapp_templates;
create policy wt_select on public.whatsapp_templates
  for select to authenticated
  using (
    (select public.is_super_admin())
    or company_id = (select public.current_company_id())
  );

-- ----------------------------------------------------------------------------
-- lead_ad_forms — mapeo de formularios de Meta Lead Ads a routing.
-- ----------------------------------------------------------------------------
create table if not exists public.lead_ad_forms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel_id uuid references public.messaging_channels(id) on delete set null,
  meta_form_id text not null,
  form_name text,
  branch_id uuid references public.branches(id) on delete set null,
  product_type_id uuid references public.product_types(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  field_map jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, meta_form_id)
);
create index if not exists lead_ad_forms_company_idx on public.lead_ad_forms (company_id);

create trigger lead_ad_forms_set_updated_at
  before update on public.lead_ad_forms
  for each row execute function public.set_updated_at();

alter table public.lead_ad_forms enable row level security;

drop policy if exists laf_select on public.lead_ad_forms;
create policy laf_select on public.lead_ad_forms
  for select to authenticated
  using (
    (select public.is_super_admin())
    or company_id = (select public.current_company_id())
  );
