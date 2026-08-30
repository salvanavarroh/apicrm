# Atribución de anuncios en conversaciones

Qué dato de anuncio llega cuando alguien nos escribe después de hacer clic en
una publicidad, dónde vive, qué guardamos y qué haría falta para devolverle esas
conversiones a Meta.

Verificado contra producción y contra el OpenAPI de Zernio el **30/08/2026**.

## El estado hoy: no llega nada, pero no porque falte soporte

Al 30/08/2026, de las **74 conversaciones** de todas las concesionarias
(26 WhatsApp, 37 Facebook, 11 Instagram), **ninguna** tiene atribución. Tampoco
aparece en los **796 eventos crudos** guardados en `webhook_events` desde el
28/07: ni una mención de `referral`, `ctwa`, `source_id` ni `ad_id`.

La primera lectura fue "Zernio no lo manda". Es incorrecta. El OpenAPI de Zernio
(`https://zernio.com/openapi.json`, 417 endpoints) documenta la familia completa
de claves de atribución. Y el spec aclara el criterio:

> Cada clave es opcional y sólo se devuelven las que Meta suministró.

O sea: que no venga el objeto significa que **ninguna conversación nació de un
clic en un anuncio**, no que el dato no exista. Es un resultado esperable —
hasta ahora el tráfico pago entra por formularios de Lead Ads, que es otro
camino y sí funciona (1.314 leads con `adId`).

**Todavía no está comprobado de punta a punta.** La única forma de confirmarlo
es hacer un clic real en un anuncio Click-to-WhatsApp y ver si aparece.

## Las dos familias de claves

Meta manda la atribución con nombres distintos según por dónde entró la persona.
**Nunca aparecen juntas.**

| | Click-to-WhatsApp | Instagram Click-to-Direct / Messenger |
|---|---|---|
| Prefijo | `ctwa_*` | `meta_ad_*` |
| **ID del anuncio** | `ctwa_source_id` | `meta_ad_id` |
| Llave de conversión | `ctwa_clid` | — |
| Resto | `ctwa_source_type`, `ctwa_source_url`, `ctwa_headline`, `ctwa_captured_at` | `meta_ad_ref`, `meta_ad_source`, `meta_ad_type`, `meta_ad_title`, `meta_ad_post_id`, `meta_ad_product_id`, `meta_ad_flow_id`, `meta_ad_photo_url`, `meta_ad_video_url`, `meta_ad_captured_at` |

Tres reglas que conviene tener presentes:

- **Se captura una sola vez**, en el primer mensaje entrante después del clic, y
  no se sobrescribe nunca. Si la misma persona más tarde hace clic en otro
  anuncio, se conservan los valores originales. Meta manda el referral sólo en
  ese primer mensaje.
- **Meta no manda campaña ni conjunto de anuncios.** Sólo el ID del anuncio. Para
  reportar por campaña hay que resolverlo aparte (ver más abajo).
- **Pueden aparecer claves nuevas.** El spec pide tratar como string opaco
  cualquier clave desconocida. Esto es la razón principal para guardar el objeto
  entero y no una selección.

## Dónde vive cada cosa

El webhook **manda todo**. No hay nada que Zernio se guarde: `message.received`
trae el referral de Meta reenviado verbatim en `metadata.referral`, con las 16
claves, **en el primer mensaje entrante después del clic**. En los siguientes
mensajes de esa misma conversación ya no viene.

Estas son las claves del webhook, y cuáles se llenan según por dónde entró:

| Clave en `metadata.referral` | WhatsApp (CTWA) | Instagram / Messenger |
|---|:--:|:--:|
| `ctwa_clid` — el click id, llave para devolver conversiones | ✅ | — |
| `source_id` — **el ID del anuncio** | ✅ | — |
| `ad_id` — el ID del anuncio | — | ✅ |
| `source_type` | ✅ | — |
| `source_url` — a dónde apuntaba el anuncio | ✅ | — |
| `headline` — el título que leyó el cliente | ✅ | — |
| `body` — el texto del anuncio | ✅ | — |
| `media_type`, `image_url`, `video_url`, `thumbnail_url` — la creatividad | ✅ | — |
| `ref`, `source`, `type`, `referer_uri`, `ads_context_data` | — | ✅ |

