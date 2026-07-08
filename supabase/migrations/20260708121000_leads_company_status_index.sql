-- ============================================================================
-- Índice para el kanban por estado a escala: cada columna filtra por
-- (company_id, status) y ordena por created_at desc. Sin este índice, una
-- columna de un estado poco frecuente escanea todos los leads de la empresa
-- hasta juntar 50. Complementa el fix de RLS (20260708120000).
-- ============================================================================

create index if not exists leads_company_status_created_active_idx
  on public.leads (company_id, status, created_at desc)
  where archived_at is null;
