# Bot de respuesta automática del inbox — approach

Problema: hoy cuando un cliente escribe por WhatsApp o Instagram, espera hasta
que un asesor se conecte. El 50% de los leads entra de noche y fin de semana
(dato de la reunión), así que ese lead se enfría antes de que alguien lo vea.

Decisión tomada: **FAQ configurable por sucursal, sin precios.** El bot nunca
dice un número de plata. Lo justifico y lo desarrollo abajo.

---

## 1. Por qué NO un chatbot con IA libre

El cliente ya se quemó: el chatbot anterior "alucinaba" y ofreció descuentos no
autorizados. Un LLM suelto sobre una conversación comercial tiene tres riesgos
que no se resuelven con un buen prompt:

1. **Compromiso comercial inventado.** Un precio, una bonificación o un plazo de
   entrega dichos por el bot son, para el cliente, la palabra de la
   concesionaria. Y en Argentina las listas cambian mes a mes.
2. **No es auditable.** Cuando el gerente pregunta "¿por qué le dijo eso?", con
   un LLM la respuesta es "salió así".
3. **Riesgo con Meta.** Ver §5: el contenido automatizado que se percibe como
   engañoso es causal de restricción de la cuenta de WhatsApp Business.

La arquitectura de abajo usa IA **sólo para clasificar la intención** del
mensaje, nunca para redactar la respuesta. Las respuestas son texto que escribió
el humano que administra la concesionaria.

> Esto es coherente con lo que ya hicimos en `next-best-action.ts` y en
> `executive-report.ts`: reglas deterministas y explicables, IA sólo donde no
> puede inventar nada.

---

## 2. Arquitectura

```
Mensaje entrante (Zernio webhook)
        │
        ▼
 ¿Hay que responder?  ──── no ──▶ nada (ya hay asesor en la conversación,
   · ventana de atención                 el cliente ya recibió respuesta hace
   · nadie activo (presencia)            < N min, o superó el tope de turnos)
   · no respondió un humano
        │ sí
        ▼
 CLASIFICADOR de intención          ← acá y sólo acá hay IA
   entrada: texto del cliente
   salida:  una intención del catálogo de la sucursal, o `desconocida`
        │
        ▼
 RESPUESTA = el texto que el admin cargó para esa intención
   · nunca generado
   · con variables: {nombre}, {sucursal}, {horario}
        │
        ▼
 Efectos sobre el CRM
   · crea/actualiza el lead
   · registra la actividad (queda en el historial)
   · si detectó modelo → lo guarda como interés
   · marca para handoff y notifica
```

### Componentes nuevos

```
supabase/migrations/XXXX_inbox_bot.sql
  bot_configs        1 por sucursal: activo, horario, tono, tope de turnos
  bot_intents        catálogo de intenciones + respuesta (texto del admin)
  bot_conversations  estado por conversación: turnos usados, handoff pedido
  bot_messages       log: qué entró, qué intención se detectó, qué se respondió

src/lib/bot/classify.ts     clasificador (ver §3)
src/lib/bot/respond.ts      máquina de decisión: ¿responde? ¿qué? ¿handoff?
src/lib/bot/guardrails.ts   filtros duros (precio, legal, insultos)
src/app/(app)/admin/bot/    pantalla de configuración por sucursal
```

Se engancha en `src/lib/messaging/handlers.ts`, donde ya se procesa el mensaje
entrante.

---

## 3. El clasificador: híbrido, en dos pasos

**Paso 1 — reglas (gratis, instantáneo, determinista).** Cada intención tiene
palabras clave que carga el admin. `"precio" | "cuánto sale" | "valor"` →
intención `precio`. Resuelve la mayoría de los mensajes reales, que son cortos y
repetitivos.

**Paso 2 — LLM sólo si las reglas no matchean.** Se le manda el mensaje y la
**lista cerrada de intenciones de esa sucursal**, y se le pide que devuelva
*una* de esas etiquetas o `desconocida`. No redacta: elige.

```
Sos un clasificador. Devolvé SOLO una de estas etiquetas:
  horarios | ubicacion | financiacion | modelos | precio | usado | postventa | desconocida
Mensaje: "buenas, atienden los sábados?"
→ horarios
```

Ventajas: costo mínimo (respuesta de 1 token), imposible que invente contenido, y
si el modelo falla se cae a `desconocida`, que tiene una respuesta segura.

El repo ya usa OpenAI `gpt-4.1-mini` vía fetch directo en `src/lib/lead-mapper.ts`
para la importación de leads con IA; conviene reusar ese mismo patrón y clave.

---

## 4. Guardrails (lo que hace que esto sea seguro)

1. **Lista negra de temas.** Si el mensaje matchea precio, descuento, tasa,
   cuota, entrega o permuta → **nunca** responde con contenido: contesta el
   mensaje de handoff y marca al lead como caliente. Esto corre ANTES del
   clasificador y no se puede desactivar desde la config.
2. **Tope de turnos.** Máximo 3 respuestas automáticas por conversación. Después
   se calla y espera al humano. Evita el loop de bot conversando solo.
3. **Se calla si aparece un humano.** Si un asesor manda un mensaje, el bot se
   apaga para esa conversación de forma permanente.
4. **Sólo fuera de horario o sin asesores activos.** Reusa lo que ya existe:
   `inbox_hours_*` en `companies` y la presencia (`inbox_available`). Si hay
   alguien activo, no interviene.
