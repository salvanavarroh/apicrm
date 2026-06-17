# Sistema y reglas — API CRM Concesionarios

Documento funcional del CRM: roles, entidades, asignación de leads, reglas de
reingreso, duplicados, multi-gerente, multi-consulta, impersonación y
visibilidad por rol. Refleja el estado del sistema al **17/06/2026** (sprint 13).

> Para detalle de implementación, las referencias de código están al pie de cada
> sección. La fuente de verdad de la lógica de asignación es la función SQL
> `auto_assign_lead` y el helper `src/lib/lead-reentry.ts`.

---

## 1. Roles

Enum `user_role`: `super_admin`, `admin`, `manager`, `sales`, `data_provider`.

| Rol | Alcance | Qué hace |
|-----|---------|----------|
| **super_admin** | Plataforma (sin empresa) | Soporte global. Ve todo (solo lectura sobre leads). Crea empresas, aprueba sucursales, factura. Puede **"acceder como"** admin/gerente. |
| **admin** | Una empresa (concesionaria) | Dueño de la operación. Crea gerentes, vendedores y proveedores. Ve y edita todos los leads de su empresa. |
| **manager** (gerente) | Sus gerencias (sucursal + tipo de producto) | Gestiona su equipo de vendedores, su pipeline y el toggle de asignación automática. |
| **sales** (vendedor) | Sus leads asignados | Trabaja el pipeline de sus leads (estado, temperatura, notas, tareas, visitas, presupuestos). |
| **data_provider** (proveedor) | Sus cargas | Carga leads (manual / CSV). Solo ve/edita los que creó, mientras estén en estado `new`. |

`super_admin` **no pertenece a ninguna empresa** (constraint en `profiles`).

Código: `supabase/migrations/20260508153401_initial_extensions_and_enums.sql`, `src/lib/auth.ts`.

---

## 2. Entidades principales

| Entidad | Tabla | Relaciones clave |
|---------|-------|------------------|
| Empresa | `companies` | raíz del tenant |
| Usuario | `profiles` (1:1 con `auth.users`) | `company_id`, `branch_id`, `manager_id` |
| Sucursal | `branches` | `company_id` |
| Tipo de producto | `product_types` | `company_id` |
| **Gerencia** | `managements` | `(branch_id, product_type_id, manager_id)` |
| Vendedor ↔ tipos | `user_product_types` | M:N entre `profiles` y `product_types` |
| Lead | `leads` | `company_id`, `branch_id`, `product_type_id`, `assigned_user_id`, `campaign_id` |
| **Consulta (auto)** | `lead_vehicles` | varios autos por lead |
| Reingreso/auditoría | `lead_submissions` | snapshot de cada carga del mismo cliente |
| Notas | `lead_notes` | `activity_type` opcional |
| Tareas | `lead_tasks` | `task_type`, `assigned_to`, `due_date` |
| Visitas | `visits` | agenda en la sucursal |
| Catálogo de autos | `car_catalog` | autocomplete (no FK desde leads) |
| Presupuestos / Ventas | `quotes` / `sales` | a nivel **lead** |
| Impersonación | `impersonation_log` | auditoría de "acceder como" |

---

## 3. Gerencias y multi-gerente

Una **gerencia** es la combinación **sucursal + tipo de producto** que maneja un
gerente, en la tabla `managements`. Cada fila tiene un toggle
`auto_assignment_enabled`.

**Regla multi-gerente (sprint 13):** una misma combinación `(sucursal, tipo de
producto)` puede tener **varios gerentes**. Antes había un `UNIQUE(branch_id,
product_type_id)` que lo impedía; se quitó. Lo único que no se permite es que el
**mismo** gerente quede duplicado en la misma combinación
(`UNIQUE(branch_id, product_type_id, manager_id)`).

Implicancias:
- Varios equipos de venta pueden compartir la misma sucursal+producto.
- La asignación automática agrupa (pool) a los vendedores de **todos** los
  gerentes de esa combinación (ver §5).

Código: `supabase/migrations/20260617120000_sprint13_*.sql`.

---

## 4. Estados, temperatura y "lead activo"

**Estados del lead** (`lead_status`):

`new` → `contacted` → `interested` → `quoted` → (`not_interested`) y, ya en venta,
`evaluating` → `accepted` / `rejected` → `closed`.

- **Lead activo** (para contar carga del vendedor en la asignación): estado en
  `new`, `contacted`, `interested`, `quoted`.
- **Lead "cerrado"** a efectos de capacidad/listados: `closed`.

