-- Origen de campaña "Otros" con texto libre. Cuando origin = 'other', se guarda
-- el detalle escrito por el usuario en origin_other (reutilizable + filtrable
-- desde la UI a partir de los valores distintos ya cargados).

alter table public.campaigns
  add column if not exists origin_other text;
