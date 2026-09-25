# Integración con ACARA — guía de precios de vehículos

Cómo el CRM trae la base de marcas, modelos, versiones y valores de la Guía
Oficial de Precios de ACARA, cómo está armada, y qué hay que saber para
portarla a otro proyecto.

Contrato verificado en vivo contra la API el **25/09/2026**.

---

## 1. Antes que el código: la autorización

El uso está **autorizado por ACARA** y esa autorización la gestionó el cliente,
que es socio de la entidad. No es una API pública con términos abiertos.

**Si esto se lleva a otro repositorio o a otro cliente, la autorización no
viaja con el código.** Quien lo implemente tiene que tener su propio permiso.
Es lo primero a resolver, antes de escribir una línea.

De ahí también el diseño: un pedido por marca en vez de uno por versión, pausa
deliberada entre pedidos, y `User-Agent` identificando la integración. Es una
fuente de otro, y el código lo trata como tal.

---

## 2. Qué provee ACARA

La guía la releva mensualmente la **Comisión de Valuación de Vehículos Usados**
de ACARA, integrada por concesionarios reales. No son precios de publicación
como los de un portal: es el consenso de quienes compran y venden. Los valores
rigen para Capital y GBA.

Por cada versión de cada modelo, la guía trae el valor **0 km** y el valor de
cada año usado.

---

## 3. El contrato de la API

Base: `https://api.acara.org.ar/api/v1`

| Endpoint | Devuelve |
|---|---|
| `GET /prices/brands-by-vehicule-type?vehiculeType=1` | JSON `[{id, name}]` — las marcas |
| `GET /prices/model-list?vehiculeType=1&vehiculeBrandId=` | JSON `[{id, name}]` — modelos de una marca |
| `GET /prices/version-list?…&vehiculeModelId=` | JSON `[{id, name}]` — versiones de un modelo |
| `GET /prices/get-vehicules?vehiculeType=1&vehiculeBrandId=` | **HTML** — tabla con todas las versiones y precios de la marca |

`vehiculeType`: **1 = autos**, 2 motos, 3 camiones, 4 maquinaria agrícola. El
CRM sólo usa autos.

**Sin el header `Accept: application/json` la API responde con un redirect a la
home en vez de JSON.** Es el primer tropiezo de cualquiera que la pruebe con
curl a secas.

### El truco que hace viable el sync

`get-vehicules` acepta **sólo la marca** y devuelve todas sus versiones y todos
sus años en una tabla. FIAT son 1.007 valores en un único pedido.

Eso convierte la guía entera en **~143 pedidos por mes** en vez de decenas de
miles (uno por versión). Es la decisión que hace que la integración sea
respetuosa con el servidor ajeno y que además termine en minutos.

Medición del 25/09/2026: 143 marcas; FIAT devuelve 1.007 valores.

---

## 4. Las tres trampas del parseo

La tabla viene en HTML. Tres cosas que, mal leídas, no dan un número raro: dan
un número **catastróficamente** equivocado.

**1. La moneda viene POR FILA.** Hay vehículos cotizados en dólares y otros en
pesos, en la misma tabla. Confundirlos no da un valor extraño, da uno mil veces
equivocado. Se parsea `$` → ARS y `u$s`/`us$`/`u$d` → USD; cualquier otra cosa
se descarta y se cuenta como anomalía.

**2. Las columnas de año NO son fijas.** Hay que leer el `<thead>` de cada
respuesta, no asumir un rango. El orden es
`Modelo | Version | Moneda | 0km | <año> | <año> | …`, y las columnas de año
cambian con el tiempo.

**3. El formato del valor.** Hoy la API devuelve enteros limpios en pesos
(`34010000`). El sitio viejo en PHP devolvía `34.010,0` **en miles**, que es
una trampa distinta. El parser acepta **sólo dígitos sin separadores** y
descarta todo lo demás: si el formato cambia, tiene que fallar en vez de
adivinar, porque un factor 1000 en una cotización lo paga el concesionario.

