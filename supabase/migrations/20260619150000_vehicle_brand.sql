-- #5 — Separar marca / modelo / versión del vehículo de interés.
--   El catálogo (car_catalog) tiene marca + modelo; la versión queda texto
--   libre (no hay fuente de versiones). Agregamos vehicle_brand separado a
--   leads y lead_vehicles. vehicle_model/vehicle_version ya existían.

alter table public.leads add column vehicle_brand text;
alter table public.lead_vehicles add column vehicle_brand text;
