# API CRM → Motorbox — Especificación de integración (nuestro lado)

> **Para quién es este documento:** el agente de código que trabaja sobre este repo (API CRM).
> **Documento espejo:** `motorbox-spec-motorbox.md` describe lo que construye el otro equipo.
> Los contratos de endpoints están definidos en los dos; si discrepan, **manda el espejo**
> y hay que corregir acá.
> **No técnico / para compartir:** `motorbox-integracion.md`.

---

## 0. Qué construimos de este lado

Cinco cosas, y ninguna toca el núcleo del CRM:

1. **Emisión de tickets SSO** — un JWT firmado que le dice a Motorbox quién entra.
2. **Un endpoint de perfil** — para que Motorbox lea los datos de la concesionaria.
3. **El botón y el iframe** en el menú de admin.
4. **Atribución de leads de Motorbox** — enganche en el inbound de WhatsApp.
5. **Webhooks salientes** — avisarle a Motorbox cuando una cuenta se suspende o cambia.

**Fuera de alcance:** publicaciones, stock, fotos, precios de vidriera. Todo eso vive en Motorbox.
Este repo no tiene módulo de stock y no lo va a tener por esta integración.

---

## 1. Decisiones tomadas

Las mismas que en el espejo. Las que nos afectan directamente:

| # | Decisión | Consecuencia acá |
|---|---|---|
| 1 | La llave es `companies.id` | El ticket siempre lleva la company **activa**, no el grupo. |
| 3 | RS256 + JWKS | Guardamos la clave privada; publicamos la pública. Rotamos sin avisar. |
| 4 | iframe en `motorbox.apicrm.ai` | Hay que crear un CNAME en nuestra zona DNS. |
| 9 | Solo `admin` y `group_admin` ven el botón | Se agrega a `ADMIN_NAV` únicamente. |
| 10 | 1 company = 1 dealer | Un `group_admin` multimarca genera un dealer **por marca**. |

---

## 2. Fase 0 — Infraestructura

### 2.1 DNS

El equipo de Motorbox agrega `motorbox.apicrm.ai` como dominio en **su** proyecto de Vercel.
Vercel les devuelve un registro; **nosotros** lo creamos en nuestra zona DNS.

```
Tipo:   CNAME
Nombre: motorbox
Valor:  <el target exacto que muestra Vercel — no lo tipees de memoria>
```

**Y muy probablemente un `TXT` también.** Motorbox vive en otro repo y otro proyecto de Vercel; si
además está en otro *team*, Vercel pide un `TXT` en `_vercel.apicrm.ai` para probar que el dominio es
nuestro. No hace falta averiguarlo de antemano: que nos manden lo que el panel les muestre, sea un
registro o dos, y los creamos.

```
Tipo:   TXT
Nombre: _vercel
Valor:  <el que muestre Vercel>
```

**Si el DNS está en Cloudflare: el CNAME va en gris (DNS only), no proxiado.** Proxiado pelea con
la emisión del certificado de Vercel y vas a perder una tarde.

**Verificá que el proyecto de API no tenga reclamado un wildcard `*.apicrm.ai`** en Vercel.
Si lo tiene, hay conflicto y el subdominio no se puede asignar al otro proyecto.

### 2.2 Par de claves para el ticket

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out motorbox-private.pem
openssl rsa -pubout -in motorbox-private.pem -out motorbox-public.pem

# Vercel maneja mal los saltos de línea: guardá los PEM en base64.
base64 -i motorbox-private.pem | pbcopy   # → MOTORBOX_JWT_PRIVATE_KEY_B64
base64 -i motorbox-public.pem  | pbcopy   # → MOTORBOX_JWT_PUBLIC_KEY_B64
```

`MOTORBOX_JWT_KID` es un string cualquiera que identifique la clave: usá `mb-2026-09`.
Cuando rotes, subís la clave nueva con un `kid` nuevo, servís **las dos** en el JWKS por 24 h, y
después sacás la vieja.

**La privada no sale de Vercel.** No la commitees, no la pegues en Slack, no la guardes en el repo.

### 2.3 Secretos compartidos

| Secreto | Lo genera | Lo guarda | Para qué |
|---|---|---|---|
| `MOTORBOX_JWT_PRIVATE_KEY_B64` | nosotros | solo nosotros | firmar el ticket |
| `MOTORBOX_JWT_PUBLIC_KEY_B64` | nosotros | nosotros (se publica en el JWKS) | que Motorbox verifique |
| `MOTORBOX_PARTNER_KEY` | nosotros | los dos | que Motorbox lea perfiles de concesionaria |
| `MOTORBOX_WEBHOOK_SECRET` | nosotros | los dos | HMAC de Motorbox → nosotros |
| `API_CRM_WEBHOOK_SECRET` | **nosotros** | los dos | HMAC de nosotros → Motorbox |
| `API_CRM_PARTNER_KEY` | Motorbox | los dos | que nosotros leamos sus publicaciones |

> **Corregido el 23/09/2026.** Esta tabla decía que `API_CRM_WEBHOOK_SECRET` la generaba Motorbox,
> y el §13 del spec de ellos decía que la generábamos nosotros. Lo detectó su equipo. Vale lo de
> arriba: **de los cuatro secretos compartidos, tres salen de nosotros** y sólo `API_CRM_PARTNER_KEY`
> sale de Motorbox. Es un secreto simétrico, así que cualquiera de las dos repartijas funcionaba;
> lo único que no funcionaba era que cada documento dijera una cosa distinta.

Generalos con `openssl rand -base64 48`. **Compartilos por un gestor de secretos o un mensaje
efímero, nunca por WhatsApp ni mail.** Si alguno se filtra, rotarlo es cambiar una env var
de los dos lados: dejá eso documentado en el runbook.

### 2.4 Dependencia

```bash
pnpm add jose
```

> Este repo usa **pnpm**. `npm install` rompe acá.

---

## 3. Fase 1 — Emisión del ticket

### 3.1 `src/lib/motorbox/keys.ts`

Carga la clave privada desde base64, la importa con `jose`, y la cachea a nivel módulo (que se
reimporte en cada request es caro y no hace falta).

```ts
import { importPKCS8, importSPKI, exportJWK, type KeyLike } from "jose";

