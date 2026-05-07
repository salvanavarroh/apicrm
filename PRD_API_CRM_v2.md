# PRD — API: CRM para Concesionarios

**Versión 2.0** · 30 de abril de 2026 · Cliente: Salvador Concesionarios · Equipo: PM, Bianca (UX), Lucas (Dev)

---

## 1. Resumen ejecutivo

API es un CRM SaaS multi-tenant para concesionarios de autos. Centraliza captación, gestión y conversión de leads en una plataforma operativa para equipos de venta de 0km, usados, planes de ahorro y otros formatos.

**MVP:** 1 concesionario piloto (Salvador), multi-sucursal. Plazo: 10 sprints (8 dev + 2 QA). Stack: Next.js 15 + Supabase + Vercel + Resend. Equipo: 3 personas.

**Incluye:** captura multi-canal de leads (manual, CSV, Proveedor de Datos), asignación auto/manual por gerencia, pipeline visual, presupuestos PDF, validación de ventas con triple check, dashboards por rol, multi-tenancy real, facturación interna, alertas de morosidad.

**Fase 2 (no MVP):** integraciones automáticas con Meta/Google Ads, IA aplicada (transcripción, scoring, copiloto), WhatsApp Business API, importación inteligente con IA, plantillas editables, sistema de referidos, chat interno.

---

## 2. Glosario

| Término | Definición |
|---|---|
| Empresa | Cuenta principal. Concesionario contratante. Puede tener N sucursales. |
| Sucursal | Unidad operativa de una empresa con sus propios equipos. |
| Gerencia | Sucursal + Tipo de Producto + Gerente. Unidad de organización del equipo. |
| Tipo de Producto | Categoría comercial (0km, usados, planes). Por empresa, habilitable por sucursal. |
| Campaña | Origen específico de leads (ej: "Meta Ads Marzo 2026"). Asociada a un origen general. |
| Lead | Persona interesada en un vehículo. |
| Submission | Cada vez que un lead vuelve a aparecer (mismo tel/email). |
| Venta | Entidad que se crea cuando un lead presupuestado avanza al cierre. Tiene su propio ciclo. |
| Snapshot de comisión | % de comisión congelado al aprobar la venta. |
| Capability | Permiso atómico (ej: `sales:approve`). |
| RLS | Row Level Security de Postgres. Aísla datos entre empresas. |

---

## 3. Roles y modelo organizacional

```
Plataforma → SuperAdmin
   └── Empresa
       ├── Admin (1 o N) · Proveedor de Datos (1+, externo)
       └── Sucursal (1+)
           └── Gerencia (1+ por sucursal)
               ├── Gerente (1, con 1+ tipos de producto)
               └── Vendedor (1+, con tipos del Gerente)
```

| Rol | Scope | Función principal |
|---|---|---|
| SuperAdmin | Plataforma | Empresas, admins, facturación, suspensión |
| Admin | Empresa completa | Aprobar ventas, ABM total, datos operativos. Múltiples por empresa. |
| Gerente | Sucursal + tipos asignados | Asignar leads, ABM Vendedores, reportes de su gerencia |
| Vendedor | Sucursal + tipos asignados | Gestionar sus leads, presupuestar, iniciar venta |
| Proveedor de Datos | Empresa (acceso acotado) | Cargar y editar leads (solo los suyos en estado ≤Asignado) |

**Reglas duras:**
- Datos legales de la empresa: solo SuperAdmin edita.
- No se puede dar de baja último Admin/Gerente sin reemplazo.
- Usuario no puede eliminar su propia cuenta.
- Gerente no gestiona Admins ni otros Gerentes.

---

## 4. Matriz de permisos