**Temperatura** (`lead_temperature`, opcional): `hot` 🔥 / `warm` 🟡 / `cold` 🔵.
Es un **scoring manual** que pone el vendedor; es independiente del estado del
pipeline. NULL = sin clasificar.

**`last_contacted_at`**: marca la última vez que se contactó al cliente. Se
actualiza automáticamente cuando:
1. Se registra una **nota con `activity_type`** (llamada, WhatsApp, email,
   reunión, presupuesto), o
2. El lead **pasa a estado `contacted`**.

Código: `src/lib/leads.ts`, triggers en `supabase/migrations/20260617120000_*.sql`.

---

## 5. Asignación automática de leads (`auto_assign_lead`)

Se invoca después de crear un lead **clasificado** (con sucursal + tipo) o al
clasificar uno del pool. Devuelve el `id` del vendedor asignado, o `null` si no
asigna. **Condicionales, en orden:**

1. **El lead debe ser elegible.** Si no existe, o le falta `branch_id`, o le
   falta `product_type_id`, o **ya tiene** `assigned_user_id` → **no asigna**
   (`null`). (Un lead sin clasificar queda en el "pool" sin vendedor.)

2. **La auto-asignación debe estar habilitada.** Se mira el toggle
   `auto_assignment_enabled` de las gerencias de esa combinación
   `(sucursal, tipo)`. Si **alguna** la tiene en `true` → habilitada. Si
   **ninguna** → **no asigna** (`null`). *(Multi-gerente: alcanza con que un
   gerente de la combinación lo tenga prendido.)*

3. **Pool de candidatos.** Vendedores que cumplen TODO:
   - `role = 'sales'` y `status = 'active'`,
   - misma empresa que el lead,
   - `branch_id` = la sucursal del lead,
   - su `manager_id` es **alguno de los gerentes** de esa combinación
     `(sucursal, tipo)`,
   - tienen el **tipo de producto** del lead en su `user_product_types`.

4. **Criterio de selección (round-robin balanceado).** Entre los candidatos se
   elige el que tiene **menos leads activos** asignados (estados
   `new/contacted/interested/quoted`). Empate → **al azar** (`random()`).

5. Si **no hay candidatos** → **no asigna** (`null`) y el lead queda sin vendedor
   (visible para el gerente/admin como "No asignado"). Si hay → asigna y setea
   `assigned_at = now()`.

> **Capacidad máxima (20 leads)**: hoy es solo informativa en la UI de
> reasignación (`VENDOR_MAX_CAPACITY` en `src/lib/team.ts`). **No** corta la
> auto-asignación; el balanceo es por "menos cargado", sin tope duro.

Código: función `public.auto_assign_lead` en
`supabase/migrations/20260617120000_*.sql`; invocación en
`src/app/(app)/admin/leads/actions.ts` (`createLead`, `classifyLead`) y en
`src/app/api/forms/[slug]/submit/route.ts`.

---

## 6. Reingreso del mismo cliente (sticky seller)

Cuando entra un lead cuyo **teléfono o email** ya existe en la empresa, se aplica
una **ventana de identidad de 31 días** (`REENTRY_WINDOW_DAYS`):

- **Dentro de 31 días** (el lead previo se creó hace ≤ 31 días): se considera el
  **mismo lead**. NO se crea un lead nuevo. En su lugar:
  - se **agrega el auto consultado** como nueva fila en `lead_vehicles`,
  - se registra la carga en `lead_submissions`,
  - **conserva su vendedor** (`assigned_user_id` no cambia) — no vuelve al
    round-robin.
- **Día 32 o más** (o no hay coincidencia): es un **lead nuevo** y entra al flujo
  normal de auto-asignación (§5).

La ventana se mide desde la **fecha de creación del lead previo más reciente**.

Dónde aplica:
- **Formulario público** (`/api/forms/[slug]/submit`): automático.
- **Alta manual** (admin/gerente): el alta detecta el duplicado y ofrece el
  diálogo; al elegir "registrar reingreso" se agrega la consulta al lead
  existente conservando su vendedor.
- **Importación CSV / bulk**: crea los leads y sus consultas, pero **no**
  deduplica por reingreso (es una carga controlada por el admin).

Código: `src/lib/lead-reentry.ts` (`findReentryLead`, `appendLeadVehicle`),
`src/app/(app)/admin/leads/actions.ts` (`createLead`),
`src/app/api/forms/[slug]/submit/route.ts`.

---

## 7. Detección de duplicados (alerta)

