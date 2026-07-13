# Carga de leads con IA — diseño y estado

> **Estado: FASE 1 IMPLEMENTADA (02/07/2026).** Pipeline end-to-end: upload →
> mapeo IA (OpenAI) → pantalla de revisión (editar mapeo / regenerar con
> instrucción) → commit en batches con distribución. Falta aplicar la migración
> del bucket al piloto y probar con datos reales. Ver §8 para el detalle de lo
> construido y lo que quedó para Fase 2.

## 1. Objetivo (cambio de modelo)

Hoy la carga masiva es una **tabla estructurada**: se descarga una plantilla, se
acomodan las columnas y se sube el CSV (`src/components/leads/csv-importer.tsx`,
`bulkInsertLeads`).

La idea nueva: **subir un archivo cualquiera** y que la **IA entienda y mapee las
columnas** solas, cargando miles de leads. Después queda una **pantalla de
revisión** donde quien cargó puede ver cómo mapeó, editar, o **regenerar** la
lectura con una instrucción en lenguaje natural, y recién ahí **confirmar** la
subida.

## 2. Decisiones confirmadas (con Salvador)

| Tema | Definición |
|---|---|
| **Formatos** | Solo **CSV / Excel** (estructurados). Sin PDF/imágenes/WhatsApp por ahora. |
| **Volumen** | **Miles** por archivo (1k–20k). → staging + insert en batches. |
| **Distribución** | **Se elige por archivo** en las pre-preguntas: round-robin / vendedor fijo / dejar sin asignar. |
| **Motor IA** | **OpenAI**. Key `OPENAI_API_KEY` en `.env.local` — **verificada** (auth + chat + `json_object` OK; modelos `gpt-4o-mini`, `gpt-4.1-mini` disponibles). Key tipo proyecto (`sk-proj-…`). |
| **Columnas sin mapear** | Texto humano (ej. `consulta`) → `initial_notes`. Columnas estructuradas sueltas → **`leads.metadata` (jsonb)**, NO a las notas. |
| **Pre-preguntas** | Por archivo: producto / sucursal / gerente / campaña / distribución (todos los leads del archivo comparten esto). |

**Insight de arquitectura clave:** la IA mapea el **esquema (las columnas)**, no
fila por fila. Mira headers + una muestra (~30 filas) y devuelve el mapeo; luego
**código determinístico** lo aplica a todas las filas. Costo/latencia planos y
resultado reproducible. El retry sólo re-corre el mapeo (1 llamada).

## 3. Arquitectura propuesta

Pipeline por etapas con staging:

1. **Pre-preguntas** (wizard): producto, sucursal, gerencia, campaña, distribución.
2. **Upload** → bucket privado `lead-imports` en Supabase Storage (Storage ya se
   usa en el proyecto: quotes, forms, avatars).
3. **Parse determinístico** (server): `papaparse`/`xlsx` → headers + filas → staging.
4. **Mapeo IA** (1 llamada OpenAI, server-only): headers + muestra + esquema
   destino → `{columna→campo, transform, confianza, notas}`. Usar
   **structured outputs (`json_schema`)**, no `json_object`.
5. **Aplicar mapeo** (determinístico) a todas las filas → validación por fila
   (tel/email presente, normalización, coerción de enums, **dedup** por
   tel/email y por `external_id`).
6. **Pantalla de revisión** (nueva): mapeo (columna→campo + confianza) + tabla de
   leads con estado (ok / warning / error / duplicado), filtros, edición manual,
   botón **"Regenerar lectura"** (instrucción NL → re-corre paso 4) y
   **"Confirmar y subir"**.
7. **Commit** → `bulkInsertLeads` (extendido) en **batches** (~500) + distribución
   (reusa `auto_assign_lead` o asigna según lo elegido).

**Modelo de datos nuevo (a crear):**
- `lead_import_jobs` (id, company_id, created_by, file_path, status, file_type,
  row_count, mapping jsonb, context jsonb [producto/sucursal/gerente/campaña/
  distribución], ai_notes, retry_count, timestamps).
- `lead_import_rows` (id, job_id, raw jsonb, mapped jsonb, status, errors[],
  dup_lead_id).

**Infra a sumar:** SDK `openai` + cliente server-side detrás de una interfaz
`LeadMapper` (agnóstico de proveedor) + prompt de mapeo. Ojo timeout de funciones
de Vercel en el commit de miles → insertar en batches o via route con
`CRON_SECRET` (patrón ya existente).

