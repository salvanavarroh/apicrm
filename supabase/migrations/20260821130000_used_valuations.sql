-- ============================================================================
-- Cotizador de usados: parámetros por concesionaria y registro de tasaciones.
--
-- El precio de la guía de ACARA NO es la cotización. Lo que el concesionario
-- ofrece es: valor de mercado − reacondicionamiento − margen. Son dos números
-- distintos y el cliente los va a confundir, así que el sistema los separa:
-- el asesor ve el rango y el detalle, al cliente le sale un solo número.
--
-- Los porcentajes van por concesionaria porque Sendai y un grupo multimarca no
-- tasan igual, y no quiero un deploy para cambiar un punto.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Parámetros de tasación
-- ----------------------------------------------------------------------------
create table public.valuation_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,

  -- Lo que cuesta poner el usado en condiciones de vender.
  recon_percent numeric(5, 2) not null default 6 check (recon_percent between 0 and 40),
  -- El margen del concesionario por rotarlo.
  margin_percent numeric(5, 2) not null default 8 check (margin_percent between 0 and 40),

  -- Kilómetros que se esperan por año de uso. El estándar del mercado argentino
  -- ronda los 15.000; con esto se decide si el auto está "muy rodado".
  km_per_year int not null default 15000 check (km_per_year between 1000 and 60000),
  -- Castigo por cada 10.000 km POR ENCIMA de lo esperado.
  km_penalty_per_10k numeric(5, 2) not null default 1.5
    check (km_penalty_per_10k between 0 and 10),
  -- Premio por cada 10.000 km POR DEBAJO. Menor que el castigo: pagar de más por
  -- un auto poco rodado es un riesgo, no una ganancia.
  km_bonus_per_10k numeric(5, 2) not null default 0.8
    check (km_bonus_per_10k between 0 and 10),
  -- Tope del ajuste por km, para arriba y para abajo. Sin tope, un auto con
  -- 400.000 km da un valor negativo y uno con 0 km vale más que el 0km.
  km_adjust_cap numeric(5, 2) not null default 15 check (km_adjust_cap between 0 and 50),

  -- Ajuste por estado, en puntos porcentuales sobre el valor de guía.
  condition_adjust jsonb not null default
    '{"excelente": 3, "bueno": 0, "regular": -5, "malo": -12}'::jsonb,

  -- Media amplitud del rango interno que ve el asesor.
  spread_percent numeric(5, 2) not null default 4 check (spread_percent between 0 and 20),

  -- Cotización del dólar para los vehículos que la guía publica en USD. null =
  -- no se convierte y la cotización queda en dólares, que es como se opera esos
  -- autos. Inventar un tipo de cambio es peor que no mostrarlo.
  usd_rate numeric(14, 2) check (usd_rate is null or usd_rate > 0),
  usd_rate_updated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger valuation_settings_set_updated_at
  before update on public.valuation_settings
  for each row execute function public.set_updated_at();

alter table public.valuation_settings enable row level security;

create policy "valuation_settings_select"
  on public.valuation_settings for select to authenticated
  using (company_id = (select public.current_company_id()));

-- Los porcentajes deciden cuánta plata se ofrece: sólo el Admin los toca.
create policy "valuation_settings_write"
  on public.valuation_settings for all to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.current_role()) = 'admin'
  )
  with check (
    company_id = (select public.current_company_id())
    and (select public.current_role()) = 'admin'
  );

-- ----------------------------------------------------------------------------
-- 2) Tasaciones
--
-- Guarda el precio de guía COMO SNAPSHOT, con el mes de la guía. Sin eso no se
-- puede responder "¿por qué en agosto le ofrecimos eso?", que es exactamente la
-- pregunta que aparece cuando una toma sale mal.
-- ----------------------------------------------------------------------------
create type public.vehicle_condition as enum (
  'excelente',
  'bueno',
  'regular',
  'malo'
);

create table public.used_valuations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Puede no haber lead todavía (una consulta suelta en el inbox).
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,

  -- El vehículo, con los strings exactos de la guía.
  brand text not null,
  model text not null,
  version text not null,
  year smallint not null,
  km int not null check (km >= 0 and km <= 2000000),
  condition public.vehicle_condition not null default 'bueno',

  -- Snapshot de la guía usada.
  guide_source text not null default 'acara',
  guide_as_of date not null,
  guide_currency char(3) not null,
  guide_value numeric(14, 2) not null,

  -- El desglose completo del cálculo: qué ajuste se aplicó y por qué. Es lo que
  -- permite explicarle a un gerente de dónde salió el número.
  breakdown jsonb not null default '{}'::jsonb,

  -- Lo que vale en el mercado y lo que se ofrece. Distintos a propósito.
  market_value numeric(14, 2) not null,
  offer_min numeric(14, 2) not null,
  offer_max numeric(14, 2) not null,
  -- El número que se le pasó al cliente (puede diferir del sugerido: el asesor
  -- cotiza libre y queda registrado con su nombre).
  offer_sent numeric(14, 2),

  created_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index used_valuations_company_idx
  on public.used_valuations (company_id, created_at desc);
create index used_valuations_lead_idx on public.used_valuations (lead_id);

alter table public.used_valuations enable row level security;

-- Lectura: cualquiera de la empresa que ya ve el lead. Las tasaciones sueltas
-- (sin lead) las ve la empresa entera: son parte del historial que después
-- calibra el cotizador.
create policy "used_valuations_select"
  on public.used_valuations for select to authenticated
  using (company_id = (select public.current_company_id()));

-- Escritura: cualquier rol que atiende clientes. Sin aprobación del gerente
-- (decisión del cliente): el control es a posteriori, con el informe de
-- cotizado vs pagado.
create policy "used_valuations_insert"
  on public.used_valuations for insert to authenticated
  with check (
    company_id = (select public.current_company_id())
    and (select public.current_role()) in ('admin', 'manager', 'supervisor', 'sales')
  );

create policy "used_valuations_update"
  on public.used_valuations for update to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.current_role()) in ('admin', 'manager', 'supervisor', 'sales')
  )
  with check (company_id = (select public.current_company_id()));

-- ----------------------------------------------------------------------------
-- 3) La venta cierra el círculo
--
-- Cotizado → pagado → (más adelante) revendido. Es lo que convierte al
-- historial propio en la mejor fuente de precios a mediano plazo, y lo que le
-- permite al gerente ver si el cotizador está bien calibrado.
-- ----------------------------------------------------------------------------
alter table public.sales
  add column used_valuation_id uuid references public.used_valuations(id) on delete set null,
  add column used_car_paid numeric(14, 2) check (used_car_paid is null or used_car_paid >= 0),
  add column used_car_resold numeric(14, 2) check (used_car_resold is null or used_car_resold >= 0);

comment on column public.sales.used_car_paid is
  'Lo que se pagó de verdad por el usado en parte de pago. Contra la tasación, '
  'es la medida de si el cotizador está bien calibrado.';
comment on column public.sales.used_car_resold is
  'A cuánto se revendió ese usado. Cierra el círculo cotizado → pagado → vendido.';
