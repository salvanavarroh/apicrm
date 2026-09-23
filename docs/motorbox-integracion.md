# API CRM + Motorbox — Cómo se integran

> Documento de contexto, sin código. Para compartir con el equipo de Motorbox y con el cliente.
> El detalle técnico está en `motorbox-spec-motorbox.md` (lado Motorbox) y `motorbox-spec-api.md`
> (lado API). Los dos documentos técnicos están escritos para que los lea directamente un agente
> de código.

---

## La idea en treinta segundos

**API** es un CRM para concesionarias de autos. Cada concesionaria tiene ahí sus leads, sus
vendedores, su WhatsApp conectado y su operación diaria.

**Motorbox** es un marketplace de publicaciones de autos, tipo Mercado Libre: publicás el auto y te
llegan consultas.

Queremos que una concesionaria que ya usa API **entre a Motorbox desde el menú de API**, sin
registrarse de nuevo y sin abrir otra pestaña. Y que cuando un comprador consulta por un auto
publicado, **ese contacto aparezca como lead en API**, con el vendedor asignado y el auto que estaba
mirando.

Dicho de otra manera: Motorbox trae la demanda, API la trabaja. Y para el concesionario es un
solo producto.

---

## Lo que ve el concesionario

**La primera vez**

1. Entra a API como todos los días y ve un ítem nuevo en el menú: **Motorbox**.
2. Lo toca. Motorbox se abre adentro de API, sin salir del CRM.
3. Lo recibe una pantalla de bienvenida: *"Tu concesionaria ya está en Motorbox"*, con sus datos ya
   cargados — nombre, razón social, CUIT, dirección, logo, sucursales. No tipeó nada.
4. Completa lo que Motorbox sí necesita y API no tiene: descripción, horarios, fotos del local,
   qué marcas vende, si toma permuta.
5. Confirma con qué número de WhatsApp quiere recibir consultas. **Le aparece preseleccionado el que
   ya tiene conectado en API**, porque ese es el que hace que los leads entren al CRM.
6. Listo. Entra al panel de Motorbox y empieza a publicar.

**Todos los días siguientes**

Toca "Motorbox" en el menú y entra directo. No hay login, no hay wizard, no hay contraseña nueva.

**Cuando aparece una consulta**

Un comprador ve un Corolla publicado, toca "Contactar por WhatsApp" y le escribe al concesionario.
Ese mensaje entra al WhatsApp que ya está conectado a API, y **API crea el lead automáticamente**,
con el origen marcado como Motorbox y el auto por el que consultó ya anotado.

El vendedor lo atiende desde el inbox de siempre. Nunca tuvo que abrir Motorbox.

---

## Quién es dueño de qué

| | **API CRM** | **Motorbox** |
|---|---|---|
| Datos de la concesionaria | **fuente de verdad** | copia para prellenar |
| Usuarios y permisos | **fuente de verdad** | espejo, sin altas propias |
| Publicaciones, fotos, precios de vidriera | — | **todo** |
| Leads y seguimiento | **todo** | — |
| WhatsApp | **conectado acá** | solo usa el número |
| Ventas, tareas, reportes | **todo** | — |

Regla que ordena todo lo demás: **nadie duplica la tabla del otro.** Si un dato es de API,
Motorbox lo lee y lo cachea, pero no lo edita. Si es de Motorbox, API no lo toca.

Vale aclararlo explícito porque es fácil asumir lo contrario: **API no tiene módulo de stock.**
No hay tabla de vehículos publicables ni nada parecido. Las publicaciones son 100% de Motorbox,
en esta versión y en las siguientes.

---

## Las tres piezas

La integración parece una sola cosa ("el enganche") pero en realidad son tres, con riesgos distintos.

### 1. Identidad — que no se registre de nuevo

Cuando el concesionario toca "Motorbox", API le entrega un **pase de un solo uso**, válido noventa
segundos: un texto firmado criptográficamente que dice "esta persona es Juan Pérez, admin de la
concesionaria tal, y yo, API, lo garantizo".

Motorbox verifica la firma, y con eso:
- si la concesionaria no existe todavía, la crea en el momento con esos datos;
- si ya existe, lo deja pasar;
- abre su propia sesión y tira el pase.

**La concesionaria queda vinculada por el identificador interno que API le asigna**, no por el mail.
El mail cambia, las personas cambian, y una concesionaria tiene varios usuarios. El identificador
interno no cambia nunca.