let privateKey: KeyLike | null = null;

export async function getPrivateKey(): Promise<KeyLike> {
  if (privateKey) return privateKey;
  const pem = Buffer.from(process.env.MOTORBOX_JWT_PRIVATE_KEY_B64!, "base64").toString("utf8");
  privateKey = await importPKCS8(pem, "RS256");
  return privateKey;
}

export async function getPublicJwk() {
  const pem = Buffer.from(process.env.MOTORBOX_JWT_PUBLIC_KEY_B64!, "base64").toString("utf8");
  const key = await importSPKI(pem, "RS256");
  return { ...(await exportJWK(key)), kid: process.env.MOTORBOX_JWT_KID, alg: "RS256", use: "sig" };
}
```

### 3.2 `src/lib/motorbox/ticket.ts`

```ts
export async function mintTicket(opts: {
  profile: Profile;
  company: { id: string; name: string; country: string | null; status: string };
  embed: boolean;
  state?: string;
  impersonatedBy?: string | null;
}): Promise<string>
```

Claims exactos (el espejo los valida uno por uno, no improvises nombres):

```
iss      = NEXT_PUBLIC_APP_URL
aud      = "motorbox"
sub      = `api_crm:profile:${profile.id}`
jti      = crypto.randomUUID()
iat      = ahora
exp      = ahora + 90
company  = { id, name, country, status }
user     = { id, email, name, role }        // role crudo: "admin" | "group_admin"
scope    = ["dealer.admin"]                  // rol traducido
embed    = boolean
act      = impersonatedBy ? { sub: `api_crm:profile:${impersonatedBy}` } : null
```

Header: `{ alg: "RS256", kid: process.env.MOTORBOX_JWT_KID }`. **El `kid` es obligatorio**, sin él
Motorbox no puede rotar claves sin downtime.

### 3.3 JWKS público

**Cuidado con la ruta.** Un directorio literal `.well-known` dentro de `src/app` no es confiable
entre versiones de Next. Usá una ruta normal + un rewrite:

`src/app/api/motorbox/jwks/route.ts`:

```ts
export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  return NextResponse.json(
    { keys: [await getPublicJwk()] },
    { headers: { "cache-control": "public, max-age=600, s-maxage=3600" } },
  );
}
```

`next.config.ts`:

```ts
async rewrites() {
  return [{ source: "/.well-known/jwks.json", destination: "/api/motorbox/jwks" }];
}
```

Es público a propósito: una clave pública se publica. No le pongas auth.

Durante una rotación, devolvé las dos claves en el array `keys`.

### 3.4 `src/app/api/motorbox/ticket/route.ts`

`POST`, autenticado con la sesión normal de la app.

```ts
export async function POST(req: Request) {
  const profile = await requireRole(["admin"]);          // hasRole() ya deja pasar group_admin
  if (!profile.company_id) {
    return NextResponse.json({ ok: false, error: "no_active_company" }, { status: 400 });
  }
  // ... rate limit, cargar company, validar status, mintTicket, devolver url
}
```

Chequeos, en orden:

1. Rol: `admin` o `group_admin`. `requireRole(["admin"])` alcanza: `hasRole()` (`src/lib/auth.ts:76`)
   ya traduce `group_admin` → `admin`.
2. `profile.company_id` no nulo. Un `group_admin` sin marca activa tiene `company_id === null`
   (ver `getCurrentProfile`, `src/lib/auth.ts:41`): devolvé un error claro, no un ticket vacío.
3. `companies.status === "active"`. Si no, `403` con un mensaje que la UI pueda mostrar.
4. Rate limit: 30 por minuto por `profile.id`. Copiá el patrón in-memory de
   `src/app/api/forms/[slug]/submit/route.ts:13` y dejá el mismo comentario sobre su límite
   (es por instancia; alcanza para esto).

Respuesta:

```json
{ "ok": true, "url": "https://motorbox.apicrm.ai/api/sso/api-crm?ticket=eyJ...&state=%2Fdealer" }
```

**Nunca loguees el ticket ni la URL completa.** Si hay Sentry, sanitizá `ticket` de los breadcrumbs.

---

## 4. Fase 2 — Endpoint de perfil

`src/app/api/partners/motorbox/companies/[companyId]/route.ts`

Auth: `Authorization: Bearer ${MOTORBOX_PARTNER_KEY}`, comparado con `crypto.timingSafeEqual`
(no con `===`). Sin la key: `401` y no des pistas de si la company existe.

Devuelve el JSON especificado en §6 del espejo. Usá `createAdminClient()`: es una llamada
server-to-server sin sesión de usuario.

### 4.1 El problema del teléfono de WhatsApp — leelo antes de codear

El número de WhatsApp de la concesionaria **no está donde uno esperaría**:

- `messaging_channels.external_ref` guarda el *username/displayName* de Zernio
  (`src/lib/messaging/sync-channels.ts:54`), no el teléfono.
- El teléfono real (`display_phone_number`) se pide en vivo a Zernio con `getNumberInfo()` y hoy
  se persiste **anidado dentro de un blob de salud**:
  `messaging_channels.metadata.health.displayPhoneNumber`
  (`src/app/(app)/admin/channels/actions.ts:236` y `src/app/api/channels/callback/route.ts:81`).
- Ese blob **solo se llena cuando alguien corre el health check**. En una cuenta recién conectada
  puede estar vacío.

Solución, en dos partes:

**a) Migración: promover el teléfono a columna.**

```sql
alter table messaging_channels add column phone_e164 text;
create index messaging_channels_phone_e164_idx on messaging_channels (phone_e164)
  where phone_e164 is not null;

