"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { saveCompanyOperational, uploadCompanyLogo } from "./actions";

const schema = z.object({
  name: z.string().min(2, "Nombre obligatorio"),
  address: z.string().optional(),
  phone: z.string().optional(),
  logo_url: z.string().url("URL inválida").optional().or(z.literal("")),
  quote_legal_text: z.string().optional(),
});

type Initial = {
  name: string;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  quote_legal_text: string | null;
};

export function EditCompanyDialog({
  trigger,
  initial,
}: {
  trigger: ReactNode;
  initial: Initial;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [logoUrl, setLogoUrl] = useState(initial.logo_url ?? "");
  const [legalText, setLegalText] = useState(initial.quote_legal_text ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(initial.name);
      setAddress(initial.address ?? "");
      setPhone(initial.phone ?? "");
      setLogoUrl(initial.logo_url ?? "");
      setLegalText(initial.quote_legal_text ?? "");
      setError(null);
    }
    setOpen(next);
  }

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await uploadCompanyLogo(dataUrl);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setLogoUrl(res.url);
      toast.success("Logo subido");
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    const parsed = schema.safeParse({
      name,
      address,
      phone,
      logo_url: logoUrl,
      quote_legal_text: legalText,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    startTransition(async () => {
      const result = await saveCompanyOperational(parsed.data);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success("Datos de la empresa actualizados");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar concesionaria</DialogTitle>
          <DialogDescription>
            Estos datos se usan también en el membrete de los presupuestos.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-name">Nombre</Label>
            <Input
              id="ec-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-address">Dirección</Label>
            <Input
              id="ec-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Dirección de la concesionaria"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-phone">Número de teléfono</Label>
            <Input
              id="ec-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Logo (aparece en el presupuesto)</Label>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt="Logo"
                  width={56}
                  height={56}
                  unoptimized
                  className="size-14 rounded-md border object-contain"
                />
              ) : (
                <div className="flex size-14 items-center justify-center rounded-md border bg-muted text-[10px] text-muted-foreground">
                  Sin logo
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={handleLogo}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "Subiendo…" : "Subir logo"}
              </Button>
              {logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLogoUrl("")}
                >
                  Quitar
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-legal">Texto legal del presupuesto</Label>
            <Textarea
              id="ec-legal"
              rows={4}
              value={legalText}
              onChange={(e) => setLegalText(e.target.value)}
              placeholder="Ej: Precios sujetos a modificación sin previo aviso. Presupuesto no vinculante…"
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending}
              className="flex-1"
            >
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