| Módulo | SuperAdmin | Admin | Gerente | Vendedor | Prov. Datos |
|---|---|---|---|---|---|
| Empresas / Admins / Facturación plataforma | Total | — | — | — | — |
| Mi Empresa (legal) | Editar | Solo ver | — | — | — |
| Mi Empresa (operativo) | Editar | Editar | — | — | — |
| Sucursales / Tipos producto | — | ABM | Solo ver suyos | — | — |
| Campañas | — | ABM | Solo ver suyas | — | — |
| Lista de Precios | — | ABM + import/export | Ver | Ver | — |
| ABM Admins | Total | Total (en su empresa) | — | — | — |
| ABM Gerentes / Prov. Datos | — | ABM | — | — | — |
| ABM Vendedores | — | ABM | ABM su gerencia | — | — |
| Carga de Leads | — | Sí | Sí (su tipo) | — | Sí |
| Clasificar pool sin clasificar | — | Sí | — | — | Sí |
| Asignación de Leads | — | Total (backup) | Su gerencia | — | — |
| Editar Lead | — | Solo ver | Solo ver suyos | Sus leads | Sus cargas (≤Asignado) |
| Generar Presupuesto / Iniciar Venta | — | — | — | Sí | — |
| Validar Ventas | — | Sí | — | — | — |
| Historial Ventas | — | Todas | Su gerencia | Suyas | — |
| Dashboard | Globales | Empresa | Su gerencia | Personal | — |
| Mi Perfil | Sí | Sí | Sí | Sí | Sí |

---

## 5. Estados del Lead y de la Venta

**Lead (5 estados, mueve el Vendedor con saltos libres hacia adelante):**

```
Nuevo → Contactado → Interesado → Presupuestado
                                       │
                                       ▼  (Vendedor inicia Venta)
                               [se crea Venta]
No Interesado: aplicable desde cualquier estado, terminal pero recuperable
```

**Venta (3 estados, se crea cuando el Vendedor inicia venta desde lead Presupuestado):**

```
Evaluando Scoring → Aceptada (Vendido) ✓
                  → Rechazada ✗  (puede reintentarse: nueva Venta)
```

**Reglas duras:**
- "Presupuestado" se setea automático al generar PDF.
- Para iniciar Venta, lead debe estar Presupuestado (mínimo 1 cotización generada).
- "Aceptada" / "Rechazada" solo las setea el Admin.
- Una Venta rechazada no impide crear una nueva Venta para el mismo lead.

**Kanban del Vendedor (6 columnas):** Nuevo / Contactado / Interesado / Presupuestado / Venta en Curso / Cerrado (con badge: Vendido / Rechazado / No interesado).

---

## 6. Módulos del MVP

### 6.1 Onboarding e invitaciones
Flujo común a Admin, Gerente, Vendedor, Proveedor. Email con token (24h), reset password, T&C obligatorios. Estado pasa de Pendiente a Activo al aceptar. **Sprint:** 1.

### 6.2 Gestión de Empresas (SuperAdmin)
Alta en 2 pasos (datos empresa + Admin inicial). Estados: Pendiente / Activa / Suspendida. Toggle Suspender/Reactivar (no baja física). Listado con filtros. Atributos: nombre, logo, dirección, CUIT, razón social, teléfono, precio mensual, fecha de vencimiento. **Sprint:** 1.

### 6.3 Facturación interna (SuperAdmin)
Cron mensual genera pagos automáticos (vencimiento +30 días). Email automático al Admin al vencer. Banner in-app a partir de día +15 (visible para todos los roles, con detalle para Admin, genérico para los demás). Marcado manual como pagado. Cron sigue generando aunque la empresa esté suspendida. **Sprint:** 2.

### 6.4 Configuración de empresa (Admin)
Datos legales en lectura, datos operativos editables (logo, contacto). Solicitud de cambio de datos legales se notifica al SuperAdmin. **Sprint:** 2.

### 6.5 Tipos de Producto (Admin)
ABM por empresa. Cada tipo se habilita en 1+ sucursales. Gerente solo ve los suyos. **Sprint:** 2.

### 6.6 Sucursales (Admin)
ABM básico. Si hay 1 sola sucursal queda preseleccionada en otros formularios. Solicitud de baja se notifica al SuperAdmin. **Sprint:** 2.

### 6.7 Campañas (Admin)
ABM con atributos: nombre, origen general (Meta Ads / Google Ads / WhatsApp / Mostrador / Referido / Web / Email / Otros), tipo de producto y sucursal opcionales. Estado Activa / Inactiva. Las campañas se seleccionan al cargar leads. **Sprint:** 2.

### 6.8 ABM de Usuarios
Admin gestiona Gerentes, otros Admins, Proveedores de Datos. Gerente gestiona sus Vendedores con % de comisión + condiciones libres + tipos de producto (subset de los suyos). Estados: Pendiente / Activo / Inactivo / Eliminado. **Sprint:** 3.

