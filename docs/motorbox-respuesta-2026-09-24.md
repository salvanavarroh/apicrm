# API CRM → MotorBox — Respuesta unificada

> **Fecha:** 24/09/2026.
> **Reemplaza** las dos respuestas sueltas del 22/9 y del 23/9. Si tenían alguna a mano, tírenla:
> ésta las junta y agrega lo de hoy.
> **Responde a** «Estado completo» (24/9) y al pedido del 23/9 que, por lo que vimos, nunca les llegó.
> **Adjuntamos los specs actualizados.** Reemplazan los del 14/9 enteros.

---

## 1. La cuenta de prueba ya está — es lo que faltaba

Tienen razón en el planteo: un ticket suelto no sirve, vive 90 segundos. Necesitan poder generarlos
ustedes, cuantas veces haga falta. Así que está creada una concesionaria con su usuario admin.

```
URL ............ https://www.apicrm.ai/login
Email .......... prueba.motorbox@apicrm.ai
Contraseña ..... (va por gestor de contraseñas, aparte de este documento)
Rol ............ Admin
Concesionaria .. MotorBox — Cuenta de prueba
company_id ..... 7e573a1a-1e55-489b-8429-e461e62f3ffd
```

Entran, y en el menú lateral van a ver **Motorbox** bajo "Operación". Cada clic emite un ticket
fresco.

Tres cosas para que no los sorprendan:

**No hay entorno de staging para API CRM.** Es un solo proyecto, así que esta cuenta vive en la base
del piloto. Por eso quedó aislada a propósito: nombre inequívoco, sin precio mensual (queda fuera
del proceso de facturación) y con su propia sucursal. No toca datos de nadie.

**No tiene WhatsApp conectado**, así que `whatsapp[]` les va a venir **vacío**. Es a propósito: es
exactamente el caso que dijeron contemplar en el onboarding, y así lo prueban de verdad en vez de
asumirlo. Si más adelante quieren probar con un número conectado, avisen y lo agregamos.

**Es una cuenta real con permisos de admin**, no una maqueta. Puede ver y cargar leads de esa
concesionaria de prueba. No mezclen datos de clientes ahí.

---

## 2. El contrato del ticket, confirmado contra el emisor real

Esto lo pidieron el 23/9 y no les llegó la respuesta. Va verificado contra el código que firma, no
contra el documento. Lo cubre una prueba nuestra que firma un ticket y lo verifica igual que
ustedes, así que si cambia, se rompe la prueba antes que la demo.

| Qué | Valor |
|---|---|
| **Algoritmo** | **RS256** |
| `iss` | `https://www.apicrm.ai` — exacto, sin barra final |
| `aud` | `motorbox` |
| JWKS | `https://www.apicrm.ai/.well-known/jwks.json` |
| `exp` | 90 s desde `iat` |
| Header | lleva `kid` siempre |

**Los cuatro obligatorios, confirmados**, con estos nombres exactos:

| Campo | Forma |
|---|---|
| `jti` | uuid v4 |
| `sub` | `api_crm:profile:<uuid>` |
| `company.id` | uuid de `companies.id` — su `origen_id` |
| `user.email` | el email real |

Y el resto, tal como los leen: `company.name`, `company.status` (`"active"`), `user.id`,
`user.name`, `user.role` (`"admin"` \| `"group_admin"` — guardar, no autorizar con eso), `scope[]`
(`["dealer.admin"]` — autorizar con esto), `embed`, `act`.

Dos aclaraciones útiles:

- **`company.status` casi nunca les va a llegar distinto de `"active"`**: validamos antes de emitir,
  una concesionaria suspendida ni siquiera recibe ticket. Dejen el chequeo igual, cuesta una línea.
- **`user.email` no vive en nuestra tabla de perfiles**, sino en el sistema de autenticación. Lo
  resolvemos al emitir. Si un usuario no tuviera email, no emitimos ticket: preferimos eso a
  mandarles uno sin el campo con el que arman la sesión.

También, para el registro: nosotros tuvimos el `iss` mal un día —salía sin `www` porque viajaba
pegado a una variable que el CRM usa para los mails de invitación—. Ya está arreglado y ahora vive
en su propia variable, para que no vuelva a romperse por un cambio ajeno.

---

## 3. Los cinco webhooks: encontraron un hueco real

> «Construimos los cinco manejadores con la apuesta más razonable.»

De los cinco eventos, **sólo tres se disparaban**. `user.deactivated` y `whatsapp.changed` estaban
declarados como tipos válidos pero no los emitía nadie: habrían esperado para siempre dos eventos
que no iban a llegar, sin ningún error que lo delatara.

Lo encontraron leyendo su lista contra la nuestra. De nuestro lado no había forma de notarlo —el
código compilaba perfecto—. Ya están enganchados:

