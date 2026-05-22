-- Extender lead_status con estados de venta (sincronizados desde sales) y cierre.
-- - evaluating: lead pasó por initiateSale, hay una venta en evaluación
-- - accepted: venta aprobada por Admin
-- - rejected: venta rechazada por Admin
-- - closed: Vendedor cerró el lead (terminal — venta cobrada, papeles entregados, etc.)

alter type public.lead_status add value if not exists 'evaluating';
alter type public.lead_status add value if not exists 'accepted';
alter type public.lead_status add value if not exists 'rejected';
alter type public.lead_status add value if not exists 'closed';
