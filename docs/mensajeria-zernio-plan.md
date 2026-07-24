# Mensajería omnicanal con Zernio — Plan de implementación

> Complementa `mensajeria-zernio-arquitectura.md`. Este documento baja el **qué hacer** (técnico)
> y el **qué implica** (no técnico) para que podamos leerlo y decidir si avanzamos.
> Estado: **propuesta**. Nada implementado.

## 0. Alcance del MVP (recordatorio)

- **Mercados:** español multi-país LATAM (AR/UY voseo · MX/CL/CO/PE y resto hispano tuteo). **Sin Brasil/portugués por ahora** (previsto, no construido).
- Inbox de **WhatsApp** (pool + claim, solo humanos).
- Ingesta automática de **Meta Lead Ads** con atribución de campaña.
- Cada concesionaria conecta **su propio WhatsApp** (Embedded Signup, coexistencia) y **su Facebook** (para Lead Ads).
- **Unificación de leads duplicados: revisión manual**; dueño al unificar: **el de mayor avance/venta**.
- **Plantillas: set estándar por idioma + propias por concesionaria** (aprobación de Meta por WABA).
- Instagram/Facebook **DM** quedan diseñados pero **fuera del MVP** (fase 2).

---

## 1. Plan técnico por fases

Cada fase es entregable e independiente. Estimaciones en "semanas-persona" (1 dev full-time), a ajustar.

### Fase 0 — Cimientos + unificación de duplicados (bloqueante, no toca Zernio) · ~2-3 sem

Sin esto, todo lo demás duplica leads y falla el dedup.

- [ ] Migración `companies.country` (ISO-2) + selección obligatoria en el alta de empresa.
- [ ] `libphonenumber-js` + `src/lib/phone.ts` (`normalizeE164(raw, company.country)`, región por defecto por empresa).
- [ ] Migración `leads.phone_e164` + índice `(company_id, phone_e164)` + `leads.merged_into_id`.
- [ ] Backfill de leads existentes a `phone_e164` (script idempotente, por lotes, por país de la empresa).
- [ ] Migrar `findReentryLead` y `findDuplicateLead` a `phone_e164`.
- [ ] **Módulo de unificación de duplicados (revisión manual):** detección por `(company, phone_e164)`, UI de grupos, merge transaccional con regla de dueño (mayor avance/venta), mover satélites, auditoría. (§6.11 arquitectura)
- [ ] Rate-limit distribuido (Postgres o Vercel KV) para reemplazar el in-memory de `forms/submit`.
- [ ] Migración `webhook_events` (dedup/idempotencia).
- [ ] `ZERNIO_API_KEY` + `ZERNIO_WEBHOOK_SECRET` en `env.ts` y `.env.example`.
- [ ] Tests unit del normalizador (casos por país: AR móvil/fijo/15, MX, CL, CO, con/sin código de país).

**Entregable:** teléfonos canónicos en todo el CRM + herramienta de unificación. Mejora el dedup **hoy**, aun sin mensajería.

### Fase 1 — Meta Lead Ads · ~1.5-2 sem

Mejor ratio valor/esfuerzo. No requiere WhatsApp ni inbox.

- [ ] Migración `lead_ad_forms` + RLS.
- [ ] `MessagingProvider` (interfaz) + `ZernioProvider` (esqueleto: auth, `parseWebhook`, `verifySignature`).
- [ ] Route handler `POST /api/webhooks/zernio` (verifica HMAC, dedup, ACK <5s, encola).
- [ ] Worker de procesamiento (patrón `leads-import/process`: claim con lock, `after()`, reintentos).
- [ ] Handler `lead.received` → mapea fields → lead (dedup por `leadgenId`), routing por `lead_ad_forms`, `auto_assign_lead` o pool.
- [ ] Cache de definiciones de formulario (`GET /v1/ads/lead-forms/{formId}`) para labels de opción múltiple.
- [ ] Connect flow de Facebook + UI de mapeo de formularios (admin) — análogo a `/admin/forms`.
- [ ] Registrar webhook global en Zernio (`POST /v1/webhooks/settings`).
- [ ] Notificación `lead_ad_received`. Badge de fuente/campaña en la ficha del lead.

**Entregable:** los Lead Ads de Meta entran solos, con atribución, y reemplazan el import manual con IA.

### Fase 2 — WhatsApp inbound + inbox (pool) · ~3-4 sem

El corazón del MVP.

