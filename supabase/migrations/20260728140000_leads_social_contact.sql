-- Redes sociales (Instagram/Facebook) NO tienen teléfono: el identificador del
-- contacto es el IGSID/PSID de Meta, que no debe guardarse como número. Se
-- guarda en leads.external_id (dedup por contacto social).
--
-- 1) Relajamos la constraint de contacto para permitir leads identificados solo
--    por external_id (además de phone/email).
-- 2) Reparamos los leads sociales que ya entraron con el ID metido en `phone`.

alter table public.leads drop constraint if exists leads_has_some_contact;

alter table public.leads
  add constraint leads_has_some_contact check (
    phone is not null or email is not null or external_id is not null
  );

-- Mover el identificador social de `phone` a `external_id` y limpiar el teléfono
-- en los leads de redes que lo guardaron mal (nunca tuvieron E.164).
update public.leads
set external_id = coalesce(external_id, phone),
    phone = null
where source in ('Instagram', 'Facebook')
  and phone_e164 is null
  and phone is not null;
