# Mensajería omnicanal con Zernio — Arquitectura

> Estado: **propuesta / diseño**. No implementado. Documento para revisión antes de avanzar.
> Fecha de análisis: julio 2026. Los contratos de API/webhook citados son los de la doc de Zernio
> al momento del análisis (`docs.zernio.com`, `llms-full.txt`) y deben **re-verificarse contra la doc
> viva al momento de implementar** — la API viene del producto antes llamado "Late" y arrastra
> aliases legacy (`X-Late-*`).

## 0. Decisiones tomadas (input del negocio)

Estas 4 decisiones fijan el diseño. Si cambian, cambia el núcleo.

| # | Decisión | Elegido | Implica |
|---|---|---|---|
| 1 | Routing de conversaciones entrantes | **Pool + el vendedor la toma** | No hay auto-asignación round-robin para mensajería. Entra a un pool, el vendedor reclama con lock. Excepción: si el teléfono ya es un lead asignado, la conversación va a su dueño (sticky-seller). |
| 2 | Primera respuesta | **Solo humanos en el MVP** | Sin bot/IA. Sin auto-respuesta. El vendedor responde desde el CRM. IA queda para fase posterior. |
| 3 | Modelo de WABA | **Cada concesionaria conecta el suyo** | Embedded Signup de Meta vía Zernio, con coexistencia (siguen usando la app en el celular). La concesionaria es dueña de su WABA y **le paga los templates a Meta directo**. Comprar número es secundario. |
| 4 | Alcance MVP | **WhatsApp + Meta Lead Ads** | Inbox de WhatsApp + ingesta automática de Lead Ads con atribución de campaña. Instagram/Facebook DM se diseñan desde el día 1 en el schema pero se activan en fase 2. |

### 0.1 Decisiones de la segunda ronda

| # | Tema | Elegido | Implica |
|---|---|---|---|
| 5 | Mercados / idiomas | **Español multi-país (AR/UY, MX, CL/CO/PE y resto hispano). Sin Brasil por ahora.** | Normalización con región por defecto **por empresa** (`companies.country`), no `AR` fija. Plantillas y set estándar con variante **voseo** (AR/UY) y **tuteo** (MX/CL/CO/PE). Portugués queda previsto para cuando se sume Brasil; no se construye ahora. |
| 6 | Duplicados existentes | **Revisión manual** | Módulo de detección + unificación confirmada por admin/manager. No auto-merge (ver §6.11). |
| 7 | Dueño al unificar | **El de mayor avance/venta** | Gana el lead más avanzado (o con presupuesto/venta); empate → última actividad más reciente. |
| 8 | Alta de plantillas | **Set estándar + propias** | La plataforma empuja un set base por idioma a cada WABA al conectar; cada concesionaria crea las suyas desde el módulo (ver §6.5). |

## 1. Principios de arquitectura

1. **Tu Postgres es la fuente de verdad.** Zernio es transporte: webhooks entran, API sale. Nunca dependemos del inbox/histórico de Zernio como store primario. Si Zernio desaparece, migramos la capa de transporte sin perder datos.
2. **Webhook-first, nunca polling.** Con N concesionarias el polling revienta el rate limit (600 req/min). Toda entrada es push.
3. **Todo detrás de un adaptador `MessagingProvider`.** Hoy sólo `ZernioProvider`. Mañana, si hace falta, se enchufa Kapso/Meta-directo sin tocar la UI ni el modelo de datos.
4. **Reusar el modelo existente del CRM.** Leads, vendedores, RLS, roles, `auto_assign_lead`, `lead_notes`, sticky-seller, `campaign_origin` — todo eso ya existe y se reutiliza. La mensajería es una capa nueva que *cuelga* del lead, no un CRM paralelo.
5. **Multi-tenant por `company_id` + RLS**, igual que el resto. Un `profile` de Zernio = una `company`.
6. **El ACK del webhook es sagrado: < 5 s.** Verificar firma → deduplicar → responder 200 → procesar asíncrono. Nunca procesar inline.

## 2. Mapa de conceptos Zernio ↔ CRM

```
Zernio Team           = toda la plataforma (una cuenta Zernio tuya, un billing)
Zernio Profile        = companies (una concesionaria)         → companies.zernio_profile_id
Zernio Account        = un canal conectado (WA / IG / FB Page) → messaging_channels.zernio_account_id
Zernio Contact        = leads (persona)                        → resuelto por teléfono E.164 / BSUID
Zernio Conversation   = conversations                         → conversations.zernio_conversation_id (OPACO)
Zernio Message        = messages                              → messages.zernio_message_id
```

Regla de oro de ruteo de webhooks (de la doc de Zernio):

