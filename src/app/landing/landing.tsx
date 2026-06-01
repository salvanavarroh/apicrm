import Image from "next/image";
import Link from "next/link";

/**
 * Landing pública — Figma node 539:1079.
 * Dark theme, naranja API (#FF5906), DM Sans (heredado del layout root).
 */

const COLORS = {
  bg: "#0a0c10",
  bgDeep: "#07090c",
  card: "#13161c",
  border: "#1f242c",
  accent: "#FF5906",
  textMuted: "#8a92a3",
} as const;

export function Landing() {
  return (
    <div className="min-h-screen bg-[#0a0c10] text-white">
      <Nav />
      <Hero />
      <Diagnostico />
      <Solucion />
      <Kpis />
      <Contacto />
      <Footer />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Nav
// ────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header className="border-b border-[#1f242c]/60">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <Hexagon />
          <span className="text-lg font-semibold tracking-wide text-white">
            API
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-white/80 md:flex">
          <a href="#producto" className="transition hover:text-white">
            Producto
          </a>
          <a href="#como-funciona" className="transition hover:text-white">
            Cómo funciona
          </a>
          <a href="#contacto" className="transition hover:text-white">
            Contacto
          </a>
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-white/80 transition hover:text-white"
          >
            Iniciar sesión
          </Link>
          <a
            href="#contacto"
            className="inline-flex items-center rounded-md bg-[#FF5906] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#FF5906]/90"
          >
            Solicitar demo
          </a>
        </div>
      </div>
    </header>
  );
}

function Hexagon() {
  return (
    <svg
      viewBox="0 0 32 32"
      width="28"
      height="32"
      aria-hidden
      className="shrink-0"
    >
      <defs>
        <linearGradient id="hexGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF8A4C" />
          <stop offset="100%" stopColor="#FF5906" />
        </linearGradient>
      </defs>
      <polygon
        points="16,1 30,9 30,23 16,31 2,23 2,9"
        fill="url(#hexGrad)"
      />
      <path
        d="M16 8 L23 22 L20 22 L18.5 19 L13.5 19 L12 22 L9 22 Z M16 14 L14.5 17 L17.5 17 Z"
        fill="#ffffff"
      />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────
// Hero
// ────────────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#FF5906]">
      <span className="h-px w-8 bg-[#FF5906]" />
      <span>{children}</span>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-7xl items-start gap-12 px-6 pt-16 pb-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="flex flex-col gap-6">
          <Eyebrow>CRM para concesionarias</Eyebrow>

          <h1 className="max-w-[14ch] text-[44px] font-bold leading-[1.05] tracking-tight md:text-[56px]">
            La plataforma que ordena la gestión de leads de tu concesionaria.
          </h1>

          <p className="max-w-md text-[15px] leading-relaxed text-white/60">
            Centralizá la asignación, el seguimiento y el cierre de
            oportunidades. Un sistema diseñado para equipos comerciales que
            necesitan trazabilidad, control y resultados medibles.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#contacto"
              className="inline-flex items-center rounded-md bg-[#FF5906] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#FF5906]/90"
            >
              Solicitar demo
            </a>
            <a
              href="#como-funciona"
              className="inline-flex items-center rounded-md border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
            >
              Ver cómo funciona
            </a>
          </div>

          <div className="mt-10 flex flex-col gap-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">
              Concesionarias que confían en API
            </p>
            <div className="flex flex-wrap items-center gap-x-10 gap-y-3 text-sm font-semibold uppercase tracking-[0.15em] text-white/55">
              <span>Valencia Motors</span>
              <span>Iberia Auto</span>
              <span>Elite Drive</span>
              <span>Prime Garage</span>
            </div>
          </div>
        </div>

        <HeroMockup />
      </div>
    </section>
  );
}