### 6.9 Lista de Precios
ABM manual del Admin + import/export Excel. Gerente y Vendedor solo lectura. Lista referencial: el Vendedor ingresa precios manualmente al cotizar. Por empresa (no por sucursal en MVP). **Sprint:** 6.

### 6.10 Captura de Leads
- **Carga manual:** form completo con campos del lead (datos cliente, vehículo, comerciales, campaña, sucursal, tipo de producto). Validación de duplicados por tel/email con alerta (sin auto-merge).
- **Carga masiva CSV:** subida → mapeo de columnas → preview EDITABLE de todas las filas → validaciones inline → confirmación. Cambios en preview se mantienen solo en el front hasta confirmar. Warning al navegar fuera con cambios sin guardar.
- **Pool sin clasificar:** leads sin tipo o sucursal quedan visibles para Admin y Proveedor para clasificación.
- **Mis cargas (Proveedor):** listado de leads cargados por él, editables si están en estado ≤Asignado.

**Sprint:** 4.

### 6.11 Asignación de Leads
Toggle "asignación automática" por gerencia (sucursal + tipo + gerente). Si on: round-robin entre vendedores activos de esa gerencia. Si off: lead queda en "Sin Asignar" del Home del Gerente. Admin asigna como backup. Match por tipo de producto + sucursal del lead. **Sprint:** 5.

### 6.12 Gestión del Lead (Vendedor)
Vista Kanban (6 columnas) y Tabla. Drag & drop para mover entre columnas. Filtros: búsqueda, rango de fecha, estado, vendedor (Gerente/Admin), sucursal, tipo de producto.

**Detalle del lead (3 variantes según rol):**
- **Vendedor:** form de cotización in-place + sidebar derecho (Resumen + Acciones de envío + Notas Internas).
- **Admin / Gerente:** lectura + botón "Reasignar" + bloques de Notas y Tareas en cards 2 columnas.

Notas con timestamp y autor, Tareas con prioridad (Alta/Media/Baja) y vencimiento. **Sprint:** 5.

### 6.13 Plantillas de mensajes
6 plantillas hardcoded: Primer contacto, Recordatorio, Post-presupuesto, Cierre suave, Recuperar lead frío, Visita/Test drive.

Placeholders: `{nombre}`, `{nombre_completo}`, `{vendedor}`, `{vehiculo}`, `{concesionaria}`, `{telefono_concesionaria}`.

Modal en detalle del lead con acciones "Enviar por WhatsApp" (abre wa.me) y "Copiar". Tono "vos" argentino. Textos completos en anexo. **Sprint:** 5.

### 6.14 Generación de presupuestos
3 modalidades: Contado, Financiado, Plan de Ahorro. Modificadores aplicables: descuento, auto usado en parte de pago. Resumen aritmético: precio base − descuento − auto usado = total.

Datos del cliente y vehículo pre-cargados desde lead, editables (caso comprador distinto). Botones: "Vista Previa" (modal con PDF preview, sin persistir) y "Generar Cotización" (persiste, guarda en Storage, cambia estado a Presupuestado).

Envío por WhatsApp (link wa.me con texto + URL del PDF), Email (Resend), Descarga local. Histórico visible en detalle del lead. Validez por defecto: 7 días.

**Atributos por modalidad (primera versión, validar con cliente):**
- **Contado:** precio base, descuento, auto usado, total.
- **Financiado:** + anticipo, monto a financiar, cuotas, TNA, CFT, valor cuota.
- **Plan de ahorro:** + nombre del plan, cuotas totales, cuota inicial, valor cuota actual, gastos administrativos.

**Sprint:** 6.

### 6.15 Iniciar y Validar Ventas
Vendedor inicia Venta desde lead Presupuestado → se crea registro Sales en estado Evaluando.

Admin entra a cola de validación, ve detalle de la venta (lead + presupuesto + vendedor + monto). Marca 3 checks: **Scoring, Documentación, Pago.** Cada check tiene textarea de observaciones opcional. Aprobación requiere los 3 checks. Rechazo requiere comentario obligatorio (mín 10 caracteres).

Aprobada → se guarda `commission_percent_snapshot` con el % vigente del vendedor. Rechazada → puede reintentarse con nueva Venta. **Sprint:** 7.

