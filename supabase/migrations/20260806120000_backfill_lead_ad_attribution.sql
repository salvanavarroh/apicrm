-- Backfill: copiar la atribución de anuncio (ad_id) de las conversaciones al
-- lead, para que el dashboard de Ads pueda cruzar Ventas/ROAS real por anuncio
-- (cruza por leads.metadata->>'adId' == platformAdId).
--
-- Solo IG/FB DM ads traen atribución; click-to-WhatsApp no la reenvía Zernio.
-- First-touch: si un lead tuvo varias conversaciones con ad, usamos la más vieja.
-- No pisamos un adId ya presente.

update public.leads l
set metadata = coalesce(l.metadata, '{}'::jsonb)
             || jsonb_build_object('adId', c.ad_id)
from (
  select distinct on (lead_id)
    lead_id,
    attribution->>'ad_id' as ad_id
  from public.conversations
  where lead_id is not null
    and attribution->>'ad_id' is not null
  order by lead_id, created_at asc
) c
where l.id = c.lead_id
  and c.ad_id is not null
  and (l.metadata->>'adId') is null;