function HeroMockup() {
  return (
    <div className="rounded-xl border border-[#262b35] bg-[#13161c] p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]">
      <div className="mb-4 grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-[#262b35] pb-3">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-white/15" />
          <span className="size-2 rounded-full bg-white/15" />
          <span className="size-2 rounded-full bg-white/15" />
        </div>
        <span className="text-center font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
          Pipeline · Concesionaria Central
        </span>
        <div className="text-right">
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">
            Conversión mes
          </div>
          <div className="font-mono text-sm font-semibold text-white">
            24.8%
          </div>
        </div>
      </div>

      <div className="rounded-md border border-[#262b35]">
        <table className="w-full table-fixed text-xs">
          <thead>
            <tr className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">
              <th className="px-3 py-2 text-left font-medium">Prospecto</th>
              <th className="px-3 py-2 text-left font-medium">Vehículo</th>
              <th className="px-3 py-2 text-left font-medium">Estado</th>
              <th className="px-3 py-2 text-left font-medium">Vendedor</th>
            </tr>
          </thead>
          <tbody className="text-white/85">
            <MockRow
              name="Ricardo Salinas"
              origin="Facebook Ads"
              vehicleA="SUV X-Trail 2024"
              statusDot="#FF5906"
              statusLabel="Nuevo"
              vendor="Asignar..."
              vendorMuted
            />
            <MockRow
              name="María Elena Torres"
              origin="Sitio web"
              vehicleA="Civic Hybrid"
              statusDot="#f59e0b"
              statusLabel="Contactado"
              vendor="L. Pérez"
            />
            <MockRow
              name="Santiago Méndez"
              origin="WhatsApp"
              vehicleA="V-Class Executive"
              statusDot="#3b82f6"
              statusLabel="Prueba de manejo"
              vendor="M. Romero"
            />
            <MockRow
              name="Carolina Ruiz"
              origin="Mercado Libre"
              vehicleA="Corolla Cross"
              statusDot="#22c55e"
              statusLabel="Presupuestado"
              vendor="L. Pérez"
              last
            />
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="Tiempo respuesta" value="1.2m" trend="-42%" good />
        <MiniStat label="Leads activos" value="487" trend="+12%" good />
        <MiniStat label="Sin asignar" value="03" trend="bajo" muted />
      </div>
    </div>
  );
}

function MockRow({
  name,
  origin,
  vehicleA,
  statusDot,
  statusLabel,
  vendor,
  vendorMuted,
  last,
}: {
  name: string;
  origin: string;
  vehicleA: string;
  statusDot: string;
  statusLabel: string;
  vendor: string;
  vendorMuted?: boolean;
  last?: boolean;
}) {
  return (
    <tr className={last ? "" : "border-t border-[#262b35]"}>
      <td className="px-3 py-3 align-top">
        <div className="font-medium text-white">{name}</div>
        <div className="font-mono text-[10px] text-white/40">{origin}</div>
      </td>
      <td className="px-3 py-3 align-top font-mono text-[11px] text-white/75">
        {vehicleA}
      </td>
      <td className="px-3 py-3 align-top">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="mt-0.5 inline-block size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: statusDot }}
          />
          <span className="text-[11px]">{statusLabel}</span>
        </span>
      </td>
      <td
        className={`px-3 py-3 align-top text-[11px] ${vendorMuted ? "text-white/40" : ""}`}
      >
        {vendor}
      </td>
    </tr>
  );
}