-- backfill desde el blob existente
update messaging_channels
set phone_e164 = metadata -> 'health' ->> 'displayPhoneNumber'
where platform = 'whatsapp'
  and metadata -> 'health' ->> 'displayPhoneNumber' is not null;
```

Normalizá a E.164 con `toE164()` (`src/lib/phone.ts`) usando `companies.country`, igual que hace
`resolveCompanyE164` en `src/lib/lead-reentry.ts:24`. Meta devuelve el número con espacios y guiones.

**b) Escribir la columna donde ya se lee el dato.** Los dos lugares citados arriba ya tienen
`info.display_phone_number` en la mano: agregales el `phone_e164` al `update`/`upsert`.
Es una línea en cada uno.

**c) Fallback en el endpoint.** Si un canal de WhatsApp activo tiene `phone_e164` nulo, pedilo en
vivo con `getNumberInfo()`, persistilo, y seguí. Si Zernio falla, devolvé el canal con
`phone_e164: null` — que Motorbox maneje el caso (está contemplado en su spec) en vez de romper
la respuesta entera.

### 4.2 Resto del payload

- `branches`: `status = 'active'` solamente.
- `admins`: `profiles` con `role in ('admin','group_admin')` y `status = 'active'`.
- `logo_url`: la URL pública de Supabase Storage. Motorbox la copia a su propio storage; no es
  nuestro problema mantenerla viva, pero **si se borra el logo, avisá por webhook `company.updated`**.
- No devuelvas nada que no esté en el contrato. Nada de leads, nada de vendedores, nada de ventas.
  Es superficie de datos que no hace falta exponer.

---

## 5. Fase 3 — El botón y el iframe

### 5.1 Menú

En `src/lib/nav.ts`, dentro de `ADMIN_NAV`. Va en la sección **Operación**, después de Ventas —
es una herramienta de trabajo diario, no una pantalla de configuración:

```ts
{
  href: "/admin/motorbox",
  label: "Motorbox",
  icon: "Store",
  hint: "Publicá tus autos en el marketplace; los contactos entran como leads acá",
},
```

**Y en `src/components/app-sidebar.tsx`, agregá `Store` al import de lucide y al map `ICONS`**
(línea 56). Si no lo agregás, el ítem no renderiza el ícono y no hay error que te avise: el map
resuelve `undefined` en silencio. Es el error más probable de toda la fase.

**No lo agregues a `MANAGER_NAV`, `SUPERVISOR_NAV` ni `SALES_NAV`** (decisión 9).

Efecto lateral esperado y deseado: `nav.ts` alimenta la base de conocimiento del asistente
(`src/lib/kb/generate.ts`) y la herramienta `dondeEsta`. Con el `hint` bien escrito, el asistente
ya va a saber contestar "¿dónde publico un auto?" sin tocar nada más. Regenerá la KB después
del cambio.

### 5.2 Página

`src/app/(app)/admin/motorbox/page.tsx` — server component:

```tsx
const profile = await requireRole(["admin"]);
// company activa, status, ticket inicial
return <MotorboxFrame key={company.id} initialUrl={url} companyName={company.name} />;
```

**El `key={company.id}` no es decorativo.** Un `group_admin` que cambia de marca activa
(`BrandSwitcher`) tiene que remontar el iframe entero: si no, el iframe sigue mostrando el dealer
de la marca anterior y el usuario ve datos de otra concesionaria. Es el peor bug posible de esta
integración.

Estados a cubrir antes del iframe:
- `group_admin` sin marca activa → "Elegí una marca para entrar a Motorbox".
- `companies.status !== 'active'` → mensaje de cuenta suspendida, sin iframe.
- Falta configuración (env vars vacías) → no renderices un iframe roto; mostrá un estado de
  "no disponible".

### 5.3 `src/components/motorbox/motorbox-frame.tsx` (client)

```tsx
<iframe
  ref={ref}
  src={initialUrl}
  className="h-[calc(100svh-var(--header-h))] w-full border-0"
  allow="camera; clipboard-write; fullscreen"
  referrerPolicy="no-referrer"
  title="Motorbox"
