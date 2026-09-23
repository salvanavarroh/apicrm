# Motorbox ← API CRM — Especificación de integración (lado Motorbox)

> **Para quién es este documento:** el agente de código que trabaja sobre el repo de Motorbox.
> **Qué asume:** Motorbox es una app Next.js (App Router) con Supabase (Auth + Postgres), desplegada en Vercel.
> **Estado:** especificación cerrada. Las decisiones de §1 ya se tomaron y no hay que re-discutirlas.
> **Documento espejo:** `motorbox-spec-api.md` describe lo que construye el otro lado. Cuando este documento
> dice "API expone X", ese endpoint está especificado allá con el mismo contrato. Si algo no coincide,
> el espejo manda.

---

## 0. Qué estamos construyendo

API CRM es un CRM multi-tenant para concesionarias de autos. Cada concesionaria es una `company`
con sus usuarios, sus leads, su WhatsApp conectado y sus sucursales.

Queremos que una concesionaria que ya usa API pueda **entrar a Motorbox desde el menú de API**,
sin registrarse de nuevo y sin abrir otra pestaña. El primer ingreso la da de alta en Motorbox
con los datos que API ya tiene; los siguientes la dejan directamente adentro.

El circuito completo, en una línea:

```
Concesionaria en API → toca "Motorbox" en el menú → iframe → ticket SSO → alta automática
→ onboarding (una sola vez) → publica autos → comprador toca "Contactar por WhatsApp"
→ el mensaje entra al WhatsApp que ya está conectado a API → API crea el lead atribuido a Motorbox
```

**Lo que Motorbox NO tiene que hacer:** gestionar leads, vendedores, seguimiento, ventas. Eso es API.
Motorbox publica y genera el contacto; el contacto vive en API.

**Lo que API NO tiene que hacer:** publicaciones, stock, fotos de vehículos, precios de vidriera.
API no tiene módulo de stock (verificado: no existe tabla de vehículos publicables). Eso es 100% Motorbox.

---

## 1. Decisiones ya tomadas

| # | Tema | Decisión | Por qué |
|---|---|---|---|
| 1 | Llave de vinculación | **`company_id` (UUID) de API**, no el email | El email cambia y una concesionaria tiene varios usuarios. El UUID es inmutable. |
| 2 | Mecanismo de SSO | **Ticket JWT firmado, un solo uso, 90 s** | No hace falta que API sea un authorization server OAuth completo. |
| 3 | Firma | **RS256 + JWKS público** | API rota claves sin coordinar con Motorbox. Nada de secreto compartido para el SSO. |
| 4 | Embebido | **iframe en un subdominio del dominio de API** | Elimina el problema de cookies de tercera parte (Safari). Ver §3. |
| 5 | Alta del dealer | **JIT, en el primer canje del ticket** | Sin coordinación de "quién llama primero". |
| 6 | Datos del concesionario | **Motorbox los tira de un endpoint de API**, no del JWT | El ticket queda chico y los datos siempre frescos. |
| 7 | Dealers preexistentes | **Campo virgen: no hay dealers auto-registrados** | Sin flujo de reclamo/merge en v1. Si esto cambia, ver §14, fila "CUIT duplicado". |
| 8 | CTAs en v1 | **Solo WhatsApp** | La ingesta server-to-server (§11) se construye pero queda detrás de un flag. |
| 9 | Quién entra desde API | **Rol `admin` y `group_admin`** | El resto de los roles no ve el botón. |
| 10 | Unidad de negocio | **1 `company` de API = 1 dealer de Motorbox** | Las sucursales de API son ubicaciones dentro del mismo dealer, no dealers separados. |

---

## 2. Glosario de identificadores

Los dos sistemas tienen que hablar exactamente de esto y nada más:

| Identificador | De dónde sale | Dónde vive en Motorbox | Inmutable |
|---|---|---|---|
| `company_id` | UUID de `companies.id` en API | `origen_id` de la concesionaria, con `origen = 'api_crm'` | Sí |
| `profile_id` | UUID de `profiles.id` en API | `origen_id` del perfil | Sí |
| `branch_id` | UUID de `branches.id` en API | `origen_id` de la ubicación | Sí |
| `listing_code` | Lo genera **Motorbox** | el código público del aviso | Sí |
| `jti` | UUID del ticket SSO | tabla de canjes del SSO | Por ticket |

`origen` es siempre el literal `'api_crm'`. Queda como columna (no hardcodeado) por si mañana se
enchufa otro CRM.

**Los nombres de la derecha son los de Motorbox** (`origen` / `origen_id`, en castellano como el
resto de ese repo). Más abajo, donde este documento escribe SQL, usa `external_source` /
`external_id`: son la misma cosa. Lo que no cambia es la **restricción**: índice único parcial sobre
el par, para que reimportar no duplique nada.

**Regla de oro:** Motorbox nunca inventa ni deriva un `company_id`. Siempre viene firmado dentro del ticket.

**Y la vuelta de lo mismo:** cuando Motorbox le devuelve a API el identificador de una concesionaria
—en el endpoint de publicaciones (§10.4) o en cualquier payload— manda **el `company_id` de API**
(el `origen_id`), nunca el id propio de Motorbox. Los dos existen y son distintos; confundirlos
rompe la atribución de todos los leads en silencio.

---

## 3. Infraestructura: el subdominio

Motorbox embebido se sirve en un host que cuelga del dominio de API:

```
https://www.motorbox.ai       → marketplace público (consumidores)   [ya existe]
https://motorbox.apicrm.ai    → mismo deployment, entrada embebida   [nuevo]
https://www.apicrm.ai         → API CRM                              [ya existe]
```

Dominios confirmados por el equipo de API (22/09/2026). El host del CRM es `www.apicrm.ai`, **con `www`**:
ese string exacto va en `frame-ancestors`, en la validación de `origin` de cada `postMessage` y es el `iss`
que trae el ticket. Sin `www` no valida nada y no hay mensaje de error que lo explique.

### Por qué

El navegador decide qué es "primera parte" por **dominio registrable**, no por host.
`www.apicrm.ai` y `motorbox.apicrm.ai` comparten `apicrm.ai` ⇒ el iframe **no es tercera
parte** ⇒ las cookies de sesión funcionan normalmente, Safari incluido. Sin CHIPS, sin
Storage Access API, sin `Partitioned`.

