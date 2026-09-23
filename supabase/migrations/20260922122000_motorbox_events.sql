-- ============================================================================
-- Eventos de intención de Motorbox.
--
-- Cada vez que un comprador toca "Contactar por WhatsApp" en una publicación,
-- Motorbox nos avisa. Sirve para una sola cosa, pero importante: comparar
-- clics contra leads efectivamente atribuidos, y así saber cuánta atribución se
-- pierde cuando alguien borra el marcador [MB:xxxx] antes de mandar el mensaje.
--
-- Sin este número, cualquier conversación sobre el rendimiento de Motorbox es
-- a ciegas. Ver docs/motorbox-spec-api.md §8.
-- ============================================================================

create table if not exists motorbox_events (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies (id) on delete cascade,
  event_id     text not null unique,
  type         text not null,
  channel      text,
  listing_code text,
  occurred_at  timestamptz not null,
  created_at   timestamptz not null default now()
);

create index if not exists motorbox_events_company_idx
  on motorbox_events (company_id, occurred_at desc);

alter table motorbox_events enable row level security;

-- Lectura: la propia empresa (y el super admin, que pasa por is_super_admin()).
--
-- Las funciones van envueltas en (select ...) a propósito: sin eso Postgres las
-- evalúa UNA VEZ POR FILA. En `leads` esa diferencia fue de 833 ms a 8 ms.
create policy "motorbox_events_select_own_company"
  on motorbox_events for select
  using (
    (select is_super_admin())
    or company_id = (select current_company_id())
  );

-- Escritura: sólo el service_role (el webhook de Motorbox). Nadie más inserta
-- acá, así que no hace falta una policy de insert para usuarios.
