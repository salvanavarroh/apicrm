-- ============================================================================
-- La clave única de `used_price_guide` no deduplicaba las unidades 0km.
--
-- `year is null` significa 0km, y en Postgres NULL no es igual a NULL: la
-- restricción `unique (source, brand_id, model, version, year, as_of)` deja pasar
-- infinitas filas idénticas mientras `year` sea null. El sync es idempotente para
-- los usados y NO lo era para los 0km: cada corrida del mismo mes duplicaba las
-- 803 filas de 0km.
--
-- Lo detectó una corrida de prueba de una marca seguida del sync completo: 29
-- filas de más, todas con year null.
--
-- Se arregla con `nulls not distinct` (Postgres 15+), que es exactamente la
-- semántica que se quería: para esta clave, dos nulls son el mismo valor.
-- ============================================================================

-- Primero limpiar lo que ya se duplicó: se conserva la fila más reciente de cada
-- clave (la del último sync, que es la que refleja la guía actual).
delete from public.used_price_guide g
using public.used_price_guide dup
where g.year is null
  and dup.year is null
  and g.source = dup.source
  and g.brand_id = dup.brand_id
  and g.model = dup.model
  and g.version = dup.version
  and g.as_of = dup.as_of
  and (g.created_at, g.id) < (dup.created_at, dup.id);

alter table public.used_price_guide
  drop constraint used_price_guide_identity_key;

alter table public.used_price_guide
  add constraint used_price_guide_identity_key
  unique nulls not distinct (source, brand_id, model, version, year, as_of);