| Familia de evento | Clave de tenant en el payload | Resolvés con |
|---|---|---|
| Inbox (`message.received`, `message.delivered`, …) | `account.id` | `messaging_channels.zernio_account_id → company_id` |
| Account (`account.connected/disconnected`) | `account.profileId` + `account.accountId` | `companies.zernio_profile_id` |
| Ads (`lead.received`, `ad.status_changed`) | `account.accountId` | `messaging_channels` (canal FB) → `company_id` |

## 3. Modelo de datos (nuevas tablas + extensiones)

### 3.1 Extensiones a tablas existentes

**`companies`**
```sql
alter table public.companies
  add column zernio_profile_id text unique,        -- id del profile en Zernio (creado on-demand)
  add column country text;                          -- ISO-2 (AR, UY, MX, CL, CO, PE, ...): región por defecto de normalización
```

**`leads`** — el cambio más importante de todo el proyecto (ver §9 Edge cases):
```sql
alter table public.leads
  add column phone_e164 text,                       -- teléfono canónico E.164 (multi-país), indexado
  add column merged_into_id uuid references public.leads(id) on delete set null;  -- si se unificó a otro lead
create index leads_company_phone_e164_idx
  on public.leads (company_id, phone_e164) where phone_e164 is not null;
```
`source`, `external_id`, `source_created_at`, `metadata jsonb`, `utm_*`, `campaign_id` ya existen y se reutilizan.
Los leads absorbidos por una unificación (§6.11) se marcan con `archived_at` + `merged_into_id`.

### 3.2 `messaging_channels` — un canal conectado por concesionaria

Análogo a `lead_capture_forms`, pero para mensajería. Es la entidad de configuración de cada número/cuenta.

```sql
create type public.channel_platform as enum ('whatsapp', 'instagram', 'facebook');
create type public.channel_status as enum ('connecting', 'active', 'disconnected', 'error');

create table public.messaging_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  zernio_account_id text not null unique,     -- clave de ruteo de TODOS los webhooks de inbox
  platform channel_platform not null,

  -- Identidad legible del canal
  external_ref text,                          -- WA: phone E.164 · IG: @handle · FB: page id
  display_name text,

  -- Routing OPCIONAL (para concesionarias con número por sucursal).
  -- Si es null → la conversación entra al pool general (decisión #1).
  -- Si está seteado → la conversación puede heredar branch/product_type/campaign.
  branch_id uuid references public.branches(id) on delete set null,
  product_type_id uuid references public.product_types(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,

  status channel_status not null default 'connecting',

  -- Salud (cache de GET /v1/whatsapp/number-info, refrescado por webhook o cron liviano)
  quality_rating text,                        -- GREEN | YELLOW | RED | UNKNOWN
  messaging_limit_tier text,                  -- TIER_250 | TIER_1K | ...
  name_status text,                           -- APPROVED | PENDING_REVIEW | DECLINED | ...
  health_checked_at timestamptz,

  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index messaging_channels_company_idx on public.messaging_channels (company_id);
```

### 3.3 `conversations`

```sql
create type public.conversation_status as enum ('open', 'snoozed', 'closed');

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel_id uuid not null references public.messaging_channels(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,     -- resuelto/creado al primer mensaje

  zernio_conversation_id text not null unique,   -- OPACO. Nunca parsear.
  platform channel_platform not null,

  -- Identidad del participante (ver §9: BSUID es el ancla, el teléfono puede venir null)
  participant_bsuid text,                        -- WhatsApp business-scoped user id (ancla primaria)
  participant_phone_e164 text,
  participant_handle text,                       -- IG username / etc.
  participant_name text,
  zernio_contact_id text,                        -- contactId ya resuelto por Zernio

  -- Asignación (decisión #1: pool + claim). null = en el pool.
  assigned_user_id uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,

  status conversation_status not null default 'open',

  -- Ventana de servicio de 24h de WhatsApp (crítico para el composer)
  window_expires_at timestamptz,

  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_message_preview text,
  unread_count int not null default 0,

  -- Atribución (CTWA / referral). Se copia al lead.
  attribution jsonb not null default '{}',       -- { ctwa_clid, ad_id, adset_id, campaign_id, ... }

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_company_status_idx on public.conversations (company_id, status);
create index conversations_pool_idx on public.conversations (company_id) where assigned_user_id is null;
create index conversations_assigned_idx on public.conversations (assigned_user_id);
create index conversations_lead_idx on public.conversations (lead_id);
```

### 3.4 `messages`