### 6.16 Reportes y Dashboards
- **Vendedor:** ventas del mes, ganancia (ventas × precio × % comisión snapshot), leads activos, leads nuevos, tareas del día.
- **Gerente:** pipeline visual, resultados por campaña, leads inactivos +X días, métricas por vendedor (asignados, cerrados, tasa contacto, gestionados).
- **Admin:** estados con semáforo (verde/amarillo/rojo según tiempo sin gestión), conversión del mes, ventas pendientes de aprobar.
- **SuperAdmin:** totales globales (empresas, sucursales, usuarios por rol, ventas totales).

Filtros temporales: mes actual / anterior / trimestre / custom. **Sprints:** 7-8.

### 6.17 Mi Perfil
Edición de datos básicos (nombre, apellido, teléfono), cambio de contraseña. Email no editable. Rol/sucursal/tipos los gestionan superiores. **Sprints:** 1 base, 8 completo.

---

## 7. Modelo de datos (alto nivel)

```
companies → users / branches / product_types / campaigns / subscription_payments /
            leads → lead_submissions / lead_notes / lead_tasks / quotes → quote_items / sales
```

**Entidades clave:**
- **companies:** nombre, datos legales/operativos, monthly_price, status (pending/active/suspended), subscription_ends_at.
- **users:** email, role, branch_id, commission_percent (Vendedores), commission_conditions, status.
- **product_types** + **branch_product_types** (M:N) + **user_product_types** (M:N).
- **campaigns:** name, origin (enum), product_type_id?, branch_id?, status.
- **leads:** datos cliente + vehículo + comercial + asignación. Campos: first/last_name, email, phone, city, vehicle_model, vehicle_version, preferred_color, budget_min/max, has_used_car, used_car_description, declared_payment_method, campaign_id, branch_id, product_type_id, assigned_user_id, status.
- **lead_submissions:** histórico de cargas duplicadas (data_snapshot JSON).
- **quotes** + **quote_items** (polimórfica: precio_base / descuento / auto_usado / cuota_inicial / etc).
- **sales:** lead_id, quote_id, vendor_id, status, commission_percent_snapshot, final_price, scoring_check + scoring_comment, documentation_check + documentation_comment, payment_check + payment_comment, general_comment, rejection_reason, started_at, resolved_at, resolved_by.

**Multi-tenancy:** toda tabla operativa con `company_id` + RLS de Postgres filtrando por sesión. Auditoría de aislamiento es criterio de "done" del Sprint 1.

---

## 8. Stack técnico

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + TanStack Query + React Hook Form + Zod + @dnd-kit/core.
- **Backend:** Server Actions (default) + Route Handlers solo para webhooks/cron + Supabase Postgres con RLS + cliente supabase-js (sin Prisma) + tipos generados con `supabase gen types`.
- **Servicios:** Supabase Auth + Storage + Vercel + Vercel Cron + Resend + Sentry.
- **Tests:** Playwright E2E desde Sprint 1.
- **PDFs:** @react-pdf/renderer. **Excel/CSV:** xlsx + papaparse.
- **No-funcionales:** responsive en todos los roles, RLS auditado, HTTPS, accesibilidad WCAG AA básica.

---

## 9. Pre-Sprint 0: Cuentas a pedir al cliente

Antes de arrancar dev, el cliente debe crear las cuentas en su nombre (no en cuenta de Cambalache). Esto asegura propiedad total.

| Servicio | Plan | Costo dev / prod | Qué pedir |
|---|---|---|---|
| GitHub | Free | $0 / $0 | Crear Org, repo privado, invitar equipo |
| Vercel | Hobby / Pro | $0 / $20-25 | Crear Team, conectar a GitHub, invitar equipo |
| Supabase | Free / Pro | $0 / $25 | Crear Org + proyecto, región São Paulo, invitar a Lucas como Owner |
| Resend | Free / Pro | $0 / $0-20 | Crear cuenta, verificar dominio (DNS), invitar equipo |
| Sentry | Developer | $0 / $0-26 | Crear Org + proyecto Next.js, invitar equipo |
| Dominio | — | ~$1/mes | Comprar o usar subdominio, dar acceso DNS |

**Total estimado:** ~$1/mes en desarrollo, ~$70-90/mes en producción.

**Checklist Lucas antes de Sprint 0:** acceso confirmado a las 6 cuentas, dominio con SSL funcional, env vars en local. Sin esto no se arranca Sprint 0.

---

## 10. Roadmap (10 sprints)

