"use client";

import { Building2, Check, ChevronsUpDown, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setActiveCompany } from "@/app/(app)/group/actions";
import type { GroupContext } from "@/lib/groups";
import { cn } from "@/lib/utils";

/**
 * Selector de marca del admin de grupo, arriba del menú.
 *
 * Es la pieza que hace que el resto de la app no cambie: al elegir una marca, el
 * usuario queda scopeado a esa concesionaria (en la app y en RLS) y todas las
 * pantallas se comportan como las de un Admin normal.
 */
export function BrandSwitcher({
  ctx,
  collapsed,
}: {
  ctx: GroupContext;
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const active = ctx.brands.find((b) => b.id === ctx.activeCompanyId);

  function pick(id: string) {
    if (id === ctx.activeCompanyId) {
      setOpen(false);
      return;
    }
    start(async () => {
      const res = await setActiveCompany(id);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  if (collapsed) {
    return (
      <Link
        href="/group"
        title={`${ctx.groupName} · ${active?.name ?? "elegir marca"}`}
        className="flex items-center justify-center rounded-md py-2 text-sidebar-foreground hover:bg-white/5"
      >
        <LayoutGrid className="size-5" />
      </Link>
    );
  }

  return (
    <div className="relative px-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-left transition-colors hover:bg-white/10",
          pending && "opacity-60",
        )}
      >
        <Building2 className="size-4 shrink-0 text-sidebar-accent" />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[10px] tracking-wide text-sidebar-foreground/60 uppercase">
            {ctx.groupName}
          </span>
          <span className="truncate text-xs font-medium text-sidebar-foreground">
            {active?.name ?? "Elegí una marca"}
          </span>
        </span>
        <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-sidebar-foreground/60" />
      </button>

      {open && (
        <div className="absolute inset-x-1 top-full z-50 mt-1 overflow-hidden rounded-md border border-white/10 bg-sidebar shadow-lg">
          <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
            Marcas del grupo
          </p>
          <ul className="max-h-72 overflow-y-auto">
            {ctx.brands.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => pick(b.id)}
                  disabled={pending}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-sidebar-foreground hover:bg-white/10"
                >
                  <span className="w-3.5 shrink-0">
                    {b.id === ctx.activeCompanyId && (
                      <Check className="size-3.5 text-sidebar-accent" />
                    )}
                  </span>
                  <span className="truncate">{b.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <Link
            href="/group"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 border-t border-white/10 px-2 py-2 text-xs font-medium text-sidebar-accent hover:bg-white/10"
          >
            <LayoutGrid className="size-3.5" />
            Ver el grupo completo
          </Link>
        </div>
      )}
    </div>
  );
}
