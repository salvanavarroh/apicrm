# Grupos de concesionarias (cliente multimarca)

Un grupo automotor maneja varias marcas. Cada marca es una concesionaria con sus
sucursales, su WhatsApp, su equipo y sus leads. El dueño del grupo necesita **una
sola cuenta** con acceso de Admin a todas, no diez.

## Los conceptos

| Concepto | Qué es |
|---|---|
| **Grupo** | El cliente. Junta N concesionarias bajo un dueño y un contrato. |
| **Marca** | Una concesionaria (`companies`). Sigue siendo la unidad de todo: sucursales, usuarios, leads, integraciones. |
| **Administrador de grupo** | Rol nuevo (`group_admin`). Admin completo en todas las marcas del grupo, de una a la vez. |
| **Marca activa** | La marca en la que está trabajando ahora. Define el alcance de toda la app. |

## Cómo funciona (y por qué así)

El camino obvio era reescribir las 283 policies de RLS de `company_id =
current_company_id()` a `company_id in (select ...)`. Se descartó: el rol tiene
**escritura** en todas las marcas, así que una policy que se escape no muestra
datos de más, los corrompe — y no hay forma de demostrar que no falta ninguna.

En cambio se usa la indirección que ya existía. Las policies no leen `profiles`:
preguntan `current_company_id()` y `current_role()`. Alcanzó con que esas dos
funciones sepan responder por un admin de grupo:

- `current_company_id()` → devuelve la **marca activa**
- `current_role()` → devuelve `'admin'`

**Ninguna policy cambió.** Un admin de grupo es un Admin de la marca que tiene
seleccionada. Mismo patrón que `acting_manager_id()` para el supervisor.

### El candado

La marca activa vive en la tabla `group_admin_state`, no en una cookie: una
cookie la firma el cliente y Postgres no la puede validar. Y se resuelve con un
join contra `companies.group_id`:

```sql
when p.group_id is not null then (
  select s.active_company_id
  from group_admin_state s
  join companies c on c.id = s.active_company_id
                  and c.group_id = p.group_id   -- ← acá
  where s.user_id = p.id
)
```

Una marca de otro grupo **no resuelve**. El peor caso de un estado manipulado es
"no ve nada", nunca "ve otro grupo". Hay un segundo candado independiente en el
`with check` de la policy de `group_admin_state`, que sólo acepta marcas del
grupo.

Si todavía no eligió marca, la función devuelve `null` y `null` no matchea
ninguna policy: **el default es no ver nada**.

### La app, en un solo lugar

`getCurrentProfile()` completa `company_id` con la marca activa. Es el espejo en
app-layer de la función SQL. Con eso, las ~200 consultas que hacen
`.eq("company_id", profile.company_id)` funcionan sin cambios.

`hasRole()` hace que un `group_admin` cumpla donde se pide `admin`, con el mismo
criterio que `current_role()` en las policies. Una sola función para que app y
base no puedan opinar distinto.

## El test que habilita todo

```bash
pnpm test:groups
```

Crea dos grupos con dos marcas cada uno y dos admins de grupo, y con la **sesión
real de cada uno** (JWT por login, no service_role) afirma 42 cosas:

- ve lo suyo (sin esto el test pasaría con un RLS que niegue todo)
- **no lee** nada del otro grupo, tabla por tabla (20 tablas)
- **no escribe** en el otro grupo: insert, update, ni desactivar a su admin
- no puede editar ni su propio grupo (el contrato es del SuperAdmin)
- no puede poner como activa una marca ajena, ni por la tabla ni forzando el id
- al cambiar de marca, el alcance se mueve de verdad
- el consolidado del grupo sólo incluye marcas del grupo

Borra todo lo que crea, pase lo que pase. **Si este test no está verde, no se
toca nada más del rol.**

## Cómo se da de alta un grupo

1. SuperAdmin → **Grupos** → Nuevo grupo (nombre, razón social, CUIT, precio,
   contacto de facturación).
2. Agregarle concesionarias con el selector. Sólo aparecen las que no están en
   otro grupo.
3. **Invitar admin del grupo**: una sola cuenta, con acceso a todas las marcas.

Al meter una marca en un grupo, su `monthly_price` pasa a **0**: el contrato es
del grupo y dejar los dos importes haría que la facturación cuente dos veces lo
mismo.

## Lo que ve el admin de grupo

- **Selector de marca** arriba del menú: el grupo y la marca activa. Cambiar de
  marca recarga toda la app en el alcance nuevo.
- **`/group`** — el consolidado: una fila por marca con leads, contactados,
  presupuestados, ventas, conversión y facturación, ordenadas por ventas, más el
  total del grupo. Botón "Entrar" en cada marca.
- **El resto de la app** idéntica a la de un Admin, en la marca activa.

### Por qué la inversión de ads se pide a mano

El costo por lead necesita el gasto de Meta/Google/TikTok, que se pide en vivo a
Zernio: son varias llamadas HTTP por marca, y un grupo de 10 marcas tardaría diez
veces lo que tarda una. La pantalla carga rápido con lo de la base y la inversión
se trae con un botón. Si alguna marca tiene más anuncios de los que se pueden
traer en una consulta, lo avisa en vez de mostrar un número corto en silencio.

## Estado

| Fase | Estado |
|---|---|
| 1 — Base y candado (schema, funciones, RLS) | ✅ |
| 2 — Test de aislamiento (42 afirmaciones) | ✅ |
| 3 — Selector de marca | ✅ |
| 4 — Consolidado del grupo | ✅ |
| Alta desde el SuperAdmin | ✅ |

### Pendiente

- **Inbox unificado** entre marcas: decidido que NO va en la v1. El inbox sigue
  siendo por marca; se cambia con el selector. Toca asignación, round-robin y
  presencia, que están pensados por empresa y sucursal.
- **Facturación del grupo** en el panel de Facturación: hoy el precio se guarda
  en `groups.monthly_price` y la pantalla de Facturación sigue listando
  concesionarias. Las marcas de un grupo aparecen en 0.
- **Un gerente en dos marcas**: no se contempla. Si aparece el caso, se resuelve
  con una tabla de membresías usuario↔concesionaria, no estirando este rol.