### Qué hay que hacer

1. En el proyecto de Motorbox en Vercel: Settings → Domains → Add → `motorbox.apicrm.ai`.
2. Vercel devuelve un registro DNS para crear. **Pasale esa pantalla al equipo de API**, que es
   quien controla esa zona DNS. Ellos crean el CNAME.
3. Si los proyectos están en teams distintos de Vercel, Vercel además va a pedir un TXT
   (`_vercel.apicrm.ai`) de verificación de propiedad. También lo crea el equipo de API.
4. Esperar a que Vercel valide y emita el certificado (minutos).

**Es el mismo proyecto, el mismo repo y el mismo deployment.** No hay segundo build, ni env vars
duplicadas, ni branch aparte. El mismo deploy responde en los dos hosts.

### Consecuencias que hay que manejar en código

**a) Detección de modo.** En `middleware.ts` (o `proxy.ts` en Next 16), leé el host:

```ts
const host = request.headers.get("host") ?? "";
const isEmbedded = host === process.env.NEXT_PUBLIC_EMBED_HOST;
```

Propagá el flag hacia abajo con un request header (`x-motorbox-embedded: 1`) para que los
layouts server-side lo lean sin volver a mirar el host.

En modo embebido: ocultá el nav del marketplace público, el footer de consumidor, banners de
cookies, el link "publicá tu auto" para particulares. El chrome lo pone API.

**b) Cookies host-only.** `@supabase/ssr` no setea `Domain` por defecto, así que ya son host-only:
es exactamente lo que necesitás. **No agregues `cookieOptions.domain`.** Si lo agregás, rompés
justo lo que estamos arreglando.

**c) Redirect URLs de Supabase.** Agregá `https://motorbox.apicrm.ai/**` a
Authentication → URL Configuration → Redirect URLs del proyecto de Supabase. Si no, los redirects
de auth fallan silenciosamente en el host nuevo.

**d) SEO.** El marketplace público queda alcanzable en dos hosts. Elegí una:
- `<link rel="canonical">` apuntando siempre a `www.motorbox.ai`, o
- en el middleware, si `isEmbedded` y la ruta **no** es del dealer console, redirigir 301 a
  `www.motorbox.ai` con el mismo path.

La segunda es más limpia. También agregá `X-Robots-Tag: noindex` en todas las respuestas del host alias.

**e) Sesiones separadas por host.** Alguien logueado en `www.motorbox.ai` **no** está logueado en
`motorbox.apicrm.ai`. Está bien y es deseable: la sesión embebida nace del ticket.
No intentes compartirlas.

### Desarrollo local

Los navegadores resuelven `*.localhost` a 127.0.0.1 solos, y `SameSite` **ignora el puerto**.
Entonces esto reproduce producción sin tocar `/etc/hosts`:

```
API      → http://api.localhost:3000
Motorbox → http://motorbox.localhost:3001
```

Ambos comparten el dominio registrable `localhost` ⇒ mismo sitio ⇒ el iframe funciona igual que en prod.
Las cookies de Supabase de los dos proyectos conviven porque el nombre incluye el project ref
(`sb-<ref>-auth-token`), que es distinto en cada uno.

---

## 4. Modelo de datos

> **Al 22/09/2026 el equipo de Motorbox confirmó que esta parte ya está construida**: cuentas de
> concesionaria, roles, permisos en base y el vínculo por sistema de origen con su restricción única.
> Lo de abajo queda como referencia del contrato, no como trabajo pendiente. Los nombres son los de
> la spec original (`external_source` / `external_id`); en el repo de Motorbox son `origen` /
> `origen_id` y el id propio de concesionaria es `text`. **Ninguna de esas diferencias cambia el
> contrato entre los dos sistemas** — lo único que importa es que el uuid de API viaje entero y
> vuelva entero.

Tablas nuevas (ajustá nombres a la convención del repo, pero respetá las restricciones):

```sql
-- El dealer. Uno por company de API.
alter table dealers
  add column external_source text,                       -- 'api_crm'
  add column external_id     uuid,                       -- companies.id de API
  add column api_crm_snapshot jsonb default '{}'::jsonb, -- lo último que devolvió API (solo para prellenar)
  add column onboarding_step  int  default 0,
  add column onboarding_completed_at timestamptz,
  add column suspended_at timestamptz;

create unique index dealers_external_key
  on dealers (external_source, external_id)
  where external_source is not null;

-- Usuarios del dealer originados en API.
alter table dealer_users
  add column external_source text,
  add column external_id     uuid,                       -- profiles.id de API
  add column api_crm_role     text,                      -- rol crudo de API, sin traducir
  add column sso_last_at      timestamptz;

create unique index dealer_users_external_key
  on dealer_users (external_source, external_id)
  where external_source is not null;

-- Ubicaciones espejo de las sucursales de API.
alter table dealer_locations
  add column external_source text,
  add column external_id     uuid;                       -- branches.id de API

-- Anti-replay del ticket SSO. Fila por ticket consumido.
create table sso_redemptions (
  jti         uuid primary key,
  issuer      text        not null,
  subject     text        not null,
  redeemed_at timestamptz not null default now()
);
create index sso_redemptions_redeemed_at_idx on sso_redemptions (redeemed_at);

-- Dedup de webhooks entrantes desde API.
create table partner_events (
  event_id   text primary key,
  source     text not null,            -- 'api_crm'
  event_type text not null,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);
```

**`api_crm_snapshot` es solo para prellenar.** Una vez que el dealer editó su vidriera, nunca la
pises con datos de API. Guardás el snapshot aparte y lo usás para el wizard y para mostrar
"en API figura X, ¿querés actualizarlo?".

**Limpieza de `sso_redemptions`:** un cron diario que borre las filas con
`redeemed_at < now() - interval '1 day'`. Sin esto la tabla crece para siempre y no sirve para nada
después de que el ticket venció.

---

## 5. SSO: el canje del ticket

Es el corazón de la integración. Si esto está bien, el resto es CRUD.

### 5.0 El contrato, confirmado contra la implementación (23/09/2026)