Un detalle que confunde: **el mismo valor tiene dos nombres** según de dónde lo
saques. El ID del anuncio de WhatsApp es `source_id` en el webhook y
`ctwa_source_id` en el registro guardado de la conversación. Zernio mantiene las
dos ortografías a propósito para no romper integraciones existentes.

El registro guardado sirve como **repesca**, no como fuente primaria:

| Fuente | Cuándo usarla |
|---|---|
| Webhook `message.received` → `metadata.referral` | **La fuente.** Llega sola, en el momento |
| `GET /v1/inbox/conversations` → `data[].metadata` | Repesca. Es el único que devuelve los `ctwa_*` |
| `GET /v1/inbox/conversations/{id}` | Sólo `meta_ad_*`. No sirve para WhatsApp |
| Webhook `referral.received` | Un clic que abre un hilo existente **sin mandar mensaje**. Sólo Instagram y Messenger |

Dos límites que conviene anotar: la ventana de atribución de CTWA es de **7 días
desde el clic**, y Meta no manda campaña ni conjunto de anuncios en ningún caso.

## Qué guardamos hoy: 2 de 16

`conversations.attribution` (jsonb) se llena en
`src/lib/messaging/handlers.ts` con `extractAttribution()`:

```ts
function extractAttribution(message: Json): Json {
  const md = (message.metadata as Json) ?? {};
  const referral = (md.referral as Json) ?? (message.referral as Json) ?? {};
  const out: Json = {};
  const clid = str(md.ctwa_clid) ?? str(referral.ctwa_clid);
  if (clid) out.ctwa_clid = clid;
  const adId = str(referral.source_id) ?? str(referral.ad_id);
  if (adId) out.ad_id = adId;
  return out;                       // ← todo lo demás se descarta
}
```

Lee el lugar correcto y elige bien las dos claves más importantes. El problema es
que **descarta las otras catorce**, y esas no se pueden recuperar después:

- `source_url`, `headline`, `body`, `media_type`, `image_url`, `video_url`,
  `thumbnail_url` — **la creatividad completa**: qué anuncio vio el cliente antes
  de escribirnos. Es lo que le sirve al vendedor para arrancar la conversación
  sabiendo de qué le están hablando, y a marketing para saber qué creatividad
  trae gente que compra y no sólo gente que escribe.
- `source_type`, `ref`, `source`, `type`, `referer_uri`, `ads_context_data` — el
  contexto del clic en Instagram y Messenger.

El `ad_id` además se copia a `leads.metadata.adId` al crear el lead, que es lo
que hoy habilita el reporte por anuncio.

## Qué hay que guardar desde ahora

El objetivo es tener, el día que queramos alimentar a Meta, el historial completo
de qué anuncio trajo cada conversación. Eso no se puede reconstruir después: si
no lo guardamos cuando entra, se pierde.

**1. Guardar el objeto entero, verbatim.** No una selección de claves. Si Meta
agrega un campo mañana, lo queremos igual aunque no sepamos qué es.

**2. Normalizar en paralelo, sin pisar el original.** Conviene una forma
canónica para poder consultar sin pelearse con las dos ortografías:

```
attribution = {
  raw:        { ...todo lo que vino, tal cual },
  source:     "ctwa" | "meta_ad",
  ad_id:      ctwa_source_id | meta_ad_id,
  click_id:   ctwa_clid | null,          // la llave para devolver conversiones
  headline:   ctwa_headline | meta_ad_title,
  source_url: ctwa_source_url | null,
  captured_at: ctwa_captured_at | meta_ad_captured_at,
}
```

**3. Por qué cada campo importa**, más allá del ID:

- `click_id` (`ctwa_clid`) — **es la llave de la conversión**. Sin esto no se le
  puede decir a Meta que ese chat terminó en venta.
- `source_url` y `headline` — qué anuncio vio el cliente. Le sirve al vendedor
  antes de contestar, y a marketing para saber qué creatividad trae gente que
  compra.
- `captured_at` — fecha del clic, que no es la misma que la del primer mensaje.
- `raw` — seguro contra cambios del lado de Meta.

**4. Copiar `ad_id` y `click_id` al lead**, no sólo a la conversación. El lead es
lo que sobrevive: una persona puede tener varias conversaciones y la venta cuelga
del lead.

## El circuito de vuelta a Meta

Esto **no está implementado** y no es urgente, pero define qué guardar hoy.
Zernio ya lo tiene resuelto y es más simple de lo esperado.