## 4. Mapeo de columnas (ejemplo real: Meta Lead Ads)

Ejemplo de export recibido:
`id, created_time, ad_id, ad_name, adset_id, adset_name, campaign_id,
campaign_name, form_id, form_name, is_organic, platform, modelo, consulta,
horario_de_contacto, email, full_name, phone_number, province, retailer_item_id`

| Columna | Destino |
|---|---|
| `full_name` | `first_name` + `last_name` (se parte) |
| `phone_number` | `phone` |
| `email` | `email` |
| `modelo` | `vehicle_model` |
| `consulta` | `initial_notes` |
| `platform` | `utm_source` |
| `campaign_name` | `utm_campaign` |
| `ad_name` | `utm_content` |
| `adset_name` | `utm_term` |
| `province` | `province` (nuevo) |
| `horario_de_contacto` | `preferred_contact_time` (nuevo) |
| `id` (lead de la fuente) | `external_id` (nuevo, dedup) |
| `created_time` | `source_created_at` (nuevo) |
| `ad_id`, `adset_id`, `form_id`, `form_name`, `is_organic`, `retailer_item_id`, campaign_id de Meta | `metadata` (jsonb) |

## 5. Campos destino en `leads`

**Ya existían:** `first_name`, `last_name`, `email`, `phone`, `city`,
`vehicle_brand/model/version`, `preferred_color`, `budget_min/max`,
`has_used_car`, `used_car_description`, `declared_payment_method`,
`campaign_id`, `branch_id`, `product_type_id`, `initial_notes`,
`utm_source/medium/campaign/term/content`, `landing_url`, `referrer`.

**Agregados para esta feature (ya aplicados a la base, migración
`20260625130000_leads_import_fields`):**
`province`, `locality`, `national_id` (DNI/CUIT), `birth_date`,
`preferred_contact_time`, `source`, `external_id`, `source_created_at`,
`metadata` (jsonb). Índice parcial `(company_id, external_id)` para dedup.

- **Financiación** → `declared_payment_method = 'financed'`.
- **Usado en parte de pago** → `has_used_car = true`.
- Estos campos **todavía no están** en el alta manual (`leadInputSchema`) ni en
  el importador CSV. Se cablean con esta feature (y opcionalmente al alta manual).

## 6. Pendiente / decisiones abiertas

- [ ] **Presupuestos/venta desde el gerente** (relacionado, no de esta feature):
      generar presupuesto / registrar venta están atados a `vendor_id`. Falta
      decidir atribución si el gerente los hace. (Ver §19 del doc de sistema.)
- [ ] Granularidad de pre-preguntas: por archivo (asumido) vs. mezcla por fila.
- [ ] Duplicados: default = **marcar para revisar** (no fusionar). Confirmar.
- [ ] Edición en revisión: editar fila a mano + re-mapear columna, además del
      retry con IA. Confirmar alcance.
- [ ] PII / retención: a OpenAI va sólo la muestra (headers + ~30 filas). ¿Se
      guarda el archivo original en Storage con retención (ej. 30d) o se borra?
- [ ] Modelo exacto (`gpt-4o-mini` vs `gpt-4.1-mini`) y **rate limits/presupuesto**
      del proyecto OpenAI para cargas grandes.
- [ ] ¿Reemplaza el importador CSV actual o conviven? (propuesto: conviven).
- [ ] ¿Quiénes lo usan? (admin / gerente / proveedor — hoy los 3 importan).

## 7. Próximos pasos (fasing propuesto)

- **Fase 1**: uploader + parse + mapeo IA (OpenAI) + pantalla de revisión +
  commit batched (CSV/Excel, contexto por archivo).
- **Fase 2**: edición manual fina, dedup avanzado, reglas de distribución por
  columna, y (si se quiere) el alta manual usando los campos nuevos.

## 8. Estado de implementación (Fase 1)

### Lo construido
- **Storage**: bucket privado `lead-imports` con RLS por `company_id` (path
  `{company_id}/{uuid}.{ext}`). Migración
  `20260702120000_lead_imports_bucket.sql` (**pendiente de aplicar al piloto**).
