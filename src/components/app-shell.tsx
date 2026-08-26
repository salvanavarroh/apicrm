"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { AssistantRail } from "@/components/assistant/assistant-rail";
import type { Suggestion } from "@/components/assistant/assistant-chat";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notifications/notification-bell";
import type { Profile } from "@/lib/auth";
import type { GroupContext } from "@/lib/groups";

/**
 * Shell de la app: menú + contenido.
 *
 * En desktop el menú es una columna fija, como siempre. En mobile pasa a ser un
 * cajón que se abre desde una barra superior: con 390px de ancho, 64px de menú
 * permanente son el 16% de la pantalla, y el contenido queda inusable.
 *
 * El estado del cajón vive acá y no en el sidebar porque lo abre el botón de la
 * barra superior, que es su hermano.
 */
export function AppShell({
  profile,
  badges,
  groupContext,
  assistant,
  children,
}: {
  profile: Profile;
  badges: Record<string, number>;
  groupContext: GroupContext | null;
  /** Saludo y sugerencias del asistente, ya resueltos por rol en el server. */
  assistant: { suggestions: Suggestion[]; greeting: string };
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AppSidebar
        profile={profile}
        badges={badges}
        groupContext={groupContext}
        mobileOpen={menuOpen}
        onMobileClose={() => setMenuOpen(false)}
      />

      {/* Fondo del cajón. Sólo en mobile y sólo cuando está abierto. */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      {/* `min-w-0` es lo que evita que una tabla ancha estire el layout y saque
          el scroll horizontal a toda la página. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior: sólo mobile. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-sidebar px-3 text-sidebar-foreground lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            className="rounded-md p-2 hover:bg-white/10"
          >
            <Menu className="size-5" />
          </button>
          <Logo size={26} mark />
          <div className="ml-auto">
            {profile.role !== "super_admin" && (
              <NotificationBell className="text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground" />
            )}
          </div>
        </header>

        {children}
      </div>

      {/* El riel del asistente va acá, hermano del contenido y no adentro: es lo
          que hace que al abrirlo el panel EMPUJE la pantalla en vez de taparla. */}
      <AssistantRail
        suggestions={assistant.suggestions}
        greeting={assistant.greeting}
      />
    </div>
  );
}
