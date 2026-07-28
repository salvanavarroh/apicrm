-- Realtime para el inbox: Supabase transmite por WebSocket los cambios de
-- `conversations` y `messages` al navegador, así los mensajes aparecen solos
-- (sin refrescar). Respeta RLS: cada usuario solo recibe filas de su empresa.
--
-- Hay que sumar las tablas a la publicación `supabase_realtime` y poner
-- REPLICA IDENTITY FULL para que RLS pueda evaluar los UPDATE/DELETE.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

alter table public.conversations replica identity full;
alter table public.messages replica identity full;
