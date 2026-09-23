# API CRM → MotorBox — Respuesta

> **Para:** el equipo de MotorBox y su agente de código.
> **Responde a:** «Dónde estamos con la integración», 15/09/2026.
> **Fecha:** 22/09/2026.
> **Cambia dos cosas del contrato.** Están en §3, y las dos tocan código de los dos lados.
> Los specs (`motorbox-spec-motorbox.md`, `motorbox-spec-api.md`) ya quedaron actualizados con todo
> lo de acá: si hay diferencia entre este documento y el spec, **manda el spec**.

---

## 1. Las tres preguntas

### 1.1 El dominio del CRM es `www.apicrm.ai`

Con `www`. Confirmado y definitivo.

```
https://www.apicrm.ai       → API CRM
https://motorbox.apicrm.ai  → MotorBox embebido
https://www.motorbox.ai     → el marketplace público, sin cambios
```

Tenían razón en la observación: `app.apicrm.ai` no resuelve. Evaluamos crearlo y lo descartamos —
la landing y la app son el mismo Next y el mismo deployment, así que `app.` era prolijidad de
nomenclatura y no aportaba nada a la integración. Lo único que hace falta es que los dos hosts
compartan `apicrm.ai`, y `www.apicrm.ai` ya lo cumple.

**El `www` no es opcional y es el detalle que más fácil se rompe.** Ese string exacto va en tres
lugares de su código:

| Dónde | Valor |
|---|---|
| `frame-ancestors` | `https://www.apicrm.ai` |
| Validación de `event.origin` en cada `postMessage` | `https://www.apicrm.ai` |
| `iss` esperado del ticket | `https://www.apicrm.ai` |

Sin `www` no valida nada, y el síntoma es un iframe en blanco sin un solo error que explique por qué.
Comparación exacta con `===`, nunca `endsWith` ni comodín.

De nuestro lado ya está anotado como tarea de Fase 0 confirmar que `apicrm.ai` a secas redirige a
`www.apicrm.ai` y no sirve la app en paralelo.

### 1.2 Vercel: repos distintos, proyectos distintos, y el TXT casi seguro va

MotorBox vive en otro repo y otro proyecto de Vercel. No tenemos a mano si además es otro *team*, y
no hace falta averiguarlo antes de empezar: **denle de alta el dominio y mándennos lo que el panel
les muestre**, sea un registro o dos.

Si aparece el `TXT` en `_vercel.apicrm.ai`, lo creamos nosotros junto con el `CNAME`. Está
contemplado en nuestra checklist, no es un ida y vuelta.

Un dato para que no pierdan una tarde: si el DNS termina estando en Cloudflare, el `CNAME` va en
**gris (DNS only)**, no proxiado. Proxiado pelea con la emisión del certificado de Vercel.

### 1.3 Sí, el iframe lleva `allow="camera"`

Ya estaba en el spec, no era de pasada. El atributo completo:

```html
allow="camera; clipboard-write; fullscreen"
```

Está en `motorbox-spec-api.md` §5.3 desde la primera versión, y anotado como dependencia de ustedes
en `motorbox-spec-motorbox.md` §8.4. Sacar una foto desde el celular y subirla funciona.

Dos cosas del mismo párrafo que conviene no perder de vista, porque son las que sí se rompen dentro
de un iframe:

- **`window.open` puede quedar bloqueado.** Para cualquier cosa que tenga que abrirse afuera
  (documentación, un link a Meta, una descarga), manden `motorbox:navigate` y lo abre el parent.
- **Las descargas de archivos generados en el cliente** también: por `motorbox:navigate` con
  `target: "blank"`.

---

## 2. Lo que aceptamos de su lado sin cambios

**Los nombres.** `origen` / `origen_id` en vez de `external_source` / `external_id`, `dealers.id`
de tipo `text`, una sola tabla de avisos para particulares y agencias, la persona vinculada a su
concesionaria por una columna del perfil. Ninguna cambia el contrato y ninguna nos afecta. Están
anotados en el spec de ustedes (§2 y §4) para que su agente no crea que hay una diferencia real que
resolver.