### El canario

El sync cuenta las celdas que no pudo interpretar. Si superan el **5%** del
total, avisa: es la señal de que ACARA cambió el formato. Es preferible
enterarse en el log que descubrirlo cotizando.

En la corrida del 25/09/2026, FIAT dio **0 celdas ignoradas**.

---

## 5. El esquema

```sql
used_price_guide (
  source        text    -- 'acara'
  vehicle_type  smallint-- 1 = autos
  brand_id      int     -- id de ACARA
  brand         text
  model_id      int     -- casi siempre NULL (ver abajo)
  model         text
  version_id    int     -- casi siempre NULL (ver abajo)
  version       text
  year          smallint-- NULL = 0km
  currency      char(3) -- 'ARS' | 'USD'
  value         numeric(14,2)
  as_of         date    -- mes de la guía
)
unique (source, brand_id, model, version, year, as_of) nulls not distinct
```

### Por qué la clave NO es el `version_id`

El primer diseño la usaba. No se puede sin pagar caro: **la tabla por marca
devuelve nombres, no ids.** Los ids sólo salen del endpoint de versiones, uno
por modelo — para FIAT son 58 pedidos extra, y para la guía completa más de
4.000 por mes, para guardar un número que no usamos.

La identidad es `(brand_id, modelo, versión, año)` con los **strings exactos de
la guía**. Ojo con la distinción: usar los strings de ACARA como identidad
*dentro* de la guía es una cosa; intentar adivinar a qué versión de ACARA
corresponde un texto nuestro es otra, y está prohibida (ver §8).

### `nulls not distinct` no es un detalle

`year IS NULL` significa 0 km. En Postgres `NULL != NULL`, así que la
restricción única dejaba pasar infinitas filas idénticas mientras el año fuera
null: el sync era idempotente para los usados y **no lo era para los 0 km**.
Cada corrida del mismo mes duplicaba las 803 filas de 0 km.

Se arregla con `nulls not distinct` (Postgres 15+). Si el destino corre una
versión anterior, hay que resolverlo de otra forma — por ejemplo guardando el
0 km como año `0` en vez de null.

### Cada mes se agrega, no se pisa

Cada sincronización escribe su propio `as_of` y conserva los meses anteriores.
Sirve para dos cosas concretas: reproducir una cotización vieja tal como se hizo
("¿por qué le ofrecimos eso en agosto?") y ver la evolución de un modelo mes a
mes.

### Es data de referencia, no de un tenant

Una sola copia para todas las concesionarias. No tiene `company_id`. Lectura
para cualquier usuario autenticado, escritura sólo `service_role`.

### Tabla de auditoría

`used_price_syncs` guarda una fila por corrida: `as_of`, marcas OK, marcas
fallidas, filas escritas, duración y error. Es lo que permite responder "¿hace
cuánto que no se actualiza?" sin adivinar.

---

## 6. Cómo corre el sync — y cada cuánto

Hay **dos disparadores para el mismo trabajo**:

| | |
|---|---|
| `pnpm sync:acara` | `scripts/sync-acara-prices.ts`. Acepta `--brand FIAT` y `--dry-run` |
| `GET /api/cron/sync-acara` | Route handler, autenticado con `Authorization: Bearer $CRON_SECRET` |

Ambos hacen lo mismo: listar marcas → un pedido por marca → parsear → upsert en
tandas de 500 → registrar la corrida. Pausa de **1,2 s entre marcas**. La guía
completa tarda unos **3 minutos** (187 s medidos).

### La respuesta honesta a "¿cada cuánto se actualiza?"

**Por diseño, una vez por mes.** ACARA releva mensualmente, así que sincronizar
más seguido no aporta nada.

**En la práctica, no se está actualizando.** El historial de
`used_price_syncs` dice:

```
2026-08-21   as_of=2026-08-21   142 marcas OK   14.815 filas   187s
```