Verificado contra el emisor real, no contra el documento. Lo cubre
`pnpm test:motorbox`, que firma un ticket y lo verifica igual que ustedes.

| Qué | Valor |
|---|---|
| Algoritmo | **RS256** (está en el `alg` del JWKS y del header) |
| `iss` | `https://www.apicrm.ai` — exacto, **sin barra final** |
| `aud` | `motorbox` |
| JWKS | `https://www.apicrm.ai/.well-known/jwks.json` |
| `exp` | 90 s desde `iat` |
| Header | lleva `kid` siempre (hace falta para rotar sin downtime) |

Campos obligatorios, todos presentes en cada ticket:

| Campo | Forma |
|---|---|
| `jti` | uuid v4 — es lo que se consume una sola vez |
| `sub` | `api_crm:profile:<uuid>` |
| `company.id` | uuid de `companies.id` — el `origen_id` del lado de Motorbox |
| `company.status` | `"active"`; cualquier otro valor se rechaza sin crear nada |
| `user.id` | uuid de `profiles.id` |
| `user.email` | el email real; **no** vive en `profiles`, se resuelve de `auth.users` |
| `scope[]` | `["dealer.admin"]` — autorizar con esto |
| `user.role` | `"admin"` \| `"group_admin"` — guardar, **no** autorizar con esto |
| `embed` | `false` sólo al abrir en pestaña nueva |
| `act` | `null`, o `{ sub }` si un super admin está personificando |

### 5.1 Qué llega

API redirige el iframe a:

```
GET https://motorbox.apicrm.ai/api/sso/api-crm?ticket=<JWT>&state=<path>
```

El JWT, firmado con **RS256**:

```json
{
  "iss": "https://www.apicrm.ai",
  "aud": "motorbox",
  "sub": "api_crm:profile:6f1c2f7e-...",
  "jti": "b3d4...",
  "iat": 1757600000,
  "exp": 1757600090,
  "company": {
    "id": "9a1e...",
    "name": "Concesionaria del Sur",
    "country": "AR",
    "status": "active"
  },
  "user": {
    "id": "6f1c...",
    "email": "juan@delsur.com.ar",
    "name": "Juan Pérez",
    "role": "admin"
  },
  "scope": ["dealer.admin"],
  "embed": true,
  "act": null
}
```

- `role` es el rol **crudo de API** (`admin` | `group_admin`). Guardalo en `api_crm_role`.
- `scope` es el rol ya traducido al vocabulario de Motorbox. **Usá `scope` para autorizar**, no `role`.
- `embed: false` significa que abrieron en pestaña nueva: no muestres el chrome reducido.
- `act` viene poblado si un super admin de API está impersonando. Si no es `null`, **logueálo**
  (auditoría) y no mandes emails de bienvenida.

### 5.2 Verificación — en este orden, sin saltear ninguno

```ts
// app/api/sso/api-crm/route.ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.API_CRM_ORIGIN}/.well-known/jwks.json`),
  { cooldownDuration: 60_000, cacheMaxAge: 600_000 },
);

const { payload } = await jwtVerify(ticket, JWKS, {
  issuer: process.env.API_CRM_ORIGIN,
  audience: "motorbox",
  clockTolerance: 30,          // ±30 s de desfasaje de reloj
  maxTokenAge: "120s",         // cinturón además del exp
});
```

1. **Firma** contra el JWKS. `createRemoteJWKSet` cachea y refetchea solo si ve un `kid` desconocido
   (con cooldown, para que un `kid` basura no te haga martillar a API).
2. **`iss`, `aud`, `exp`, `iat`** con `clockTolerance: 30`.
3. **Consumir el `jti`**: `insert into sso_redemptions (jti, issuer, subject) values (...)`.
   Si viola la PK (código Postgres `23505`), **el ticket ya se usó**: devolvé una pantalla
   "Este enlace ya se usó. Volvé a entrar desde API." con un botón que hace `postMessage`
   `motorbox:need-ticket` al parent. **Nunca** lo dejes pasar.
4. **`company.status`**: si no es `active`, pantalla de cuenta suspendida. No crees nada.

### 5.3 Resolver el dealer

```
select * from dealers where external_source = 'api_crm' and external_id = <company.id>
```

- **No existe** → crear con `onboarding_completed_at = null`, y hacer el pull de perfil (§6)
  **antes** de responder, para que el wizard ya salga con datos.
- **Existe** → seguir. No toques los campos de vidriera.
- **Existe con `suspended_at` no nulo** → si `company.status` del ticket es `active`, reactivalo
  (`suspended_at = null`). El ticket es la verdad más fresca.

Hacé el insert con `on conflict (external_source, external_id) do nothing` + re-select. Dos pestañas
abiertas al mismo tiempo es un caso real y sin esto creás dos dealers.

### 5.4 Resolver el usuario

```
select * from dealer_users where external_source = 'api_crm' and external_id = <user.id>
```

Si no existe, creá la fila y el usuario de Supabase Auth. Si existe, actualizá `api_crm_role`,
`scope` y `sso_last_at`.

**Edge case — el email ya existe en `auth.users`:** puede pasar si el mismo humano se registró
antes por su cuenta. `admin.createUser` devuelve error 422 (`email_exists`). Manejalo así:

```ts
const { data: created, error } = await admin.auth.admin.createUser({
  email: user.email,
  email_confirm: true,                       // ya vino verificado desde API, no le pidas confirmar
  user_metadata: { source: "api_crm", api_crm_profile_id: user.id },
});

let authUserId = created?.user?.id;
if (error?.code === "email_exists" || error?.status === 422) {
  const { data } = await admin.auth.admin.listUsers({ /* buscar por email */ });
  const existing = data.users.find((u) => u.email?.toLowerCase() === user.email.toLowerCase());
  if (!existing) throw new Error("email_exists pero no lo encuentro");
  // ¿ya está vinculado a OTRA concesionaria?
  const conflict = await findDealerUserByAuthId(existing.id);
  if (conflict && conflict.dealer_id !== dealer.id) {
    return renderError("CONFLICT_USER_OTHER_DEALER");   // no fusiones en silencio
  }
  authUserId = existing.id;
}
```

**Nunca fusiones automáticamente un usuario que ya pertenece a otro dealer.** Devolvé un error
explícito y que lo resuelva un humano. Fusionar mal acá significa que alguien ve los leads de otra
concesionaria, y eso no se deshace.

### 5.5 Crear la sesión de Supabase

Este es el paso con más trampa. Motorbox usa Supabase Auth, y necesitamos loguear a alguien
**sin password y sin mandarle un email**. El camino es generar un magic link y canjearlo en la
misma request:

```ts
import { createServerClient } from "@supabase/ssr";

