# API CRM → MotorBox — Respuesta

> **Responde a:** «Qué necesitamos para seguir», 23/09/2026.
> **Fecha:** 23/09/2026.
> **Lo urgente primero:** el JWKS está construido y probado, falta deployarlo. No es trabajo, es un
> deploy con las env vars cargadas.
> **Adjuntamos los specs actualizados.** Reemplazan los del 14/9 enteros.
> **Su corrección de las credenciales era correcta** y además destapó una contradicción entre
> nuestros propios dos documentos. Está arreglada: §7.

---

## 1. El dominio: corregido, y gracias por atajarlo

`www.motorbox.ai`, con `www`. Ya está corregido en **los cinco documentos** y también en el código
—que es donde más importaba, porque ahí dejaba de ser un ejemplo y pasaba a ser configuración:

| Dónde estaba mal | Estado |
|---|---|
| Spec §3 diagrama de hosts | corregido |
| Spec §3 regla del `<link rel="canonical">` (las dos apariciones) | corregido |
| Spec §10.4 y §11, la `url` de los ejemplos | corregido |
| Spec §13 `NEXT_PUBLIC_PUBLIC_ORIGIN` | corregido |
| Respuesta 22/9 §1.2, §3.1, §4 | corregido |
| Integración, diagrama de hosts | corregido |
| **`.env.example` de API** | corregido |
| **`scripts/motorbox-setup-keys.sh`** (genera la config que se pega en Vercel) | corregido |

Verificamos los dos hosts antes de tocar nada:

```
https://www.motorbox.ai   → 200
https://motorbox.ai       → 308 → https://www.motorbox.ai/
```

**Y el argumento del `Bearer` que se pierde en el redirect nos pareció lo bastante bueno como para
instrumentarlo.** Nuestro cliente ahora detecta si `MOTORBOX_PUBLIC_ORIGIN` redirige y lo escribe en
los logs con el nombre de la variable y los dos hosts:

```
[motorbox] MOTORBOX_PUBLIC_ORIGIN redirige (https://motorbox.ai/... → https://www.motorbox.ai/...).
Usá el host canónico exacto: un redirect puede tirar el Bearer y dar 401.
```

Con eso, el "401 intermitente que no se parece a su causa" pasa a ser una línea que dice exactamente
qué arreglar. Mismo chequeo en los webhooks salientes, donde un redirect se llevaría la firma HMAC.

---

## 2. El JWKS: construido, falta deployarlo

Confirmamos el 404 y les contamos exactamente qué pasa, porque el diagnóstico importa:

```
GET https://www.apicrm.ai/.well-known/jwks.json  →  404   (confirmado, 23/9)
```

**No es que falte escribirlo: está escrito y probado, y todavía no salió a producción.** Se sirve
por un rewrite hacia una ruta normal, porque un directorio literal `.well-known` dentro de `src/app`
no es confiable entre versiones de Next. Lo que falta es el deploy con las claves cargadas en Vercel.

Cuando esté arriba van a ver:

```json
{ "keys": [ { "kty": "RSA", "alg": "RS256", "use": "sig", "kid": "mb-2026-09", "n": "...", "e": "AQAB" } ] }
```

Detalles que les sirven:

- **Mientras las claves no estén cargadas, responde `503` con `{"keys":[]}` y sin cache**, no un 404
  ni un 500. Si ven eso, es que el deploy salió pero falta una env var.
- Con las claves cargadas: `200`, `cache-control: public, max-age=600, s-maxage=3600`.
- Su cache de 10 minutos con enfriamiento de 60 s ante un `kid` desconocido está bien. En una
  rotación vamos a servir **las dos claves** durante 24 h antes de sacar la vieja, así no dependen
  del refetch.

---

## 3. El contrato del ticket, confirmado contra el código

Los cinco valores que pidieron, verificados contra el emisor real —no contra el documento—. Todo
esto lo cubre una prueba nuestra que firma un ticket y lo verifica igual que ustedes; si algún día
cambia, se rompe la prueba antes que la demo.

| Qué | Valor | ¿Coincide con lo que esperan? |
|---|---|---|
| **Algoritmo** | **RS256** | — (lo pidieron para el registro) |
| `iss` | `https://www.apicrm.ai` — exacto, sin barra final | sí |
| `aud` | `motorbox` | sí |
| JWKS | `{iss}/.well-known/jwks.json` | sí |
| `exp` | 90 s desde `iat` | sí |
| Desfasaje de reloj | su ±30 s nos sirve | sí |

