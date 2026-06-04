-- Sprint 9b — Tracking de origen del lead + actividad tipada en notas.

-- ============================================================================
-- leads: columnas de tracking
-- Capturadas en /api/forms/[slug]/submit desde el browser del visitante.
-- ============================================================================

alter table public.leads
  add column utm_source text,
  add column utm_medium text,
  add column utm_campaign text,
  add column utm_term text,
  add column utm_content text,
  add column landing_url text,
  add column referrer text;

-- Índice para reportes/atribución por campaña.
create index leads_utm_campaign_idx on public.leads (utm_campaign);
create index leads_utm_source_idx on public.leads (utm_source);

-- ============================================================================
-- lead_notes: actividad tipada (opcional — nota suelta sigue siendo válida)
-- ============================================================================

create type public.note_activity as enum (
  'email_sent',    -- Email enviado
  'phone_call',    -- Llamada
  'whatsapp',      -- WhatsApp
  'meeting_held',  -- Reunión realizada
  'quote_sent',    -- Presupuesto enviado
  'other'          -- Otro
);

alter table public.lead_notes
  add column activity_type public.note_activity;
