# API CRM → MotorBox — El SSO ya se probó de punta a punta

> **Fecha:** 25/09/2026.
> **Responde a:** «Para Lucas — lo que nos falta de ustedes» (25/9).
> **Antes que nada:** sus tres puntos ya estaban contestados en la respuesta unificada que les
> mandamos ayer, junto con el spec actualizado. Se cruzaron los documentos. Abajo van en corto, con
> el lugar donde está el detalle.
> **Lo nuevo, y lo único que bloquea hoy:** probamos el circuito completo con la cuenta de prueba.
> El canje funciona. Corta un paso después, y es de ustedes. Está en §1.

---

## 1. Dónde corta el circuito

Entramos al CRM con la cuenta de prueba y apretamos "Motorbox". El resultado, paso por paso:

```
1. motorbox.apicrm.ai/api/sso/api-crm?ticket=…&state=/dealer   → 200   ✓ aceptan el pase
2. redirigen a /dealer                                                 ✓ correcto
3. motorbox.apicrm.ai/dealer                                   → 308   ✗ acá se rompe
4. www.motorbox.ai/dealer                                      → 404
```

**Los pasos 1 y 2 funcionan.** El canje acepta un ticket real firmado por nosotros y redirige a
donde tiene que redirigir. Eso cierra la parte más difícil.

El problema es el paso 3: **`motorbox.apicrm.ai` está redirigiendo todas sus páginas a
`www.motorbox.ai` con un 308.** Sólo `/api/*` se salva — por eso el canje anda y lo que sigue, no.

La consecuencia es la que el subdominio venía justamente a evitar: el canje **setea la cookie de
sesión en `motorbox.apicrm.ai`**, y el 308 manda al usuario a `www.motorbox.ai`, donde esa cookie
no existe. Y ahí la página tampoco existe, de ahí el 404.

### Se reproduce sin ticket, en una línea

```bash
curl -sI https://motorbox.apicrm.ai/dealer | head -2
# → HTTP/2 308
# → location: https://www.motorbox.ai/dealer
```

Lo mismo con cualquier ruta:

```bash
curl -sI https://motorbox.apicrm.ai/cualquier-cosa   # → 308 → www.motorbox.ai/cualquier-cosa
curl -sI https://motorbox.apicrm.ai/api/sso/api-crm  # → 200  (las /api/* sí se salvan)
```

### De dónde creemos que salió

De una recomendación nuestra, aplicada sin su excepción. El §3(d) del spec, para que Google no
indexe el marketplace dos veces, dice:

> «en el middleware, si `isEmbedded` y la ruta **no** es del dealer console, redirigir 301 a
> `www.motorbox.ai` con el mismo path»

La parte que falta es **"la ruta no es del dealer console"**. El dealer console tiene que quedarse
en `motorbox.apicrm.ai`: es el único host donde vale su cookie de sesión, y es la razón entera por
la que existe ese subdominio.

### Lo que sí está bien

Para que no busquen donde no hay nada:

```
motorbox.apicrm.ai                    → resuelve, certificado válido
  content-security-policy             → frame-ancestors 'self' https://www.apicrm.ai   ✓
  sin X-Frame-Options bloqueando                                                       ✓
/api/sso/api-crm                      → 200, acepta el pase                            ✓
/api/*                                → no se redirige                                 ✓
```

### El pase de esa prueba, para sus logs

Verificamos los nueve campos del contrato antes de escribir esto: `iss` con `www`, `aud`, `jti`,
`sub`, empresa activa, email, `scope`, 90 s de vigencia y `act` en `null`. Todo correcto.

```
jti .......... 900b8ebe-5330-449a-a887-ab0136dee23a
usuario ...... prueba.motorbox@apicrm.ai
company_id ... 7e573a1a-1e55-489b-8429-e461e62f3ffd
iss .......... https://www.apicrm.ai
```

Con ese `jti` encuentran la request exacta en sus logs sin buscar a ciegas.

---

## 2. Sus tres puntos, en corto