/>
```

- **Altura fija al viewport, scroll interno del iframe.** Nada de altura dinámica por `postMessage`:
  salta, pelea con el scroll del CRM y no vale la complejidad. Usá `svh`, no `vh`, por la barra
  de Safari en móvil.
- **Sin `sandbox`.** Es mismo sitio y confiamos en el contenido. Si algún día hace falta, el set
  mínimo es `allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox
  allow-downloads` — con menos que eso se rompe la sesión.

Handler de mensajes:

```tsx
useEffect(() => {
  const ORIGIN = process.env.NEXT_PUBLIC_MOTORBOX_EMBED_ORIGIN!;
  const onMsg = async (e: MessageEvent) => {
    if (e.origin !== ORIGIN) return;                 // exacto
    const m = e.data;
    if (!m || m.v !== 1) return;
    switch (m.type) {
      case "motorbox:ready":
        setLoading(false);
        post({ v: 1, type: "api:theme", theme: resolvedTheme });
        break;
      case "motorbox:need-ticket": {
        const r = await fetch("/api/motorbox/ticket", { method: "POST" });
        const { url } = await r.json();
        post({ v: 1, type: "api:ticket", url });
        break;
      }
      case "motorbox:navigate":
        if (m.target === "blank") window.open(m.href, "_blank", "noopener");
        else router.push(m.href);                    // ej: /admin/integraciones
        break;
      case "motorbox:onboarding-completed":
        toast.success("Tu concesionaria ya está publicada en Motorbox");
        break;
      case "motorbox:error":
        setError(m.message);
        break;
    }
  };
  window.addEventListener("message", onMsg);
  return () => window.removeEventListener("message", onMsg);
}, [resolvedTheme]);

const post = (msg: unknown) =>
  ref.current?.contentWindow?.postMessage(msg, process.env.NEXT_PUBLIC_MOTORBOX_EMBED_ORIGIN!);
```

Más:
- **Tema**: reenviá `api:theme` cada vez que cambie `resolvedTheme` de `next-themes`.
- **Timeout de carga**: si no llegó `motorbox:ready` en 15 s, mostrá un fallback con
  "No pudimos cargar Motorbox" + botón "Abrir en pestaña nueva" (que pide un ticket con
  `embed: false` y hace `window.open`). El `onError` de un iframe cross-origin no dispara;
  el timeout es la única señal confiable.
- **Nunca** uses `"*"` como `targetOrigin`.

### 5.4 Cabeceras del lado nuestro

No hace falta tocar CSP en API (hoy no hay una restrictiva). Si en algún momento se agrega,
acordate de incluir `frame-src https://motorbox.apicrm.ai`.

---

## 6. Fase 4 — Atribución de leads de Motorbox

La más valiosa de todas: sin esto, Motorbox no aparece en ningún reporte.

### 6.1 Dónde engancha

En `src/lib/messaging/handlers.ts`, dentro de `handleInboundMessage`, en la rama donde **no**
existe conversación previa (alrededor de la línea 305, justo donde ya se calcula `extractAttribution`
y el `adId`). El comentario que hay ahí explica que el referral de click-to-WhatsApp no llega por
Zernio: este cambio es exactamente la respuesta a ese problema.

### 6.2 `src/lib/motorbox/tracking.ts`