```sql
create type public.message_direction as enum ('inbound', 'outbound');
create type public.message_delivery as enum ('queued', 'sent', 'delivered', 'read', 'failed');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,

  zernio_message_id text unique,                 -- id de Zernio (idempotencia de entrada)
  platform_message_id text,                      -- wamid de Meta

  direction message_direction not null,
  sender_type text not null default 'contact',   -- contact | agent | system
  sent_by_user_id uuid references public.profiles(id) on delete set null,  -- qué vendedor lo mandó

  message_type text not null default 'text',     -- text|image|video|audio|document|location|template|interactive
  body text,
  attachments jsonb not null default '[]',        -- [{ type, url, name, mime }]
  template_name text,                             -- si es template
  reply_to_message_id uuid references public.messages(id) on delete set null,

  delivery_status message_delivery not null default 'queued',
  error_code text,
  error_detail text,

  platform_timestamp timestamptz,                -- hora del evento en la plataforma
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_delivery_idx on public.messages (delivery_status) where delivery_status in ('queued','sent');
```

### 3.5 `whatsapp_templates` — templates aprobados, **por WABA/canal**

Distinto de `message_templates` (que son snippets de texto para el composer in-window, sin aprobación de Meta). Un template de WhatsApp API vive en el WABA de **cada** concesionaria y **Meta lo aprueba individualmente**.

```sql
create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel_id uuid not null references public.messaging_channels(id) on delete cascade,

  zernio_template_name text not null,            -- name en Meta (minúsculas, snake_case)
  language text not null,                        -- por WABA/país: es_AR (voseo), es_MX / es_419 (tuteo), ...
  category text not null,                        -- UTILITY | MARKETING | AUTHENTICATION
  is_standard boolean not null default false,    -- true = del set estándar de la plataforma; false = propia de la concesionaria

  -- Ligado (opcional) a un message_template del CRM para reusar copy/variables
  source_message_template_id uuid references public.message_templates(id) on delete set null,
  body_preview text,                             -- cuerpo con {{1}} para mostrar en UI
  variables jsonb not null default '[]',         -- orden de variables: [{ pos:1, maps_to:'nombre' }, ...]

  status text not null default 'PENDING',        -- PENDING|APPROVED|REJECTED|PAUSED|DISABLED
  rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, zernio_template_name, language)
);
```

### 3.6 `webhook_events` — dedup, idempotencia y auditoría

```sql
create table public.webhook_events (
  event_id text primary key,                     -- payload.id / header X-Zernio-Event-Id
  provider text not null default 'zernio',
  event_type text not null,
  payload jsonb not null,
  status text not null default 'received',        -- received | processed | failed | skipped
  attempts int not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index webhook_events_status_idx on public.webhook_events (status) where status in ('received','failed');
```

### 3.7 `lead_ad_forms` — mapeo de formularios de Lead Ads a routing

Igual patrón que `lead_capture_forms`: cada formulario de Meta se mapea a sucursal/tipo/campaña.

```sql
create table public.lead_ad_forms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel_id uuid references public.messaging_channels(id) on delete set null,  -- canal FB

  meta_form_id text not null,                    -- formId de Meta
  form_name text,

  -- Routing heredado (si null → pool sin clasificar)
  branch_id uuid references public.branches(id) on delete set null,
  product_type_id uuid references public.product_types(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,

  field_map jsonb not null default '{}',          -- { meta_question_key: 'lead_field' }
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, meta_form_id)
);
```

### 3.8 Extensión de `notifications`

Reusar la tabla existente. Nuevos `type`: `wa_message_received`, `wa_message_pool`, `lead_ad_received`, `wa_delivery_failed`, `channel_disconnected`, `template_status_changed`. Categoría `leads` o nueva `messaging`.

## 4. RLS (reusa los helpers existentes)

- **`messaging_channels`**: SELECT super_admin (todo), admin/manager (su empresa/gerencia), sales (su empresa, read). Write: admin (empresa), manager (su gerencia).
- **`conversations`**: heredan visibilidad del lead cuando `lead_id` está seteado, con `exists (select 1 from public.leads l where l.id = conversation.lead_id)` — mismo patrón que `lead_notes`. Las conversaciones **en pool** (`assigned_user_id is null` y lead nuevo sin clasificar) son visibles a sales/managers de la empresa según scope de canal (§6.3).
- **`messages`**: vía `conversation → lead`.
- **`whatsapp_templates`**: admin/manager de la empresa; super_admin todo.
- **`lead_ad_forms`**: admin/manager de la empresa.
- **`webhook_events`**: sin políticas (solo service_role, como `notifications`).

Helpers reutilizados: `current_company_id()`, `current_role()`, `is_super_admin()`, `acting_manager_id()`, `current_user_product_type_ids()`.

## 5. La capa `MessagingProvider` (adaptador)