- [ ] Migraciones `messaging_channels`, `conversations`, `messages`, `whatsapp_templates` + RLS.
- [ ] `companies.zernio_profile_id` + `ensureProfile()`.
- [ ] Onboarding: UI "Conectar WhatsApp" (admin) → connect flow → callback → upsert canal.
- [ ] Handlers de webhook: `message.received`, `conversation.started`, `account.connected/disconnected`, `whatsapp.template.status_updated`.
- [ ] Resolución de identidad (BSUID + E.164) y de lead (match/crear, sticky-seller).
- [ ] **Inbox UI** dentro de la app: lista de conversaciones (pool + asignadas), hilo de mensajes, composer.
- [ ] **Claim con lock** (`UPDATE ... WHERE assigned_user_id IS NULL`) + asignación del lead.
- [ ] **Supabase Realtime** para el inbox en vivo.
- [ ] Salud del canal (`number-info`) + estados (display name pendiente, desconectado).

**Entregable:** las concesionarias reciben WhatsApp en el CRM y los vendedores responden y toman conversaciones.

### Fase 3 — WhatsApp outbound + ventana 24h + templates · ~2-3 sem

- [ ] Composer con detección de ventana 24h (texto libre ↔ plantilla obligatoria).
- [ ] `sendMessage` / `sendTemplate` vía provider, con aislamiento de tenant (assert company_id).
- [ ] Estados de entrega (`sent/delivered/read/failed`) en la UI (tildes).
- [ ] Registro automático de actividad (`lead_notes activity_type='whatsapp'` → pipeline).
- [ ] **Módulo de plantillas**: editor de alta → envío a Meta → seguimiento de aprobación (PENDING/APPROVED/REJECTED) por webhook + motivo de rechazo + reeditar/reenviar.
- [ ] Set estándar por idioma (voseo AR/UY, tuteo MX/CL/CO/PE) creado en cada WABA al conectar; + plantillas propias por concesionaria.
- [ ] Envío de PDF de presupuesto (`/q/[token]`) por WhatsApp.
- [ ] Fallback `wa.me` para empresas sin canal (transición suave).
- [ ] Manejo de errores de envío (131026 / 131021 / 131047) en la UI.

**Entregable:** conversación bidireccional completa, con re-enganche por plantilla fuera de ventana.

### Fase 4 (post-MVP) — no incluida, diseñada

Instagram/Facebook DM en el inbox · CTWA ads + Conversions API (devolver ventas a Meta) · Broadcasts/sequences segmentadas · Bot/IA de primera respuesta y calificación · Analytics de tiempo de respuesta por canal.

### Total MVP estimado: **~9-12 semanas-persona** (Fases 0-3), sin contar QA/beta ni el onboarding del primer cliente.

---

## 2. Dependencias y orden

```
Fase 0 (cimientos) ─┬─► Fase 1 (Lead Ads)          ─┐
                    └─► Fase 2 (WA inbox) ─► Fase 3 ─┴─► Beta con 1 concesionaria piloto
```
Fase 1 y Fase 2 pueden ir en paralelo si hay 2 devs (comparten la Fase 0 y el webhook handler).

---

## 3. Qué implica NO técnicamente

Esto es lo que suele matar estos proyectos si no se planifica.

### 3.1 Requisitos de Meta por cada concesionaria (fricción real)

Para conectar WhatsApp API **cada** concesionaria necesita:
- Una **cuenta de Facebook Business Manager** (muchas no la tienen o la tiene "el sobrino").
- **WhatsApp Business** con un número (la mayoría ya lo tiene — bien).
- **Business Verification** de Meta para subir de tier (documentación de la empresa: CUIT, etc.).
- **Aprobación de display name** (1-3 días hábiles) — no se manda nada hasta que aprueban.
- **Método de pago en Meta** (tarjeta) para pagar los templates una vez agotado el free tier.
- Para Lead Ads: aceptar los **Lead Generation ToS** de Facebook una vez por Page.

**Implicancia:** el onboarding NO es "click y listo". Necesitás un **playbook de onboarding asistido** y probablemente acompañar a las primeras concesionarias en videollamada. Es soporte humano, no sólo software.

### 3.2 Coexistencia (mensaje a comunicar bien)

Las concesionarias siguen usando la app de WhatsApp Business en el celular **y** el CRM a la vez. Hay que explicar: qué se sincroniza, límites (20 msg/s, sin grupos por API), y que si desconectan lo hacen desde el teléfono.

### 3.3 Costos (quién paga qué)

| Concepto | Quién paga | Monto aprox. |
|---|---|---|
| Plan Zernio (cuentas conectadas) | **Vos** | ~$1-6/cuenta/mes graduado. 30 conces. × 2 cuentas (WA+FB) ≈ **$180/mes**; 100 × 2 ≈ **$1/cuenta** |
| Templates de WhatsApp (Meta) | **Cada concesionaria** (a su WABA) | Varía por país (ej. AR: ~$0,026 utility / ~$0,062 marketing). Entrantes y ventana 24h **gratis** |
| Desarrollo | **Vos** | ~9-12 sem-persona MVP |
| Onboarding/soporte | **Vos** | tiempo humano por cliente |