```ts
const MARKER = /\[MB:([A-Za-z0-9]{4,16})\]/;

export function extractMotorboxCode(text: string | null | undefined): string | null {
  if (!text) return null;
  return MARKER.exec(text)?.[1] ?? null;
}
```

Mirá el texto del mensaje **y el caption de los adjuntos**: mucha gente manda la foto del aviso.

### 6.3 Qué hacer cuando matchea

**Lead nuevo** (no había conversación ni lead previo):

1. Pedile los datos del vehículo a Motorbox:
   `GET {MOTORBOX_PUBLIC_ORIGIN}/api/partners/api-crm/listings/{code}` con
   `Authorization: Bearer ${API_CRM_PARTNER_KEY}`. Timeout 4 s, **un** reintento.
2. **Verificá que `listing.api_crm_company_id === channel.company_id`.** Si no coincide, ignorá el
   marcador y tratalo como un WhatsApp normal. Es la defensa contra alguien que pega un código
   ajeno en un mensaje.

   > El campo se llamaba `dealer_external_id` hasta el 22/09/2026. Se renombró porque Motorbox tiene
   > **dos** ids de concesionaria — el suyo (`text`, corto) y nuestro `company_id` (uuid) — y el
   > nombre viejo no decía cuál de los dos manda. Si acá llega el id de ellos, este chequeo falla
   > siempre, el marcador se ignora y **todos** los leads de Motorbox pierden la atribución sin un
   > solo error en los logs. Si ves cero leads con `source = "Motorbox"` después de publicar, esto
   > es lo primero que hay que mirar.

3. Creá el lead con:
   - `source: "Motorbox"`
   - `campaign_id`: el de la campaña Motorbox de esa empresa (ver 6.4)
   - `metadata.motorbox = { listing_code, listing_url, price, currency, matched_at }`
   - el resto igual que hoy (`branch_id`, `product_type_id` del canal, `status: "new"`).
4. Registrá el vehículo con `appendLeadVehicle()` (`src/lib/lead-reentry.ts:104`):
   `vehicle_brand`, `vehicle_model`, `vehicle_version`, y en `notes` el año, los km, el precio con su
   moneda y el link.

### 6.3.1 La moneda del aviso

Motorbox manda `price` + `currency` (`"ARS"` o `"USD"`), en la moneda en que lo cargó quien vende,
**sin convertir**. Es la decisión correcta y la aceptamos: convertir en el origen graba un número
calculado con la cotización de ese día, y a los dos días el lead dice un precio que el vendedor
nunca puso.

De nuestro lado cuesta poco, porque el precio del aviso **no aterriza en ninguna columna tipada**:

- `lead_vehicles` no tiene campo de precio.
- `leads.budget_min` / `budget_max` son el presupuesto del **comprador**, otra cosa. No los uses para esto.
- El precio va a `metadata.motorbox` (los dos campos juntos, nunca el número solo) y, formateado, al
  texto de `lead_vehicles.notes`.

Lo único que sí hay que tocar es la presentación: **`formatARS()` (`src/lib/format.ts:5`) está clavada
en pesos.** Hacé una `formatMoney(value, currency)` al lado, con el mismo criterio de `es-AR` y sin
decimales, y usala para todo lo que venga de Motorbox. No cambies `formatARS()` de firma: la usan
muchas pantallas que sí son ARS por definición.

El repo ya tiene el precedente de las dos monedas conviviendo:
`used_price_guide.currency char(3) check (currency in ('ARS','USD'))`
(`supabase/migrations/20260821120000_used_price_guide.sql:52`). Mismo criterio acá.

**Nunca conviertas USD a ARS para guardar.** Si en algún momento hace falta mostrar un equivalente,
se calcula al renderizar y se etiqueta como estimado.

**Lead que ya existía** (mismo teléfono, sticky-seller):

- **No toques `source` ni `campaign_id`.** La atribución original se respeta: esa persona ya era
  un lead de otro canal. Pisarla arruina los reportes de origen.
- Sí agregá el vehículo con `appendLeadVehicle()` y anotá el toque en
  `metadata.motorbox_touches[]` (array con `{ listing_code, at }`).
- Opcional pero útil: una `lead_notes` automática con "Consultó por X desde Motorbox".

### 6.4 La campaña

```ts
export async function ensureMotorboxCampaign(admin: Admin, companyId: string): Promise<string>
```

Busca en `campaigns` la fila con `company_id`, `origin = 'marketplace'` y `name = 'Motorbox'`.
Si no existe, la crea con `status: 'active'`.

Migración para que la carrera entre dos webhooks simultáneos no cree dos:

```sql
create unique index campaigns_motorbox_unique
  on campaigns (company_id)
  where origin = 'marketplace' and name = 'Motorbox';
```

Con eso el insert puede ir con `on conflict do nothing` + re-select.

### 6.5 Qué se pierde y cómo lo medimos

