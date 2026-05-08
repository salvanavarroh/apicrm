-- Sprint 1 — fundaciones del schema multi-tenant
-- Extensiones, enums y helpers base. No tablas todavía.

create extension if not exists "pgcrypto";  -- gen_random_uuid()
create extension if not exists "citext";    -- emails case-insensitive

-- Roles del sistema (PRD §3). Valores estables: cambiarlos requiere migration.
create type public.user_role as enum (
  'super_admin',
  'admin',
  'manager',
  'sales',
  'data_provider'
);

-- Estado de empresa (PRD §6.2): pending al crearse, active tras setup, suspended
-- por morosidad o decisión del SuperAdmin.
create type public.company_status as enum (
  'pending',
  'active',
  'suspended'
);

-- Estado de profile (PRD §6.8): pending tras invitar, active al aceptar T&C,
-- inactive si lo desactivó un superior, deleted como soft-delete.
create type public.profile_status as enum (
  'pending',
  'active',
  'inactive',
  'deleted'
);

-- Helper genérico: trigger function para mantener updated_at automático.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