5. **Siempre se identifica.** El primer mensaje dice que es una respuesta
   automática. Es requisito de Meta y además baja la frustración.
6. **Salida garantizada.** "Escribí *asesor* y te paso con una persona" en todo
   momento; esa palabra fuerza el handoff.

---

## 5. Políticas de Meta — qué hay que respetar

| Regla | Cómo la cumplimos |
|---|---|
| **Ventana de 24 h.** Fuera de esa ventana sólo se pueden mandar plantillas aprobadas. | El bot sólo responde DENTRO de la ventana (es una respuesta a un mensaje del cliente). Ya existe `window_expires_at` en `conversations` y el contador en el inbox. |
| **Identificarse como automatizado.** | Primer mensaje: "Te responde el asistente de {concesionaria}". |
| **Ofrecer contacto humano.** Meta exige un camino claro a una persona. | La palabra *asesor* y el mensaje de handoff en cada respuesta. |
| **No spam / no mensajes no solicitados.** | El bot nunca inicia; sólo responde. |
| **Contenido prohibido.** No se puede automatizar la venta de ciertos productos ni hacer afirmaciones engañosas. | La lista negra de precios cubre lo engañoso; los autos no están en categorías prohibidas. |
| **Calidad del número.** Bloqueos y reportes bajan la calidad y pueden restringir el envío. | Tope de turnos + handoff rápido: el motivo #1 de bloqueo es un bot que no te deja hablar con alguien. |

**Riesgo real a vigilar:** la métrica de calidad del número en WhatsApp Business
Manager. Si empieza a bajar tras activar el bot, hay que acortar el tope de
turnos. Conviene mostrar esa métrica en la pantalla de configuración —
`whatsapp-health.ts` ya trae datos de salud del número.

---

## 6. Qué agregaría más allá de lo pedido

1. **Calificación conversacional.** El bot pregunta lo que el vendedor
   preguntaría igual: modelo de interés, si entrega usado, forma de pago. Cuando
   el asesor entra, el lead ya está calificado. **Esto es el mayor valor del
   bot** y no estaba en el pedido: no es ahorrar respuestas, es que a las 8 AM el
   vendedor encuentre 12 leads con datos en vez de 12 "hola".

2. **Handoff con resumen.** Cuando entra el asesor ve arriba: "Consultó por
   Hilux SRV, entrega un Corolla 2018, quiere financiar. 3 mensajes a las 23:40."
   Se apoya en la ficha rediseñada.

3. **Respuesta con retardo humano.** Contestar en 200 ms grita "robot". Un
   retardo de 3-8 segundos y el indicador de "escribiendo" mejora mucho la
   percepción y baja los bloqueos.

4. **Modo borrador.** Antes de activarlo en automático, el bot propone la
   respuesta y el asesor la manda con un clic. Sirve para ganar confianza y para
   descubrir las FAQ que faltan.

5. **Aprendizaje de FAQ faltantes.** Todo mensaje que cae en `desconocida` se
   acumula en una pantalla "Preguntas sin respuesta", agrupadas por similitud.
   El admin las convierte en intención con un clic. El bot mejora solo, sin IA
   generativa.

6. **Agenda de test drive.** La única acción transaccional que le daría: ofrecer
   turnos libres y agendar la visita. Se apoya en `visits`, que ya existe. Alto
   valor, riesgo bajo (no compromete plata).

7. **Métricas del bot.** Cuántas resolvió sin humano, tiempo de primera
   respuesta antes vs después, y cuántos leads calificó. Sin esto no hay forma de
   defender que sirve.

---

## 7. Plan por fases

| Fase | Qué entra | Por qué en este orden |
|---|---|---|
| **0** | Schema + pantalla de configuración por sucursal + 8 FAQ base cargadas | Sin config no hay nada que probar. Las 8 FAQ base cubren el 80% de los mensajes. |
| **1** | **Modo borrador**: sugiere, el humano manda | Se prueba la calidad sin exponer a un cliente. Sale la lista de FAQ faltantes. |
| **2** | Automático fuera de horario, con guardrails y tope de turnos | Es el caso de uso que pidieron: la guardia nocturna. |
| **3** | Calificación conversacional + resumen en el handoff | Acá el bot pasa de ahorrar tiempo a generar valor. |
| **4** | Agenda de test drive + métricas | Transaccional, con la confianza ya construida. |

---

## 8. Lo que hay que definir antes de arrancar

1. **¿El bot atiende también Instagram, o sólo WhatsApp?** Instagram tiene reglas
   de ventana distintas y más informalidad.
2. **¿Una config por sucursal o por sucursal + canal?** El pedido dice por
   sucursal; si un mismo número atiende dos sucursales, hay que resolver a cuál
   corresponde antes de elegir el catálogo de FAQ.
3. **¿Qué pasa en horario de atención con todos los asesores ocupados?** Hoy
   "hay asesores activos" apaga el bot, pero activo no es lo mismo que
   disponible.
4. **Tono.** ¿"vos" siempre? ¿El bot usa el nombre de la concesionaria o el del
   vendedor asignado?
5. **¿Se le muestra al cliente que es un bot con un nombre propio** (ej. "Sofía,
   asistente de Nave Motor") o genérico? Un nombre propio funciona mejor pero
   roza el engaño si no se aclara que es automático.
