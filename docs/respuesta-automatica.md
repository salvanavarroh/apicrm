# Respuesta automática del inbox

Qué contesta el inbox cuando no hay nadie disponible. Se configura en
**Configuración → Respuesta automática** (`/admin/bot`), y es **por sucursal**:
cada una tiene su propia configuración, porque una con guardia nocturna y otra
que cierra a las 18 no necesitan la misma política.

## Prenderlo

Cada sucursal tiene un interruptor **Encendido / Apagado** arriba a la derecha.
Apagado no interviene en ninguna conversación. Viene apagado por default:
encenderlo es una decisión explícita de cada concesionaria.

## ¿Qué hace el bot cuando le escriben?

Dos opciones, y se elige una:

- **Sólo sugerir** — escribe la respuesta y te la deja en el inbox. La manda el
  asesor con un clic. Al cliente no le llega nada sin revisar.
- **Responder solo** — le contesta al cliente directamente, sin que nadie revise.
  Sigue el tope de respuestas y se apaga si contesta un humano.

Conviene arrancar en *Sólo sugerir* unos días: se gana confianza y de paso
aparecen las preguntas frecuentes que faltan cargar.

## Cuándo interviene

- **Fuera de horario** — responder cuando la sucursal está cerrada.
- **Sin asesores activos** — responder si nadie está recibiendo conversaciones.
- **En horario, si nadie contesta en…** — cantidad de minutos. Vacío = no
  interviene en horario. Cubre el caso del asesor que está activo pero con
  quince conversaciones abiertas: está disponible y el cliente espera igual.

## Los otros campos

- **Tope de respuestas por conversación** — después se calla y espera al asesor.
  Evita que el bot converse solo.
- **Se presenta como** — el nombre con el que se presenta. Siempre aclara que es
  una respuesta automática, porque lo exige Meta.
- **Calificar mientras espera** — pregunta modelo, usado y forma de pago. El
  asesor entra con el lead ya cargado.
- **Responder preguntas que no están en la lista** — si el cliente pregunta algo
  que no coincide con ninguna pregunta frecuente, el bot contesta igual, pero
  **sólo con lo que sabe**: las respuestas cargadas y el texto de información de
  la concesionaria. Lo que no está ahí, dice que no lo sabe y deriva.
- **Largo máximo de la respuesta**.

## Lo que el bot nunca contesta

Si el mensaje menciona descuento, bonificación, rebaja, último precio, tasa, CFT
u otros términos de plata, el bot **no responde con contenido**: avisa que un
asesor sigue la conversación y marca al lead como caliente.

**Esto no se puede desactivar.** Es lo que evita que prometa un precio o una
bonificación que no existe.

## Las variables se resuelven solas

En las respuestas se pueden usar `{concesionaria}`, `{sucursal}`, `{direccion}`,
`{telefono}`, `{horario}` y `{nombre}`. **No hay que completarlas a mano**: salen
de los datos ya cargados en la empresa y en la sucursal. La pantalla muestra cada
una con su valor de hoy y un link para cargarlo si falta.

Si una variable no tiene dato, se reemplaza por vacío: el cliente nunca ve una
llave sin resolver.

## Preguntas frecuentes

La lista de preguntas y respuestas se carga en la misma pantalla. La respuesta la
escribís vos: el bot no la inventa. Las preguntas que el bot no supo contestar se
juntan aparte para convertirlas en pregunta nueva con un clic.