Esa es la única corrida completa. **Hoy es 25/09/2026: la guía tiene 35 días y
nunca se corrió un segundo mes.**

El motivo está documentado en el código: `/api/cron/sync-acara` **no está
declarado en `vercel.json`** porque el plan Hobby admitía 2 crons y ya estaban
usados (pagos y planillas), y declarar un tercero hacía fallar el deploy
completo.

**Ese motivo ya no aplica.** Hoy `vercel.json` tiene tres crons declarados
(pagos, planillas y la limpieza de presencia) y el deploy pasa. Agregar el
cuarto para ACARA debería funcionar:

```json
{ "path": "/api/cron/sync-acara", "schedule": "0 6 1 * *" }
```

(El día 1 de cada mes a las 6 UTC.) Vale probarlo en un deploy antes de darlo
por hecho — el modo de fallo es que se rompe el deploy entero, no sólo el cron.

---

## 7. Cómo se consume

**El cotizador nunca llama a ACARA.** Lee de `used_price_guide`. Dos razones:
cotizar es instantáneo, y el CRM sigue cotizando si ACARA se cae.

Las listas de opciones (marca → modelo → versión → año) salen de **funciones
SQL**, no de un `select` con `DISTINCT` en el cliente:

```
guide_latest_as_of()  guide_brands()  guide_models(p_brand)  …
```

El motivo es concreto y cuesta encontrarlo: la guía tiene ~15.000 filas,
**PostgREST corta en 1.000**, y el `DISTINCT` del lado del cliente devolvía **3
marcas de 72**. Falla en silencio y con datos que parecen plausibles. Si el
proyecto destino usa PostgREST/Supabase, va a tropezar con lo mismo.

Toda consulta se resuelve contra la guía **más reciente**, pero devolviendo su
`as_of` para que la cotización lo guarde. Sin eso, una cotización de hace dos
meses no se puede reproducir.

---

## 8. Lo que NO hay que hacer

**No matchear el catálogo propio contra el de ACARA por texto.** Comparar
"208 Feline" contra "1.6 Feline Tiptronic" es la forma garantizada de cotizar
mal algunos casos y no enterarse nunca.

La solución es de producto, no de algoritmo: **el usuario elige de la lista de
ACARA**. Marca → modelo → versión → año, cada paso alimentado por la guía.

---

## 9. Para portarlo a otro repositorio

Lo que hay que llevarse:

| Archivo | Qué es |
|---|---|
| `src/lib/used-prices/acara.ts` | Cliente y parser. **El corazón**: los 4 endpoints y las tres trampas |
| `scripts/sync-acara-prices.ts` | El sync manual, con `--brand` y `--dry-run` |
| `src/app/api/cron/sync-acara/route.ts` | El mismo sync como endpoint |
| `src/lib/used-prices/lookup.ts` | Consulta de la guía |
| `supabase/migrations/20260821120000_used_price_guide.sql` | Tabla + auditoría |
| `supabase/migrations/20260821121000_used_price_guide_key.sql` | La corrección de la clave |
| `supabase/migrations/20260821122000_used_price_guide_null_year.sql` | `nulls not distinct` |
| `supabase/migrations/20260821140000_guide_option_functions.sql` | Las funciones de opciones |

Si sólo querés **la base de modelos** y no los precios, alcanza con
`listBrands()` + `listModels()`: son JSON limpio y no tienen ninguna de las
trampas del parseo. La tabla HTML sólo hace falta para los valores.

### Checklist

1. Conseguir la autorización de ACARA (§1).
2. Confirmar que el destino corre **Postgres 15+** por `nulls not distinct`.
3. Correr `--dry-run` con una marca antes del sync completo.
4. Mirar el contador de celdas ignoradas: si supera el 5%, el formato cambió.
5. Dejar el sync agendado una vez por mes, y **algo que avise si no corre**.

Ese último punto es el que falló acá: la integración funciona, y aun así la
guía lleva 35 días sin actualizarse porque nadie se enteró de que el cron no
estaba agendado.