// 1) generar el link (NO envía email: devuelve el token para que lo uses vos)
const { data: link, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: user.email,
});
if (error) throw error;
const tokenHash = link.properties.hashed_token;

// 2) canjearlo con el cliente SSR, para que las cookies queden en ESTE host
const response = NextResponse.redirect(new URL(safeState, request.url));
const supabase = createServerClient(URL, ANON_KEY, {
  cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: (cookies) => cookies.forEach((c) => response.cookies.set(c.name, c.value, c.options)),
  },
});
await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
return response;
```

Cosas que van a morder:

- **El `type` de `verifyOtp`.** Para un `hashed_token` de `generateLink({type:'magiclink'})` el tipo
  correcto es `'magiclink'`, pero la familia `EmailOtpType` cambió de nombres entre versiones del SDK.
  **Verificá contra la doc viva de la versión que tenés instalada** antes de dar por perdido el día.
- **Rate limits de Supabase Auth.** `generateLink` cae bajo los límites de la API de auth. Con pocos
  concesionarios no lo vas a tocar; si en algún momento aparece un 429, la salida es cachear la
  sesión más tiempo (§9) en vez de re-emitir en cada carga del iframe.
- **Las cookies tienen que setearse sobre el objeto `response` que devolvés.** Si creás el cliente
  con otro juego de cookies, el `verifyOtp` funciona y la sesión se pierde. Es el bug clásico.
- **`Referrer-Policy: no-referrer`** en esta respuesta, para que el ticket no se filtre en el
  `Referer` de las requests siguientes.
- **No loguees la query string.** Ni en tu logger, ni en Sentry. Sanitizá `?ticket=` en los breadcrumbs.

> Alternativa si esto se complica: emitir vuestra propia cookie de sesión firmada para los usuarios
> originados en API, sin pasar por Supabase Auth. Funciona, pero te deja dos sistemas de sesión
> conviviendo. Elegila solo si el camino de arriba falla por algo estructural.

### 5.6 Redirigir

```ts
// state: solo rutas internas. Nada de esquemas, nada de //, nada de \
function safePath(state: string | null): string {
  if (!state) return "/dealer";
  if (!/^\/[A-Za-z0-9/_\-.?=&%]*$/.test(state)) return "/dealer";
  if (state.startsWith("//")) return "/dealer";
  return state;
}
```

Y antes de redirigir: si `dealer.onboarding_completed_at` es `null`, mandalo a `/dealer/onboarding`
ignorando el `state`.

El 302 tiene que salir **sin el ticket en el destino**. Después del canje, la URL del iframe es una
ruta limpia de Motorbox.

### 5.7 Endurecimiento opcional: POST binding

El ticket viaja en la query string del `src` del iframe. Con TTL de 90 s, un solo uso y
`Referrer-Policy: no-referrer` el riesgo es bajo. Si querés cerrarlo del todo: que API sirva en el
`src` del iframe un HTML con un formulario auto-submit que hace `POST` del ticket a
`/api/sso/api-crm`. Mismo canje, el ticket nunca aparece en ninguna URL. Es el binding de SAML.
Agregalo después de que funcione la versión simple.

---

## 6. Pull del perfil de la concesionaria

En el alta (y cuando el dealer toque "actualizar datos desde API"), Motorbox llama server-to-server:

```http
GET {API_CRM_ORIGIN}/api/partners/motorbox/companies/{company_id}
Authorization: Bearer {MOTORBOX_PARTNER_KEY}
Accept: application/json
```

Respuesta:

```json
{
  "ok": true,
  "company": {
    "id": "9a1e...",
    "name": "Concesionaria del Sur",
    "legal_name": "Del Sur Automotores S.A.",
    "cuit": "30-71234567-8",
    "country": "AR",
    "address": "Av. Rivadavia 4321, CABA",
    "phone": "+541143210000",
    "logo_url": "https://<supabase>/storage/v1/object/public/company-logos/9a1e.png",
    "status": "active",
    "plan": "pro"
  },
  "branches": [
    { "id": "b1...", "name": "Casa Central", "address": "Av. Rivadavia 4321", "phone": "+541143210000", "status": "active" }
  ],
  "whatsapp": [
    { "channel_id": "c1...", "display_name": "Ventas Del Sur", "phone_e164": "+5491143210000", "branch_id": "b1...", "status": "active" }
  ],
  "admins": [
    { "id": "6f1c...", "name": "Juan Pérez", "email": "juan@delsur.com.ar", "role": "admin" }
  ]
}
```

Reglas:

- **Guardá el bloque entero en `api_crm_snapshot`.** Lo vas a necesitar para el wizard y para mostrar
  diferencias después.
- **Copiá el logo a tu propio storage.** No hotlinkees la URL de Supabase de API: si cambian el bucket
  o el archivo, se te rompe la vidriera pública. Descargalo una vez en el alta.
- **`whatsapp[]` puede venir vacío.** Es normal: la concesionaria todavía no conectó WhatsApp en API.
  El onboarding tiene que contemplarlo (§7, paso 3).
- **Este endpoint puede fallar.** Si API está caída, el alta igual tiene que completarse con lo que
  trae el ticket (`company.name`, `company.country`) y marcar `profile_pull_pending = true` para
  reintentar. **No bloquees el SSO por esto.**
- Timeout de 5 s, un reintento, y seguí.

---

## 7. Onboarding

Ruta: `/dealer/onboarding`. Se muestra mientras `onboarding_completed_at is null`.
Guardá el avance en `onboarding_step` para que se pueda retomar.

**Paso 1 — Bienvenida y confirmación de datos.**
Título en la línea de "Tu concesionaria ya está en Motorbox". Explicá en dos frases qué es Motorbox
y qué va a poder hacer. Mostrá en solo lectura lo que llegó de API: nombre, razón social, CUIT,
dirección, logo. Un botón "Está bien" y un link chico "Corregir" para los que quieran editar.

**Paso 2 — La vidriera.** Todo esto API no lo tiene, lo carga el concesionario:
descripción, horarios de atención, fotos del local, marcas que comercializa, si toma permuta,
si ofrece financiación, redes sociales.

**Paso 3 — Contacto.** El más importante de los tres.
- El número de WhatsApp sale de `whatsapp[]` del pull. **Presentalo como selector, no como campo de
  texto libre.**
- Si el concesionario insiste en poner otro número, mostrale una advertencia dura e inequívoca:
  *"Si publicás un número distinto al que tenés conectado en API, los mensajes de tus compradores
  no van a entrar a tu CRM y no vas a tener el lead."* Es literalmente la razón por la que existe
  esta integración.
- Si `whatsapp[]` vino vacío: mostrá un estado explicativo con un botón "Conectar WhatsApp en API"
  que hace `postMessage` `motorbox:navigate` hacia `/admin/integraciones` (el parent lo maneja).
  Permití terminar el onboarding igual, pero dejá el dealer marcado como "sin canal de contacto"
  y no lo dejes publicar hasta resolverlo.
- Sucursales: importadas de `branches[]` con checkbox de cuáles publicar.

**Cierre.** `onboarding_completed_at = now()`, `postMessage` `motorbox:onboarding-completed` al
parent, y redirect al dashboard del dealer.

Edge cases del wizard:
- Si entra un segundo admin de la misma concesionaria con el onboarding a medias, que pueda
  continuarlo él. No lo bloquees: son colegas.
- No mandes email de bienvenida si `act` del ticket no era `null` (es un super admin impersonando).

---

## 8. Modo embebido

### 8.1 Permitir el iframe

En las rutas del dealer console, en modo embebido:

```
Content-Security-Policy: frame-ancestors 'self' https://www.apicrm.ai
```

Y **asegurate de que no haya un `X-Frame-Options: DENY`** dando vueltas (Vercel no lo agrega solo,
pero a veces está en `next.config` heredado de un template). `X-Frame-Options` y `frame-ancestors`
conviven mal: si están los dos, gana el más restrictivo en varios navegadores.

Poné el origen permitido en una env var, no hardcodeado.

### 8.2 Protocolo `postMessage`

Versionado desde el día uno. **Los dos lados validan `event.origin` de forma estricta**, con
comparación exacta contra la env var. Nada de `endsWith`, nada de `includes`, nada de `'*'` como
`targetOrigin`.

**Motorbox → API (parent):**

| Mensaje | Cuándo | Payload |
|---|---|---|
| `motorbox:ready` | El dealer console cargó y tiene sesión | `{ dealerId, onboarded: boolean }` |
| `motorbox:need-ticket` | No hay sesión, o venció | `{ reason: "expired" \| "missing" \| "consumed" }` |
| `motorbox:onboarding-completed` | Se terminó el wizard | `{ dealerId }` |
| `motorbox:navigate` | Pedir abrir algo fuera del iframe | `{ href, target: "parent" \| "blank" }` |
| `motorbox:error` | Error que el usuario tiene que ver | `{ code, message }` |
| `motorbox:title` | Cambió la sección (para breadcrumb en API) | `{ title }` |

**API → Motorbox:**

| Mensaje | Cuándo | Payload |
|---|---|---|
| `api:ticket` | Respuesta a `need-ticket` | `{ url }` — navegá con `location.replace(url)` |
| `api:theme` | Al cargar y cuando el usuario cambia de tema | `{ theme: "light" \| "dark" }` |
| `api:ping` | Healthcheck | `{}` — respondé `motorbox:ready` |

Todos los mensajes llevan `{ v: 1, type, ... }`. Ignorá en silencio cualquier mensaje sin `v`,
con `v` desconocida o de un origin que no es el esperado.

```ts
// Motorbox, lado cliente
const PARENT = process.env.NEXT_PUBLIC_API_CRM_ORIGIN!;

