# Cotizador de usados — fuente de precios

## Qué se usa y por qué

**Guía Oficial de Precios de ACARA.** La releva mensualmente la Comisión de
Valuación de Vehículos Usados de ACARA, integrada por representantes de
concesionarios reales. No son precios de publicación como los de un portal
(donde el que pide de más queda tres meses publicado): es el consenso de los que
compran y venden. Y los valores rigen para **Capital y GBA**, que es exactamente
la plaza del piloto, en vez de un promedio nacional.

**Uso autorizado por ACARA**, gestionado por el cliente en su condición de socio.
La publicación lleva la leyenda "queda terminantemente prohibida la reproducción
total o parcial", así que sin esa autorización esto no existiría.

## De dónde sale el dato

El sitio público en PHP (`acaramotos.org.ar`) sirve una versión de la guía cuyo
año más nuevo es **2023**: sirve para consultar a mano, no para integrar. La guía
vigente está detrás de la API del sitio nuevo:

```
GET api.acara.org.ar/api/v1/prices/brands-by-vehicule-type?vehiculeType=1   → JSON
GET api.acara.org.ar/api/v1/prices/model-list?vehiculeType=1&vehiculeBrandId= → JSON
GET api.acara.org.ar/api/v1/prices/version-list?…&vehiculeModelId=           → JSON
GET api.acara.org.ar/api/v1/prices/get-vehicules?vehiculeType=1&vehiculeBrandId= → HTML
```

`vehiculeType`: 1 autos · 2 motos · 3 camiones · 4 maquinaria agrícola.
Sin el header `Accept: application/json` la API responde con un redirect a la home.

**El pedido que hace viable todo esto** es el último: `get-vehicules` acepta sólo
la marca y devuelve **todas sus versiones** en una tabla (Fiat: 268 filas). Así
la guía completa son ~142 pedidos por mes en vez de decenas de miles, uno por
versión. Entre marcas se espera 1,2 s: el servidor es de otro.

## Trampas del formato (todas encontradas con datos reales)

**La moneda viene por fila.** Hay vehículos cotizados en dólares — de 14.815
valores, 6.123 están en USD (todo Audi, BMW, el Fiat 500…). Confundirla no da un
número raro: da uno mil veces equivocado.

**Las columnas de año no son fijas.** Se leen del `<thead>` de cada respuesta. Hoy
son 0km + 2025…2012.

**La API devuelve enteros limpios en pesos** (`34010000`), pero el sitio viejo
devolvía `34.010,0` **en miles**. El parser acepta sólo dígitos sin separadores y
descarta lo demás contándolo como anomalía: si ACARA cambia el formato, el sync
avisa en vez de guardar valores con un factor 1000 de error.

**La tabla por marca no trae ids**, sólo nombres. Los ids salen del endpoint de
versiones, uno por modelo: más de 4.000 pedidos por mes para guardar un número
que no usamos. Así que la identidad de una fila es `(brand_id, modelo, versión)`
con los strings **exactos** de la guía. Eso no es matcheo difuso — el matcheo que
sí está prohibido es intentar adivinar a qué versión de ACARA corresponde un texto
nuestro, y se evita haciendo que el usuario elija de esta lista.

## Cómo está guardado

`used_price_guide` — una fila por (marca, modelo, versión, año, mes de guía).

- `year is null` = unidad 0km. Se guarda porque es el techo: un usado no puede
  valer más que el 0km, y la relación entre los dos delata un valor viejo.
- Cada sync escribe su propio `as_of` y **no pisa los meses anteriores**. Sirve
  para reproducir una cotización vieja tal como se hizo y para ver la evolución.
- La clave usa `unique nulls not distinct`: en Postgres `null <> null`, así que
  sin eso las 774 filas de 0km se duplicaban en cada corrida del mismo mes. Pasó
  de verdad — 29 filas de más entre una prueba y el sync completo.

`used_price_syncs` — log de cada corrida, para saber si el precio que se muestra
es de este mes o de hace tres sin tener que deducirlo de los datos.

## Cómo se sincroniza

```bash
pnpm sync:acara                  # la guía completa (~3 min)
pnpm sync:acara --brand FIAT     # una marca, para probar
pnpm sync:acara --dry-run        # sin escribir
```

También está `GET /api/cron/sync-acara` con `Authorization: Bearer $CRON_SECRET`.

**No está declarado en `vercel.json` a propósito.** El plan Hobby admite 2 crons
y ya están usados (pagos y planillas); declarar un tercero hace fallar el deploy
completo, no sólo el cron — ya pasó. Mientras el plan siga en Hobby, el sync se
dispara a mano una vez por mes o desde un scheduler externo.

