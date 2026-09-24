# API CRM → MotorBox — Respuesta

> **Responde a:** «Estado completo», 24/09/2026.
> **Fecha:** 24/09/2026.
> **Lo primero:** su endpoint de canje ya está bien. Lo verificamos.
> **Encontraron un hueco real de nuestro lado** y ya está tapado: §2.
> **Adjuntamos el spec actualizado**, con el §12.1 nuevo que es justo lo que pidieron.

---

## 1. Su servidor ya valida

Confirmado desde afuera, hoy:

| Lo que mandamos | Lo que respondían ayer | Lo que responden hoy |
|---|---|---|
| sin ticket | «Entrá desde el menú de API CRM» | igual |
| `?ticket=basura` | **«Falta configurar el servidor»** | **«No pudimos validar el acceso»** |

Ahora intenta validar y falla donde tiene que fallar. Lo de ayer era configuración de ustedes, y se
resolvió.

Una sugerencia chica, de algo que nos costó una tarde a los dos: cuando el mensaje sea por
configuración faltante, que diga **cuál**. «Falta configurar el servidor» nos mandó a buscar el
problema en nuestro `iss`; «falta `API_CRM_ORIGIN`» lo cerraba en diez segundos. Es lo que hacemos
de este lado: cuando falta una variable, el log la nombra.

De paso: nosotros también teníamos el `iss` mal —salía sin `www`, porque viajaba pegado a una
variable que el CRM usa para los mails de invitación—. Ya está arreglado y ahora vive en su propia
variable, para que no vuelva a pasar por un cambio ajeno.

---

## 2. Tenían razón, y encontraron un hueco que no habríamos visto

> «Construimos los cinco manejadores con la apuesta más razonable.»

De los cinco eventos, **sólo tres se disparaban**. `user.deactivated` y `whatsapp.changed` estaban
declarados como tipos válidos pero no los emitía nadie: ustedes habrían esperado para siempre dos
eventos que no iban a llegar nunca, sin ningún error que lo delatara.

Lo detectaron leyendo su propia lista contra la nuestra. Gracias — de nuestro lado no había forma de
notarlo, porque el código compilaba perfecto.

Ya están enganchados:

- **`user.deactivated`** — al desactivar un usuario y al borrarlo. Importa más de lo que parece: su
  sesión embebida dura 8 h, así que sin este aviso alguien dado de baja en el CRM sigue publicando
  hasta que expire.
- **`whatsapp.changed`** — al conectar y al desconectar un canal. Ustedes publican ese número en
  cada aviso; si queda muerto, los leads se pierden sin que nadie se entere.

Y su apuesta era correcta: **el campo es `company_id`**, en los cinco.

---

## 3. El cuerpo de los eventos — §12.1 del spec adjunto

Tenían razón también acá: el spec traía la tabla de tipos pero ningún ejemplo de cuerpo, a
diferencia del ticket y de los leads. Adivinar no es un contrato. Va lo que manda el emisor real:

**Los cuatro campos comunes, en los cinco eventos:**

```json
{
  "event_id":    "company.suspended:9a1e0000-...-0002:1790194651",
  "type":        "company.suspended",
  "company_id":  "9a1e0000-...-0002",
  "occurred_at": "2026-09-24T14:03:00.000Z"
}
```

`company_id` es el `companies.id` de API — el mismo uuid que viaja en el ticket y que ustedes
guardan como `origen_id`. Sin excepciones. `event_id` es estable entre reintentos: dedupliquen por
ahí.

**Los dos con campo extra:**

```json
// user.deactivated  →  + user_id  (el profiles.id de API, su origen_id de usuario)
{ "user_id": "6f1c2f7e-...-0001" }

// whatsapp.changed  →  + channel_id
{ "channel_id": "c1a2b3c4-...-0003" }
```

**Un detalle de diseño que conviene tener presente:** `whatsapp.changed` **no dice si se conectó o
se desconectó**. El evento significa "algo cambió en los WhatsApp de esta concesionaria, volvé a
pedir el perfil". Ningún evento manda el estado nuevo en el cuerpo — avisan *qué* cambió, no *cómo
quedó*. Para eso está el endpoint de perfil, que siempre tiene la verdad actual.

Es a propósito: si dos webhooks llegan desordenados, un cuerpo con estado dejaría datos viejos
pisando datos nuevos. Volviendo a pedir el perfil, eso no puede pasar.

---

## 4. Multimarca: es un caso real, pero no los apura

Su defensa —un email ya vinculado no se vincula a una segunda concesionaria— **es correcta y no la
cambien para el caso general.** Es exactamente lo que pedimos en el spec: nunca fusionar en
silencio, porque fusionar mal significa que alguien ve los leads de otra agencia.