useEffect(() => {
  const onMsg = (e: MessageEvent) => {
    if (e.origin !== PARENT) return;              // exacto, sin excepciones
    const msg = e.data;
    if (!msg || msg.v !== 1) return;
    if (msg.type === "api:ticket") location.replace(msg.url);
    if (msg.type === "api:theme") setTheme(msg.theme);
  };
  window.addEventListener("message", onMsg);
  post({ v: 1, type: "motorbox:ready", dealerId, onboarded });
  return () => window.removeEventListener("message", onMsg);
}, []);

function post(msg: unknown) {
  if (window.parent === window) return;           // no estamos embebidos
  window.parent.postMessage(msg, PARENT);         // targetOrigin explícito, nunca "*"
}
```

### 8.3 Tema

API usa `next-themes` y tiene modo oscuro. Escuchá `api:theme` y acompañá. Si no llega el mensaje,
default al tema claro. Se ve mal un iframe blanco dentro de un CRM oscuro y es lo primero que
alguien va a señalar en la demo.

### 8.4 Cosas que no funcionan igual dentro de un iframe

- **`window.open`** puede quedar bloqueado. Para cualquier cosa que tenga que abrirse afuera
  (documentación, links a Meta, descargas), mandá `motorbox:navigate` y que el parent lo abra.
- **Descargas** de archivos generados en el cliente: mejor por `motorbox:navigate` con `target: "blank"`.
- **Cámara** para subir fotos: necesita que API ponga `allow="camera"` en el iframe. Ya está
  especificado del otro lado, pero si falla, avisá.
- **Scroll anidado.** El iframe ocupa el alto del viewport y el scroll es interno del dealer console.
  No hagas `document.body.style.overflow = hidden` a lo loco.

---

## 9. Sesión: duración y renovación

La sesión de Motorbox en el host embebido es independiente de la de API. Dos riesgos:

**a) Que dure más que el permiso.** Si en API dan de baja al usuario o suspenden la concesionaria,
la sesión de Motorbox sigue viva. Dos mitigaciones, hacé las dos:
- **TTL de la sesión de origen API: 8 horas.** Guardá `sso_last_at` en `dealer_users` y en el
  middleware del host embebido, si `now() - sso_last_at > 8h`, invalidá y pedí ticket nuevo.
  Como el parent lo renueva solo, el usuario no se entera.
- **Webhooks de API** (§13) para las bajas inmediatas.

**b) Que muera antes que la de API.** Es el caso frecuente: el iframe queda abierto en una pestaña
todo el día. Cuando el middleware detecta que no hay sesión válida en modo embebido, **no
redirijas a un login**: eso muestra un formulario de login adentro del CRM y queda pésimo.
Serví una página mínima que hace:

```ts
window.parent.postMessage({ v: 1, type: "motorbox:need-ticket", reason: "expired" }, PARENT);
```

y muestra un spinner. El parent responde con `api:ticket` y la página hace `location.replace(url)`.
Si en 10 segundos no llegó respuesta, mostrá "No pudimos renovar la sesión" con un botón de reintento.

**Nunca muestres el login de Motorbox dentro del iframe.** Si llegaste ahí, es un bug.

---

## 10. El CTA de WhatsApp (la parte que genera el lead)

Este es el punto donde Motorbox le entrega valor a API, y tiene un detalle que **no es opcional**.

### 10.1 El problema

Cuando alguien toca "Contactar por WhatsApp" y llega el mensaje al número de la concesionaria,
API crea el lead automáticamente (ya lo hace hoy con todos los WhatsApp entrantes). Pero API **no
tiene forma de saber que vino de Motorbox ni de qué publicación**: el referral de click-to-WhatsApp
no llega por el proveedor de mensajería que usa API. Verificado en su código.

Sin resolverlo, Motorbox es invisible en los reportes de la concesionaria, y "¿cuántos leads me
trajo Motorbox?" no tiene respuesta.

### 10.2 La solución: marcador en el texto prellenado

```ts
const text = [
  `Hola! Me interesa este vehículo:`,
  `${brand} ${model} ${version} ${year} — ${priceFormatted}`,
  listingUrl,
  ``,
  `[MB:${listing.public_code}]`,
].join("\n");

