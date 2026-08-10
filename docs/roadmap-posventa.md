# Roadmap — Administración y Posventa

Origen: reunión con Salvador Navarro y Richi Grant. La estrategia de retención
del SaaS es sumar módulos que hagan que la concesionaria opere su día a día
dentro de API, no sólo su embudo de ventas. Cuanto más del proceso vive acá,
más caro es irse a otra plataforma.

Este documento es el plan, no una implementación. No hay código de posventa
todavía.

---

## Por qué posventa y no otra cosa

Hoy el CRM cubre desde que entra el lead hasta que la venta se aprueba. Después
de eso, el cliente desaparece del sistema. Eso tiene tres costos:

1. **Retención del SaaS.** Un CRM de leads es reemplazable. Un sistema que
   además tiene la agenda del taller y el historial de servicio del cliente, no.
2. **Retención del cliente final.** El 100% de los compradores de 0km vuelven al
   service. Es el único contacto garantizado post-venta y hoy no se registra.
3. **Recompra.** El momento de recompra es predecible (kilometraje, antigüedad
   del vehículo, fin de plan de ahorro) y hoy no se dispara ninguna acción.

---

## Fase 1 — Vehículos vendidos (base de todo)

Sin un registro de "qué unidad tiene qué cliente", no hay posventa posible.

**Modelo propuesto**

```
sold_vehicles
  id, company_id, branch_id
  lead_id            -- de dónde vino (puede ser null: cliente histórico)
  sale_id            -- la venta que lo originó (null si se cargó a mano)
  customer_name, customer_phone_e164, customer_email
  brand, model, version, year
  vin                -- chasis, unique por empresa
  license_plate      -- patente
  delivered_at
  created_at, updated_at
```

- `phone_e164` para poder cruzar con el Inbox de WhatsApp (ya existe el
  normalizador en `src/lib/phone.ts`).
- `vin` único por empresa: es la clave real de un auto.
- Se crea automáticamente al aprobarse una venta, y se puede cargar a mano para
  la base histórica de la concesionaria (que es lo que van a querer importar el
  primer día).

**Alcance de pantalla:** listado + detalle de vehículo con su historial.

---

## Fase 2 — Turnos de service

Es el pedido concreto: "gestión de turnos y servicios".

**Modelo propuesto**

```
service_bays                        -- capacidad del taller
  id, company_id, branch_id, name, active

service_appointments
  id, company_id, branch_id
  sold_vehicle_id                   -- o customer libre si no está registrado
  bay_id
  scheduled_at, estimated_hours
  service_type                      -- enum: mantenimiento | garantía | reparación | diagnóstico
  status                            -- enum: scheduled | confirmed | in_progress | done | no_show | canceled
  odometer_km
  notes
  assigned_to                       -- asesor de service (profiles)
  created_by, created_at, updated_at
```

**Por qué `service_bays`:** sin capacidad modelada, la agenda sobrevende y el
módulo no sirve. Es la diferencia entre una agenda de verdad y un Google
Calendar con otro nombre.

**Reutilizable de lo que ya existe**

- El patrón de `visits` (agenda + estados + asignación) es casi el mismo:
  `AgendaCalendar` en `src/components/dashboard/agenda-calendar.tsx` y el loader
  `src/lib/tasks-visits-loader.ts` se pueden extender en vez de reescribir.
- Los recordatorios salen por el canal de WhatsApp que ya está integrado
  (`src/lib/messaging/dispatch.ts`) con una plantilla nueva.
- El semáforo y los chips de estado ya tienen tonos definidos en el tema.

**Rol nuevo:** `service_advisor` (asesor de posventa). Ve la agenda del taller y
los vehículos, no ve el pipeline de leads. Implica sumar el rol al enum
`user_role`, al sidebar y a las policies RLS.

---

## Fase 3 — Órdenes de trabajo y facturación interna

```
work_orders
  id, company_id, service_appointment_id, sold_vehicle_id
  status                -- open | waiting_parts | done | invoiced
  labor_total, parts_total, discount, total
  opened_at, closed_at

work_order_items
  id, work_order_id, kind (labor | part), description, qty, unit_price
```

Acá aparece la primera decisión de integración real: si la concesionaria ya
factura con un sistema contable (lo normal), esto NO debe facturar — debe
exportar. Hay que preguntarlo antes de diseñar.

---

## Fase 4 — Recompra y retención (donde se cierra el círculo)

El módulo de posventa alimenta de vuelta al de ventas:

- **Disparador por kilometraje/antigüedad:** vehículo con +4 años o +60.000 km
  → se genera un lead de recompra asignado al vendedor original.
- **Fin de plan de ahorro:** cuota final próxima → lead de recompra.
- **Service sin cerrar:** turno `no_show` → tarea de seguimiento.

Esto encaja directo en el motor de reglas que ya existe:
`src/lib/next-best-action.ts` para el vendedor y
`src/lib/executive-report.ts` para las alertas del gerente. Se agregan reglas,
no se construye nada nuevo.

---

## Fase 5 — Administración

Lo más chico de los dos módulos que se mencionaron, y el que menos retiene.
Sugerencia: dejarlo último.

- Comisiones liquidadas por período (hoy hay `commission_percent_snapshot` en
  `sales`, pero no un cierre de liquidación).
- Gastos por sucursal.
- Exportables contables.

---

## Orden recomendado y por qué

| # | Fase | Por qué en este orden |
|---|------|-----------------------|
| 1 | Vehículos vendidos | Nada de posventa existe sin esto. Además es lo primero que el cliente puede cargar (base histórica) y ver valor. |
| 2 | Turnos de service | Es el pedido explícito y el que genera uso diario → retención. |
| 3 | Recompra (fase 4) | Adelantada a propósito: es lógica de reglas sobre datos que ya existen en fase 1-2, barata y con impacto comercial directo. |
| 4 | Órdenes de trabajo | Más caro y depende de definir si facturan acá o afuera. |
| 5 | Administración | Valor real pero no retiene; el contador de la concesionaria ya tiene su sistema. |

---

## Decisiones que hay que cerrar antes de arrancar

1. **¿La concesionaria factura el service en API o en su sistema contable?**
   Cambia por completo el alcance de la fase 3.
2. **¿Cuántas bahías/puestos tiene un taller típico de los clientes objetivo?**
   Define si la agenda es por bahía o por franja horaria.
3. **¿El asesor de service es un rol nuevo o lo maneja el Admin?**
   Un rol nuevo toca el enum `user_role` y todas las policies RLS: no es gratis.
4. **¿Se importa la base histórica de vehículos vendidos?**
   Si sí, hace falta un importador tipo el de leads (`src/lib/lead-import-*`),
   que es reutilizable.
5. **¿Posventa entra en el plan Estándar o es un plan superior?**
   Es la palanca de precio más obvia (ver `src/lib/plans.ts`), y define si hay
   que soportar feature flags por plan.