Su corte adicional a los 120 s de emitido es correcto y no nos molesta: con `exp` de 90 s nunca lo
van a tocar salvo que haya un reloj muy corrido, que es justo cuando querés cortar.

**Los cuatro obligatorios, confirmados.** Todos presentes en cada ticket, con estos nombres exactos:

| Campo | Forma | Nota |
|---|---|---|
| `jti` | uuid v4 | lo que consumen una sola vez |
| `sub` | `api_crm:profile:<uuid>` | |
| `company.id` | uuid de `companies.id` | es su `origen_id` |
| `user.email` | el email real | |

Y los demás, tal como los leen:

```
company.name      presente
company.status    "active" — si no lo es, no emitimos el ticket (403 del lado nuestro)
user.id           uuid de profiles.id
user.name         nombre y apellido, o null
user.role         "admin" | "group_admin" — guardar, NO autorizar con esto
scope[]           ["dealer.admin"] — autorizar con esto
embed             false sólo al abrir en pestaña nueva
act               null, o { sub } si un super admin está personificando
```

Dos aclaraciones que valen para su implementación:

**`company.status` casi nunca les va a llegar distinto de `"active"`.** Validamos antes de emitir:
una concesionaria suspendida recibe un error en pantalla y no se emite ticket. Igual dejen el chequeo
—es defensa en profundidad y cuesta una línea.

**`user.email` no vive en nuestra tabla de perfiles**, vive en el `auth.users` de Supabase. Lo
resolvemos al emitir. Si por algún motivo un usuario no tuviera email, no emitimos ticket y le
mostramos por qué, en vez de mandarles un ticket sin el campo con el que arman la sesión.

---

## 4. El endpoint de perfil: la ruta se confirma, y sí, `whatsapp[]` puede venir vacío

```http
GET https://www.apicrm.ai/api/partners/motorbox/companies/{company_id}
Authorization: Bearer {MOTORBOX_PARTNER_KEY}
```

Confirmada, sin cambios. Está construida y compila; sale con el mismo deploy que el JWKS.

**`whatsapp[]` vacío es un caso normal, no un error suyo.** Pasa cuando la concesionaria todavía no
conectó WhatsApp en el CRM. Que su onboarding lo contemple está bien y es lo correcto.

Sobre la ficha vacía: su regla de mostrar el estado vacío en vez de rellenar con algo verosímil nos
parece la correcta, y coincide con cómo trabajamos nosotros. Este endpoint la resuelve: devuelve
nombre, razón social, CUIT, dirección, teléfono, logo, sucursales, los admins y los WhatsApp
conectados.

Una cosa que arreglamos por el camino y les afecta: **el teléfono de WhatsApp no estaba donde
debía.** Vivía enterrado en un blob de diagnóstico y sólo aparecía si alguien había corrido un
chequeo de salud, así que un canal recién conectado podía devolver `phone_e164: null` sin motivo.
Lo promovimos a columna propia con backfill, y si aun así falta, el endpoint se lo pide en vivo al
proveedor y lo persiste. O sea: si la concesionaria tiene WhatsApp conectado, el número va a estar.

---

## 5. Concesionarias que no vienen de API CRM

Elegimos: **`api_crm_company_id` presente y en `null`.**

Un campo ausente y uno nulo se ven exactamente igual desde nuestro código —los dos dan `undefined`
o `null` y los dos fallan el chequeo de pertenencia—, así que la diferencia no es funcional, es de
diagnóstico. El `null` explícito dice *"lo miramos, este aviso no es de API CRM"*. Un campo ausente
deja la duda de si es eso o si se perdió en la serialización, y esa duda aparece justo cuando estás
debuggeando por qué un lead no se atribuyó.

Ya está implementado de este lado, y distingue los dos casos:

- **`null`** → concesionaria propia de MotorBox. Caso normal y silencioso: no hay nada que atribuir.
- **un uuid que no es el de la concesionaria que recibió el mensaje** → alguien pegó el código de un
  aviso ajeno. Eso sí queda logueado como anomalía.

Antes los dos casos se logueaban igual, y el ruido de los avisos normales de MotorBox habría tapado
la señal del caso raro.

---

## 6. El DNS: recibidos, y los creamos

Gracias por adelantar el alta en su Vercel. Verificamos el estado de los dos registros al momento
de escribir esto:

```
dig +short CNAME motorbox.apicrm.ai   → (vacío)
dig +short TXT   _vercel.apicrm.ai    → (vacío)
```

O sea: **todavía no están creados, y es nuestro**. Quedaron cargados en nuestra checklist de
arranque con los valores exactos que mandaron, no con un "pedirle a alguien el CNAME" — que es
precisamente la forma que tiene un trámite de cinco minutos de dormir tres días. Va con el mismo
bloque de trabajo que el deploy del JWKS.

Tomamos nota de que Vercel lo detecta solo y no hace falta avisarles.

De paso, una que teníamos como pendiente de nuestro lado y ya verificamos:

```
https://apicrm.ai  →  308  →  https://www.apicrm.ai/
```

El apex redirige bien y no sirve la app en paralelo, así que el `www.apicrm.ai` de `frame-ancestors`
y de la validación de `origin` no tiene ambigüedad. Es el mismo cuidado que ustedes pidieron para
`www.motorbox.ai`, del otro lado.

---

## 7. Las credenciales: el error era nuestro, y está arreglado

Tienen razón, y la corrección de ustedes destapó algo peor que una confusión de quién manda qué:
**nuestros dos documentos se contradecían entre sí.**

- El spec de API (§2.3) decía que `API_CRM_WEBHOOK_SECRET` la generaba MotorBox.
- El spec de MotorBox (§13) la listaba bajo "credenciales que da el equipo de API".

Las dos repartijas funcionan —es un secreto simétrico, lo único que importa es que los dos lados
tengan el mismo string—. Lo que no funcionaba era que cada documento dijera una cosa distinta: eso
termina en dos secretos distintos generados en paralelo y en un "firma inválida" que nadie sabe de
dónde sale.

Queda como lo leyeron ustedes, que es la versión del spec que tenían en la mano:

| Secreto | Lo genera | Para qué |
|---|---|---|
| `MOTORBOX_PARTNER_KEY` | **API** | que MotorBox lea perfiles de concesionaria |
| `MOTORBOX_WEBHOOK_SECRET` | **API** | que MotorBox firme lo que nos manda |
| `API_CRM_WEBHOOK_SECRET` | **API** | que MotorBox verifique lo que le mandamos |
| `API_CRM_PARTNER_KEY` | **MotorBox** | que API lea sus publicaciones |

Ya está corregido en el spec de API, con una nota de por qué cambió, y **en el script que genera la
configuración** —que es donde importaba de verdad: generaba dos secretos y ahora genera los tres, y
te dice cuáles compartir. Un documento desactualizado se relee; un script que genera de menos deja
un campo vacío que alguien completa a mano con cualquier cosa.

La cuarta la esperamos de ustedes cuando coordinemos el canal.

---

## 8. Lo que sigue de nuestro lado

Lo pedido en el orden que lo pidieron:

| # | Qué | Estado |
|---|---|---|
| 1 | Publicar el JWKS | **construido, falta el deploy** — es lo próximo |
| 2 | `MOTORBOX_PARTNER_KEY`, `MOTORBOX_WEBHOOK_SECRET`, `API_CRM_WEBHOOK_SECRET` | las tres se generan juntas y se mandan por gestor de contraseñas |
| 3 | El spec actualizado | **adjunto**, con `api_crm_company_id` y `currency` adentro |
| 4 | Corregir el dominio | **hecho**, en los cinco documentos y en el código |
| 5 | Confirmar `iss`, `aud` y los obligatorios | **hecho**, §3 de este documento |
| 6 | Una empresa de prueba | se prepara junto con el deploy |
| 7 | Cargar los dos registros DNS | **pendiente nuestro**, con los valores ya cargados en la checklist |
| 8 | Qué esperamos en `api_crm_company_id` | **`null` explícito**, §5 |

Lo que ya está construido de este lado y sale con el mismo deploy: el emisor del ticket, el JWKS, el
endpoint de perfil, el botón y el iframe en el menú del CRM, y la lectura del marcador `[MB:xxxx]`
en el WhatsApp entrante —con el auto y su precio anotados en el lead, y la moneda que ustedes manden,
sin convertir.

Sobre su nota final: que el marcador ya esté escrito y probado de su lado es la mejor noticia del
documento. Es la pieza que hace que la concesionaria vea a MotorBox en sus reportes, y sin las dos
mitades no sirve ninguna.