function MiniStat({
  label,
  value,
  trend,
  good,
  muted,
}: {
  label: string;
  value: string;
  trend: string;
  good?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="rounded-md border border-[#262b35] px-3 py-2.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">
        {label}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="font-mono text-base font-semibold">{value}</span>
        <span
          className={`font-mono text-[10px] font-medium ${
            muted
              ? "text-white/40"
              : good
                ? "text-emerald-400"
                : "text-rose-400"
          }`}
        >
          {trend}
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Diagnóstico
// ────────────────────────────────────────────────────────────────

function Diagnostico() {
  return (
    <section id="producto" className="border-y border-[#1f242c]/60 bg-[#07090c]">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-6">
          <Eyebrow>Diagnóstico</Eyebrow>
          <h2 className="text-4xl font-bold leading-tight tracking-tight md:text-[40px]">
            ¿Qué está fallando hoy en la gestión de leads de tu concesionaria?
          </h2>
          <p className="text-sm leading-relaxed text-white/55">
            Si más de uno de estos problemas te resulta familiar, tu equipo
            está dejando ventas sobre la mesa todos los días.
          </p>
        </div>

        <div className="rounded-xl border border-[#1f242c] bg-[#0d1015]/60 p-6 md:p-8">
          <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
            <NumberedItem
              num="01"
              title="Leads que se enfrían"
              body="Las consultas llegan por Facebook, WhatsApp y la web pero nadie las responde a tiempo. Cada minuto perdido es una venta menos."
            />
            <NumberedItem
              num="02"
              title="Asignación manual y desordenada"
              body="Los leads quedan en planillas, mensajes sueltos o en la cabeza del gerente. No hay un criterio claro para decidir a quién le toca cada uno."
            />
            <NumberedItem
              num="03"
              title="Sin trazabilidad del vendedor"
              body="No sabés qué hizo cada vendedor con su lead, en qué etapa está ni cuánto demora en responder. La gestión queda librada al criterio individual."
            />
            <NumberedItem
              num="04"
              title="Oportunidades que se pierden"
              body="Sin pipeline, sin recordatorios y sin métricas, el equipo deja escapar prospectos que estaban listos para comprar."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function NumberedItem({
  num,
  title,
  body,
}: {
  num: string;
  title: string;
  body: string;
}) {
  return (
    <div className="border-t border-[#FF5906]/70 pt-4">
      <span className="font-mono text-[11px] font-semibold text-[#FF5906]">
        {num}
      </span>
      <h3 className="mt-3 text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-white/55">{body}</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Solución
// ────────────────────────────────────────────────────────────────

function Solucion() {
  return (
    <section id="como-funciona" className="bg-[#0a0c10]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-end">
          <div className="flex flex-col gap-6">
            <Eyebrow>La plataforma</Eyebrow>
            <h2 className="text-4xl font-bold leading-tight tracking-tight md:text-[42px]">
              Una solución integral para no perder ni una oportunidad de venta.
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-white/55 lg:max-w-md">
            API conecta a todo tu equipo comercial — gerencia, ventas y
            proveedores de datos — en un único sistema diseñado para la
            operación de concesionarias. Menos planillas, más cierres.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-[#1f242c]">
          <Image
            src="/landing-showroom.jpg"
            alt="Concesionaria con autos en exhibición"
            width={1206}
            height={290}
            priority
            className="h-auto w-full"
          />
        </div>

        <div className="rounded-xl border border-[#1f242c] bg-[#0d1015]/60 p-6 md:p-8">
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            <NumberedItem
              num="01"
              title="Asignación automática"
              body="Cada lead se distribuye al vendedor correcto según producto, sucursal y carga de trabajo. Ningún prospecto queda sin responsable."
            />
            <NumberedItem
              num="02"
              title="Pipeline centralizado"
              body="Etapas estandarizadas — Nuevo, Contactado, Interesado, Presupuestado, Vendido — con notas, tareas y recordatorios por lead."
            />
            <NumberedItem
              num="03"
              title="Performance del equipo"
              body="Métricas en vivo por vendedor: tasa de contacto, ventas cerradas, tiempo de respuesta y comisiones liquidables."
            />
            <NumberedItem
              num="04"
              title="Alertas y SLA"
              body="Avisos automáticos cuando un lead lleva tiempo sin gestión, cuando vence una tarea o cuando hay una venta pendiente de aprobación."
            />
            <NumberedItem
              num="05"
              title="Contacto vía WhatsApp"
              body="Plantillas de mensajes precargadas con placeholders dinámicos. Tu equipo responde en un click, sin errores ni demoras."
            />
            <NumberedItem
              num="06"
              title="Multi-sucursal y multi-rol"
              body="Administradores, gerentes por producto, vendedores y proveedores de datos. Cada perfil con su vista y sus permisos."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────
// KPIs
// ────────────────────────────────────────────────────────────────

function Kpis() {
  return (
    <section className="bg-[#07090c]">
      <div className="mx-auto w-full max-w-7xl px-6 py-16">
        <div className="grid divide-x divide-[#1f242c] rounded-xl border border-[#1f242c] bg-[#0d1015]/60 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi value="-42%" label="Tiempo de respuesta al lead" />
          <Kpi value="+28%" label="Mejora en tasa de conversión" />
          <Kpi value="100%" label="Leads asignados sin pérdida" />
          <Kpi value="360°" label="Visibilidad del pipeline" />
        </div>
      </div>
    </section>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-2 px-6 py-7">
      <span className="font-mono text-5xl font-semibold tracking-tight text-[#FF5906] md:text-[52px]">
        {value}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
        {label}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Contacto
// ────────────────────────────────────────────────────────────────

function Contacto() {
  return (
    <section id="contacto" className="bg-[#0a0c10]">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-6">
          <Eyebrow>Contacto comercial</Eyebrow>
          <h2 className="text-4xl font-bold leading-tight tracking-tight md:text-[42px]">
            Coordinemos una demo para tu equipo.
          </h2>
          <p className="text-sm leading-relaxed text-white/55">
            Dejanos tus datos y un especialista te contacta en menos de 24
            horas hábiles para mostrarte la plataforma en vivo y proponerte un
            plan adecuado al tamaño de tu operación.
          </p>
          <ul className="mt-2 flex flex-col gap-2.5 text-[13px] text-white/65">
            <BulletItem>Demo personalizada de 30 minutos</BulletItem>
            <BulletItem>Diagnóstico de tu pipeline actual</BulletItem>
            <BulletItem>Sin compromiso ni tarjeta de crédito</BulletItem>
          </ul>
        </div>

        <div className="rounded-xl border border-[#1f242c] bg-[#0d1015]/60 p-6 md:p-8">
          <form className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Nombre y apellido" required>
                <FormInput placeholder="Juan Pérez" />
              </FormField>
              <FormField label="Email corporativo" required>
                <FormInput
                  type="email"
                  placeholder="juan@concesionaria.com"
                />
              </FormField>
              <FormField label="Empresa" required>
                <FormInput placeholder="Concesionaria Central" />
              </FormField>
              <FormField label="Teléfono">
                <FormInput placeholder="+54 11 1234 5678" />
              </FormField>
            </div>

            <FormField label="Tamaño del equipo de ventas">
              <select className="h-11 w-full appearance-none border border-[#262b35] bg-[#13161c] bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22><path d=%22M5.5 7.5L10 12l4.5-4.5%22 stroke=%22white%22 stroke-width=%221.5%22 fill=%22none%22 stroke-linecap=%22round%22/></svg>')] bg-[right_0.75rem_center] bg-[length:18px_18px] bg-no-repeat px-3 pr-10 text-sm text-white outline-none transition focus:border-[#FF5906]/60">
                <option>1-5 vendedores</option>
                <option>6-15 vendedores</option>
                <option>16-30 vendedores</option>
                <option>+30 vendedores</option>
              </select>
            </FormField>

            <button
              type="button"
              className="mt-1 inline-flex h-12 w-full items-center justify-center bg-[#FF5906] text-sm font-semibold text-white transition hover:bg-[#FF5906]/90"
            >
              Solicitar demo
            </button>

            <p className="text-center text-[11px] text-white/40">
              Respuesta garantizada en menos de 24 horas hábiles. Tus datos no
              se comparten con terceros.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-2 h-px w-4 shrink-0 bg-white/35" />
      <span>{children}</span>
    </li>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
        {label}
        {required && <span className="text-[#FF5906]"> *</span>}
      </span>
      {children}
    </label>
  );
}

function FormInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-11 w-full border border-[#262b35] bg-[#13161c] px-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#FF5906]/60"
    />
  );
}

// ────────────────────────────────────────────────────────────────
// Footer
// ────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-[#07090c]">
      <div className="mx-auto w-full max-w-7xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_repeat(3,_1fr)]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Hexagon />
              <span className="text-lg font-semibold tracking-wide text-white">
                API
              </span>
            </div>
            <p className="max-w-xs text-[13px] leading-relaxed text-white/45">
              CRM de leads para concesionarias. Asigná, seguí y cerrá más
              ventas, sin perder oportunidades.
            </p>
          </div>

          <FooterCol
            title="Producto"
            items={["Funcionalidades", "Cómo funciona", "Precios", "Roadmap"]}
          />
          <FooterCol
            title="Empresa"
            items={["Sobre nosotros", "Casos de éxito", "Contacto"]}
          />
          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
              Contacto
            </span>
            <span className="text-[13px] text-white/65">hola@api-crm.com</span>
            <span className="text-[13px] text-white/65">+54 11 1234 5678</span>
            <span className="text-[13px] text-white/65">Buenos Aires, AR</span>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-[#1f242c]/60 pt-6 text-[11px] text-white/40 sm:flex-row">
          <span>© 2026 API. Todos los derechos reservados.</span>
          <div className="flex items-center gap-6">
            <a href="#" className="transition hover:text-white">
              Términos
            </a>
            <a href="#" className="transition hover:text-white">
              Privacidad
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
        {title}
      </span>
      {items.map((item) => (
        <a
          key={item}
          href="#"
          className="text-[13px] text-white/65 transition hover:text-white"
        >
          {item}
        </a>
      ))}
    </div>
  );
}

void COLORS;
