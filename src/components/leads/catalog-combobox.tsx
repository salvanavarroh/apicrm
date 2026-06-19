"use client";

import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (v: string) => void;
  kind: "brands" | "models";
  // Solo para kind="models": filtra modelos por esta marca.
  brand?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Autocomplete de strings contra /api/cars/catalog. Permite texto libre (no
 * fuerza elegir del catálogo). Para modelos, las sugerencias dependen de la
 * marca (cascada). La versión no usa este combo (es texto libre: no hay datos).
 */
export function CatalogCombobox({
  value,
  onChange,
  kind,
  brand,
  placeholder,
  disabled,
  className,
}: Props) {
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ mode: kind, q: value.trim() });
        if (kind === "models") params.set("brand", brand ?? "");
        const res = await fetch(`/api/cars/catalog?${params.toString()}`);
        const json = (await res.json()) as { ok: boolean; items: string[] };
        if (json.ok) {
          setItems(json.items ?? []);
          setHighlight(0);
        }
      } catch {
        // network fail — keep last items
      }
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, open, kind, brand]);

  function pick(item: string) {
    onChange(item);
    setOpen(false);
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
            onClick={() => onChange("")}
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

      {open && items.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-30 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-card shadow-lg">
          <ul className="divide-y divide-border">
            {items.map((it, i) => (
              <li key={it}>
                <button
                  type="button"
                  onClick={() => pick(it)}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm transition-colors",
                    i === highlight
                      ? "bg-muted text-foreground"
                      : "bg-card hover:bg-muted/40",
                  )}
                >
                  {it}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
