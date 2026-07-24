"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarCheck,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  FileInput,
  FileText,
  HelpCircle,
  Camera,
  Home,
  Inbox,
  Layers,
  LogOut,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Receipt,
  Settings2,
  ShoppingBag,
  Smartphone,
  Target,
  UserPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { signOut } from "@/app/auth/actions";

import type { Profile, UserRole } from "@/lib/auth";

type Item = { href: string; label: string; icon: LucideIcon; match?: string };

const SUPER_ADMIN_NAV: Item[] = [
  { href: "/super-admin", label: "Inicio", icon: Home, match: "exact" },
  { href: "/super-admin/reports", label: "Reportes", icon: BarChart3 },
  { href: "/super-admin/leads", label: "Leads", icon: Inbox },
  { href: "/super-admin/companies", label: "Concesionarias", icon: Building2 },
  {
    href: "/super-admin/branch-requests",
    label: "Solicitudes",
    icon: Layers,
  },
  { href: "/super-admin/templates", label: "Plantillas", icon: MessageCircle },
  { href: "/super-admin/billing", label: "Facturación", icon: Receipt },
];

const ADMIN_NAV: Item[] = [
  { href: "/admin", label: "Inicio", icon: Home, match: "exact" },
  { href: "/admin/company", label: "Mi empresa", icon: Building2 },
  { href: "/admin/leads", label: "Leads", icon: Inbox },
  { href: "/admin/tasks-visits", label: "Tareas y Visitas", icon: CalendarCheck },
  { href: "/admin/forms", label: "Formularios", icon: FileInput },
  { href: "/admin/sales", label: "Ventas", icon: ShoppingBag },
  { href: "/admin/prices", label: "Precios", icon: Receipt },
  {
    href: "/admin/product-types",
    label: "Tipos de producto",
    icon: Briefcase,
  },
  { href: "/admin/campaigns", label: "Campañas", icon: Megaphone },
  { href: "/admin/users", label: "Usuarios", icon: UsersRound },
];

const MANAGER_NAV: Item[] = [
  { href: "/manager", label: "Inicio", icon: Home, match: "exact" },
  { href: "/manager/leads", label: "Leads", icon: Inbox },
  { href: "/manager/sales", label: "Ventas", icon: ShoppingBag },
  { href: "/manager/tasks-visits", label: "Tareas y Visitas", icon: CalendarCheck },
  { href: "/manager/forms", label: "Formularios", icon: FileInput },
  { href: "/manager/team", label: "Equipo", icon: Users },
  { href: "/manager/managements", label: "Gerencias", icon: Settings2 },
];

// El Supervisor (sub-gerente) reutiliza las pantallas del gerente, pero no
// gestiona Gerencias (eso es exclusivo del gerente dueño).
const SUPERVISOR_NAV: Item[] = [
  { href: "/manager", label: "Inicio", icon: Home, match: "exact" },
  { href: "/manager/leads", label: "Leads", icon: Inbox },
  { href: "/manager/sales", label: "Ventas", icon: ShoppingBag },
  { href: "/manager/tasks-visits", label: "Tareas y Visitas", icon: CalendarCheck },
  { href: "/manager/forms", label: "Formularios", icon: FileInput },
  { href: "/manager/team", label: "Equipo", icon: Users },
];

const PROVIDER_NAV: Item[] = [
  { href: "/data-provider", label: "Inicio", icon: Home, match: "exact" },
  { href: "/data-provider/leads", label: "Mis cargas", icon: Inbox },
  { href: "/data-provider/pool", label: "Sin clasificar", icon: Layers },
  {
    href: "/data-provider/leads/new",
    label: "Nuevo lead",
    icon: UserPlus,
  },
];

const SALES_NAV: Item[] = [
  { href: "/sales", label: "Inicio", icon: Home, match: "exact" },
  { href: "/sales/leads", label: "Mis leads", icon: Inbox },
  { href: "/sales/leads/new", label: "Nuevo lead", icon: UserPlus },
  {
    href: "/sales/tasks-visits",
    label: "Tareas y Visitas",
    icon: CalendarCheck,
  },
  { href: "/sales/sales", label: "Mis ventas", icon: ShoppingBag },
];

const APP_NAV: Item[] = [
  { href: "/dashboard", label: "Inicio", icon: Home, match: "exact" },
];

// --- Integraciones: subtítulo con Inbox + sub-grupos WhatsApp / Meta Ads ---
type NavGroup = { label: string; icon: LucideIcon; items: Item[] };
type Integrations = { items: Item[]; groups: NavGroup[] };

const INBOX_ITEM: Item = { href: "/admin/inbox", label: "Inbox", icon: MessageSquare };
const INSTAGRAM_ITEM: Item = {
  href: "/admin/channels/instagram",
  label: "Instagram",
  icon: Camera,
};

