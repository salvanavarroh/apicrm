"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Building2,
  HelpCircle,
  Home,
  Inbox,
  Layers,
  LogOut,
  Megaphone,
  Receipt,
  Settings2,
  ShoppingBag,
  UserPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { signOut } from "@/app/auth/actions";

import type { Profile, UserRole } from "@/lib/auth";

type Item = { href: string; label: string; icon: LucideIcon; match?: string };

const SUPER_ADMIN_NAV: Item[] = [
  { href: "/super-admin", label: "Inicio", icon: Home, match: "exact" },
  { href: "/super-admin/companies", label: "Concesionarias", icon: Building2 },
  {
    href: "/super-admin/branch-requests",
    label: "Solicitudes",
    icon: Inbox,
  },
  { href: "/super-admin/billing", label: "Facturación", icon: Receipt },
];

const ADMIN_NAV: Item[] = [
  { href: "/admin", label: "Inicio", icon: Home, match: "exact" },
  { href: "/admin/company", label: "Mi empresa", icon: Building2 },
  { href: "/admin/leads", label: "Leads", icon: Inbox },
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
  {
    href: "/manager/leads/unassigned",
    label: "Sin asignar",
    icon: Layers,
  },
  { href: "/manager/team", label: "Equipo", icon: Users },
  { href: "/manager/managements", label: "Gerencias", icon: Settings2 },
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
  { href: "/sales/sales", label: "Mis ventas", icon: ShoppingBag },
];

const APP_NAV: Item[] = [
  { href: "/dashboard", label: "Inicio", icon: Home, match: "exact" },
];

function navForRole(role: UserRole): Item[] {
  if (role === "super_admin") return SUPER_ADMIN_NAV;
  if (role === "admin") return ADMIN_NAV;
  if (role === "manager") return MANAGER_NAV;
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

export function AppSidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const items = navForRole(profile.role);
  const activeItemHref = activeHref(pathname, items);

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center px-6 pt-7 pb-5">
        <Link href="/" aria-label="Ir al inicio">
          <Logo size={44} />
        </Link>
      </div>

      <Separator className="bg-sidebar-border" />

      <nav className="flex-1 flex-col gap-1 px-3 py-4">
        {items.map((item) => {
          const active = item.href === activeItemHref;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "text-sidebar-accent"
                  : "text-sidebar-foreground hover:bg-white/5",
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span>{item.label}</span>
              {active && (
                <span
                  aria-hidden
                  className="absolute top-1.5 right-0 bottom-1.5 w-[3px] rounded-l-full bg-sidebar-accent"
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-1 px-3 pb-5">
        <Link
          href="/profile"
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
            pathname === "/profile"
              ? "bg-white/10"
              : "hover:bg-white/5",
          )}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground">
            {initials(profile.first_name, profile.last_name)}
          </span>
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
        </Link>

        <Separator className="my-1 bg-sidebar-border" />

        <button
          type="button"
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-muted transition-colors hover:bg-white/5 hover:text-sidebar-foreground"
        >
          <HelpCircle className="size-5 shrink-0" />
          <span>Ayuda</span>
        </button>

        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            className="flex w-full items-center justify-start gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground"
          >
            <LogOut className="size-5 shrink-0" />
            <span>Salir</span>
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
  sales: "Vendedor",
  data_provider: "Proveedor de datos",
};

function initials(first: string, last: string) {
  const f = (first || "").trim().charAt(0).toUpperCase();
  const l = (last || "").trim().charAt(0).toUpperCase();
  return (f + l) || "U";
}