```ts
// src/lib/messaging/provider.ts
export interface MessagingProvider {
  // Onboarding
  ensureProfile(company: Company): Promise<string>;              // devuelve zernio_profile_id
  getConnectUrl(profileId: string, platform: Platform, redirectUrl: string): Promise<{ authUrl: string }>;
  getChannelHealth(accountId: string): Promise<ChannelHealth>;

  // Envío
  sendMessage(accountId: string, conversationId: string, msg: OutboundMessage): Promise<SendResult>;
  sendTemplate(accountId: string, to: string, template: TemplateSend): Promise<SendResult>;
  markRead(accountId: string, conversationId: string): Promise<void>;

  // Templates
  createTemplate(accountId: string, def: TemplateDef): Promise<{ name: string }>;
  listTemplates(accountId: string): Promise<TemplateStatus[]>;

  // Webhooks
  verifySignature(rawBody: string, signature: string): boolean;
  parseWebhook(payload: unknown): NormalizedEvent;               // normaliza al modelo del CRM
}
```

Toda la UI y los server actions hablan con la interfaz, no con Zernio. `ZernioProvider` la implementa. Los shapes crudos de Zernio (endpoints de §7) viven **sólo** dentro de `ZernioProvider`.

## 6. Flujos (todos, con edge cases)

### 6.1 Onboarding — la concesionaria conecta su WhatsApp

```
Admin concesionaria → Config → Canales → "Conectar WhatsApp"
  │
  ├─ (backend) ensureProfile(company): si companies.zernio_profile_id es null →
  │     POST /v1/profiles { name: company.id, description: company.name } → guardar id
  │
  ├─ (backend) GET /v1/connect/whatsapp?profileId=<id>&redirect_url=<APP>/settings/channels/callback
  │     → { authUrl }
  │
  ├─ redirect del browser del admin → Meta Embedded Signup
  │     → elige "conectar WABA existente" (coexistencia) o crear nuevo
  │
  ├─ vuelve a redirect_url con ?connected=whatsapp&accountId=...&profileId=...
  │     → upsert messaging_channels (status connecting→active)
  │
  ├─ (webhook, en paralelo) account.connected { accountId, profileId, platform, username }
  │     → confirma/crea el channel (idempotente con el redirect)
  │
  └─ (backend) GET /v1/whatsapp/number-info?accountId=... → guardar quality/tier/name_status
        → si name_status != APPROVED → UI: "WhatsApp conectado. Meta está aprobando el nombre
          (1-3 días hábiles). Todavía no se pueden enviar mensajes."
```

**Registro de webhooks**: es **global por team** (máx 10), no por concesionaria. Se configura una vez en el setup de la plataforma: `POST /v1/webhooks/settings` con la URL `<APP>/api/webhooks/zernio`, el `secret` (=`ZERNIO_WEBHOOK_SECRET`) y los eventos suscriptos.

**Edge cases:**
- **Display name no aprobado** → canal activo pero envío bloqueado. Mostrar estado, no dejar mandar.
- **Business no verificado** → algunas features (tiers altos, CTWA) fallan. Detectar por `number-info`.
- **"Display name only" en el signup** (número Meta-managed limitado) → advertir que NO lo elijan.
- **Coexistencia**: explicar que la app del celular sigue andando; límites (20 msg/s, sin grupos por API).
- **Error / abandono del flujo** → canal queda `connecting`; permitir reintentar; limpiar los stale.
- **Token expira / se desconecta** → `account.disconnected` (§6.9).

### 6.2 Inbound — llega un mensaje de WhatsApp

```
Zernio → POST /api/webhooks/zernio   (message.received)
  1. Leer raw body. Verificar HMAC X-Zernio-Signature (timing-safe). Inválido → 400.
  2. Dedup: INSERT webhook_events(event_id). Si conflicto (ya visto) → 200 y salir.
  3. Responder 200 YA (< 5s). Encolar procesamiento (after() / worker).
  4. Procesar:
     a. Resolver canal: account.id → messaging_channels → company_id. Si no existe → skip + log.
     b. Resolver identidad:
        - participant_bsuid = sender.businessScopedUserId          (ancla primaria)
        - phone = normalizeE164(sender.phoneNumber, company.country) (puede venir null; el wa_id ya es E.164)
     c. Resolver conversación:
        - si existe zernio_conversation_id → append.
        - si no → crear conversations; resolver/crear lead (paso d).
     d. Resolver/crear lead:
        - match por (company_id, phone_e164) o por bsuid guardado → lead existente.
          · si el lead está asignado y activo → conversation.assigned_user_id = su dueño (sticky).
        - sin match → crear lead nuevo (status new, source 'WhatsApp', sin asignar → POOL).
     e. Insertar message (inbound, con adjuntos/tipo).
     f. Atribución: si metadata.referral/ctwa_clid → guardar en conversation.attribution + lead.metadata
        + resolver campaign_id si es posible (§6.7).
     g. Setear window_expires_at = now + 24h. Bump last_inbound_at, unread_count.
     h. Notificar: si asignada → al dueño; si en pool → a sales/managers en scope ("nuevo lead WA sin asignar").
     i. Realtime: broadcast a los suscriptores del inbox (Supabase Realtime).
```

