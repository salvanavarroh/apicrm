-- Sprint 15 — nuevos valores de enum (pedido Salvador):
--   1) Rol 'supervisor' (sub-gerente del equipo de un gerente).
--   2) Más canales de origen de campaña.
--
-- IMPORTANTE: en Postgres, un valor de enum nuevo no puede usarse en la misma
-- transacción en que se crea. Por eso estos ADD VALUE viven en su PROPIA
-- migración, separada de las policies/funciones que los referencian
-- (ver 20260624130000_*).

-- ============================================================================
-- 1) Rol supervisor — se comporta como sub-gerente de un gerente (manager_id).
-- ============================================================================

alter type public.user_role add value if not exists 'supervisor';

-- ============================================================================
-- 2) Canales de origen de campaña — más opciones para clasificar el origen.
--    Se insertan antes de 'other' para que "Otros" quede último.
-- ============================================================================

alter type public.campaign_origin add value if not exists 'instagram' before 'other';
alter type public.campaign_origin add value if not exists 'tiktok_ads' before 'other';
alter type public.campaign_origin add value if not exists 'marketplace' before 'other';
alter type public.campaign_origin add value if not exists 'portal_usados' before 'other';
alter type public.campaign_origin add value if not exists 'inbound_call' before 'other';