const href = `https://wa.me/${phoneE164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
```

**Reglas del marcador, no negociables:**

- Formato exacto: `[MB:` + código + `]`, donde el código es `[A-Za-z0-9]{4,16}`.
- **Siempre en la última línea**, precedido por una línea en blanco. La gente edita el mensaje antes
  de mandarlo, y lo que borra es el principio, no el final.
- Un solo marcador por mensaje.
- El código es el `public_code` de la publicación, no el UUID interno. Corto, legible, sin ambigüedad
  entre `0`/`O` ni `1`/`l` si lo generás (usá un alfabeto tipo Crockford base32).

API parsea ese marcador en el mensaje entrante y con él marca el lead como originado en Motorbox,
le asocia la campaña correspondiente y registra el vehículo consultado.

### 10.3 Qué número usar

El `phone_e164` que salió del pull de perfil (§6), el que la concesionaria eligió en el onboarding.
Nunca uno tipeado a mano sin validar. Si el dealer no tiene número de API configurado, el CTA de
WhatsApp no se muestra: mostrá el formulario (§11) en su lugar.

### 10.4 Endpoint que Motorbox tiene que exponer

Cuando API ve el marcador, necesita saber de qué auto se trata. Exponé:

```http
GET {MOTORBOX_PUBLIC_ORIGIN}/api/partners/api-crm/listings/{public_code}
Authorization: Bearer {API_CRM_PARTNER_KEY}
```

```json
{
  "ok": true,
  "listing": {
    "public_code": "8f3k2",
    "url": "https://www.motorbox.ai/p/toyota-corolla-xei-2021-8f3k2",
    "status": "published",
    "brand": "Toyota",
    "model": "Corolla",
    "version": "XEI 1.8 CVT",
    "year": 2021,
    "km": 45000,
    "price": 28500000,
    "currency": "ARS",
    "condition": "usado",
    "photo_url": "https://...",
    "api_crm_company_id": "9a1e...",
    "api_crm_branch_id": "b1..."
  }
}
```

Detalles:
- **Tiene que responder aunque la publicación esté pausada, vendida o borrada** (con el `status`
  correspondiente). El lead puede llegar días después de que se bajó el aviso, y API igual necesita
  saber qué miraba la persona. Borrado lógico, nunca 404 por eso. 404 solo si el código no existió nunca.
- **`api_crm_company_id` es el `company_id` de API (uuid), NO el id de concesionaria de Motorbox.**
  El campo se llamaba `dealer_external_id` y se renombró justamente por esto: Motorbox tiene su
  propio id de concesionaria (`dealers.id`, text, corto) y mandar ese en vez del uuid de API hace que
  el chequeo del otro lado falle siempre. El síntoma sería que **todos** los leads de Motorbox
  pierden la atribución, sin un solo error en los logs. Es el valor de `origen_id` cuando
  `origen = 'api_crm'`.
- `api_crm_branch_id` = el `branches.id` de API de la sucursal, mismo criterio. Puede ser `null`.
- **`currency` es obligatoria, no opcional.** `"ARS"` o `"USD"`, y el `price` va en esa moneda, sin
  convertir. API guarda las dos cosas juntas y nunca convierte: un precio convertido con la
  cotización del día dice, dos días después, un número que el vendedor nunca puso. Mandá el par
  siempre, aun cuando sea ARS — un número sin moneda es ambiguo apenas existe el segundo caso.
- **`api_crm_company_id` llega presente y en `null` cuando el aviso es de una concesionaria propia
  de Motorbox** (alguien que se dio de alta ahí y no existe en el CRM). Decidido el 23/09/2026: un
  campo ausente y uno nulo se ven igual del lado de API, pero el `null` explícito dice "lo miramos,
  no es de API CRM" en vez de "puede que se haya perdido en la serialización". API lo trata como
  caso normal y silencioso; un uuid que no corresponde, en cambio, queda logueado como anomalía.
- Rate limit generoso (API llama una vez por lead nuevo) pero ponelo.
- Cachealo: es contenido casi inmutable.