El caso multimarca es distinto, y sí es real: el CRM tiene grupos, y un **admin de grupo** maneja
varias marcas con un solo usuario, cambiando de marca activa con un selector. Cada marca es una
concesionaria separada. Hoy en el piloto hay un grupo con dos empresas, pero es data de prueba: **no
hay ningún cliente multimarca en producción todavía.**

Así que no rediseñen ahora. Pero hay una distinción que les deja la puerta abierta sin ceder nada de
seguridad:

> Su regla protege contra que **un usuario reclame** una segunda concesionaria. Un ticket firmado
> por nosotros no es un reclamo: es una afirmación del sistema que maneja esas identidades.

Concretamente: cuando el admin de grupo cambia de marca, les llega un ticket **con el mismo
`user.id` y el mismo email, pero otro `company.id`**, y con `user.role: "group_admin"`. Ese rol es
la señal. La regla podría quedar:

- rechazar vincular un email a una segunda concesionaria **por iniciativa del usuario** — como está hoy;
- aceptarlo **sólo cuando lo afirma un ticket nuestro con `role: "group_admin"`**.

Si prefieren dejarlo para cuando aparezca el primer cliente multimarca real, nos parece bien.
Avisaremos con tiempo.

---

## 5. `api_crm_company_id`: `null` explícito

Ya lo habíamos elegido el 23/9 y parece que ese documento no les llegó — va de nuevo.

**Presente y en `null`** cuando el aviso es de una concesionaria propia de ustedes.

Funcionalmente `null` y ausente son idénticos para nosotros: los dos fallan el chequeo de
pertenencia. La diferencia es de diagnóstico. El `null` dice *"lo miramos, no es de API CRM"*; un
campo ausente deja la duda de si es eso o si se perdió en la serialización — y esa duda aparece
justo cuando estás buscando por qué un lead no se atribuyó.

Ya está implementado, y distingue los dos casos:

- **`null`** → concesionaria de ustedes. Caso normal, silencioso, no se loguea.
- **uuid que no corresponde** → alguien pegó el código de un aviso ajeno. Eso sí queda logueado
  como anomalía.

Sin la distinción, el ruido de los avisos normales habría tapado la señal del caso raro.

---

## 6. Sus dos decisiones distintas del spec

Gracias por registrarlas en vez de dejarlas pasar. Una nos parece bien; la otra tiene un costo que
conviene que sea a ojos abiertos.

**Publicar sin WhatsApp conectado, con advertencia** — nos parece bien. Bloquear era demasiado duro
y el spec ya contemplaba dejar terminar el onboarding. Ahora que `whatsapp.changed` se dispara al
conectar, la concesionaria que conecte después va a quedar completa sola, sin que nadie toque nada.

**Contraseña propia para cuentas que vinieron por SSO** — acá hay un costo real. Si alguien deja la
concesionaria, el CRM lo da de baja y les mandamos `user.deactivated`: ustedes invalidan la sesión,
pero **la contraseña sigue funcionando**. Esa persona vuelve a entrar y sigue viendo el stock y los
leads de una agencia de la que ya no es parte.

No decimos que la saquen: puede haber buenas razones (acceso cuando el CRM está caído, por ejemplo).
Pero si la dejan, que `user.deactivated` **bloquee la cuenta, no sólo la sesión**. Si no, el aviso
no sirve para lo único que lo hace valioso.

---

## 7. Lo que falta de nuestro lado

**La cuenta de prueba.** Es lo único que traba cerrar la fase 1, y tienen razón en cómo lo
plantean: un ticket suelto no sirve, vive 90 segundos. Necesitan poder generarlos ustedes. Está en
curso.

**El spec actualizado.** Adjunto, con el §12.1 nuevo. También corregidos: `api_crm_company_id`,
`currency` obligatoria, su dominio `www.motorbox.ai` y el contrato del ticket confirmado contra el
emisor real (§5.0).

---

## 8. Sobre Safari

Que lo marquen como pendiente en vez de darlo por hecho es lo correcto, y coincidimos en que no se
cierra esto sin esa prueba.

Un pedido: **en un iPhone de verdad, no en el simulador.** El simulador comparte más estado con el
Mac que el teléfono, y el modo de falla que nos preocupa —Safari bloqueando la cookie de un sitio
mostrado adentro de otro— es justamente el que puede pasar en uno y no en el otro.

Es la prueba que justifica toda la decisión del subdominio. Si pasa, el diseño era el correcto. Si
falla, queremos saberlo antes de la demo y no durante.
