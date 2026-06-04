-- Sprint 11 — Avatar URL en perfiles. Hoy nadie tiene foto cargada (la UI
-- cae a iniciales), pero dejamos el campo para que el día que se suba una
-- foto desde /profile no haya que migrar.

alter table public.profiles
  add column avatar_url text;
