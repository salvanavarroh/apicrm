# Actividad del equipo — tiempo de los vendedores en el CRM

Qué mide la sección **Actividad del equipo**, cómo se mide, qué no mide, y qué
preguntas de gerencia contesta.

Introducida el **07/09/2026**. Vive en `/admin/actividad` (toda la
concesionaria) y `/manager/actividad` (el equipo de ese gerente; el supervisor
ve el equipo de su gerente padre).

## El problema

El CRM sabía **qué** hizo cada vendedor —notas, tareas, visitas, mensajes,
ventas— pero no **cuándo** ni **por cuánto tiempo** estuvo. No hay logins que
mirar: la sesión de Supabase se renueva sola y no dice nada sobre presencia. La
pregunta de gerencia era literal: "¿cuánto tiempo estuvieron mis vendedores en
el CRM?".

Y la pregunta que importa no es ninguna de las dos por separado. Ocho horas de
CRM con tres notas registradas es un problema distinto de dos horas con veinte,
y hasta ahora los dos casos se veían igual.

## Cómo se mide el tiempo

`<ActivityTracker />` vive en el shell de la app, así que corre en todas las
pantallas de todos los roles. Manda un latido a `POST /api/activity` **cada 60
segundos**, y sólo si se cumplen las dos condiciones:

1. La pestaña está **visible** (`document.visibilityState`).
2. Hubo **interacción del usuario** —click, tecla, scroll, touch— en los
   últimos **5 minutos**.

El endpoint llama a `track_user_activity(section)`, que:

- calcula el **bucket de 5 minutos con el reloj del servidor** (nunca con el del
  cliente, que es del usuario y es editable),
- hace upsert en `user_activity_buckets` sumando un ping a ese bucket,
- guarda la **sección** (Inbox, Leads, Reportes…) derivada del path en el
  servidor, así a la base sólo entran valores del catálogo de
  `src/lib/activity.ts`.

Los minutos se cuentan **por latido, no por bucket entero**:

```
minutos del bucket = least(pings, 5)
```

Alguien que entró 40 segundos suma 1 minuto, no 5. El `least` acota los latidos
extra que dispara volver a la pestaña.

### Por qué esas dos condiciones

Son las que hacen que el número signifique algo. Sin ellas, una pestaña olvidada
abierta un viernes a la tarde acumularía el fin de semana entero. Lo que se mide
es **"CRM en pantalla y la persona usándolo"**.

### Lo que NO mide

**No es un reloj de fichada.** El trabajo en el salón, al teléfono, en una
prueba de manejo o en la calle no pasa por el CRM y por lo tanto no aparece.
La pantalla lo dice explícitamente al pie, y es importante que lo siga diciendo:
sirve para **comparar** —entre vendedores, y contra lo que produjeron— no para
liquidar sueldos.

## Quién ve qué

La RLS de `user_activity_buckets` decide:

| Rol | Ve |
|---|---|
| admin | toda la concesionaria |
| manager | los perfiles cuyo `manager_id` es él |
| supervisor | los de su gerente padre (`acting_manager_id()`) |
| vendedor | sólo sus propias filas |
| super_admin | todo |

No hay policies de INSERT ni de UPDATE: escribir pasa **sólo** por
`track_user_activity`, que es `security definer` y siempre escribe la fila del
usuario autenticado. Nadie puede inflar ni borrar el tiempo de nadie — tampoco
el propio.

## Lo que la sección muestra

**Arriba**: tiempo del equipo, promedio por vendedor y día, gestiones por hora
conectada y tareas vencidas.

**Gráficos**: horas del equipo por día, y "dónde pasan el tiempo" por sección.

**Tabla, vendedor por vendedor**: tiempo en el CRM, días con actividad,
promedio por día, hora de arranque promedio, leads recibidos, leads gestionados,
contactos, mensajes, tareas hechas, tareas vencidas, visitas, ventas y
gestiones por hora.

**Detalle de un vendedor** (`…/actividad/[id]`): el **horario real** (minutos
por hora del día, que es lo que responde si el turno declarado y el real son el
mismo), dónde pasó el tiempo, y el día por día con hora de entrada, última
actividad y lo producido. Los días vacíos se recortan de las dos puntas pero
**los huecos del medio se conservan**: un martes sin entrar es la información.

Todo exporta a Excel.

## De dónde sale cada mitad

| | Fuente |
|---|---|
| Tiempo, días, arranque, secciones, horario | `user_activity_buckets` |
| Leads recibidos | `leads.assigned_at` en el rango |
| Leads gestionados / contactos | `lead_notes` con `activity_type`, por autor |
| Mensajes | `messages` salientes con `sent_by_user_id` |
| Tareas hechas / vencidas | `lead_tasks.completed_at` / `due_date` |
| Visitas | `visits` con `status = completed` |
| Ventas | `sales` con `status = accepted` |

**Las tareas vencidas no se acotan al rango**: una tarea vencida hace dos meses
sigue siendo el pendiente de hoy, y esconderla sería perder justo el dato que
gerencia va a buscar.

## Detalles de implementación que importan

**El "día" es el de la concesionaria** (`companies.inbox_tz`), no el del
servidor, que corre en UTC. Un vendedor que contesta 21:30 en Buenos Aires cae
al día siguiente en UTC, y eso le movía la jornada.

**Los agregados se hacen en la base, no en el cliente.** PostgREST corta la
respuesta en 1000 filas: una función que devolviera "una fila por vendedor y por
día" empezaría a **mentir en silencio** con 20 vendedores y 3 meses de rango.
Cada función tiene una cota que se puede escribir —por vendedor, por día, por
hora— y `p_user_ids` recorta al equipo que se está mirando.

**El latido es un route handler, no una server action.** Una server action
arrastra el ciclo de re-render de la ruta actual, y esto es telemetría de fondo:
no tiene que tocar en nada la pantalla que el vendedor está usando. Mismo
criterio que el beacon de presencia del inbox.

## Volumen

Una jornada de 8 h son ~96 filas por persona. 20 vendedores × 22 días hábiles
≈ **42k filas por mes**. Las consultas agregan por índice
(`user_activity_company_idx`, `user_activity_user_idx`).

## Pendiente

- No hay pantalla para que el vendedor vea su propia actividad (la RLS ya se lo
  permitiría). Sería lo transparente.
- Los latidos no distinguen entre pestañas: dos pestañas abiertas del mismo
  usuario caen en el mismo bucket y no duplican tiempo, que es lo correcto, pero
  tampoco se puede saber cuántas había.
- No hay retención: las filas se acumulan. Con el volumen de arriba tarda años
  en ser un problema, pero en algún momento conviene agregar los meses viejos.
