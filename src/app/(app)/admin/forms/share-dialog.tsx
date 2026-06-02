"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Props = {
  trigger: ReactNode;
  slug: string;
  active: boolean;
};

export function FormShareDialog({ trigger, slug, active }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://api-crm.example.com";
  const landing = `${base}/f/${slug}`;
  const embed = `${base}/embed/${slug}`;
  const iframe = `<iframe src="${embed}" width="100%" height="640" frameborder="0" style="border:0"></iframe>`;

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compartir formulario</DialogTitle>
          <DialogDescription>
            {active
              ? "El formulario está activo. Quien tenga el link puede enviar datos."
              : "El formulario está inactivo. Activalo antes de compartir."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <ShareRow
            label="Landing pública"
            help="Página completa con tu branding."
            value={landing}
            copied={copied === "landing"}
            onCopy={() => copy(landing, "landing")}
            external
          />
          <ShareRow
            label="Embed (iframe-only)"
            help="Solo el form, sin header. Ideal para meter dentro de tu sitio."
            value={embed}
            copied={copied === "embed"}
            onCopy={() => copy(embed, "embed")}
            external
          />
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">Snippet HTML</p>
              <button
                type="button"
                onClick={() => copy(iframe, "iframe")}
                className="text-xs text-accent hover:underline"
              >
                {copied === "iframe" ? "Copiado ✓" : "Copiar"}
              </button>
            </div>
            <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-[11px]">
              <code>{iframe}</code>
            </pre>
            <p className="text-[11px] text-muted-foreground">
              Pegá esto en el HTML de tu sitio para que el form quede embebido
              dentro de tu página.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShareRow({
  label,
  help,
  value,
  copied,
  onCopy,
  external,
}: {
  label: string;
  help: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  external?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{help}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={value}
          className="h-9 flex-1 border border-input bg-card px-3 font-mono text-xs"
        />
        {external && (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center justify-center border border-input bg-card px-3 text-xs hover:bg-muted"
            aria-label="Abrir"
          >
            <ExternalLink className="size-3.5" />
          </a>
        )}
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-9 items-center justify-center gap-1 bg-accent px-3 text-xs font-semibold text-accent-foreground hover:bg-accent/90"
        >
          {copied ? (
            <>
              <Check className="size-3.5" /> Copiado
            </>
          ) : (
            <>
              <Copy className="size-3.5" /> Copiar
            </>
          )}
        </button>
      </div>
    </div>
  );
}
