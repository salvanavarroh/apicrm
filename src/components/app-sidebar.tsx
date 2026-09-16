"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, Fragment, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Sheet,
  Bot,
  FileBarChart,
  TrendingUp,
  Blocks,
  Briefcase,
  Building2,
  Calculator,
  CalendarCheck,
  ChevronsLeft,
  ChevronsRight,
  FileInput,
  HelpCircle,
  Home,
  Inbox,
  Layers,
  LayoutGrid,
  LogOut,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Receipt,
  Settings2,
  ShoppingBag,
  UserPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { BrandSwitcher } from "@/components/groups/brand-switcher";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { signOut } from "@/app/auth/actions";

import type { Profile } from "@/lib/auth";
import { navForRole, ROLE_LABELS, type NavItem, type NavSection } from "@/lib/nav";
import type { GroupContext } from "@/lib/groups";

// El menú vive en `src/lib/nav.ts` como DATO (ver el encabezado de ese archivo):
// lo comparte con el generador de la base de conocimiento del asistente y con la
// herramienta `dondeEsta`. Acá sólo se resuelve el nombre del ícono al componente.
const ICONS: Record<string, LucideIcon> = {
  BarChart3,
  BookOpen,
  Blocks,
  Bot,
  Briefcase,
  Building2,
  Calculator,
  CalendarCheck,
  FileBarChart,
  FileInput,
  HelpCircle,
  Home,
  Inbox,
  Layers,
  LayoutGrid,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Receipt,
  Settings2,
  Sheet,
  ShoppingBag,
  TrendingUp,
  UserPlus,
  Users,
  UsersRound,
};

// Todos los hrefs (aplanados) para calcular el ítem activo.
function flatItems(sections: NavSection[]): NavItem[] {
  return sections.flatMap((s) => s.items);
}