**Paso 1 — Provisionar el dataset (una vez por cuenta de WhatsApp).**

```
POST /v1/whatsapp/dataset
```

Crea (o recupera) el dataset de Meta contra el que se reportan los eventos de
Click-to-WhatsApp y lo guarda en la cuenta como `metadata.metaCapiDatasetId`.
Es idempotente. **Requiere que el token tenga el permiso
`whatsapp_business_manage_events`**; si falta, devuelve 422 pidiendo reconectar
la cuenta. `GET` del mismo endpoint sirve para saber si ya está configurado.

**Paso 2 — Mandar el evento cuando la conversación sirvió.**

```
POST /v1/whatsapp/conversions
{
  accountId, eventName, eventId, conversationId,
  value?, currency?, eventTime?, email?, externalId?
}
```

`eventName` acepta `LeadSubmitted`, `Purchase`, `AddToCart`,
`InitiateCheckout`, `ViewContent`.

**Lo que más simplifica todo: el `ctwa_clid` lo busca Zernio solo.** Nosotros
mandamos el `conversationId` y él recupera el clic del primer mensaje entrante y
lo replica en cada evento. Si la conversación no tiene `ctwa_clid` devuelve 422,
que es exactamente "esta conversación no vino de un anuncio".

`eventId` es la clave de deduplicación: tiene que ser **estable**, para poder
reintentar sin contar dos veces. Sirve algo como `${leadId}:${eventName}` o el id
de la venta.

**Mapeo sugerido de nuestro pipeline:**

| Nuestro estado | Evento de Meta | `value` |
|---|---|---|
| Lead creado con teléfono o email | `LeadSubmitted` | — |
| Presupuestado | `InitiateCheckout` | monto del presupuesto |
| Venta aprobada | `Purchase` | `final_price`, currency `ARS` |

Mandar `Purchase` con el valor real es lo que le permite a Meta optimizar por
plata y no por volumen de chats. Es la diferencia entre "traeme muchas
conversaciones" y "traeme conversaciones que compran".

## Para reportar por campaña

Como Meta no manda campaña ni ad set, hay que resolver el ID del anuncio contra
la API de ads:

- `GET /v1/ads/{adId}` — datos del anuncio, incluida su jerarquía.
- `GET /v1/ads/{adId}/analytics` — inversión, impresiones, clics.

Con eso se cierra el costo por lead y el costo por venta reales por anuncio, que
hoy sólo tenemos para Lead Ads.

## Los tres huecos abiertos

1. **No estamos suscriptos a `referral.received`.** Nuestro webhook escucha 10
   eventos y ese no está. No afecta a WhatsApp —ahí el referral viaja pegado al
   mensaje— pero en Instagram y Messenger perdemos los casos de alguien que
   reabre un hilo por un link `ig.me`/`m.me` o vuelve por un clic de anuncio.

2. **`extractAttribution()` descarta casi todo.** El webhook manda 16 claves y
   guardamos 2. Se pierde la creatividad entera —título, texto, imagen, video,
   URL del anuncio— que es justamente lo que hace accionable la atribución.
   Es el hueco más caro de los tres: el dato pasa por nuestro server y lo
   tiramos.

3. **No hay repesca.** Nunca leemos el `metadata` del listado de conversaciones,
   así que si se pierde un webhook —una caída, un reintento fallido— el dato se
   pierde para siempre aunque Zernio lo tenga guardado.

Los tres son baratos de cerrar y conviene hacerlo **antes** de que empiece a
correr tráfico de Click-to-WhatsApp, porque lo que no se capture en el momento no
se recupera.

## Cómo comprobarlo cuando haya tráfico

1. Publicar un anuncio Click-to-WhatsApp (o usar uno existente).
2. Hacer clic desde un teléfono que no haya escrito antes y mandar un mensaje.
3. Revisar el evento crudo:

```sql
select payload->'message'->'metadata'
from webhook_events
where event_type = 'message.received'
order by received_at desc limit 5;
```

4. Contrastar con el listado de Zernio, que es donde vive el registro guardado:

```
GET /v1/inbox/conversations?accountId={cuenta}&limit=50
→ data[].metadata.ctwa_source_id
```

Si aparece en el listado pero no en el webhook, el problema es la suscripción.
Si no aparece en ninguno, el problema está del lado de Meta o del anuncio.