Si el comprador borra el marcador antes de mandar el mensaje, el lead entra como WhatsApp común.
No hay forma de evitarlo. Por eso existe el endpoint de eventos de intención (§8): comparar
"clics al CTA" contra "leads atribuidos" nos dice cuánta atribución se escapa. Sin ese número,
cualquier discusión sobre el rendimiento de Motorbox es a ciegas.

---

## 7. Fase 5 — Ingesta server-to-server (apagada en v1)

`src/app/api/partners/motorbox/leads/route.ts`

Es casi el mismo código que `src/app/api/forms/[slug]/submit/route.ts`, con firma en vez de
honeypot. El patrón de webhook ya está resuelto en este repo: copiá la estructura de
`src/app/api/webhooks/zernio/route.ts` — **verificar firma → deduplicar → responder 200 → procesar
en `after()`**. Es la regla de oro documentada en `mensajeria-zernio-arquitectura.md` §6.2 y
aplica igual acá.

1. **Firma**: `X-Motorbox-Signature: sha256=<hex>` sobre `${timestamp}.${rawBody}` con
   `MOTORBOX_WEBHOOK_SECRET`. Compará con `timingSafeEqual`. Reusá la forma de
   `verifyZernioSignature` (`src/lib/messaging/zernio-webhook.ts`).
2. **Ventana de replay**: rechazá si `|now - timestamp| > 300 s`.
3. **Dedup**: insertá en `webhook_events` con `provider: 'motorbox'` y `event_id` del body.
   Conflicto `23505` → `{ ok: true, deduped: true }` y salí. La tabla ya existe y ya se usa así.
4. **Validá que `company_id` existe y está activa.**
5. Creá el lead reusando lo que ya hay:
   - `resolveCompanyE164()` para el teléfono canónico
   - `findReentryLead()` para la ventana de 31 días
   - `appendLeadVehicle()` para el vehículo
   - `admin.rpc("auto_assign_lead", { p_lead_id })` para la asignación
6. Respondé `{ ok: true, lead_id, deduped }`.

Detrás de `MOTORBOX_LEAD_INGEST_ENABLED`. Si está apagado, devolvé `503` con un cuerpo claro
(`{ ok: false, error: "disabled" }`) para que el otro lado lo distinga de un bug.

---

## 8. Fase 5b — Eventos de intención

`src/app/api/partners/motorbox/events/route.ts`, misma firma y dedup.

```sql
create table motorbox_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies (id) on delete cascade,
  event_id    text not null unique,
  type        text not null,             -- 'listing.contact_click'
  channel     text,                      -- 'whatsapp' | 'form' | 'phone'
  listing_code text,
  occurred_at timestamptz not null,
  created_at  timestamptz not null default now()
);
create index motorbox_events_company_idx on motorbox_events (company_id, occurred_at desc);
```

RLS: lectura para la propia empresa. **Envolvé las funciones en `(select ...)`** —
`using ((select current_company_id()) = company_id)` — si no, Postgres las evalúa por fila.
En `leads` esa diferencia fue de 833 ms a 8 ms.

---

## 9. Fase 6 — Webhooks salientes

`src/lib/motorbox/notify.ts`: `notifyMotorbox(type, payload)` que hace `POST` firmado a
`{MOTORBOX_PUBLIC_ORIGIN}/api/partners/api-crm/events` con `API_CRM_WEBHOOK_SECRET`.

Eventos y dónde engancharlos:

| Evento | Dónde |
|---|---|
| `company.suspended` / `company.reactivated` | server action de super-admin que cambia `companies.status` |
| `company.updated` | acción de `/admin/company` (nombre, logo, dirección, CUIT) |
| `user.deactivated` | acción de `/admin/users` al desactivar un admin |
| `whatsapp.changed` | al conectar/desconectar un canal de WhatsApp |

Reglas:
- **Best-effort, nunca bloqueante.** Si Motorbox no responde, se loguea y la acción del CRM sigue.
  Nadie puede quedar sin poder suspender una cuenta porque el marketplace está caído.
- Corré el envío en `after()` para no meter latencia en la server action.
- Solo mandá el evento si la empresa tiene Motorbox activado
  (`companies.motorbox_enabled_at is not null`), para no spamear al otro lado con las 200 que no lo usan.
- `event_id` único y estable (`${type}:${companyId}:${timestamp}`) para que puedan deduplicar.

---

## 10. Migraciones

Un archivo por tema, en `supabase/migrations/`, con timestamp **único**
(`YYYYMMDDHHMMSS_nombre.sql`). Dos archivos con el mismo timestamp ya rompieron un `db push` en
este repo: verificá antes de crear.

1. `..._motorbox_channel_phone.sql` — `messaging_channels.phone_e164` + índice + backfill (§4.1)
2. `..._motorbox_campaign_index.sql` — índice único parcial de la campaña (§6.4)
3. `..._motorbox_events.sql` — tabla `motorbox_events` + RLS (§8)
4. `..._motorbox_company_flag.sql` — `companies.motorbox_enabled_at timestamptz` y
   `companies.motorbox_dealer_id text` (lo devuelve Motorbox en el primer alta; sirve para
   diagnóstico y para el filtro de §9)

