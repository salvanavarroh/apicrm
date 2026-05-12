-- Sprint 2 — facturación interna (PRD §6.3)
-- Cron mensual crea un pago por empresa activa. Vencimiento +30 días desde
-- la fecha de generación. Banner morosidad a partir de día +15.

create type public.payment_status as enum (
  'pending',     -- generado, aún no vencido
  'paid',        -- marcado como pagado por SuperAdmin
  'overdue'      -- vencido y no pagado (lo setea cron / consultas computadas)
);

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  -- Período del pago (mes que se está cobrando)
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),

  amount numeric(12, 2) not null,
  due_date date not null,

  status public.payment_status not null default 'pending',
  paid_at timestamptz,
  marked_paid_by uuid references public.profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, period_year, period_month)
);

create trigger subscription_payments_set_updated_at
  before update on public.subscription_payments
  for each row execute function public.set_updated_at();

create index subscription_payments_company_idx
  on public.subscription_payments (company_id);
create index subscription_payments_status_idx
  on public.subscription_payments (status);
create index subscription_payments_due_date_idx
  on public.subscription_payments (due_date);

alter table public.subscription_payments enable row level security;

-- Helper para chequear morosidad: el banner se muestra cuando hay pagos
-- pendientes con due_date < (today - 15 days).
create or replace function public.has_overdue_payment(
  p_company_id uuid,
  p_grace_days int default 15
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.subscription_payments
    where company_id = p_company_id
      and status = 'pending'
      and due_date < current_date - make_interval(days => p_grace_days)
  )
$$;