**Edge cases:**
- **Teléfono null (sólo BSUID)** → no se puede matchear por teléfono; matchear por `participant_bsuid`/`zernio_contact_id`. Guardar BSUID desde el día 1.
- **Normalización AR** (§9): `11 5555-1234`, `+54 9 11...`, `549115555...` deben colapsar al mismo E.164, si no se duplican leads.
- **Entrega duplicada / fuera de orden** (at-least-once): idempotencia por `event_id` y upsert por `zernio_message_id`. Un `delivered` puede llegar antes que su `received`.
- **Mensaje a un canal desconectado/borrado** → skip + log.
- **Media** (imagen, audio, ubicación, contacto): guardar en `attachments`; la URL de media de Zernio puede expirar → considerar rehospedar en Storage si se necesita persistencia larga.
- **El lead ya existe pero archivado** → linkear y reabrir (quitar `archived_at`) para que vuelva a las vistas.
- **Reingreso sticky-seller**: si el teléfono matchea un lead de otro vendedor, respeta al dueño (no re-pool).

### 6.3 El vendedor toma una conversación del pool (claim + lock)

```
Vendedor ve el pool (conversaciones con assigned_user_id null visibles en su scope)
  │
  ├─ click "Tomar"
  │
  ├─ (backend) claim atómico:
  │     UPDATE conversations SET assigned_user_id = :me, claimed_at = now()
  │     WHERE id = :id AND assigned_user_id IS NULL RETURNING id;
  │     → 0 filas = otro la tomó → "Ya la tomó {vendedor}".
  │
  ├─ asignar el LEAD al vendedor si estaba sin asignar (leads.assigned_user_id = :me,
  │     assigned_at = now()) → activa sticky-seller para el futuro.
  │
  └─ Realtime: sacar la conversación del pool de los demás.
```

**¿Quién ve el pool?** Reusa la visibilidad de leads. Default: sales/managers de la empresa ven las conversaciones sin asignar de su empresa. Si el canal tiene `branch_id`/`product_type_id` seteado, el pool se scopea a esa sucursal/tipo. Managers/admin pueden reasignar (reusa `reassignLead`). Se puede "liberar" (volver al pool).

**Edge cases:** dos claims simultáneos (lock resuelve); reasignación por manager; vendedor inactivo/desactivado con conversaciones asignadas → reasignar en cascada; conversación cerrada que recibe mensaje nuevo → reabrir.

### 6.4 Outbound — el vendedor responde

```
Composer dentro de la ficha del lead / vista de conversación
  │
  ├─ Chequear ventana 24h:
  │     window_expires_at > now → texto libre permitido.
  │     expirada → composer cambia a "elegir plantilla aprobada" (obligatorio).
  │
  ├─ Sólo el assigned_user_id puede escribir (composer bloqueado para el resto).
  │
  ├─ (backend, server action) resolver accountId del canal de la conversación.
  │     Validar channel.company_id == empresa del usuario (aislamiento de tenant, §8).
  │
  ├─ In-window:  POST /v1/inbox/conversations/{zernioConvId}/messages
  │                { accountId, message } (o attachmentUrl / interactive / buttons)
  │  Template:    POST /v1/inbox/conversations/{zernioConvId}/messages
  │                { accountId, template: { elements:[{ name, language, components:[...] }] } }
  │
  ├─ Insertar message (outbound, delivery_status queued→sent, sent_by_user_id).
  │     Bump last_outbound_at.
  │
  └─ Registrar actividad: lead_notes { activity_type: 'whatsapp' } → dispara last_contacted_at
        y el avance de status a 'contacted' (reusa lo existente).
```

**Edge cases:**
- **Ventana expira mientras escribe** → al enviar, error `131026` → forzar plantilla.
- **`131021`** número inválido / sin WhatsApp → mostrar al vendedor.
- **`131047`** rate → reintentar con backoff (worker).
- **Adjuntar PDF de presupuesto**: `attachmentUrl` con la URL de `/q/[token]` o `headerMedia` en template.
- **Envío falla después de aceptado** → webhook `message.failed` actualiza `delivery_status=failed` + `error_code`; notificar al vendedor.
- **Fallback wa.me**: si la empresa **no** tiene canal conectado, el composer mantiene el `wa.me` actual (transición suave, §10).

### 6.5 Templates de WhatsApp (por WABA)

