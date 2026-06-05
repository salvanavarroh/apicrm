-- Sprint 12b — Separar "valor del vehículo" de "lo que paga el cliente".
--
-- Antes: la columna `total` era ambigua — para cash es valor del vehículo,
-- para financed también guardaba valor del vehículo (sin intereses), lo cual
-- subestima el monto real. Resultado: reportes y PDF mostraban $20M cuando el
-- cliente terminaba pagando $26.7M con intereses.
--
-- Ahora:
--   - `total` (existente) sigue siendo subtotal del vehículo
--     (base − descuento − usado). Es directo y comparable entre modalidades.
--   - `total_to_pay` nueva, nullable: monto real que paga el cliente.
--     - cash → igual a total
--     - financed → cuota × n_cuotas + anticipo
--     - savings_plan → cuota_actual × n_cuotas + alicuotas + cuota_inicial
--   - `total_interest` nueva, nullable: solo intereses para financed.
--
-- Las columnas nuevas son nullable para no romper filas existentes.

alter table public.quotes
  add column total_to_pay numeric(14, 2) check (total_to_pay is null or total_to_pay >= 0),
  add column total_interest numeric(14, 2) check (total_interest is null or total_interest >= 0);

-- Backfill: para cotizaciones existentes, total_to_pay = total (asumimos cash
-- como default seguro — los financed previos van a quedar con total_to_pay
-- igual al subtotal, lo cual NO es exacto pero es el mejor proxy hasta que el
-- vendedor edite y guarde la cotización de nuevo).
update public.quotes set total_to_pay = total where total_to_pay is null;