### 10.5 Eventos de intención (fase 2, opcional pero muy barato)

Cada vez que alguien toca el CTA, mandá a API:

```http
POST {API_CRM_ORIGIN}/api/partners/motorbox/events
```
```json
{
  "event_id": "mb_evt_01J...",
  "type": "listing.contact_click",
  "channel": "whatsapp",
  "company_id": "9a1e...",
  "listing_code": "8f3k2",
  "occurred_at": "2026-09-11T14:03:00Z"
}
```

Firmado igual que §11. Sirve para una sola cosa, pero importante: comparar clics contra
conversaciones efectivamente iniciadas. Sin esto nadie sabe cuánta atribución se pierde por gente
que borra el marcador o nunca manda el mensaje.

---

## 11. Ingesta de leads server-to-server (detrás de flag en v1)

Para todo CTA que **no** sea WhatsApp: formulario de contacto, consulta por email, clic para llamar.
En v1 solo hay WhatsApp (decisión 8), así que construí esto y dejalo apagado con
`MOTORBOX_LEAD_PUSH_ENABLED`.

```http
POST {API_CRM_ORIGIN}/api/partners/motorbox/leads
Content-Type: application/json
X-Motorbox-Timestamp: 1757600000
X-Motorbox-Signature: sha256=<hmac>
```

Firma:

```ts
import { createHmac } from "node:crypto";

const ts = Math.floor(Date.now() / 1000).toString();
const signature = createHmac("sha256", process.env.MOTORBOX_WEBHOOK_SECRET!)
  .update(`${ts}.${rawBody}`)     // exactamente el string que mandás como body
  .digest("hex");
```

Body:

```json
{
  "event_id": "mb_lead_01J...",
  "company_id": "9a1e...",
  "channel": "form",
  "listing": { "public_code": "8f3k2", "url": "https://www.motorbox.ai/p/...", "brand": "Toyota", "model": "Corolla", "version": "XEI 1.8 CVT", "year": 2021, "price": 28500000, "currency": "ARS" },
  "contact": { "first_name": "Ana", "last_name": "Gómez", "phone_e164": "+5491155556666", "email": "ana@ejemplo.com" },
  "message": "¿Aceptan permuta por una Amarok 2018?",
  "api_crm_branch_id": "b1...",
  "occurred_at": "2026-09-11T14:03:00Z"
}
```

Reglas:

- **`phone_e164` siempre en E.164 con `+`.** API deduplica por ese campo; si mandás `11 5555-6666`
  se crea un lead duplicado que nadie va a unificar después.
- **`event_id` único y estable.** Si reintentás, mandá el mismo: API deduplica por ahí.
- Reintentá con backoff exponencial (1 s, 4 s, 16 s, 1 min, 5 min) ante 5xx o timeout.
  Ante 4xx **no reintentes**: es un bug tuyo, logueálo y alertá.
- Respuesta esperada: `{ "ok": true, "lead_id": "...", "deduped": false }`.
- API va a fusionar este lead con uno existente si la persona ya escribió por WhatsApp en los últimos
  31 días. Eso es correcto y deseado: es la misma persona. `deduped: true` te lo avisa.

---

## 12. Webhooks entrantes desde API

API te avisa de cambios que afectan la vidriera:

```http
POST {MOTORBOX_PUBLIC_ORIGIN}/api/partners/api-crm/events
X-ApiCrm-Timestamp: 1757600000
X-ApiCrm-Signature: sha256=<hmac con API_CRM_WEBHOOK_SECRET>
```

| `type` | Qué hacer |
|---|---|
| `company.suspended` | `dealers.suspended_at = now()`. **Despublicar avisos** o marcarlos como no visibles. Invalidar sesiones de ese dealer. |
| `company.reactivated` | `suspended_at = null`. Republicar lo que estaba publicado antes, no todo. |
| `company.updated` | Refrescar `api_crm_snapshot`. **No pisar** la vidriera editada. Si cambió algo relevante (logo, dirección), mostrale al dealer un aviso "en API actualizaron X, ¿lo traés?". |
| `user.deactivated` | Invalidar la sesión de ese `dealer_users.external_id` y bloquear su ingreso. |
| `whatsapp.changed` | Refrescar `whatsapp[]`. Si el número que tenía publicado ya no existe, **alertá al dealer fuerte**: sus leads están cayendo en el vacío. |

Implementación: verificar HMAC → dedup por `event_id` en `partner_events` → responder `200` en
menos de 5 segundos → procesar asíncrono. Si el evento es desconocido, **respondé 200 igual**
y logueálo: no obligues a API a reintentar para siempre por un tipo que todavía no implementaste.

---

## 13. Variables de entorno

```bash
# Identidad de API CRM
API_CRM_ORIGIN=https://www.apicrm.ai
NEXT_PUBLIC_API_CRM_ORIGIN=https://www.apicrm.ai     # para validar origin en postMessage

# Hosts propios
NEXT_PUBLIC_EMBED_HOST=motorbox.apicrm.ai
NEXT_PUBLIC_PUBLIC_ORIGIN=https://www.motorbox.ai

# Credenciales que da el equipo de API
MOTORBOX_PARTNER_KEY=            # para leer perfiles de concesionarias (Bearer)
MOTORBOX_WEBHOOK_SECRET=         # HMAC de Motorbox → API (leads, eventos)
API_CRM_WEBHOOK_SECRET=          # HMAC de API → Motorbox (verificar lo que llega)

# Credencial que generás vos y le pasás a API
API_CRM_PARTNER_KEY=             # para que API lea tus publicaciones

# Flags
MOTORBOX_LEAD_PUSH_ENABLED=false # §11, apagado en v1
```

Todas server-only salvo las `NEXT_PUBLIC_`. **Ninguna clave va al cliente.**

---

## 14. Edge cases — tabla de referencia