Lo único que el contrato exige de todo eso es la **restricción**: índice único parcial sobre el par
`(origen, origen_id)`, que ya tienen.

**«Campo virgen» confirmado.** Con las seis concesionarias como datos de demo, no hace falta el flujo
de reclamo ni el de fusión en v1. Lo marcamos como decisión cerrada en los tres documentos. Si en
algún momento aparece una concesionaria auto-registrada de verdad, el paso de "vincular cuenta
existente" está diseñado (§14 del spec de ustedes, fila "CUIT duplicado") pero **nunca automático**:
fusionar mal significa que alguien ve los leads de otro, y eso no se deshace.

**Publicación directa sin moderación.** Es decisión de ustedes y no nos toca.

---

## 3. Dos cambios en el contrato

### 3.1 La moneda: tienen razón, y nos cuesta menos de lo que pensaban

Mandan `price` + `currency` (`"ARS"` | `"USD"`) en la moneda en que lo cargó quien vende, sin
convertir. Aceptado, y por el mismo argumento que dieron: convertir en el origen graba un número
calculado con la cotización de ese día, y en dos días el lead dice un precio que el vendedor nunca
puso.

Lo verificamos contra nuestro schema antes de contestar. Tres cosas:

1. **El precio del aviso no aterriza en ninguna columna tipada nuestra.** `lead_vehicles` no tiene
   campo de precio, y `leads.budget_min`/`budget_max` son el presupuesto del **comprador**, que es
   otra cosa. El precio del aviso va a `metadata` y, formateado, al texto de la nota del vehículo.
   O sea: guardamos los dos campos juntos tal cual llegan y listo.
2. **Ya tenemos el precedente exacto de las dos monedas en producción.** Nuestra guía de precios de
   usados usa `currency char(3) check (currency in ('ARS','USD'))`. Mismo criterio.
3. Lo único que nos toca de verdad es la presentación: una función nuestra de formato está clavada
   en pesos. Es una función chica y ya está anotada.

**Lo que les pedimos a cambio:** manden siempre los dos campos juntos, nunca el número solo, ni
siquiera cuando sea ARS. Un precio sin moneda es ambiguo apenas existe el segundo caso, y el día que
llegue uno sin `currency` no vamos a saber si es un peso o un dólar.

### 3.2 `dealer_external_id` pasa a llamarse `api_crm_company_id`

Este es el cambio importante, y salió justamente de su respuesta.

En el endpoint de publicaciones, el spec pedía un campo `dealer_external_id`. Cuando dijeron que
`dealers.id` es `text` y que nuestro `company_id` vive en su propia columna, quedó claro que el
nombre viejo es ambiguo: **ustedes tienen dos ids de concesionaria y el campo no decía cuál de los
dos va.**

De nuestro lado ese campo se usa para un chequeo de seguridad:

```
listing.api_crm_company_id === channel.company_id
```

Si ahí llega el id de MotorBox en vez de nuestro uuid, el chequeo falla **siempre**. Y no falla
ruidosamente: el marcador se ignora, el lead se crea igual como un WhatsApp común, y **todos** los
leads de MotorBox pierden la atribución sin un solo error en los logs. Se descubriría tres semanas
después, cuando alguien pregunte por qué MotorBox no aparece en ningún reporte.

El campo nuevo, entonces:

```json
{
  "ok": true,
  "listing": {
    "public_code": "8f3k2",
    "url": "https://www.motorbox.ai/p/toyota-corolla-xei-2021-8f3k2",
    "status": "published",
    "brand": "Toyota",
    "model": "Corolla",
    "version": "XEI 1.8 CVT",
    "year": 2021,
    "km": 45000,
    "price": 28500000,
    "currency": "ARS",
    "condition": "usado",
    "photo_url": "https://...",
    "api_crm_company_id": "9a1e...",
    "api_crm_branch_id": "b1..."
  }
}
```

