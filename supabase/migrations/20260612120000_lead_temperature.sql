-- Scoring manual del lead — "temperatura" asignada por el vendedor.
-- Es una señal subjetiva distinta del semáforo de gestión (ese es automático
-- por días sin movimiento). Acá el vendedor marca qué tan caliente está la
-- oportunidad: caliente / tibio / frío. NULL = sin clasificar (default).

create type public.lead_temperature as enum (
  'hot',    -- Caliente: alta intención de compra
  'warm',   -- Tibio: interés moderado
  'cold'    -- Frío: baja prioridad
);

alter table public.leads
  add column temperature public.lead_temperature,
  add column temperature_set_at timestamptz;

-- Índice para filtrar/contar por temperatura en tablas y dashboards.
create index leads_temperature_idx on public.leads (temperature)
  where temperature is not null;