Los tres estaban en la respuesta unificada de ayer. Van condensados; el detalle está donde se indica.

### 2.1 La cuenta de prueba — creada

```
URL ............ https://www.apicrm.ai/login
Email .......... prueba.motorbox@apicrm.ai
Contraseña ..... por gestor de contraseñas, aparte de este documento
Rol ............ Admin
Concesionaria .. MotorBox — Cuenta de prueba
company_id ..... 7e573a1a-1e55-489b-8429-e461e62f3ffd
```

En el menú lateral, **Motorbox** bajo "Operación". Cada clic emite un ticket fresco.

Dos aclaraciones, porque su documento las da por supuestas al revés:

**No tenemos entorno de staging.** API CRM es un solo proyecto, así que la cuenta vive en la base
del piloto. Por eso quedó aislada: nombre inequívoco, sin precio mensual —queda fuera del proceso
de facturación— y con su propia sucursal. No toca datos de nadie.

**No tiene WhatsApp conectado, a propósito.** Así `whatsapp[]` les llega vacío y prueban ese caso de
verdad en vez de asumirlo. Si quieren uno con número conectado, avisen y lo agregamos.

### 2.2 Los cinco eventos — el campo es `company_id`, en los cinco

Su apuesta era correcta. Los cuatro campos comunes:

```json
{
  "event_id":    "company.suspended:7e573a1a-...-3ffd:1790277545",
  "type":        "company.suspended",
  "company_id":  "7e573a1a-...-3ffd",
  "occurred_at": "2026-09-25T14:03:00.000Z"
}
```

`company_id` es el `companies.id` de API — el mismo uuid del ticket, el mismo que guardan como
`origen_id`. `event_id` es estable entre reintentos: dedupliquen por ahí.

Los dos con campo extra:

```json
// user.deactivated  →  + user_id  (el profiles.id de API)
// whatsapp.changed  →  + channel_id
```

`company.suspended`, `company.reactivated` y `company.updated` no llevan nada más.

**Detalle de diseño:** `whatsapp.changed` no dice si se conectó o se desconectó. Significa "algo
cambió en los WhatsApp de esta concesionaria, volvé a pedir el perfil". Ningún evento manda el
estado nuevo en el cuerpo: avisan *qué* cambió, no *cómo quedó*. Así dos webhooks desordenados no
dejan datos viejos pisando nuevos.

Todo esto está en el **§12.1 del spec** que les mandamos ayer.

**Y una que encontraron ustedes sin proponérselo:** de los cinco eventos, **sólo tres se
disparaban**. `user.deactivated` y `whatsapp.changed` estaban declarados como tipos válidos pero no
los emitía nadie — habrían esperado para siempre dos eventos que no iban a llegar, sin ningún error
que lo delatara. Ya están enganchados. Gracias: de nuestro lado no había forma de verlo, el código
compilaba perfecto.

### 2.3 `api_crm_company_id` — presente y en `null`

Funcionalmente `null` y ausente nos dan igual: los dos fallan el chequeo de pertenencia. La
diferencia es de diagnóstico. El `null` dice *"lo miramos, no es de API CRM"*; un campo ausente deja
la duda de si es eso o si se perdió en la serialización — y esa duda aparece justo cuando estás
buscando por qué un lead no se atribuyó.

Ya está implementado y distingue los dos casos:

- **`null`** → concesionaria propia de ustedes. Normal, silencioso, no se loguea.
- **uuid que no corresponde** → alguien pegó el código de un aviso ajeno. Eso sí queda logueado como
  anomalía.

---

## 3. Qué queda

**De ustedes:**

1. El 308 del §1 — es lo único que bloquea el circuito hoy.
2. La prueba en Safari y en un iPhone **real**, no el simulador.
3. Confirmar sus cinco manejadores contra el §2.2.

**De nosotros:** nada que los bloquee. Quedamos atentos.

Cuando el paso 3 deje de redirigir, el circuito debería cerrarse solo: los pasos 1 y 2 ya funcionan
y el pase que emitimos está verificado campo por campo.