**Decisión comercial pendiente:** ¿le cobrás este feature a la concesionaria? ¿incluido en el plan? ¿extra por número? (§4).

### 3.4 Legal y compliance

- **Opt-in de marketing**: Meta exige consentimiento para mandar mensajes de marketing. Los leads de form web o Lead Ads necesitan capturar consentimiento (checkbox). Diseñar dónde.
- **Ventana 24h y WhatsApp Business Policy**: reglas de Meta que si se violan degradan el `quality_rating` o banean el número.
- **Datos personales (multi-país: Ley 25.326 AR, Ley 1581 CO, LFPDPPP MX, Ley 19.628 CL, Ley 29733 PE, etc.)**: guardar conversaciones = PII. Política de retención, derecho de acceso/borrado, DPA. Marco por país.
- **Términos y privacidad**: actualizar los del CRM para reflejar el procesamiento de mensajes y la subprocesadora (Zernio/Meta).

### 3.5 Operación continua

- Alguien monitorea `quality_rating`/tier y actúa ante `RED`/desconexiones.
- Gestión de templates por WABA (crear, resubir rechazados).
- Manejo del `402` global (billing de la plataforma) como incidente.
- Soporte a concesionarias (reconexión de token, dudas).

### 3.6 Riesgo de proveedor

- Zernio es un proveedor único para toda la mensajería. Mitigación ya prevista: **adaptador `MessagingProvider`** + **datos en tu Postgres** (no dependemos de su store). Antes de firmar conviene pedirles: entidad legal, SLA, DPA, exportación de datos, y evaluar a la empresa detrás con la misma lupa que a Kapso.
- Zernio arrastra naming legacy ("Late", `X-Late-*`) — producto reciente. Verificar madurez.

---

## 4. Decisiones abiertas (para resolver antes o durante)

**Ya resueltas (2 rondas):** routing pool+claim · solo humanos en el MVP · cada uno conecta su WhatsApp · MVP WhatsApp+Lead Ads · mercados español LATAM (sin Brasil) · duplicados por revisión manual · dueño al unificar = mayor avance/venta · plantillas set estándar + propias.

Siguen abiertas:

1. **Pricing a las concesionarias**: ¿incluido / extra por número / por volumen? Define márgenes. (Se puede construir agnóstico al cobro.)
2. **Realtime**: confirmar Supabase Realtime para el inbox (hoy sin usar). Costo/latencia.
3. **Contenido del set estándar por idioma**: qué plantillas exactas pre-aprobar (¿los 6 actuales adaptados a voseo/tuteo? ¿más?).
4. **Retención de mensajes**: ¿cuánto guardamos? ¿archivado? (impacta storage + legal).
5. **Consentimiento/opt-in**: dónde y cómo se captura (form, primera conversación).
6. **Quién onboardea el setup de Meta** de cada concesionaria (vos, ellos, un partner).
7. **Número por sucursal vs uno por concesionaria**: el schema soporta ambos; el pool se scopea si hay `branch_id` en el canal. ¿Alguna concesionaria multi-sucursal lo necesita?
8. **Backfill de historial** al conectar: ¿traemos conversaciones previas (coexistencia espeja hasta 6 meses) o arrancamos limpio?
9. **Piloto**: ¿con qué concesionaria (Salvador?) y con qué criterios de éxito medimos?
10. **Fase 2 (IG/FB DM)**: ¿cuándo? ¿algún cliente ya lo pide?
11. **Brasil / portugués**: cuándo se suma (agrega `pt_BR` en plantillas, UI y set estándar; el "9" de móviles ya lo cubre `libphonenumber-js`).

---

## 5. Criterios de éxito del MVP (propuestos)

- Una concesionaria piloto conecta su WhatsApp y su Facebook sin intervención de dev (con playbook).
- Un lead de WhatsApp entrante crea/linkea el lead correcto (sin duplicar) y aparece en el pool en < 5 s.
- Un vendedor toma la conversación y responde desde el CRM; el cliente recibe el mensaje; el estado de entrega se refleja.
- Un Lead Ad de Meta entra solo, con la campaña atribuida, y se auto-asigna según el mapeo.
- Cero leads duplicados por diferencias de formato de teléfono.

---

## 6. Qué NO estamos haciendo (para que quede explícito)

- No hay bot/IA en el MVP (solo humanos).
- No hay Instagram/Facebook **DM** en el inbox del MVP (sí Lead Ads de Meta).
- No hay broadcasts/sequences masivos en el MVP.
- No compramos números por default (cada uno trae el suyo).
- No usamos el inbox/store de Zernio como fuente de verdad.
- No tocamos el flujo `wa.me` de las empresas sin canal conectado.