**Problema:** cada concesionaria tiene su propio WABA → sus templates se aprueban por separado en Meta. No hay templates "globales" a nivel API de WhatsApp.

**MVP — módulo de plantillas (autoría "set estándar + propias", decisión #8):**
1. **Set estándar por idioma**: al conectar un canal, la plataforma crea un set base de templates en ese WABA vía `POST /v1/whatsapp/templates` (accountId), en el idioma del país de la concesionaria — variante **voseo** (AR/UY) o **tuteo** (MX/CL/CO/PE). Derivado de los `message_templates` globales. Se marcan `is_standard = true`.
2. **Propias**: cada concesionaria da de alta sus propias plantillas desde el módulo (editor → `POST /v1/whatsapp/templates` → seguimiento de aprobación). Se marcan `is_standard = false`.
3. Variables `{nombre}`/`{vehiculo}`/`{vendedor}` → `{{1}}`/`{{2}}`/… con `variables` (orden) en `whatsapp_templates`.
4. Estado de aprobación se sincroniza por webhook `whatsapp.template.status_updated` (no pollear). Rechazo → motivo visible en el módulo + reeditar/reenviar.
5. El vendedor sólo puede usar templates `APPROVED` para re-enganche fuera de ventana.
6. In-window sigue usando texto libre + los `message_templates` como snippets rápidos (sin Meta).

**Módulo (UI):** listado de plantillas por canal con su estado; editor (nombre, categoría, idioma, cuerpo con variables, botones); acción "enviar a aprobación"; badge de estado sincronizado por webhook; motivo de rechazo; reeditar y reenviar. Gestión: admin/manager de la empresa (las `is_standard` las gestiona el super_admin).

**Edge cases:** template rechazado por Meta → notificar admin + motivo; pendiente → no usable aún; idioma correcto por país (`es_AR` voseo vs `es_MX`/`es_419` tuteo); `132000` cantidad de parámetros no coincide.

### 6.6 Meta Lead Ads (segundo pilar del MVP)

```
Prerequisito: la concesionaria conecta su Facebook (Page) vía Zernio connect
              → messaging_channels (platform=facebook). Zernio es Meta Partner → sin App Review propio.

Admin mapea cada formulario de Lead Ads → branch/product_type/campaign en lead_ad_forms
  (igual que se mapea un lead_capture_form).

Zernio → POST /api/webhooks/zernio  (lead.received)
  1. Verificar HMAC. Dedup por event_id.
  2. Dedup de negocio por leadgenId → leads.external_id (índice parcial ya existe).
  3. Mapear fields → lead. Opción múltiple devuelve la CLAVE (k1) → cruzar con
     GET /v1/ads/lead-forms/{formId} para obtener labels (cachear la definición del form).
  4. Crear lead:
     - source = 'Meta Lead Ads'
     - external_id = leadgenId
     - metadata = { adId, adsetId, campaignId, formId, isOrganic }
     - phone_e164 = normalizeE164(phone, company.country)
     - routing: lead_ad_forms[formId] → branch/product_type/campaign
        · mapeado → auto_assign_lead (reusa round-robin)   ← Lead Ads SÍ auto-asigna
        · sin mapear → pool sin clasificar
  5. Notificar (lead_ad_received). Reemplaza el import manual de CSV con IA.
```

**Nota de alcance:** el MVP "WhatsApp + Lead Ads" implica que la concesionaria conecta **dos** cuentas (WhatsApp y Facebook). Onboarding debe contemplar ambas.

**Edge cases:** formulario sin mapear → pool; clave vs label; test leads (`POST .../test-leads`); creación de formularios NO es idempotente (en MVP sólo *leemos*, no creamos forms); teléfono AR sin normalizar.

### 6.7 Atribución de campaña ("saber de qué campaña viene")

| Origen del lead | Qué sabemos | De dónde |
|---|---|---|
| **Meta Lead Ads** | `adId`, `adsetId`, `campaignId`, `formId` | webhook `lead.received` |
| **Click-to-WhatsApp ad** | `ctwa_clid` + info del ad | `conversation.metadata` / `referral` del primer inbound |
| **Click-to-Messenger/IG ad** | `referral` | primer inbound |
| **DM orgánico** (te escriben de la nada) | **nada** — Meta no manda campaña | (esperado; cae a atribución manual/UTM) |
| **Form web propio** | `utm_*`, `landing_url`, `referrer` | ya existe |

Se persiste en el lead (`campaign_id` si se resuelve a una `campaigns` del CRM + `metadata` crudo) y se muestra en la ficha (reusa `tracking-card`). `campaign_origin` ya tiene `whatsapp`, `instagram`, `meta_ads`.

### 6.8 Estados de entrega y read receipts

`message.sent` → `sent` · `message.delivered` → `delivered` · `message.read` → `read` · `message.failed` → `failed` (+ error_code). El inbox muestra los tildes. Al abrir la conversación el vendedor, opcional `POST /v1/inbox/conversations/{id}/read` (manda tildes azules).

### 6.9 Desconexión / errores / reconexión

- **`account.disconnected`** { disconnectionType: intentional|unintentional, reason } → `messaging_channels.status = disconnected`. Si `unintentional` (token vencido) → notificar admin "Reconectá tu WhatsApp" + flujo de reconexión (re-`GET /v1/connect/...`).
- **`quality_rating = RED` o baja de tier** → alertar (riesgo de restricción de Meta).
- **`402 PAYMENT_REQUIRED`** de Zernio → billing de la plataforma suspendido, **afecta a TODOS los tenants** → alertar on-call, **no reintentar**.

### 6.10 Notificaciones y realtime

- **Notificaciones in-app**: reusa `notifications` + `notify()`. Nuevos tipos (§3.8).
- **Realtime del inbox**: la campanita actual es polling 25s — insuficiente para un chat. Se introduce **Supabase Realtime** (hoy sin usar) sobre `messages`/`conversations` para el inbox en vivo. La campanita puede seguir en polling.

### 6.11 Unificación de leads duplicados (merge) — revisión manual

La normalización a E.164 revela leads históricos con el mismo número. Decisión #6: **revisión manual** (no auto-merge). Decisión #7: el superviviente es el de **mayor avance/venta**.

```
Detección (batch inicial + al vuelo tras cada alta):
  agrupar leads no-archivados por (company_id, phone_e164) con > 1 lead → "grupo de duplicados"
  (email normalizado como señal secundaria)

UI de revisión (admin/manager):
  lista los grupos; por lead muestra dueño, estado, temperatura, última actividad, presupuestos/ventas
  el operador confirma "unificar" o descarta el grupo como falso positivo (números compartidos)

Al unificar (transacción única):
  1. Elegir lead superviviente por regla de dueño (decisión #7):
       mayor avance de pipeline (o con venta/presupuesto) → empate: última actividad más reciente
  2. Mover TODOS los satélites al superviviente:
       lead_vehicles, lead_notes, lead_tasks, visits, quotes, sales,
       lead_submissions, conversations, messages
  3. Consolidar campos del lead (quedarse con el valor no-nulo más completo/reciente)
  4. Marcar los leads absorbidos: archived_at + merged_into_id → superviviente
  5. Auditoría: quién unificó, qué se movió, cuándo
```

**Edge cases:** números compartidos (familia, mismo celular) → el operador descarta el grupo como falso positivo; conflicto de vendedor → regla de dueño + queda registrado y notificado; **nunca borrar** (mover, para no romper FKs); idempotencia (no re-unificar lo ya unido); un lead ya `merged_into_id` no reaparece en la detección.

## 7. Contratos Zernio usados (referencia rápida)

> Base: `https://zernio.com/api/v1` · Auth: `Authorization: Bearer sk_...` (server-only).
> Re-verificar contra la doc viva al implementar.

| Propósito | Método + path |
|---|---|
| Crear profile (tenant) | `POST /v1/profiles` |
| Connect WhatsApp | `GET /v1/connect/whatsapp?profileId&redirect_url[&headless=true]` |
| Connect Facebook (Lead Ads) | `GET /v1/connect/facebook?profileId&redirect_url` |
| Salud del número | `GET /v1/whatsapp/number-info?accountId` |
| Listar conversaciones | `GET /v1/inbox/conversations?profileId&platform&accountId&status&cursor` |
| Listar mensajes | `GET /v1/inbox/conversations/{id}/messages?accountId&cursor` |
| **Enviar mensaje** | `POST /v1/inbox/conversations/{id}/messages` (body `accountId` req) |
| Iniciar conv / template a número nuevo | `POST /v1/inbox/conversations` |
| Marcar leído | `POST /v1/inbox/conversations/{id}/read` |
| Crear template | `POST /v1/whatsapp/templates` |
| Leer definición de form de Lead Ads | `GET /v1/ads/lead-forms/{formId}` |
| Leads persistidos de Lead Ads (backfill) | `GET /v1/ads/leads?formId&since&cursor` |
| Registrar webhook (global) | `POST /v1/webhooks/settings` |

**Webhooks (entrada):**
- Endpoint único global: `POST <APP>/api/webhooks/zernio`.
- Firma: header `X-Zernio-Signature` = HMAC-SHA256 (hex, minúscula) del **raw body** con `ZERNIO_WEBHOOK_SECRET`. Comparación timing-safe.
- Dedup: `payload.id` = header `X-Zernio-Event-Id`. Semántica at-least-once.
- ACK: **2xx en < 5 s** o cuenta como fallo. Hasta 7 reintentos (backoff hasta ~51h) → dead-letter.
- Máx 10 endpoints por team.
- Eventos suscriptos (MVP): `message.received`, `message.sent`, `message.delivered`, `message.read`, `message.failed`, `conversation.started`, `account.connected`, `account.disconnected`, `whatsapp.template.status_updated`, `lead.received`.

**Errores:** envelope plano `{ error, type, code, param, docUrl }`. Ramificar por `code`/`type`, nunca por `error`. `429` con `Retry-After`.

## 8. Seguridad

1. **Secreto de webhook separado**: `ZERNIO_WEBHOOK_SECRET` ≠ `CRON_SECRET`.
2. **Verificación HMAC** obligatoria del raw body en `/api/webhooks/zernio`, timing-safe. Sin firma válida → 400.
3. **Aislamiento de tenant en el envío**: la doc advierte que `POST` valida `accountId` contra **todo tu team**, no contra el profile. Antes de cualquier envío, resolver `accountId` desde la conversación y **assert `channel.company_id == empresa del usuario`**. Opcional: API keys scoped por profile como defensa en profundidad.
4. **API key de Zernio server-only** (env), nunca al cliente. Todo envío pasa por server actions / route handlers.
5. **Rate limit distribuido**: el rate-limit in-memory actual (`forms/[slug]/submit`) no sirve en serverless. Mover a Postgres/KV para el webhook y los envíos.
6. **PII**: los mensajes son datos personales, con marco legal **por país** (Ley 25.326 AR, Ley 1581 CO, LFPDPPP MX, Ley 19.628 CL, Ley 29733 PE, etc.). RLS estricta + política de retención (§Plan). Consentimiento/opt-in para marketing.
7. **Idempotencia** en toda entrada (webhook_events) y en creación de leads (external_id).

## 9. Edge cases transversales (los que más duelen)

1. **🔴 Normalización de teléfonos multi-país (bloqueante, Fase 0).** `normalizePhone()` actual (`src/lib/leads.ts`) sólo deja `[\d+]`. Form web → `11 5555-1234`; WhatsApp → `5491155551234`; Lead Ads → `+54 9 11 5555-1234`. Son la misma persona y hoy crean **3 leads**. Cada país tiene su trampa (el "9"/"15" de AR, el "1" histórico de MX, el "9" de los móviles, etc.). Requiere `libphonenumber-js` con **región por defecto = `companies.country`** (no fija), columna `phone_e164` indexada, backfill de leads existentes, y `findReentryLead`/`findDuplicateLead` migrados a esa columna. **Sin esto, el sticky-seller y el dedup no matchean contra WhatsApp.**
2. **🔴 Identidad BSUID.** Desde abril 2026 el `phoneNumber` puede venir `null`. Ancla primaria = `businessScopedUserId`. Guardarlo desde el día 1.
3. **🟠 Ventana 24h.** Countdown visible en el composer; cambio automático a plantilla al expirar.
4. **🟠 Colisión de vendedores** en número compartido → claim con lock + composer bloqueado para no-dueños.
5. **🟠 TIER_250 al arranque** (250 contactos únicos/día). No se puede reactivar 2.000 fríos el día 1. Monitorear `number-info`.
6. **🟠 Display name** 1-3 días → onboarding no termina el mismo día.
7. **🟡 ACK < 5 s** → verificar+dedup+200, procesar en `after()`/worker.
8. **🟡 Aislamiento de tenant en envío** (§8.3).
9. **🟡 Opción múltiple de Lead Ads** devuelve clave, no label.
10. **🟡 Media que expira** → rehospedar si se necesita.

## 10. Convivencia con el flujo `wa.me` actual

Hoy: "Enviar por WhatsApp" abre `wa.me` en el celular del vendedor y registra una nota. Transición:
- Empresa **sin** canal conectado → sigue el `wa.me` actual (0 cambios).
- Empresa **con** canal conectado → el composer del CRM usa la API; el `wa.me` se oculta o queda como fallback.
- Los `message_templates` globales siguen sirviendo para `wa.me` y para snippets in-window.
- Migración gradual, sin big-bang. Ninguna concesionaria pierde funcionalidad durante el rollout.

## 11. Lo que Zernio NO da y resolvemos nosotros (recordatorio)

Ya cubierto por tu CRM, no es gap: **asignación a vendedor** (leads.assigned_user_id + claim), **notas** (lead_notes), **estados/pipeline** (lead_status), **tags/temperatura**. Sí construimos: **inbox multicanal en la app**, **claim con lock**, **atribución al lead**, **normalización E.164**, **índice inverso external_id↔contactId**, **opt-in/consentimiento**.