- **`user.deactivated`** — al desactivar y al borrar un usuario. Importa más de lo que parece: su
  sesión embebida dura 8 h, así que sin este aviso alguien dado de baja en el CRM sigue publicando
  hasta que expire.
- **`whatsapp.changed`** — al conectar **y** al desconectar un canal. Ustedes publican ese número en
  cada aviso; si queda muerto, los leads se pierden sin que nadie se entere.

Y su apuesta era correcta: **el campo es `company_id`**, en los cinco.

### 3.1 El cuerpo de cada evento

Tenían razón en pedirlo: el spec traía la tabla de tipos pero ningún ejemplo de JSON, a diferencia
del ticket y de los leads. Adivinar no es un contrato. Esto es lo que manda el emisor real, y está
en el §12.1 del spec adjunto.

**Los cuatro campos comunes, en los cinco eventos:**

```json
{
  "event_id":    "company.suspended:9a1e0000-...-0002:1790194651",
  "type":        "company.suspended",
  "company_id":  "9a1e0000-...-0002",
  "occurred_at": "2026-09-24T14:03:00.000Z"
}
```

`company_id` es el `companies.id` de API — el mismo uuid del ticket, el mismo que guardan como
`origen_id`. Sin excepciones. `event_id` es estable entre reintentos: dedupliquen por ahí.

**Los dos con campo extra:**

```json
// user.deactivated  →  + user_id  (el profiles.id de API, su origen_id de usuario)
{ "user_id": "6f1c2f7e-...-0001" }

// whatsapp.changed  →  + channel_id
{ "channel_id": "c1a2b3c4-...-0003" }
```

**Un detalle de diseño:** `whatsapp.changed` **no dice si se conectó o se desconectó**. Significa
"algo cambió en los WhatsApp de esta concesionaria, volvé a pedir el perfil". Ningún evento manda el
estado nuevo en el cuerpo: avisan *qué* cambió, no *cómo quedó*. Para eso está el endpoint de
perfil, que siempre tiene la verdad actual.

Es a propósito. Si dos webhooks llegan desordenados, un cuerpo con estado dejaría datos viejos
pisando datos nuevos. Volviendo a pedir el perfil, eso no puede pasar.

---

## 4. `api_crm_company_id`: `null` explícito

Ésta la contestamos el 23/9 y es de las que no les llegó. Va de nuevo.

**Presente y en `null`** cuando el aviso es de una concesionaria propia de ustedes.

Funcionalmente `null` y ausente son idénticos para nosotros: los dos fallan el chequeo de
pertenencia. La diferencia es de diagnóstico. El `null` dice *"lo miramos, no es de API CRM"*; un
campo ausente deja la duda de si es eso o si se perdió en la serialización — y esa duda aparece
justo cuando estás buscando por qué un lead no se atribuyó.

Ya está implementado, y distingue los dos casos:

- **`null`** → concesionaria de ustedes. Caso normal, silencioso, no se loguea.
- **uuid que no corresponde** → alguien pegó el código de un aviso ajeno. Eso sí queda logueado como
  anomalía.

Sin la distinción, el ruido de los avisos normales habría tapado la señal del caso raro.

---

## 5. El endpoint de perfil: confirmado, y sí, `whatsapp[]` puede venir vacío

```http
GET https://www.apicrm.ai/api/partners/motorbox/companies/{company_id}
Authorization: Bearer {MOTORBOX_PARTNER_KEY}
```

La ruta no cambió. **`whatsapp[]` vacío es un caso normal, no un error suyo** — pasa cuando la
concesionaria todavía no conectó WhatsApp en el CRM. La cuenta de prueba que les dimos está
justamente así, para que lo vean.

Su regla de mostrar el estado vacío en vez de rellenar con algo verosímil nos parece la correcta y
coincide con cómo trabajamos.

Una cosa que arreglamos por el camino y les afecta: **el teléfono de WhatsApp no estaba donde
debía.** Vivía enterrado en un blob de diagnóstico y sólo aparecía si alguien había corrido un
chequeo de salud, así que un canal recién conectado podía devolver `phone_e164: null` sin motivo. Lo
promovimos a columna propia con backfill, y si aun así falta, el endpoint se lo pide en vivo al
proveedor y lo persiste. Si la concesionaria tiene WhatsApp conectado, el número va a estar.

---

## 6. Multimarca: es un caso real, pero no los apura

Su defensa —un email ya vinculado no se vincula a una segunda concesionaria— **es correcta y no la
cambien para el caso general.** Es exactamente lo que pide el spec: nunca fusionar en silencio,
porque fusionar mal significa que alguien ve los leads de otra agencia.

