-- ============================================================================
-- Corrección de la clave de `used_price_guide`.
--
-- La migración anterior asumía que se podía guardar el `version_id` de ACARA. No
-- se puede sin pagar caro: la tabla de precios por marca —el pedido que trae 268
-- versiones de una sola vez— devuelve NOMBRES, no ids. Los ids sólo salen del
-- endpoint de versiones, uno por modelo: para Fiat son 58 pedidos extra, y para
-- la guía completa más de 4.000 por mes, para guardar un número que no usamos.
--
-- La clave pasa a ser (marca_id, modelo, versión, año). Sigue sin ser matcheo
-- difuso: son los strings EXACTOS de la guía usados como identidad dentro de la
-- guía, que es distinto de intentar adivinar a qué versión de ACARA corresponde
-- un texto nuestro. Ese matcheo —el de nuestro catálogo contra el suyo— sigue
-- estando prohibido y se resuelve haciendo que el usuario elija de esta lista.
-- ============================================================================

alter table public.used_price_guide
  drop constraint used_price_guide_source_version_id_year_as_of_key;

alter table public.used_price_guide
  alter column model_id drop not null,
  alter column version_id drop not null;

alter table public.used_price_guide
  add constraint used_price_guide_identity_key
  unique (source, brand_id, model, version, year, as_of);

comment on column public.used_price_guide.version_id is
  'Id de versión de la fuente. Casi siempre null: la tabla por marca no lo trae '
  'y pedirlo costaría miles de requests por mes. La identidad es '
  '(brand_id, model, version).';