const ADMIN_INTEGRATIONS: Integrations = {
  items: [INBOX_ITEM, INSTAGRAM_ITEM],
  groups: [
    {
      label: "WhatsApp",
      icon: MessageCircle,
      items: [
        { href: "/admin/channels/whatsapp", label: "Conexión", icon: Smartphone },
        { href: "/admin/whatsapp-templates", label: "Plantillas", icon: FileText },
      ],
    },
    {
      label: "Meta Ads",
      icon: Target,
      items: [
        { href: "/admin/channels/facebook", label: "Conexión", icon: Smartphone },
        { href: "/admin/lead-ads", label: "Formularios", icon: Target },
      ],
    },
  ],
};

// Gerente/Supervisor/Vendedor: sólo Inbox (las pantallas de config son de admin).
const INBOX_ONLY_INTEGRATIONS: Integrations = { items: [INBOX_ITEM], groups: [] };

function integrationsForRole(role: UserRole): Integrations | null {
  if (role === "admin") return ADMIN_INTEGRATIONS;
  if (role === "manager" || role === "supervisor" || role === "sales")
    return INBOX_ONLY_INTEGRATIONS;
  return null;
}

// Todos los hrefs (menú + integraciones) para calcular el ítem activo.
function allHrefItems(items: Item[], integ: Integrations | null): Item[] {
  if (!integ) return items;
  return [...items, ...integ.items, ...integ.groups.flatMap((g) => g.items)];
}

function navForRole(role: UserRole): Item[] {
  if (role === "super_admin") return SUPER_ADMIN_NAV;
  if (role === "admin") return ADMIN_NAV;
  if (role === "manager") return MANAGER_NAV;
  if (role === "supervisor") return SUPERVISOR_NAV;
  if (role === "sales") return SALES_NAV;
  if (role === "data_provider") return PROVIDER_NAV;
  return APP_NAV;
}

function activeHref(pathname: string, items: Item[]): string | null {
  // Devuelve el href más específico (más largo) que matchea con la URL actual.
  let bestMatch: { href: string; length: number } | null = null;
  for (const item of items) {
    const matches =
      item.match === "exact"
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (!bestMatch || item.href.length > bestMatch.length)) {
      bestMatch = { href: item.href, length: item.href.length };
    }
  }
  return bestMatch?.href ?? null;
}