| Sprint | Entregable principal | Demo cierre |
|---|---|---|
| 0 | Setup repo, Vercel, Supabase, Resend, Sentry conectados | "Hello world" en URL prod |
| 1 | Auth + RLS + SuperAdmin (Empresas + Admins) | SuperAdmin crea empresa → Admin acepta invitación |
| 2 | Facturación + Banner morosidad + Configuración Admin (Sucursales + Tipos + Campañas + Mi Empresa) | Admin configura empresa completa |
| 3 | ABM completo de usuarios (Gerentes + Vendedores + Prov. Datos) + Toggle asignación auto | Jerarquía completa armada, todos invitados |
| 4 | Captura de leads (manual + CSV editable + Pool sin clasificar + Mis cargas Prov.) | Proveedor sube CSV, Admin clasifica pendientes |
| 5 | Asignación + Pipeline Vendedor (Kanban + Detalle + Plantillas + Notas + Tareas) | Lead nuevo → asignado → contactado → presupuestado |
| 6 | Lista de Precios + Presupuestos (3 modalidades + envío) | Vendedor genera presupuesto y lo envía |
| 7 | Iniciar/Validar Ventas + Dashboards Vendedor y Gerente | Ciclo completo lead → venta → aprobada |
| 8 | Dashboards Admin/SuperAdmin + Mi Perfil + Empty/Loading/Error states | Walkthrough completo 5 roles |
| 9 | QA full + Bugfix + Mobile responsive + Auditoría RLS | Walkthrough con script QA, lista bugs cero críticos |
| 10 | Lanzamiento prod + Capacitación cliente + Onboarding piloto | Concesionario operando en producción |

**Definición de "done" por sprint:** user stories cumplidas + tests E2E del flujo nuevo pasando + responsive validado + RLS sin fugas + 0 bugs críticos + demo grabada + PR aprobado por PM.

---

## 11. QA y testing

**Tests automatizados (Playwright, desde Sprint 1):**

Cobertura mínima: login + reset, invitación + aceptación, alta empresa + Admin, configuración inicial Admin, carga lead manual + CSV, asignación auto + manual, cambio de estados (drag & drop), generación presupuesto + envío, iniciar Venta, validar Venta (aprobar + rechazar), suspensión + banner.

**Test plan por rol (manual + automatizado):**
- **SuperAdmin:** alta empresa, suspensión, marcado de pago, métricas.
- **Admin:** configuración inicial completa, ABM Gerentes, validación venta (aprobar y rechazar con observaciones por check), ver datos legales en lectura.
- **Gerente:** ABM Vendedores con scope, asignación auto y manual, dashboard de su gerencia.
- **Vendedor:** pipeline completo (drag), detalle del lead, generar presupuesto (3 modalidades), iniciar venta, dashboard personal.
- **Prov. Datos:** alta individual, alta CSV con preview editable, edición de leads en estado ≤Asignado.

**Casos críticos (no pueden romperse):**
1. Aislamiento RLS: usuario de empresa A nunca ve datos de B.
2. Round-robin balanceado: 100 leads / 5 vendedores → 20 cada uno.
3. Snapshot de comisión: cambiar % del vendedor no afecta ventas anteriores.
4. Estado del lead "Presupuestado" se setea automático al generar PDF.
5. Cron de pagos genera correctamente el mes siguiente.
6. Banner de morosidad muestra mensaje correcto según rol.
7. Detección de duplicados al cargar (sin auto-merge).
8. Proveedor no puede editar lead en estado >Asignado.
9. Campos del Admin con datos legales en read-only.
10. Reintentar Venta tras rechazo (nueva Venta para mismo lead).

**Smoke tests al cierre de cada sprint:** 5-10 minutos automatizados validando los flujos críticos hasta ese punto. No mergea a main si fallan.

**Auditoría de seguridad (Sprint 9):** revisión manual de RLS, validación de inputs server-side, rate limiting básico, expiración de tokens, sanitización de campos ricos.

**UAT (User Acceptance Testing) Sprint 10:** cliente recorre los 5 roles con script provisto. Firma aceptación al cumplir checklist.

---

## 12. Comunicación con cliente

**Demos semanales:** 30-45 min al cierre de cada sprint, vía Google Meet. Conduce el PM. Lucas y Bianca presentes para responder. Se graba la demo.

**Formato de demo:**
1. Recap del sprint (5 min): qué se prometió y qué se entregó.
2. Walkthrough en URL preview (15-20 min): el cliente toca el sistema.
3. Validación de criterios (5 min): checklist en vivo.
4. Próximo sprint (5 min): qué viene, qué se necesita del cliente.

