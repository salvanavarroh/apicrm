-- Campos nuevos en leads para soportar cargas masivas (incl. exports tipo Meta
-- Lead Ads) y datos de negocio frecuentes. Todo aditivo y nullable.
--
-- Nota: "interesado en financiación" ya se cubre con declared_payment_method
-- ('financed') y "usado en parte de pago" con has_used_car — no se duplican.

alter table public.leads
  -- Ubicación más fina que city.
  add column if not exists province text,
  add column if not exists locality text,
  -- Datos de la persona.
  add column if not exists national_id text,        -- DNI / CUIT
  add column if not exists birth_date date,
  add column if not exists preferred_contact_time text,
  -- Origen / trazabilidad de la carga.
  add column if not exists source text,             -- origen legible (ej. "Meta Lead Ads")
  add column if not exists external_id text,         -- id del lead en la fuente (dedup/idempotencia)
  add column if not exists source_created_at timestamptz, -- fecha real del lead en la fuente
  -- Comodín para columnas que varían entre archivos (ad/adset/form ids,
  -- is_organic, retailer_item_id, y cualquier columna futura desconocida).
  add column if not exists metadata jsonb;

-- Dedup por fuente: evita reimportar el mismo lead externo dos veces.
create index if not exists leads_company_external_idx
  on public.leads (company_id, external_id)
  where external_id is not null;