Recordatorios de este repo:
- Las policies nuevas van con las funciones envueltas en `(select ...)`.
- `service_role` saltea RLS pero **no** saltea triggers. Si algún trigger existente usa
  `is_super_admin()` o `auth.uid()`, las escrituras del admin client se bloquean: agregá
  `or auth.role() = 'service_role'`.
- En el piloto las migraciones se aplican por la Management API, no por `db push`. Ojo con el
  drift de migraciones no aplicadas antes de sumar estas.

Después: `pnpm db:types`.

---

## 11. Variables de entorno

En `.env.example` y en el schema zod de `src/lib/env.ts` (server schema, todas `.optional()`
mientras la integración no esté activa — el mismo criterio que las de Zernio):

```bash
# --- Motorbox ---------------------------------------------------------------
# Claves del ticket SSO (RS256). PEM en base64: Vercel maneja mal los saltos de línea.
MOTORBOX_JWT_PRIVATE_KEY_B64=
MOTORBOX_JWT_PUBLIC_KEY_B64=
MOTORBOX_JWT_KID=mb-2026-09

# Credenciales de partner
MOTORBOX_PARTNER_KEY=          # la generamos nosotros; Motorbox la usa para leer perfiles
MOTORBOX_WEBHOOK_SECRET=       # HMAC de Motorbox → API (leads, eventos)
API_CRM_PARTNER_KEY=           # nos la da Motorbox; la usamos para leer sus publicaciones
API_CRM_WEBHOOK_SECRET=        # HMAC de API → Motorbox

# Orígenes
MOTORBOX_PUBLIC_ORIGIN=https://www.motorbox.ai
NEXT_PUBLIC_MOTORBOX_EMBED_ORIGIN=https://motorbox.apicrm.ai

# Flags
MOTORBOX_LEAD_INGEST_ENABLED=false
```

`NEXT_PUBLIC_APP_URL` ya existe y se usa como `iss` del ticket: **verificá que esté seteada en
producción**, hoy en `.env.example` está vacía y en `sync-channels.ts:66` ya hay un fallback a
`localhost:3000` que acá sería un desastre silencioso (tickets con `iss` de localhost que Motorbox
rechaza, sin decir por qué).

---

## 12. Criterios de aceptación

1. `GET /.well-known/jwks.json` devuelve una clave con `kid` y `alg: RS256`.
2. `POST /api/motorbox/ticket` como admin devuelve una URL; como vendedor devuelve `403`.
3. Un `group_admin` sin marca activa recibe un error claro, no un ticket roto.
4. El ticket decodificado tiene `iss` = la URL de producción (no localhost), `exp` a 90 s y `jti` único.
5. El menú muestra "Motorbox" solo para admin y group_admin, **con ícono**.
6. El iframe carga y llega `motorbox:ready`.
7. Con el `BrandSwitcher`, cambiar de marca remonta el iframe y entra al dealer correcto.
8. Matar la sesión de Motorbox y recargar: el `need-ticket` renueva solo, sin login visible.
9. `GET /api/partners/motorbox/companies/{id}` con la key correcta devuelve el perfil; sin key, `401`.
10. Ese perfil trae `whatsapp[].phone_e164` en E.164, no nulo, para una empresa con WhatsApp conectado.
11. Un WhatsApp entrante con `[MB:xxxx]` crea un lead con `source = "Motorbox"`, la campaña correcta
    y el vehículo en `lead_vehicles`.
12. El mismo mensaje sobre un lead **existente** agrega el vehículo pero **no** cambia su `source`.
13. Un `[MB:xxxx]` de una publicación de otra concesionaria se ignora.
14. Un aviso en USD llega con `currency: "USD"` y se guarda **sin convertir**, y se muestra en dólares.
15. Suspender una empresa dispara `company.suspended` hacia Motorbox y no rompe la suspensión si
    Motorbox está caído.

---

## 13. Orden de trabajo

| Fase | Qué | Se puede hacer en paralelo con Motorbox |
|---|---|---|
| 0 | DNS + claves + secretos | — (los bloquea a ellos, hacelo primero) |
| 1 | `mintTicket` + JWKS + `/api/motorbox/ticket` | sí |
| 2 | Endpoint de perfil + migración del teléfono | sí |
| 3 | Menú + página + componente del iframe | sí |
| 4 | Atribución en el inbound de WhatsApp | necesita el endpoint de listings de ellos |
| 5 | Ingesta S2S + eventos (apagados) | sí |
| 6 | Webhooks salientes | necesita el endpoint de eventos de ellos |

