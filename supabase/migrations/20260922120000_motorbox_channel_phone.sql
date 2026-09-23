-- ============================================================================
-- El teléfono de WhatsApp, promovido a columna.
--
-- Hasta hoy el número real de un canal de WhatsApp vivía anidado en
-- `messaging_channels.metadata -> 'health' ->> 'displayPhoneNumber'`, y sólo
-- aparecía ahí si alguien había corrido el health check. `external_ref` guarda
-- el username/displayName de Zernio, no el teléfono.
--
-- Motorbox necesita ese número para armar el link de WhatsApp de cada
-- publicación: si no lo tiene, el CTA no funciona y el lead nunca entra al CRM.
-- Pero esto es deuda vieja y sirve con Motorbox o sin él.
--
-- Ver docs/motorbox-spec-api.md §4.1.
-- ============================================================================

alter table messaging_channels
  add column if not exists phone_e164 text;

comment on column messaging_channels.phone_e164 is
  'Teléfono del canal en E.164 (+5491112345678). Sólo WhatsApp. Se completa al '
  'conectar el canal y en cada health check. Fuente: display_phone_number de Zernio.';

-- Backfill desde el blob de salud existente. Meta devuelve el número con
-- espacios y guiones ("+54 9 11 1234-5678"): acá sólo dejamos dígitos y el +.
-- La normalización fina a E.164 por país la hace la app con `toE164()`; esto
-- deja el dato utilizable y sin ruido.
update messaging_channels
set phone_e164 = '+' || regexp_replace(
      metadata -> 'health' ->> 'displayPhoneNumber', '[^0-9]', '', 'g')
where platform = 'whatsapp'
  and phone_e164 is null
  and coalesce(metadata -> 'health' ->> 'displayPhoneNumber', '') <> ''
  and regexp_replace(
      metadata -> 'health' ->> 'displayPhoneNumber', '[^0-9]', '', 'g') <> '';

create index if not exists messaging_channels_phone_e164_idx
  on messaging_channels (phone_e164)
  where phone_e164 is not null;