**Canal de comunicación:** definir entre Slack compartido / WhatsApp / Email. Una sola persona del lado cliente como interlocutor único.

**Reportes intermedios:** changelog escrito al cierre de cada sprint con qué se agregó, qué cambió, qué se sacó. Acceso permanente a URL preview con datos seed.

---

## 13. Gestión de cambios

Cualquier pedido del cliente fuera del PRD durante el desarrollo se evalúa con esta lógica:

1. **Triage del PM (24h):** clasificar pedido como (a) clarificación de algo ya en PRD, (b) bug, (c) cambio de scope nuevo.
2. Si es (a) o (b): se incluye en sprint actual sin afectar plazos.
3. Si es (c): se evalúa impacto en horas. Tres opciones:
   - **Pequeño (<4h):** se agrega al sprint actual sin afectar entregables.
   - **Mediano (4-16h):** se agrega a Fase 2 o se cambia algo del scope MVP existente para hacerle lugar (decisión cliente + PM).
   - **Grande (>16h):** se agrega obligatoriamente a Fase 2 con presupuesto separado, no se permite intercambio.

Todo cambio aprobado se registra en un changelog de cambios al PRD que el cliente firma al cierre.

---

## 14. Decisiones tomadas vs flujos originales

| Cambio | Original | Nuevo |
|---|---|---|
| Stack | Bubble.io | Next.js + Supabase + Vercel |
| Roles | 6 (Gerente General + Gerente Ventas) | 5 (Gerente unificado por tipo) |
| Datos legales empresa | Admin editaba | Solo SuperAdmin |
| Asignación de leads | No detallado | Por gerencia (sucursal + tipo + gerente) |
| Plantillas de mensajes | ABM editable | Hardcoded por sistema en MVP |
| WhatsApp | Multi-canal Fase 1 | Solo wa.me en MVP |
| Modalidades presupuesto | 4 excluyentes | 3 modalidades + modificadores |
| Estados | Mezclados | Separados: Lead (5) + Venta (3) |
| Detección duplicados | No estaba | Alerta + opción cargar igual |
| Suspensión empresa | Bloqueo total | Banner según rol, sigue operativa |
| Captura lead manual | Solo Prov. Datos | Admin + Gerente + Prov. Datos |
| Mobile responsive | No detallado | Todos los roles |
| Múltiples Admins | No claro | Sí, N Admins por empresa |
| Edición Prov. Datos | Solo lectura | Editable en sus cargas, scope ≤Asignado |
| Campañas | No estaba | Módulo nuevo con orígenes asociados |
| Validación Ventas | 3 checks simples | + comentarios opcionales por check |

---

## 15. Pendientes y dependencias

**Para validar con cliente Salvador (mail consolidado):**
1. Atributos exactos de presupuesto por modalidad (TNA, CFT, planes de ahorro que maneja).
2. CSV real del piloto para validar template oficial.
3. T&C: validación legal por abogado.
4. Lista de orígenes de campañas habituales.
5. Tono "vos" o "usted" en plantillas.
6. ¿Comercial se contacta auto o manual ante morosidad?
7. ¿Campaña obligatoria al cargar lead?
8. ¿Proveedor ve lista de campañas activas para seleccionar?

**Para Bianca (resolver por sprint):**
- UX2 (mobile en Figma), UX4 (sidebar SuperAdmin), UX5 (toasts vs feedback), UX6 (visualización semáforo), UX7 (sticky sidebar Vendedor), UX8 (Vista Previa modal o pantalla), UX9 (UI agregar nota), UX10 (Tareas en sidebar Vendedor), UX11 (Historial de estados o solo Notas), UX12 (confirmar prioridades A/M/B), UX13 (diseño ABM Campañas), UX14 (campos editables Prov. en lead).

**Para el equipo:**
- E1: herramienta de gestión de bugs (Linear / Notion / GitHub Issues).
- E2: canal de comunicación con cliente.

**Anexos separados (no en este PRD):**
- A1: Términos y Condiciones + Política de Privacidad (primera versión, requiere validación legal).
- A2: 6 plantillas de mensajes redactadas.
- A3: Template oficial de CSV con headers y reglas de formato.

---

*Fin del documento. Versión 2.0.*
