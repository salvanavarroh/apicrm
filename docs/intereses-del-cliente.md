# Intereses personales del cliente — plan

Objetivo: que el vendedor pueda registrar en un clic datos personales que sirven
para romper el hielo (de qué cuadro es, cuándo cumple años, cómo se llama la
hija) y que el sistema se los devuelva en el momento justo.

**Estado: no existe nada en el repo.** Lo verifiqué: `quickUpdateLead` y
`quickAddNote` en el inbox son otra cosa (estado, temperatura y notas libres).
No hay tabla, columna ni UI para esto.

---

## 1. Por qué no alcanza con "usá el campo de notas"

Hoy esto se puede escribir en una nota. El problema es que una nota:

- no se puede consultar ("¿qué leads son de Boca?" no tiene respuesta),
- no dispara nada (nadie se entera de que el cliente cumple años mañana),
- se pierde entre 40 notas de gestión,
- y no sobrevive al cambio de vendedor, que es justo cuando más se necesita.

El valor no está en guardar el dato: está en que **el sistema te lo recuerde
antes de que llames**.

---

## 2. Modelo de datos

Dos opciones. Recomiendo la segunda.

**Opción A — columnas en `leads`.** Simple pero rígida: cada dato nuevo es una
migración, y la mayoría queda en null.

**Opción B — tabla de atributos tipados (recomendada).**

```sql
create type public.interest_kind as enum (
  'club',          -- cuadro de fútbol
  'cumpleanos',    -- fecha (día/mes, sin año: no hace falta la edad)
  'familia',       -- "hija: Sofía, 8 años"
  'hobby',         -- pesca, golf, moto
  'mascota',
  'profesion',
  'vehiculo_actual',
  'no_molestar',   -- horarios en los que no quiere que lo llamen
  'otro'
);

create table public.lead_interests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  kind public.interest_kind not null,
  value text not null,               -- "Boca", "Sofía", "pesca"
  detail text,                       -- contexto libre opcional
  -- Para 'cumpleanos': día y mes, sin año. Permite el recordatorio sin guardar
  -- la edad, que es un dato sensible que no necesitamos.
  day int check (day between 1 and 31),
  month int check (month between 1 and 12),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lead_id, kind, value)
);
```

Por qué así:
- **Consultable**: "leads de Boca en la sucursal Centro" es un `where`.
- **Extensible**: sumar `kind` es agregar un valor al enum, no una migración de
  tabla.
- **Auditable**: se sabe quién cargó qué y cuándo.
- **Cumpleaños sin año**: alcanza para el saludo y evita guardar la edad.

---

## 3. UI: tiene que costar menos que no hacerlo

La regla es que cargar un interés no puede tomar más de 2 segundos, o no se usa.
Tres puntos de captura:

**a) Chips en la ficha y en el panel del inbox.**

```
INTERESES                                    [+]
┌──────────────────────────────────────────────┐
│ ⚽ Boca  ×    🎂 14/03  ×    👨‍👧 Sofía (hija) × │
│ [+ cuadro] [+ cumple] [+ familia] [+ hobby]  │
└──────────────────────────────────────────────┘
```

Los botones `[+ …]` abren un input chico con autocompletado. Para `cuadro`, una
lista de los clubes argentinos; para `cumple`, un selector de día y mes.

**b) Detección asistida desde la conversación.** El inbox ya tiene el texto de
los mensajes. Si el cliente escribió "justo el finde juega Boca", se ofrece un
chip sugerido `⚽ Boca — ¿guardar?`. Un clic confirma. **Sugerir, nunca guardar
solo**: si se equivoca, el vendedor arranca la charla con un dato falso, que es
peor que no tener nada.

**c) Al cerrar una actividad.** Después de registrar un llamado, una línea
opcional: "¿algo personal que quieras recordar?".

---

## 4. Dónde el sistema lo devuelve (esto es lo que importa)

Guardar sin devolver es un cementerio de datos. Cuatro lugares:

1. **Encabezado de la ficha**, junto a los chips de estado. Se ve antes de
   llamar, sin buscarlo.
2. **Próxima acción** (`next-best-action.ts`). Regla nueva: si el cumpleaños es
   dentro de 7 días y el lead está activo → "Saludalo por el cumpleaños" con
   prioridad alta. Es la mejor excusa para reactivar un lead frío y no cuesta
   nada.
3. **Plantillas de WhatsApp.** Variables nuevas `{club}`, `{hijo}` para armar
   mensajes que no suenen a plantilla.
4. **Agenda del día.** "Hoy cumple años Sandro Pérez (lead de Juan)".

Y un reporte chico: **"Cumpleaños del mes"**, que encaja directo en el catálogo
de Reportes que acabo de construir.

---

## 5. Privacidad — la parte que no hay que saltear

Se están guardando datos personales de terceros que no son clientes todavía. En
Argentina aplica la Ley 25.326 de Protección de Datos Personales.

Reglas que propongo dejar escritas en el producto:

1. **Nada de categorías sensibles.** El enum NO incluye religión, salud,
   ideología política, orientación sexual ni afiliación sindical. El cuadro de
   fútbol está al borde y lo dejaría; el resto, no. Que el enum sea cerrado es
   justamente lo que impide que alguien cargue lo que no corresponde.
2. **Sin campo libre sin etiquetar.** `detail` es contexto, no un cajón de sastre.
3. **Se borra con el lead** (`on delete cascade`) y entra en cualquier pedido de
   baja de datos.
4. **Visible para el equipo, no para el cliente.** Nunca se muestra en un
   presupuesto ni en un mensaje automático sin que el vendedor lo apruebe.
5. **Auditoría**: `created_by` responde quién cargó cada dato.

Una línea en la UI, chica pero importante: *"Datos para mejorar la atención. No
cargues información sensible."*

---

## 6. Qué haría diferente / qué sumaría

- **Que el cumpleaños alimente una campaña de reactivación.** Un lead perdido
  hace 8 meses al que le llega un saludo el día del cumpleaños es la reactivación
  más barata que existe.
- **"Cosas que NO le gustan".** Un `kind` = `no_molestar` con "no llamar antes de
  las 10" vale tanto como saber de qué cuadro es. Evita el llamado que arruina
  la relación.
- **Heredar el interés al recomprar.** Si el mismo teléfono vuelve en 3 años,
  los intereses siguen ahí. Con la fase 1 de posventa (vehículos vendidos), esto
  se vuelve muy potente.
- **NO gamificar la carga.** La tentación es premiar al vendedor que más
  intereses carga; el resultado sería basura inventada. Mejor medir si los leads
  con intereses cargados convierten más, y mostrar ese dato.

---

## 7. Esfuerzo

| Fase | Qué | Tamaño |
|---|---|---|
| 1 | Migración + chips en ficha e inbox + carga manual | Chico |
| 2 | Regla de cumpleaños en próxima acción + agenda | Chico |
| 3 | Variables en plantillas de WhatsApp + reporte de cumpleaños | Chico |
| 4 | Detección asistida desde la conversación | Medio |

La fase 1 y 2 juntas son la mitad del valor y son un rato de trabajo. Lo dejo
listo para arrancar cuando lo apruebes: la única decisión pendiente es
**confirmar la lista de `kind`** — sobre todo si querés que `club` esté o no.
