-- #12 — Sistema de plantillas de mensaje.
--   * Plantillas GLOBALES creadas por el super_admin (llegan a todos los
--     vendedores/gerentes de la plataforma). Nadie más las edita/borra.
--   * Cada vendedor/gerente puede crear/editar/borrar SUS propias plantillas.
--   Variables soportadas: {nombre}, {nombre_completo}, {vendedor}, {vehiculo},
--   {concesionaria}, {telefono_concesionaria}.

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'user')),
  owner_id uuid references public.profiles(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  label text not null check (length(label) > 0),
  body text not null check (length(body) > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_templates_scope_owner check (
    (scope = 'global' and owner_id is null) or
    (scope = 'user' and owner_id is not null)
  )
);

create index message_templates_owner_idx on public.message_templates (owner_id);
create index message_templates_scope_idx on public.message_templates (scope);

create trigger message_templates_set_updated_at
  before update on public.message_templates
  for each row execute function public.set_updated_at();

alter table public.message_templates enable row level security;

-- SELECT: globales para todos; propias para el dueño.
create policy "mt_select_global"
  on public.message_templates for select to authenticated
  using (scope = 'global');

create policy "mt_select_own"
  on public.message_templates for select to authenticated
  using (owner_id = auth.uid());

-- Globales: solo el super_admin las gestiona.
create policy "mt_write_global_superadmin"
  on public.message_templates for all to authenticated
  using (scope = 'global' and public.is_super_admin())
  with check (scope = 'global' and public.is_super_admin());

-- Propias: el dueño gestiona las suyas.
create policy "mt_write_own"
  on public.message_templates for all to authenticated
  using (scope = 'user' and owner_id = auth.uid())
  with check (scope = 'user' and owner_id = auth.uid());

-- Seed: las 6 plantillas actuales como globales.
insert into public.message_templates (scope, label, body, sort_order) values
  ('global', 'Primer contacto',
   'Hola {nombre}! Soy {vendedor} de {concesionaria}. Vi que estás interesado en el {vehiculo}, te escribo para ayudarte con la información que necesites. ¿Cuándo te queda cómodo charlar?', 1),
  ('global', 'Recordatorio',
   'Hola {nombre}, te escribo para ver cómo seguimos con el {vehiculo}. ¿Te quedó alguna duda? Cuando quieras coordinamos una llamada o una visita.', 2),
  ('global', 'Post-presupuesto',
   'Hola {nombre}, te paso el presupuesto del {vehiculo} que charlamos. Cualquier consulta me decís. Si te suma podemos coordinar una visita para verlo en persona.', 3),
  ('global', 'Cierre suave',
   'Hola {nombre}! Cómo va? Te escribo porque tengo unas unidades del {vehiculo} disponibles y queríamos ofrecerte una propuesta antes que salgan. ¿Podemos hablar hoy?', 4),
  ('global', 'Recuperar lead frío',
   'Hola {nombre}, hace un tiempo charlamos sobre el {vehiculo}. ¿Seguís buscando o cambió tu necesidad? Si querés te mando opciones nuevas que nos llegaron.', 5),
  ('global', 'Visita / Test drive',
   'Hola {nombre}! Te invito a pasar por {concesionaria} a conocer el {vehiculo}. Podemos coordinar un test drive si querés probarlo. ¿Te queda mejor un día de semana o sábado?', 6);