- `api_crm_company_id` = **el uuid de API**, o sea el `origen_id` de esa concesionaria cuando
  `origen = 'api_crm'`. Nunca el `dealers.id` de MotorBox.
- `api_crm_branch_id` = el uuid de la sucursal de API, mismo criterio. Puede ser `null`.
- `location_external_id` del payload de ingesta S2S se renombra igual, por coherencia.

Nada más del contrato cambia.

---

## 4. Tres cosas del spec que conviene no perder

No son novedades, pero son las que más fácil se saltean y las tres rompen en silencio.

**El canje del ticket va contra el host embebido.** El endpoint tiene que vivir en
`motorbox.apicrm.ai/api/sso/...`. Si se canjea contra `www.motorbox.ai`, la cookie se setea en el host
público y el iframe sigue sin sesión. Es el bug más probable de toda la integración.

**Nunca mostrar el login de MotorBox dentro del iframe.** Cuando la sesión venza, sirvan la página
mínima que hace `postMessage` `motorbox:need-ticket` y muestra un spinner; nosotros respondemos con
un ticket nuevo y el usuario no se entera. Un formulario de login apareciendo adentro del CRM es un
bug, no un estado válido.

**El marcador de WhatsApp va en la última línea, precedido por una línea en blanco.** La gente edita
el mensaje antes de mandarlo y lo que borra es el principio, nunca el final. Formato exacto
`[MB:<código>]`, un solo marcador por mensaje.

Y la que ustedes mismos rescataron y tienen toda la razón en rescatar: **probar en un iPhone real,
no en el simulador.** Todo el diseño del subdominio existe por eso. Andaría perfecto en Chrome
durante todo el desarrollo.

---

## 5. Qué necesitamos, y cuándo

### De ustedes

| Qué | Cuándo |
|---|---|
| Los registros DNS que les muestre Vercel (CNAME, y TXT si aparece) | ahora — bloquea todo |
| `API_CRM_PARTNER_KEY` — para que leamos sus publicaciones | ahora |
| `API_CRM_WEBHOOK_SECRET` — para verificar lo que nos mandan | ahora |
| La URL exacta del endpoint de publicaciones | antes de la fase de atribución |
| Confirmación de que devuelve `api_crm_company_id` y `price` + `currency` | con el endpoint |

### De nosotros

| Qué | Estado |
|---|---|
| `MOTORBOX_PARTNER_KEY` — para que lean perfiles de concesionaria | listo para entregar |
| `MOTORBOX_WEBHOOK_SECRET` — HMAC de MotorBox → API | listo para entregar |
| La URL del JWKS: `https://www.apicrm.ai/.well-known/jwks.json` | con la fase 1 |
| El registro DNS creado en nuestra zona | apenas nos lo manden |
| El endpoint de perfil de concesionaria | fase 2 |

Los secretos van por gestor de contraseñas o mensaje autodestructivo. Nunca por mail ni WhatsApp.
Nuestra clave privada del ticket no se comparte con nadie: ustedes verifican contra el JWKS público,
que es justamente para eso.

---

## 6. Orden

Coincidimos con el suyo. Una sola diferencia: **el punto 1 ya está resuelto** — el dominio está
confirmado arriba y las tres preguntas contestadas, así que no hace falta la llamada para
desbloquear. Arranquen por el alta del subdominio.

1. ~~Las tres preguntas y el dominio~~ → resuelto en este documento.
2. **Alta de `motorbox.apicrm.ai` en su Vercel** y mándennos los registros. Es lo único que bloquea.
3. **Intercambio de credenciales.**
4. **El canje del ticket.** El corazón. Si eso funciona en Safari, el resto es trabajo conocido.
5. **La atribución del lead:** el marcador y su endpoint de publicaciones.

Nosotros en paralelo: las fases 1, 2, 3 y 5 de nuestro lado no dependen de nada de ustedes.
La atribución (4) necesita su endpoint de publicaciones; los webhooks salientes (6), su endpoint de
eventos.

La llamada igual nos sirve, pero para revisar el canje del ticket cuando esté andando, no para
desbloquear.
