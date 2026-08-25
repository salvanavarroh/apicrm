-- ============================================================================
-- Asistente IA — extensiones.
--
-- Va en su propia migración, antes que las tablas, porque `create extension` no
-- se puede correr dentro de la misma transacción que las usa en algunos
-- entornos, y porque si esto falla querés que falle solo y con un mensaje claro.
--
-- Convención de Supabase: las extensiones viven en el schema `extensions`, no en
-- `public`. El `config.toml` de este repo ya tiene
-- `extra_search_path = ["public", "extensions"]`, así que el tipo `vector`
-- resuelve sin prefijo en las requests de PostgREST.
--
-- `if not exists` es intencional: si el proyecto ya las tiene instaladas (en el
-- schema que sea), esto es un no-op y no rompe.
-- ============================================================================

create schema if not exists extensions;

-- pgvector: tipo `vector`, operador `<=>` (distancia coseno) e índice HNSW.
create extension if not exists vector with schema extensions;

-- pg_trgm: similitud por trigramas. Se usa para que un término mal escrito
-- ("gerencias", "reingresso") igual matchee en la búsqueda por texto.
create extension if not exists pg_trgm with schema extensions;