| Situación | Qué tiene que pasar |
|---|---|
| Ticket vencido | Pantalla "el enlace expiró" + `motorbox:need-ticket`. Nunca aceptarlo. |
| Ticket reusado (`jti` repetido) | Rechazar. Es la defensa contra replay. |
| `kid` desconocido en el ticket | Refetch del JWKS una vez (con cooldown). Si sigue sin aparecer, error. |
| Reloj desfasado | `clockTolerance: 30`. Más que eso, que falle. |
| Dos pestañas abren el SSO a la vez | `on conflict do nothing` en el insert del dealer. Un solo dealer. |
| Concesionaria suspendida en API | No crear nada, pantalla de cuenta suspendida. Si ya existía, despublicar. |
| Usuario dado de baja en API | Webhook `user.deactivated` + TTL de 8 h como red de seguridad. |
| Email ya existe en `auth.users`, libre | Vincular ese usuario al `external_id`. |
| Email ya existe y pertenece a otro dealer | **Error explícito.** Nunca fusionar en silencio. |
| CUIT duplicado con un dealer preexistente | No aplica en v1 (campo virgen). Si aparece: paso de "vincular cuenta existente" con confirmación del dueño actual, nunca automático. |
| `group_admin` de API cambia de marca activa | Llega un ticket con otro `company.id` → otro dealer. El parent remonta el iframe. No intentes reusar la sesión. |
| API caída durante el alta | Completar el alta con lo del ticket, marcar `profile_pull_pending`, reintentar después. |
| Motorbox caído | El parent muestra su propio fallback. Nada que hacer de este lado. |
| Publicación borrada, lead llega después | `/listings/{code}` responde con `status` y los datos. Nunca 404 por borrado. |
| `whatsapp[]` vacío en el pull | Onboarding completable, pero dealer marcado sin canal y sin poder publicar. |
| Super admin impersonando (`act` ≠ null) | Loguear. No mandar emails. No marcar "primera visita". |
| Mensaje de WhatsApp sin el marcador | Se pierde la atribución. Por eso existen los eventos de intención (§10.5). |

---

## 15. Checklist de seguridad

- [ ] `jti` consumido de forma atómica antes de crear la sesión.
- [ ] `iss`, `aud`, `exp` validados. `maxTokenAge` además del `exp`.
- [ ] `state` validado contra open redirect (solo paths internos).
- [ ] `Referrer-Policy: no-referrer` en la respuesta del canje.
- [ ] El ticket nunca se loguea, ni en el logger propio ni en Sentry ni en los logs de Vercel.
- [ ] `frame-ancestors` con el origen exacto de API, sin comodines.
- [ ] `postMessage` con `targetOrigin` explícito. Nunca `'*'`.
- [ ] `event.origin` comparado con `===`. Nunca `includes`/`endsWith`.
- [ ] Las claves del partner nunca llegan al bundle del cliente.
- [ ] Los usuarios de API se crean con `email_confirm: true` (no mandar mails de verificación).
- [ ] Un usuario nunca queda vinculado a dos dealers.
- [ ] HMAC comparado en tiempo constante (`crypto.timingSafeEqual`), no con `===`.
- [ ] Ventana de replay de 5 minutos en los webhooks (rechazar timestamps viejos).
- [ ] `X-Robots-Tag: noindex` en el host embebido.

---

## 16. Criterios de aceptación

Probá en este orden. Cada uno tiene que pasar antes del siguiente.

1. **Alias vivo.** `https://motorbox.apicrm.ai` sirve Motorbox con certificado válido.
2. **Canje feliz.** Un ticket válido de API crea el dealer, crea el usuario, setea la cookie y
   redirige al onboarding. **Verificá en DevTools → Application → Cookies que la cookie quedó en
   `motorbox.apicrm.ai`.**
3. **Safari.** El punto 2 completo en Safari de escritorio **y en un iPhone real**. Este es el test
   que justifica toda la decisión del subdominio; no lo saltees ni lo hagas solo en el simulador.
4. **Replay.** El mismo ticket una segunda vez: rechazado.
5. **Vencido.** Un ticket de hace 3 minutos: rechazado.
6. **Segundo ingreso.** Con el onboarding terminado, entra directo al dashboard sin wizard.
7. **Sesión vencida.** Borrá la cookie con el iframe abierto y recargá: tiene que aparecer el spinner
   de renovación y volver solo, **sin mostrar nunca un login**.
8. **CTA.** El link de WhatsApp abre con el texto correcto y el marcador `[MB:...]` en la última línea.
9. **Listings.** `/api/partners/api-crm/listings/{code}` responde con la clave correcta y rechaza sin ella.
10. **Suspensión.** El webhook `company.suspended` despublica los avisos.
11. **Multimarca.** Con un `group_admin` de API que cambia de marca, llegan dos tickets con
    `company.id` distinto y se crean dos dealers separados, sin datos cruzados.

---

## 17. Qué NO hacer

- **No** implementes login/registro propio para concesionarias que vienen de API. La única puerta es el ticket.
- **No** guardes el JWT del ticket después de canjearlo. Consumilo y tiralo.
- **No** uses el email como llave de nada.
- **No** pises la vidriera editada por el dealer con datos de API.
- **No** hotlinkees el logo desde el storage de API.
- **No** muestres el login de Motorbox dentro del iframe, en ningún camino.
- **No** uses `postMessage(msg, "*")`.
- **No** agregues `Domain` a las cookies.
- **No** asumas que `whatsapp[]` viene con datos.
- **No** empieces por el onboarding bonito: primero que el canje funcione en Safari. Todo lo demás
  es CRUD; eso es lo único que puede obligar a rediseñar.

---

## 18. Orden sugerido de implementación

| Fase | Qué | Bloquea a |
|---|---|---|
| 0 | Alias DNS + dominio en Vercel | todo |
| 1 | `/api/sso/api-crm`: verificar, consumir `jti`, crear dealer + usuario, sesión, redirect | 2, 3 |
| 2 | Pull de perfil + `api_crm_snapshot` | 3 |
| 3 | Wizard de onboarding | — |
| 4 | Modo embebido: detección de host, CSP, `postMessage`, tema | — |
| 5 | Renovación de sesión (`need-ticket`) | — |
| 6 | CTA de WhatsApp con marcador + endpoint de listings | la atribución en API |
| 7 | Webhooks entrantes de API | — |
| 8 | Ingesta S2S de leads (apagada) + eventos de intención | — |

Las fases 1 y 6 son las que le dan valor real a la integración. Si el tiempo aprieta, 3 y 4 se
pueden entregar feos.