- **Env**: `OPENAI_API_KEY` agregada al `serverSchema` de `src/lib/env.ts`.
- **Núcleo determinístico** (`src/lib/lead-import.ts`, compartido cliente/server):
  catálogo `TARGET_FIELDS` (con hints para el prompt), tipos de mapeo,
  `applyMapping()` con coerciones (número AR con miles/decimales, booleano,
  forma de pago por keywords, fechas dd/mm/aaaa), split de `full_name`, comodín
  `metadata`, validación (tel/email) y **dedup en archivo** (external_id → tel →
  email).
- **Parser server** (`src/lib/lead-import-parse.ts`): CSV (papaparse) y Excel
  (xlsx) desde buffer, headers crudos + `sampleRows()`.
- **Mapper IA** (`src/lib/lead-mapper.ts`): interfaz `LeadMapper` + `createOpenAiMapper()`
  vía `fetch` a OpenAI con **structured outputs (`json_schema`, strict)**,
  modelo `gpt-4o-mini`, `temperature 0`. `reconcile()` valida la salida contra
  los headers reales (lo no mapeado cae a `metadata`).
- **Server actions** (`src/lib/lead-ai-import-actions.ts`): `analyzeImport`,
  `regenerateMapping` (instrucción NL), `reapplyMapping` (edición manual sin IA),
  `commitImport` (dedup por `external_id` contra la base, insert en batches de
  500, distribución round-robin / vendedor fijo / sin asignar, borra el archivo
  al terminar). Gate `requireRole(admin/manager/supervisor/data_provider)`.
- **UI** (`src/components/leads/ai-lead-importer.tsx`): wizard pre-preguntas +
  upload → analizando → revisión (stats, tabla de mapeo editable por columna,
  regenerar con instrucción, preview de leads con estado) → confirmar. Páginas
  `admin/leads/import-ai` y `manager/leads/import-ai`, con banner de acceso
  desde los importadores CSV existentes.

### Commit en segundo plano (jul-2026)
El commit dejó de ser una server action bloqueante (se "tildaba" el front y podía
hacer timeout con miles). Ahora:
- **`lead_import_jobs`** (tabla): guarda file_path, mapping, context, status,
  total/processed/inserted/skipped, locked_at, updated_at. RLS: el creador +
  admin/manager/supervisor de la empresa la leen. Migración `20260713120000`.
- **`enqueueImport`** crea el job (pending) y **vuelve al toque**; dispara
  `POST /api/leads-import/process` (auth `CRON_SECRET`, mismo secreto interno que
  el cron de pagos — NO agendado como cron).
- **`/api/leads-import/process`** (`maxDuration=60`): claim atómico (lock por
  `locked_at`, vencimiento 25s → evita doble proceso), y en su `after()` procesa
  tandas de 500 (tope 6 tandas / 30s por invocación) **re-invocándose** hasta
  terminar. Asigna cada tanda con `bulk_assign_leads`. Al final borra el archivo.
- **Polling**: el cliente llama `getImportJob(jobId)` cada 2.5s y muestra barra de
  progreso. Se puede cerrar la ventana / navegar: sigue en segundo plano.
- **Reanudar (sin cron)**: si `updated_at` no avanza >30s (job trabado), el
  cliente marca `stale` y ofrece **"Reanudar"** → `resumeImport` re-dispara
  `/process`. Idempotente: dedup por `external_id` + cursor `processed`.

### Decisiones vs. el diseño original
- **Sí hay staging job** (`lead_import_jobs`) para el progreso/reanudación, pero
  **sin `lead_import_rows`**: el archivo en Storage es la fuente de verdad y se
  re-parsea en cada invocación (barato y determinístico). El cursor `processed`
  permite reanudar sin persistir las filas.
- **Edición en revisión**: se puede cambiar el destino de cada columna y
  regenerar el mapeo con IA. La edición fila-por-fila queda para Fase 2.
- **PII**: a OpenAI va sólo headers + ~30 filas de muestra. El archivo original
  se **borra** de Storage tras el commit exitoso.

### Pendiente para dejarlo productivo
- [ ] Aplicar la migración del bucket al piloto (Management API) y setear
      `OPENAI_API_KEY` en el entorno de Vercel.
- [ ] Probar con exports reales (Meta Lead Ads, Excel de portales).
- [x] Data-provider: página `data-provider/leads/import-ai` creada
      (`showClassification={false}` + `showDistribution={false}`, todo al pool).