**Fase 0 primero y ya.** Todo lo que hace el otro equipo depende del alias de DNS, y es lo único
que no podemos empezar sin coordinar.

**Fase 0 primero y ya.** Todo lo que hace el otro equipo depende del alias de DNS, y es lo único
que no podemos empezar sin coordinar.

---

## 14. Arranque — checklist de Fase 0

Lo único que bloquea al otro equipo. Todo esto es nuestro y no depende de ellos salvo donde se aclara.

### Claves y secretos

```bash
./scripts/motorbox-setup-keys.sh
```

Genera el par RS256 y los dos secretos que nos toca generar, y deja los valores listos para pegar en
Vercel. **Los archivos quedan fuera del repo**; el script te dice dónde y te recuerda borrarlos una
vez cargados.

- [ ] Correr el script.
- [ ] Cargar en Vercel (Production + Preview): `MOTORBOX_JWT_PRIVATE_KEY_B64`,
      `MOTORBOX_JWT_PUBLIC_KEY_B64`, `MOTORBOX_JWT_KID`, `MOTORBOX_PARTNER_KEY`,
      `MOTORBOX_WEBHOOK_SECRET`, `API_CRM_WEBHOOK_SECRET`.
- [ ] Borrar los `.pem` del disco.
- [ ] Pasarle a Motorbox, por gestor de secretos o mensaje efímero, **las tres**:
      `MOTORBOX_PARTNER_KEY`, `MOTORBOX_WEBHOOK_SECRET` y `API_CRM_WEBHOOK_SECRET`.
      **Nunca la clave privada del ticket** — ellos verifican contra el JWKS público.
- [ ] Recibir de ellos `API_CRM_PARTNER_KEY` (ya la tienen generada) y cargarla en Vercel.

### Dominio

- [ ] **`NEXT_PUBLIC_APP_URL=https://www.apicrm.ai` en Vercel (Production).** Con `www`. Es el `iss`
      del ticket: si sale mal, Motorbox rechaza todos y el mensaje de error no dice por qué.
- [x] ~~Confirmar que `apicrm.ai` a secas redirige a `https://www.apicrm.ai`.~~ **Verificado el
      23/09/2026**: `https://apicrm.ai` → `308` → `https://www.apicrm.ai/`. Sin ambigüedad.
- [ ] Verificar en Vercel que el proyecto de API **no** tenga reclamado un wildcard `*.apicrm.ai`
      (bloquearía el alias de Motorbox).
- [ ] **Crear los dos registros DNS en la zona `apicrm.ai`.** Motorbox ya dio de alta el dominio en
      su Vercel el 23/09/2026 y mandó los valores. Al 23/09 **todavía no están creados** — es lo
      único que bloquea el modo embebido entero:

      | Tipo | Host | Nombre completo | Valor |
      |---|---|---|---|
      | CNAME | `motorbox` | `motorbox.apicrm.ai` | `932a33de170ec90c.vercel-dns-016.com.` |
      | TXT | `_vercel` | `_vercel.apicrm.ai` | `vc-domain-verify=motorbox.apicrm.ai,6c248fec5432fde7131e` |

      **Si el DNS está en Cloudflare, el CNAME va en gris — DNS only, no proxiado.** Proxiado pelea
      con la emisión del certificado de Vercel.

      Para verificar que quedaron:

      ```bash
      dig +short CNAME motorbox.apicrm.ai     # → 932a33de170ec90c.vercel-dns-016.com.
      dig +short TXT _vercel.apicrm.ai        # → "vc-domain-verify=..."
      curl -sI https://motorbox.apicrm.ai | head -1
      ```

      Vercel lo detecta solo y emite el certificado; no hace falta avisarles.

### Lo que podemos hacer sin esperarlos

Las fases 1, 2, 3 y 5 no dependen de nada de Motorbox. La 4 (atribución) necesita su endpoint de
publicaciones, y la 6 (webhooks salientes) su endpoint de eventos.

Dentro de la fase 2 hay una que conviene empezar ya porque no tiene nada que ver con la integración
y es deuda vieja: **la migración del teléfono de WhatsApp** (§4.1). Hoy el número vive anidado en
`messaging_channels.metadata.health.displayPhoneNumber` y sólo aparece si alguien corrió el health
check. Promoverlo a columna nos sirve con Motorbox o sin Motorbox.

### Lo que le pedimos a Motorbox

- [x] ~~Los registros DNS.~~ Recibidos el 23/09/2026 (arriba).
- [ ] `API_CRM_PARTNER_KEY` — ya la generaron, falta coordinar el canal para recibirla.
- [ ] La URL exacta de su endpoint de publicaciones (host: `https://www.motorbox.ai`).
- [ ] Confirmación de que el endpoint devuelve `api_crm_company_id` (nuestro uuid, o `null` si el
      aviso es de una concesionaria propia de ellos) y `price` + `currency`.