## Estado

Primera sincronización: **21/08/2026** — 142 marcas, 14.815 valores, 0 celdas
ignoradas, 187 s.

| | |
|---|---|
| Valores en pesos | 8.692 |
| Valores en dólares | 6.123 |
| Unidades 0km | 774 |
| Años | 0km + 2025 … 2012 |

## El cotizador

### Los tres números

El precio de la guía **no es** la cotización. Son tres cosas distintas:

1. **valor de guía** — lo que dice ACARA para esa versión y año
2. **valor de mercado** — la guía ajustada por los km y el estado de ESTE auto
3. **oferta de toma** — mercado − reacondicionamiento − margen

El cliente confunde 2 con 3 ("¿cómo me lo tomás a 16 si vale 18?"), así que el
motor los devuelve separados: el asesor ve el rango y el desglose completo, y al
cliente le sale **un solo número**.

### El motor

`src/lib/used-prices/valuate.ts` es una **función pura**: no toca base ni red,
todo entra por parámetro. En una función que decide cuánta plata se ofrece por un
auto, poder testearla no es un lujo — `pnpm test:valuation`, 22 casos.

Los casos que se testean no son la aritmética por la aritmética, son los que se
pagan con plata:

- un auto con 900.000 km **no** puede dar un valor negativo (tope de ajuste)
- un usado **no** puede valer más que el 0km (techo, con aviso cuando se topa)
- el premio por pocos km es menor que el castigo por muchos: pagar de más por un
  auto poco rodado es un riesgo, no una ganancia
- dos concesionarias con distintos porcentajes ven **el mismo valor de mercado** y
  ofertas distintas: los parámetros afectan la oferta, no el mercado

### Los parámetros (por concesionaria)

En `/admin/valuations`, sólo Admin: son los números que deciden cuánta plata se
ofrece. Reacondicionamiento, margen, amplitud del rango, km esperados por año,
castigo/premio por km con su tope, ajuste por estado, y el dólar para los
vehículos que la guía publica en USD.

La pantalla tiene **vista previa en vivo** sobre un auto de $20.000.000: un
porcentaje suelto no dice nada, "esto ofrece 17,2" sí. Y avisa si el descuento
total pasa el 25% (el cliente lo vende por su cuenta) o baja del 5% (no queda
margen para reacondicionar).

Si no hay fila cargada, se usan los defaults del motor: la concesionaria puede
cotizar desde el minuto cero.

### Dónde se cotiza

**Inbox** — botón "Cotizar un usado" sobre el composer. Cuatro campos, y el botón
de enviar arma el texto para el cliente con un solo número. Está en el inbox y no
en otra pantalla porque el momento de cotizar es mientras se chatea: si hay que
navegar, el asesor tira un número de memoria.

**Ficha del lead** (admin, gerente y vendedor) — el usado deja de ser texto libre
y pasa a ser un dato: versión exacta de la guía, km, estado, valor y desglose.
Con historial de tasaciones anteriores. Y **vencen**: a los 30 días la ficha avisa
que la guía cambió de mes y conviene recotizar, en vez de mostrar un número viejo
como si estuviera vigente.

**La venta** — se registra lo que se pagó de verdad y, cuando pasa, a cuánto se
revendió. Muestra el desvío contra lo cotizado y el margen real. Es lo que cierra
el círculo cotizado → pagado → revendido, y lo que convierte al historial propio
en la mejor fuente de precios a mediano plazo.

### Reglas que no se tocan

**El bot no cotiza.** Sus guardrails bloquean precio, descuento, seña y tasa, y
derivan a un asesor. El cotizador le da el número al asesor; el asesor decide.

**El asesor cotiza libre**, sin aprobación del gerente (decisión del cliente).
Si se pasa del techo sugerido, la pantalla lo dice y se guarda igual **con su
nombre**. El control es a posteriori, con el desvío cotizado vs pagado.

**No se inventa un tipo de cambio.** Si el vehículo cotiza en dólares y el admin
no cargó el dólar, la cotización queda en dólares — que es como se operan esos
autos.

## Lo que falta

- **Liquidez desde DNRPA** (transferencias): cuántas unidades de esa versión y año
  cambiaron de manos de verdad, y en qué provincia. ACARA dice cuánto vale, DNRPA
  dice si se rota. Es dato abierto y complementario; hoy la rotación no entra en
  el cálculo.
- **Reporte de tasaciones** para el gerente: qué se cotizó, quién, cuánto se
  desvió del sugerido y cuántas terminaron en venta. Sin eso no hay forma de
  saber si el cotizador está bien calibrado.
- **Cotizador público** en la web del concesionario (quedó fuera de alcance).