El caso multimarca es distinto, y sí es real: el CRM tiene grupos, y un **admin de grupo** maneja
varias marcas con un solo usuario, cambiando de marca activa con un selector. Cada marca es una
concesionaria separada. Hoy en el piloto hay un grupo con dos empresas, pero es data de prueba:
**no hay ningún cliente multimarca en producción todavía.**

Así que no rediseñen ahora. Pero hay una distinción que deja la puerta abierta sin ceder seguridad:

> Su regla protege contra que **un usuario reclame** una segunda concesionaria. Un ticket firmado
> por nosotros no es un reclamo: es una afirmación del sistema que maneja esas identidades.

Concretamente: cuando el admin de grupo cambia de marca, les llega un ticket **con el mismo
`user.id` y el mismo email, pero otro `company.id`**, y con `user.role: "group_admin"`. Ese rol es
la señal. La regla podría quedar:

- rechazar vincular un email a una segunda concesionaria **por iniciativa del usuario** — como hoy;
- aceptarlo **sólo cuando lo afirma un ticket nuestro con `role: "group_admin"`**.

Si prefieren dejarlo para cuando aparezca el primer cliente multimarca real, nos parece bien.
Avisamos con tiempo.

---

## 7. Sus dos decisiones distintas del spec

Gracias por registrarlas en vez de dejarlas pasar. Una nos parece bien; la otra tiene un costo que
conviene que sea a ojos abiertos.

**Publicar sin WhatsApp conectado, con advertencia** — nos parece bien. Bloquear era demasiado duro
y el spec ya contemplaba dejar terminar el onboarding. Ahora que `whatsapp.changed` se dispara
también al conectar, la concesionaria que conecte después queda completa sola, sin que nadie toque
nada.

**Contraseña propia para cuentas que vinieron por SSO** — acá hay un costo real. Si alguien deja la
concesionaria, el CRM lo da de baja y les mandamos `user.deactivated`: ustedes invalidan la sesión,
pero **la contraseña sigue funcionando**. Esa persona vuelve a entrar y sigue viendo el stock y los
leads de una agencia de la que ya no es parte.

No decimos que la saquen —puede haber buenas razones, como poder entrar si el CRM está caído—. Pero
si la dejan, que `user.deactivated` **bloquee la cuenta, no sólo la sesión**. Si no, el aviso no
sirve para lo único que lo hace valioso.

---

## 8. Estado de lo compartido

| Qué | Estado |
|---|---|
| JWKS publicado | `https://www.apicrm.ai/.well-known/jwks.json` → 200, RS256, `kid: mb-2026-09` |
| `MOTORBOX_PARTNER_KEY` | entregada |
| `MOTORBOX_WEBHOOK_SECRET` | entregada |
| `API_CRM_WEBHOOK_SECRET` | entregada |
| `API_CRM_PARTNER_KEY` | recibida y cargada de nuestro lado |
| Registros DNS de `motorbox.apicrm.ai` | creados; el host responde con certificado válido |
| Endpoint de perfil | en producción, pide credencial |
| Emisor del ticket | `https://www.apicrm.ai`, con `www`, verificado en producción |
| Cuenta de prueba | creada (§1) |

Y una confirmación sobre su servidor: ayer el canje devolvía «Falta configurar el servidor» con
cualquier ticket —incluso con la palabra `basura`, que no es ni un JWT—. Hoy devuelve «No pudimos
validar el acceso», que es el comportamiento correcto. Quedó resuelto.

Una sugerencia chica, de algo que nos costó una tarde a los dos: cuando el mensaje sea por
configuración faltante, que diga **cuál**. «Falta configurar el servidor» nos mandó a buscar el
problema en nuestro `iss`; «falta `API_CRM_ORIGIN`» lo cerraba en diez segundos. Es lo que hacemos
de este lado: cuando falta una variable, el log la nombra.

---

## 9. Safari

Que lo marquen como pendiente en vez de darlo por hecho es lo correcto, y coincidimos en que esto no
se cierra sin esa prueba.

Un pedido: **en un iPhone de verdad, no en el simulador.** El simulador comparte más estado con el
Mac que el teléfono, y el modo de falla que preocupa —Safari bloqueando la cookie de un sitio
mostrado adentro de otro— es justamente el que puede pasar en uno y no en el otro.

Es la prueba que justifica toda la decisión del subdominio. Si pasa, el diseño era el correcto. Si
falla, queremos saberlo antes de la demo y no durante.

---

## 10. Qué queda

**De ustedes:** la prueba en Safari e iPhone, y confirmar sus cinco manejadores contra el §3.1 —
construyeron adivinando y acertaron lo principal, pero ahora pueden verificarlo.

**De nosotros:** nada que los bloquee. Quedamos atentos a lo que salga de la prueba de punta a punta
con la cuenta nueva.

Con eso cerramos la fase 1, que es la que sostiene todo lo demás.