Independiente del reingreso. En los listados de leads (admin y gerente) se
marca con una **alerta ⚠️** todo lead cuyo **teléfono normalizado** aparezca en
**más de un** lead de la empresa.

- Normalización del teléfono: se quitan todos los caracteres que no sean dígitos
  o `+` (`normalizePhone`).
- El cálculo se hace al armar el listado (cuenta de teléfonos repetidos).

Además, el **alta manual** busca duplicados por teléfono/email
(`findDuplicateLead`) y, salvo `skip_check`, pregunta antes de crear.

Código: `src/app/(app)/admin/leads/page.tsx`, `src/app/(app)/manager/leads/page.tsx`,
`src/components/leads/leads-table.tsx`, `findDuplicateLead` en
`src/app/(app)/admin/leads/actions.ts`.

---

## 8. Multi-consulta (varios autos por lead)

Un lead puede tener **varias consultas por distintos autos**, en la tabla
`lead_vehicles` (`vehicle_model`, `vehicle_version`, `preferred_color`, `notes`).

- Las columnas `vehicle_*` del propio `leads` se mantienen como **"auto
  principal"** (denormalizado) para listados, export y CSV.
- **Presupuestos y ventas siguen a nivel lead** (no se atan a una consulta
  puntual).
- Las consultas se cargan: desde el alta (auto principal → primera consulta),
  por reingreso (cada vuelta agrega un auto), y a mano desde el detalle del lead
  (sección "Consultas": agregar / eliminar).

Código: tabla en `supabase/migrations/20260617120000_*.sql`; acciones
`addLeadVehicleAction` / `deleteLeadVehicleAction` en
`src/app/(app)/admin/leads/actions.ts`; UI en
`src/components/leads/lead-vehicles-section.tsx`.

---

## 9. Listado de leads — selección, reasignación y filtros

En el listado (`LeadsTable`), para **admin y gerente**:

- **Selección múltiple** con checkboxes (incluye "seleccionar todos los
  filtrados").
- **Reasignación masiva**: reasignar o desasignar los leads seleccionados a un
  vendedor (`reassignLeadsBulk`). La RLS limita qué leads puede tocar cada rol.
- **Filtros**: búsqueda por texto, estado, temperatura, **rango de fecha de
  creación** y **rango de fecha de último contacto**. Columna "Últ. contacto".

Quién puede reasignar:
- **admin**: cualquier vendedor activo de la empresa.
- **manager**: solo vendedores bajo su `manager_id`.
- **sales / data_provider**: no reasignan (no se les pasan los vendedores).

Código: `src/components/leads/leads-table.tsx`, `reassignLead` /
`reassignLeadsBulk` en `src/app/(app)/admin/leads/actions.ts`,
`getAssignableSalesUsers` en `src/lib/team.ts`.

---

## 10. Creación de usuarios

El **admin** crea usuarios desde *Usuarios → Crear usuario*
(`InviteUserDialog`). El flujo usa `generateLink` (no envía mail de Supabase) +
**Resend** con template propio, con **rollback atómico** si falla el email.

| Rol a crear | Campos extra | Qué setea |
|-------------|--------------|-----------|
| admin | — | profile básico |
| data_provider | — | profile básico |
| manager | sucursales + tipos de producto | crea filas en `managements` (branch × tipo) y `user_product_types` |
| **sales** (nuevo) | **gerente** + sucursal + tipos | setea `manager_id`, `branch_id` y `user_product_types` |

Reglas:
- Para **vendedor**: el gerente elegido debe ser de la empresa y rol `manager`.
  La sucursal y los tipos se **constriñen** a los del gerente seleccionado.
- Para **gerente**: con multi-gerente ya **no** se valida que la combinación
  esté libre (puede compartirse).

Código: `src/app/(app)/admin/users/actions.ts` (`inviteUser`),
`src/app/(app)/admin/users/invite-user-dialog.tsx`,
`src/app/(app)/admin/users/page.tsx`.

---

## 11. Visibilidad por rol (RLS de `leads`)

La base aplica Row Level Security; cada rol ve/edita distinto, **sin importar el
filtro del front**:

| Rol | SELECT | UPDATE | INSERT | DELETE |
|-----|--------|--------|--------|--------|
| super_admin | todos | — | — | — |
| admin | todos los de su empresa | todos los de su empresa | sí | sí |
| manager | leads de sus gerencias (match `branch_id`+`product_type_id` vía `managements`) | ídem | sí | — |
| sales | los que tiene asignados (`assigned_user_id = uid`) | ídem | — | — |
| data_provider | los que creó (`created_by = uid`) | los que creó **y** en estado `new` | sí | — |

Notas:
- Como `manager` matchea por gerencia, con **multi-gerente** todos los gerentes
  de una combinación ven los mismos leads de esa sucursal+producto.
- `notes` / `tasks` / `visits` / `lead_vehicles` heredan visibilidad: su RLS
  permite ver/escribir si el lead asociado es visible para el usuario.

Código: `supabase/migrations/20260515111906_sprint4_leads.sql` (+ helpers
`current_role()`, `current_company_id()`, `is_super_admin()`).

---

## 12. Impersonación del super_admin ("Acceder como")

El super_admin puede iniciar sesión **como** un admin/gerente para destrabar
cosas. Es una sesión **real** (la RLS aplica como ese usuario).

Flujo:
1. Botón "Acceder como" en el detalle de la empresa (lista de usuarios), visible
   para usuarios `admin`/`manager` **activos**.
2. Se genera un magic-link del usuario destino y se verifica server-side
   (`verifyOtp`) → quedan las cookies de sesión de ese usuario.
3. La sesión original del super_admin se guarda en una cookie httpOnly
   (`impersonation_origin`) para poder volver. Se registra en
   `impersonation_log` (`super_admin_id`, `target_user_id`, `started_at`).
4. Aparece un **banner** "Estás viendo como … · Salir" en toda la app.
5. "Salir" restaura la sesión del super_admin y cierra el registro
   (`ended_at`).

Código: `src/app/(app)/super-admin/impersonation-actions.ts`,
`src/components/impersonate-button.tsx`,
`src/components/impersonation-banner.tsx`, banner montado en
`src/app/(app)/layout.tsx`.

---

## 13. Contadores del sidebar (super_admin)

En el menú del super_admin aparecen **badges** con contadores a nivel
plataforma:

- **Leads**: cantidad de leads en estado `new` (solicitudes nuevas desde los
  formularios).
- **Solicitudes**: cantidad de solicitudes de sucursal (`branch_requests`) en
  estado `pending`.

Se calculan en el layout (solo si el rol es super_admin) y se pasan al sidebar
por `href`. Tope visual "99+".

Código: `src/app/(app)/layout.tsx`, `src/components/app-sidebar.tsx`.

---

## 14. Origen de los leads (cómo entran)

1. **Formulario público** (`/f/[slug]` o embed) → `POST /api/forms/[slug]/submit`:
   - rate limit por IP, honeypot anti-bot,
   - hereda `branch_id` / `product_type_id` / `campaign_id` del formulario,
   - aplica **reingreso** (§6) y, si es nuevo, **auto-asignación** (§5),
   - guarda tracking (UTM, landing, referrer).
2. **Alta manual** (admin/gerente/proveedor): formulario interno, con chequeo de
   duplicado y auto-asignación si queda clasificado.
3. **Importación CSV / bulk** (admin/proveedor): carga masiva con defaults de
   sucursal/tipo/campaña.

Un lead **sin** sucursal o **sin** tipo de producto queda en el **pool** ("sin
clasificar"); al clasificarlo (asignarle ambos) se dispara la auto-asignación.

Código: `src/app/api/forms/[slug]/submit/route.ts`,
`src/app/(app)/admin/leads/actions.ts` (`createLead`, `classifyLead`,
`bulkInsertLeads`).

---

## 15. Resumen de avances (sprint 13 — 17/06/2026)

Implementado en esta tanda:

1. **Multi-gerente** por sucursal+producto (schema + asignación pooled).
2. **Admin crea vendedores** y los asigna a un gerente.
3. **Listado de leads**: selección múltiple + reasignación masiva, filtros por
   fecha (creación / último contacto), columna de último contacto.
4. **Alerta de duplicado** por teléfono.
5. **Reingreso sticky-seller** (mismo lead/vendedor dentro de 31 días; lead
   nuevo a partir del día 32).
6. **Multi-consulta** por distintos autos (`lead_vehicles`).
7. **Impersonación** del super_admin con auditoría y banner.
8. **Contadores** en el sidebar del super_admin (leads nuevos + solicitudes de
   sucursal pendientes).

Migración: `supabase/migrations/20260617120000_sprint13_multi_manager_vehicles_contact_impersonation.sql`
(aplicada al piloto). Se aplicó también la migración pendiente
`20260612120000_lead_temperature` para sincronizar la base con el repo.