La firma es asimétrica: API firma con una clave privada que nunca comparte, y publica la clave
pública para que Motorbox verifique. Eso significa que **API puede cambiar sus claves sin coordinar
con nadie**, y que si Motorbox sufriera una filtración, nadie puede falsificar un pase.

### 2. El embebido — que no abra otra pestaña

Acá está el único requisito de infraestructura de todo el proyecto, y conviene entenderlo porque
suena más grande de lo que es.

Motorbox se muestra dentro de API en un marco embebido. El problema: los navegadores tratan con
desconfianza a un sitio mostrado dentro de otro sitio distinto, y **Safari directamente le bloquea
las cookies**. Sin cookies no hay sesión. Traducción práctica: andaría perfecto en Chrome durante el
desarrollo y fallaría en el iPhone del concesionario.

La solución es hacer que, para el navegador, los dos sean el mismo sitio. Motorbox se publica
**también** en una dirección que cuelga del dominio de API:

```
www.motorbox.ai       → el marketplace público, para compradores   (no cambia nada)
motorbox.apicrm.ai    → la misma aplicación, entrada embebida      (nuevo)
www.apicrm.ai         → el CRM                                     (no cambia nada)
```

Lo importante, porque genera confusión: **no es otro proyecto, ni otro código, ni otro deploy.**
Es la misma aplicación de Motorbox respondiendo en una dirección adicional. Cuando el equipo de
Motorbox publica una versión, las dos direcciones se actualizan juntas porque son la misma versión.

En la práctica son dos pasos: el equipo de Motorbox agrega la dirección en su panel de Vercel, y el
equipo de API crea un registro en su DNS. Media hora entre los dos, una sola vez.

*(Evaluamos las alternativas: cookies particionadas, que dependen de que Safari acompañe;
autenticación por token en memoria, que obliga a reescribir todo el acceso a datos de Motorbox; y
un proxy sin marco embebido, que acopla los deploys de los dos productos. Ninguna era mejor que un
registro de DNS.)*

### 3. Los leads — que la consulta llegue al CRM

Esta es la que parece gratis y no lo es.

La intuición era: "el comprador escribe por WhatsApp, ese WhatsApp ya está conectado a API, entonces
el lead entra solo". Es cierto — pero **entra sin saber que vino de Motorbox ni de qué auto**.
El proveedor de mensajería no reenvía esa información, lo verificamos en el código.

Consecuencia si no se hace nada: Motorbox es invisible en los reportes. La pregunta obvia del
concesionario — *"¿cuántos leads me trajo Motorbox?"* — no tiene respuesta.

La solución es simple y no requiere ninguna integración compleja: el botón de WhatsApp prellena el
mensaje con un **código corto de la publicación**, tipo `[MB:8f3k2]`, al final del texto. API lo lee
en el mensaje entrante, y con eso marca el lead como originado en Motorbox y anota el vehículo por
el que consultó.

Tres detalles que hacen la diferencia:

- **El número de WhatsApp lo provee API, no lo tipea el concesionario.** Si escribe otro número a
  mano, los mensajes no entran al CRM y la integración deja de existir sin que nadie se entere.
  Por eso en el onboarding es un selector, no un campo libre.
- **El precio viaja con su moneda, y nadie convierte nada.** Motorbox admite pesos y dólares, y nos
  manda el número tal como lo cargó quien vende. Convertirlo en el camino significaría grabar en el
  CRM un precio calculado con la cotización de ese día: a los dos días, el lead diría un número que
  el vendedor nunca puso.
- **Para los contactos que no son WhatsApp** (un formulario, una consulta por mail), hace falta que
  Motorbox le avise a API directamente. Está especificado y construido, pero apagado: en la primera
  versión solo hay WhatsApp.

Además, si la misma persona ya era lead de la concesionaria, API la reconoce por el teléfono y suma
la consulta al lead existente en vez de duplicarlo. Eso ya funciona hoy y no hay que hacer nada.

---

## Decisiones ya tomadas

Para que nadie las reabra a mitad de camino:

| Decisión | Por qué |
|---|---|
| La vinculación es por el identificador interno de la concesionaria, no por mail | El mail cambia y hay varios usuarios por concesionaria |
| El alta se crea sola en el primer ingreso | Evita coordinar "quién llama primero a quién" |
| Los datos pesados Motorbox los pide a API por separado, no vienen en el pase | El pase queda chico y los datos siempre frescos |
| Una concesionaria de API = una concesionaria de Motorbox | Las sucursales son ubicaciones dentro de la misma, no cuentas separadas |
| Solo admin y administrador de grupo ven el botón | Vendedores y gerentes no publican |
| En la primera versión, el único botón de contacto es WhatsApp | Lo demás está construido pero apagado |
| Gratis durante el piloto | Sin facturación cruzada por ahora |