function activeHref(pathname: string, items: NavItem[]): string | null {
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
  groupContext = null,
  mobileOpen = false,
  onMobileClose,
  onOpenAssistant,
}: {
  profile: Profile;
  // Contadores por href (ej. leads nuevos, solicitudes pendientes).
  badges?: Record<string, number>;
  /** Sólo para el admin de grupo: sus marcas y cuál está activa. */
  groupContext?: GroupContext | null;
  /** En mobile el menú es un cajón que se abre desde la barra superior. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  /** Abre el panel del asistente. "Ayuda" ES el asistente. */
  onOpenAssistant?: () => void;
}) {
  const pathname = usePathname();
  const sections = navForRole(profile.role);
  const activeItemHref = activeHref(pathname, flatItems(sections));

  // ---------------------------------------------------------------------
  // Abierto / colapsado.
  //
  // El menú vive colapsado y se abre al pasar el mouse (desktop). Al elegir una
  // opción se vuelve a colapsar solo: así no hay que usar la flecha todo el
  // tiempo y la pantalla recupera el ancho.
  //
  // La flecha sigue estando para fijarlo abierto: si el usuario la usa, el hover
  // deja de mandar hasta que la vuelva a tocar. Antes el inbox lo colapsaba a la
  // fuerza y eso confundía —el menú se cerraba solo al entrar a Inbox—; con el
  // hover esa regla especial ya no hace falta.
  // ---------------------------------------------------------------------
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [hovering, setHovering] = useState(false);
  // En mobile el menú es un cajón y va SIEMPRE expandido: el modo íconos existe
  // para no comerse ancho en desktop, y en un cajón que tapa la pantalla no
  // aporta nada.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const collapsed = !isMobile && !pinnedOpen && !hovering;

  // Al elegir una opción el menú se cierra: es lo que pedía el QA y lo que hace
  // que el hover no sea molesto. Si está fijado con la flecha, no se toca.
  const closeAfterNav = () => {
    setHovering(false);
    onMobileClose?.();
  };

  const renderLink = (item: NavItem, indent = false) => {
    const active = item.href === activeItemHref;
    const Icon = ICONS[item.icon] ?? Home;
    const count = badges[item.href] ?? 0;
    if (collapsed) {
      return (
        <Link
          key={item.href}
          href={item.href}
          title={item.label}
          onClick={closeAfterNav}
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
        onClick={closeAfterNav}
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
            // -right-3 compensa el px-3 del <nav>: sin eso la línea queda
            // flotando a 12px del borde en vez de pegada.
            className="absolute top-1.5 -right-3 bottom-1.5 w-[3px] rounded-l-full bg-sidebar-accent"
          />
        )}
      </Link>
    );
  };

  return (
    <aside
      // El hover abre el menú en desktop. En touch no hay hover, así que ahí
      // manda el botón de la barra superior.
      onMouseEnter={() => !isMobile && setHovering(true)}
      onMouseLeave={() => !isMobile && setHovering(false)}
      className={cn(
        "flex flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200",
        // Mobile: cajón fijo que entra desde la izquierda por encima de todo.
        "fixed inset-y-0 left-0 z-50 w-64 lg:static lg:z-auto lg:h-full lg:shrink-0 lg:translate-x-0 lg:transition-[width]",
        mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        collapsed ? "lg:w-16" : "lg:w-60",
      )}
    >
      {/* Cabecera: el logo arriba y la flecha SIEMPRE debajo, abierto o cerrado.
          Antes la flecha estaba al lado del logo cuando el menú estaba abierto y
          debajo cuando estaba cerrado, y saltaba de lugar al togglear. */}
      <div
        className={cn(
          "flex flex-col items-center gap-2 pb-4",
          collapsed ? "px-2 pt-6" : "px-6 pt-7",
        )}
      >
        <div className="flex w-full items-center justify-center gap-2">
          <Link href="/" aria-label="Ir al inicio">
            {/* Colapsado va sólo el isotipo, y más grande: el texto "API" a 30px
                no se lee y le roba tamaño al símbolo. */}
            <Logo size={collapsed ? 36 : 44} mark={collapsed} />
          </Link>
          {!collapsed && profile.role !== "super_admin" && (
            <NotificationBell className="ml-auto text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground" />
          )}
        </div>

        {/* Fijar el menú es una herramienta de desktop: en mobile es un cajón y
            siempre está expandido, así que la flecha no haría nada. */}
        <button
          type="button"
          onClick={() => setPinnedOpen((p) => !p)}
          title={pinnedOpen ? "Soltar el menú" : "Dejar el menú fijo"}
          aria-label={pinnedOpen ? "Soltar el menú" : "Dejar el menú fijo"}
          className="hidden rounded-md p-1 text-sidebar-muted transition-colors hover:bg-white/10 hover:text-sidebar-foreground lg:block"
        >
          {pinnedOpen ? (
            <ChevronsLeft className="size-4" />
          ) : (
            <ChevronsRight className="size-4" />
          )}
        </button>
      </div>

      {/* El selector de marca va antes del menú porque define el alcance de TODO
          lo que sigue: sin saber en qué marca estás, ningún ítem significa nada. */}
      {groupContext && (
        <div className={cn("pb-3", collapsed ? "px-2" : "px-5")}>
          <BrandSwitcher ctx={groupContext} collapsed={collapsed} />
        </div>
      )}

      <Separator className="bg-sidebar-border" />

      <nav
        className={cn(
          "sidebar-scroll flex flex-1 flex-col gap-1 overflow-y-auto py-4",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {sections.map((section, si) => (
          <Fragment key={section.title ?? `s${si}`}>
            {collapsed
              ? si > 0 && <Separator className="my-2 bg-sidebar-border" />
              : section.title && (
                  <div
                    className={cn(
                      "px-3 text-[10px] font-semibold tracking-wider text-sidebar-muted uppercase",
                      si === 0 ? "mb-1" : "mt-5 mb-1",
                    )}
                  >
                    {section.title}
                  </div>
                )}
            {section.items.map((item) => renderLink(item))}
          </Fragment>
        ))}
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

        {/* "Ayuda" abre el asistente, no una página. Mandar a alguien que
            necesita ayuda a leer una página de links es hacerle dar una vuelta
            de más: el chat contesta la pregunta concreta. La página /ayuda sigue
            existiendo con la referencia rápida. */}
        <button
          type="button"
          onClick={() => onOpenAssistant?.()}
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


