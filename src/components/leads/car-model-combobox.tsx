"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CarItem = {
  id: string;
  brand: string;
  model: string;
};

type Props = {
  value: string;
  onChange: (combined: string, parts?: { brand: string; model: string }) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Autocomplete contra /api/cars/search. Renderiza un input con dropdown de
 * sugerencias. El usuario también puede tipear libre (cualquier string es
 * válido — el combo no fuerza elegir del catálogo). Esto cubre el caso de
 * un modelo recién salido que todavía no está cargado.
 *
 * `value` y `onChange` operan sobre el STRING combinado ("Volkswagen Amarok").
 * Cuando se elige uno del dropdown, también devolvemos las partes separadas
 * por si el form quiere persistir brand y model en columnas distintas.
 */
export function CarModelCombobox({
  value,
  onChange,
  placeholder = "Buscá marca o modelo (ej: Amarok)",
  className,
  disabled,
}: Props) {
  const [items, setItems] = useState<CarItem[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cerrar al hacer click afuera.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Search con debounce.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `/api/cars/search?q=${encodeURIComponent(value.trim())}&limit=20`;
        const res = await fetch(url);
        const json = (await res.json()) as { ok: boolean; items: CarItem[] };
        if (json.ok) {
          setItems(json.items);
          setHighlight(0);
        }
      } catch {
        // network fail — keep last items
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, open]);

  function pick(item: CarItem) {
    const combined = `${item.brand} ${item.model}`;
    onChange(combined, { brand: item.brand, model: item.model });
    setOpen(false);
  }

  function clear() {
    onChange("");
    setItems([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && open && items[highlight]) {
      e.preventDefault();
      pick(items[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="bg-card pr-12 pl-8"
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            aria-label="Limpiar"
            className="absolute top-1/2 right-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Abrir lista"
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>

      {open && (
        <div className="absolute top-full right-0 left-0 z-30 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-card shadow-lg">
          {loading && items.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">Buscando…</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col gap-1 px-3 py-3">
              <p className="text-xs text-muted-foreground">
                Sin coincidencias en el catálogo.
              </p>
              {value.trim().length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Podés dejar “{value}” como texto libre; se guarda igual.
                </p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((it, i) => {
                const isHl = i === highlight;
                const combined = `${it.brand} ${it.model}`;
                const selected = combined.toLowerCase() === value.trim().toLowerCase();
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => pick(it)}
                      onMouseEnter={() => setHighlight(i)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                        isHl
                          ? "bg-muted text-foreground"
                          : "bg-card hover:bg-muted/40",
                      )}
                    >
                      <span className="flex flex-col">
                        <span className="font-medium">{combined}</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {it.brand}
                        </span>
                      </span>
                      {selected && (
                        <Check className="size-3.5 shrink-0 text-success" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