export function AppSidebar({
  profile,
  badges = {},
}: {
  profile: Profile;
  // Contadores por href (ej. leads nuevos, solicitudes pendientes).
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const items = navForRole(profile.role);
  const integrations = integrationsForRole(profile.role);
  const activeItemHref = activeHref(pathname, allHrefItems(items, integrations));

  // Menú acoplado (solo íconos + logo). Auto en el inbox; con botón para togglear.
  // El override manual se resetea al cruzar el borde del inbox (entrar/salir),
  // así CADA vez que se abre el inbox el menú vuelve a colapsarse solo.
  const onInbox = pathname.includes("/inbox");
  const [override, setOverride] = useState<boolean | null>(null);
  const [prevOnInbox, setPrevOnInbox] = useState(onInbox);
  if (prevOnInbox !== onInbox) {
    setPrevOnInbox(onInbox);
    setOverride(null);
  }
  const collapsed = override ?? onInbox;

  // Grupos desplegables (WhatsApp, Meta Ads). Se abren solos si el activo está dentro.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (integrations) {
      for (const g of integrations.groups) {
        if (g.items.some((it) => it.href === activeItemHref)) s.add(g.label);
      }
    }
    return s;
  });
  const toggleGroup = (label: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  const renderLink = (item: Item, indent = false) => {
    const active = item.href === activeItemHref;
    const Icon = item.icon;
    const count = badges[item.href] ?? 0;
    if (collapsed) {
      return (
        <Link
          key={item.href}
          href={item.href}
          title={item.label}
          className={cn(
            "relative flex items-center justify-center rounded-md py-2.5 transition-colors",
            active
              ? "bg-white/5 text-sidebar-accent"
              : "text-sidebar-foreground hover:bg-white/5",
          )}
        >
          <Icon className="size-5 shrink-0" />
          {count > 0 && (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent" />
          )}
        </Link>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "relative flex items-center gap-3 rounded-md py-2.5 text-sm font-medium transition-colors",
          indent ? "pr-3 pl-9" : "px-3",
          active
            ? "text-sidebar-accent"
            : "text-sidebar-foreground hover:bg-white/5",
        )}
      >
        <Icon className="size-5 shrink-0" />
        <span>{item.label}</span>
        {count > 0 && (
          <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-accent-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
        {active && (
          <span
            aria-hidden
            className="absolute top-1.5 right-0 bottom-1.5 w-[3px] rounded-l-full bg-sidebar-accent"
          />
        )}
      </Link>
    );
  };

  // Sub-botón (dentro de un grupo desplegado): más chico, indentado, sin ícono.
  const renderSubLink = (item: Item) => {
    const active = item.href === activeItemHref;
    const count = badges[item.href] ?? 0;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "relative flex items-center rounded-md py-1.5 pr-3 pl-11 text-[13px] transition-colors",
          active
            ? "font-medium text-sidebar-accent"
            : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
        )}
      >
        <span>{item.label}</span>
        {count > 0 && (
          <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-accent-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
        {active && (
          <span
            aria-hidden
            className="absolute top-1 right-0 bottom-1 w-[3px] rounded-l-full bg-sidebar-accent"
          />
        )}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex",
          collapsed
            ? "flex-col items-center gap-2 px-2 pt-6 pb-4"
            : "items-center justify-between px-6 pt-7 pb-5",
        )}
      >
        <Link href="/" aria-label="Ir al inicio">
          <Logo size={collapsed ? 30 : 44} />
        </Link>
        <div className="flex items-center gap-1">
          {!collapsed && profile.role !== "super_admin" && (
            <NotificationBell className="text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground" />
          )}
          <button
            type="button"
            onClick={() => setOverride(!collapsed)}
            title={collapsed ? "Expandir menú" : "Contraer menú"}
            className="rounded-md p-1.5 text-sidebar-muted transition-colors hover:bg-white/10 hover:text-sidebar-foreground"
          >
            {collapsed ? (
              <ChevronsRight className="size-4" />
            ) : (
              <ChevronsLeft className="size-4" />
            )}
          </button>
        </div>
      </div>

      <Separator className="bg-sidebar-border" />

      <nav
        className={cn(
          "sidebar-scroll flex flex-1 flex-col gap-1 overflow-y-auto py-4",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {items.map((item) => renderLink(item))}

        {integrations && (
          <>
            {collapsed ? (
              <Separator className="my-2 bg-sidebar-border" />
            ) : (
              <div className="mt-5 mb-1 px-3 text-[10px] font-semibold tracking-wider text-sidebar-muted uppercase">
                Integraciones
              </div>
            )}
            {integrations.items.map((item) => renderLink(item))}
            {integrations.groups.map((group) => {
              const GroupIcon = group.icon;
              const open = expanded.has(group.label);
              if (collapsed) {
                const groupActive = group.items.some(
                  (it) => it.href === activeItemHref,
                );
                return (
                  <button
                    key={group.label}
                    type="button"
                    title={group.label}
                    onClick={() => {
                      setOverride(false);
                      setExpanded((prev) => new Set(prev).add(group.label));
                    }}
                    className={cn(
                      "flex items-center justify-center rounded-md py-2.5 transition-colors",
                      groupActive
                        ? "bg-white/5 text-sidebar-accent"
                        : "text-sidebar-foreground hover:bg-white/5",
                    )}
                  >
                    <GroupIcon className="size-5" />
                  </button>
                );
              }
              return (
                <div key={group.label}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-white/5"
                  >
                    <GroupIcon className="size-5 shrink-0" />
                    <span>{group.label}</span>
                    <ChevronDown
                      className={cn(
                        "ml-auto size-4 shrink-0 text-sidebar-muted transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>
                  {open && (
                    <div className="mt-0.5 mb-1 flex flex-col gap-0.5">
                      {group.items.map((item) => renderSubLink(item))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </nav>

      <div
        className={cn(
          "flex flex-col gap-1 pb-5",
          collapsed ? "items-center px-2" : "px-3",
        )}
      >
        <Link
          href="/profile"
          title="Mi perfil"
          className={cn(
            "flex rounded-md transition-colors",
            collapsed ? "justify-center p-1.5" : "items-center gap-2 px-2 py-1.5",
            pathname === "/profile" ? "bg-white/10" : "hover:bg-white/5",
          )}
        >
          <UserAvatar
            firstName={profile.first_name}
            lastName={profile.last_name}
            avatarUrl={profile.avatar_url}
            role={profile.role}
            size="sm"
          />
          {!collapsed && (
            <span className="flex min-w-0 flex-col text-left leading-tight">
              <span className="truncate text-xs font-medium text-sidebar-foreground">
                {[profile.first_name, profile.last_name]
                  .filter(Boolean)
                  .join(" ") || "Mi perfil"}
              </span>
              <span className="truncate text-[10px] text-sidebar-muted">
                {ROLE_LABELS[profile.role]}
              </span>
            </span>
          )}
        </Link>

        <Separator className="my-1 bg-sidebar-border" />

        <button
          type="button"
          title="Ayuda"
          className={cn(
            "flex items-center rounded-md py-2.5 text-sm font-medium text-sidebar-muted transition-colors hover:bg-white/5 hover:text-sidebar-foreground",
            collapsed ? "w-full justify-center" : "gap-3 px-3",
          )}
        >
          <HelpCircle className="size-5 shrink-0" />
          {!collapsed && <span>Ayuda</span>}
        </button>

        <form action={signOut} className="w-full">
          <Button
            type="submit"
            variant="ghost"
            className={cn(
              "flex w-full items-center rounded-md py-2.5 text-sm font-medium text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
              collapsed ? "justify-center px-0" : "justify-start gap-3 px-3",
            )}
          >
            <LogOut className="size-5 shrink-0" />
            {!collapsed && <span>Salir</span>}
          </Button>
        </form>
      </div>
    </aside>
  );
}

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "SuperAdmin",
  admin: "Admin",
  manager: "Gerente de ventas",
  supervisor: "Supervisor",
  sales: "Vendedor",
  data_provider: "Proveedor de datos",
};

