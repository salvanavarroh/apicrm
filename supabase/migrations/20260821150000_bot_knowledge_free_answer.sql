-- ============================================================================
-- Bot: base de conocimiento propia y respuesta fuera de la lista.
--
-- Tres problemas reales que apareció configurándolo:
--
-- 1. Las variables ({sucursal}, {horario}, …) ya se resolvían solas, pero el
--    admin las veía crudas en cada respuesta y creía que tenía que completarlas
--    a mano en las ocho. Se arregla en la UI, mostrando el valor resuelto.
--
-- 2. `{sucursal}` es el NOMBRE de la sucursal y se usaba como si fuera la
--    dirección ("Estamos en Quilmes"). Faltaban {direccion} y {telefono}, que
--    ya están cargados en la sucursal y no hay por qué volver a pedirlos.
--
-- 3. El bot sólo sabía responder las preguntas frecuentes cargadas. Si el
--    cliente escribe cualquier otra cosa, caía en "desconocida". Ahora puede
--    responder libremente PERO sólo con lo que sabe: las preguntas frecuentes
--    más este texto de conocimiento. Y sigue sin poder hablar de plata.
-- ============================================================================

alter table public.bot_configs
  -- Responder preguntas que no están en la lista, usando como fuente las
  -- preguntas frecuentes + `knowledge`. Apagado por default: encenderlo es una
  -- decisión, no un default.
  add column free_answer boolean not null default false,

  -- Lo que el bot sabe de esta concesionaria, en texto libre. Es la fuente que
  -- puede citar cuando responde fuera de la lista. Todo lo que NO esté acá, el
  -- bot no lo sabe y tiene que decir que no lo sabe.
  add column knowledge text,

  -- Tope de caracteres de una respuesta generada. Una respuesta larga es la
  -- señal más clara de que el modelo se fue por las ramas.
  add column max_answer_chars int not null default 400
    check (max_answer_chars between 100 and 1000);

comment on column public.bot_configs.free_answer is
  'Si el bot puede responder preguntas que no están en la lista de preguntas '
  'frecuentes, usando esas respuestas + knowledge como única fuente.';
comment on column public.bot_configs.knowledge is
  'Lo que el bot sabe de la concesionaria. Es su ÚNICA fuente además de las '
  'preguntas frecuentes: lo que no está acá, no lo sabe.';