Los dos supuestos que quedaban abiertos ya se resolvieron (22/09/2026):

1. **Motorbox no tiene concesionarias registradas por su cuenta.** Confirmado por su equipo: las seis
   que existen son datos de demo. No hace falta el paso de "vincular cuenta existente" ni el de fusión.
2. **El dominio del CRM es `www.apicrm.ai`**, con `www`, y el embebido de Motorbox va en
   `motorbox.apicrm.ai`. Se descartó separar la app en `app.apicrm.ai` porque no aporta nada a la
   integración: lo único que hace falta es que los dos hosts compartan `apicrm.ai`.

---

## Lo que necesitamos del equipo de Motorbox para arrancar

Nada de esto es trabajo pesado, pero sin esto no se puede empezar:

- [ ] Confirmar el nombre del proyecto de Motorbox en Vercel y si está en el mismo team que API
      (si no, hay un paso extra de verificación de dominio).
- [ ] Agregar `motorbox.apicrm.ai` como dominio en el proyecto y pasarnos el registro DNS que
      pide Vercel.
- [ ] Una clave de acceso para que API pueda consultar los datos de una publicación a partir de su
      código. Es una sola consulta, de servidor a servidor.
- [ ] Confirmar si ya hay concesionarias registradas por su cuenta en Motorbox.
- [ ] Confirmar qué botones de contacto va a tener una publicación además de WhatsApp.

Nosotros les entregamos:

- [ ] El registro DNS de `motorbox.apicrm.ai` creado en nuestra zona (el dominio ya está definido).
- [ ] La dirección donde publicamos nuestra clave pública de verificación.
- [ ] Una clave de acceso para que lean los datos de una concesionaria.
- [ ] Un secreto compartido para firmar los avisos automáticos entre los dos sistemas.
- [ ] Los dos documentos técnicos.

Los secretos se comparten por un gestor de contraseñas o un mensaje que se autodestruye. Nunca por
WhatsApp ni por mail.

---

## Riesgos conocidos

| Riesgo | Qué tan probable | Cómo lo manejamos |
|---|---|---|
| El embebido falla en Safari / iPhone | Alta si no se hace el subdominio | El subdominio lo elimina. **Hay que probarlo en un iPhone real, no en el simulador.** |
| El concesionario publica un WhatsApp distinto al del CRM | Media | El onboarding lo preselecciona y advierte fuerte si lo cambia |
| Se pierde atribución porque el comprador borra el código del mensaje | Media | Motorbox reporta los clics al botón; comparando clics contra leads sabemos cuánto se escapa |
| Una concesionaria suspendida en API sigue publicando | Baja | API avisa por webhook y Motorbox despublica |
| Un usuario dado de baja en API sigue entrando a Motorbox | Baja | Aviso inmediato + la sesión embebida expira a las 8 horas |
| Se crean dos concesionarias duplicadas en Motorbox | Baja | La vinculación es por identificador único, con restricción en la base |

---

## Fases

**Fase 0 — Infraestructura.** El registro DNS y el intercambio de claves. Bloquea todo lo demás,
así que va primero aunque el resto no esté definido.

**Fase 1 — Entrar sin registrarse.** El pase firmado, el alta automática y el onboarding. Es el
corazón: si esto funciona, el resto es trabajo conocido.

**Fase 2 — El botón en API.** El ítem de menú y el marco embebido, con su manejo de errores y
renovación de sesión.

**Fase 3 — Que los leads se atribuyan.** El código en el mensaje de WhatsApp y su lectura del lado
de API. Es lo que hace que la integración se vea en los reportes.

**Fase 4 — Los bordes.** Avisos de suspensión, contactos que no son WhatsApp, métricas de clics.

Las fases 1 y 3 son las que dan valor real. Si el tiempo aprieta, la 2 puede entregarse fea y la 4
puede esperar.

---

## Lo que esta integración no hace

Vale la pena decirlo para que nadie lo espere:

- No sincroniza stock. API no tiene stock.
- No permite publicar desde API. Se publica adentro de Motorbox.
- No lleva leads de API hacia Motorbox. El flujo es en una sola dirección.
- No comparte vendedores ni asignaciones.
- No unifica la facturación.

Todo eso es posible más adelante, pero cada una es un proyecto propio. Esta integración hace una
sola cosa: que para el concesionario sean un solo producto, y que la demanda que genera Motorbox
termine en el CRM donde ya trabaja.
