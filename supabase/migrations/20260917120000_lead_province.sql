-- ============================================================================
-- Provincia del lead.
--
-- Gerencia pidió un reporte de "de qué provincia vienen los leads" y al mirar
-- los datos no había con qué: de 4.220 leads, 32 tenían `city` cargada (0,8%),
-- y es texto libre que mezcla ciudades, barrios y provincias — "Nuñez",
-- "Misiones", "Villa Maria Cordoba". Sumar eso no dice nada.
--
-- Dos frentes, y hacen falta los dos:
--
--   HACIA ADELANTE  este campo, que se pregunta en los formularios y se carga
--                   en el alta manual. Es el dato bueno.
--   HACIA ATRÁS     el código de área del teléfono. 1.546 leads (37%) tienen
--                   phone_e164, y en Argentina el código identifica la
--                   provincia. Se deriva al vuelo en el reporte, no se guarda:
--                   es una inferencia, y guardarla la haría parecer un dato
--                   declarado. Ver src/lib/province.ts.
--
-- El reporte usa `province` cuando está y cae al teléfono cuando no.
-- ============================================================================

alter table public.leads
  add column if not exists province text;

-- El reporte agrupa por provincia dentro de una empresa y un rango de fechas.
create index if not exists leads_company_province_idx
  on public.leads (company_id, province)
  where province is not null;

-- Los formularios públicos existentes pasan a poder preguntar la provincia.
-- Arranca en `required: false`: activar un campo obligatorio de golpe en un
-- formulario que ya está publicado le rompería el envío a quien lo tenga
-- abierto.
update public.lead_capture_forms
set fields = jsonb_set(
  fields,
  '{province}',
  '{"label": "Provincia", "placeholder": "Buenos Aires", "required": false}'::jsonb,
  true
)
where not (fields ? 'province');

-- Y los formularios nuevos lo traen en el default.
alter table public.lead_capture_forms
  alter column fields set default '{
    "first_name":     {"label": "Nombre",                "placeholder": "Tu nombre",            "required": true},
    "last_name":      {"label": "Apellido",              "placeholder": "Tu apellido",          "required": false},
    "phone":          {"label": "Teléfono",              "placeholder": "+54 11 1234 5678",     "required": true},
    "email":          {"label": "Email",                 "placeholder": "tu@email.com",         "required": false},
    "province":       {"label": "Provincia",             "placeholder": "Buenos Aires",         "required": false},
    "city":           {"label": "Ciudad",                "placeholder": "Buenos Aires",         "required": false},
    "vehicle_model":  {"label": "Vehículo de interés",   "placeholder": "Ej: Civic Hybrid",     "required": false},
    "initial_notes":  {"label": "Notas",                 "placeholder": "Contanos más",         "required": false}
  }'::jsonb;

comment on column public.leads.province is
  'Provincia declarada. Cuando falta, el reporte la infiere del código de área de phone_e164 (src/lib/province.ts).';
