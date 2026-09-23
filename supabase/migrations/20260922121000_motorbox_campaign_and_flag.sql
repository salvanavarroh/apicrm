-- ============================================================================
-- Motorbox: la campaña de atribución y el flag por empresa.
--
-- Los leads que llegan por WhatsApp desde una publicación de Motorbox se
-- cuelgan de una campaña con origen `marketplace` llamada "Motorbox", una por
-- empresa. El índice único parcial evita que dos webhooks simultáneos creen dos
-- (el insert va con `on conflict do nothing` + re-select).
--
-- Ver docs/motorbox-spec-api.md §6.4.
-- ============================================================================

create unique index if not exists campaigns_motorbox_unique
  on campaigns (company_id)
  where origin = 'marketplace' and name = 'Motorbox';

-- ---------------------------------------------------------------------------
-- Flag por empresa: ¿esta concesionaria usa Motorbox?
--
-- Sirve para no spamear a Motorbox con webhooks de las empresas que no lo usan,
-- y para diagnóstico (`motorbox_dealer_id` lo devuelve Motorbox en el alta).
-- ---------------------------------------------------------------------------
alter table companies
  add column if not exists motorbox_enabled_at timestamptz,
  add column if not exists motorbox_dealer_id  text;

comment on column companies.motorbox_enabled_at is
  'Cuándo esta concesionaria entró por primera vez a Motorbox. Null = nunca entró.';
comment on column companies.motorbox_dealer_id is
  'Id de concesionaria del lado de Motorbox (text, corto). Sólo diagnóstico: la '
  'llave de vinculación es companies.id, que viaja firmada en el ticket SSO.';
