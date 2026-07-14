"use client";

import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import {
  addSaleDocument,
  deleteSaleDocument,
} from "@/lib/sale-doc-actions";

export type SaleDoc = {
  id: string;
  kind: string;
  title: string;
  filePath: string;
  mimeType: string | null;
  url: string | null;
};

type Props = {
  saleId: string;
  companyId: string;
  docs: SaleDoc[];
  canEdit?: boolean;
};

function isImage(mime: string | null) {
  return !!mime && mime.startsWith("image/");
}

export function SaleDocuments({ saleId, companyId, docs, canEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [dni, setDni] = useState(true);
  const [lightbox, setLightbox] = useState<SaleDoc | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const finalTitle = dni ? "DNI" : title.trim();
    if (!finalTitle) {
      toast.error("Poné un nombre al archivo");
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${companyId}/${saleId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("sale-docs")
        .upload(path, file, { upsert: false });
      if (error) {
        toast.error(`No pude subir: ${error.message}`);
        return;
      }
      const res = await addSaleDocument(saleId, {
        kind: dni ? "dni" : "other",
        title: finalTitle,
        filePath: path,
        mimeType: file.type || undefined,
      });
      if (!res.ok) {
        toast.error(res.message ?? "Error");
        return;
      }
      toast.success("Documento agregado");
      setTitle("");
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteSaleDocument(id);
      if (!res.ok) {
        toast.error(res.message ?? "Error");
        return;
      }
      toast.success("Documento eliminado");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3">
          <div className="flex gap-1 rounded-md border bg-card p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setDni(true)}
              className={`rounded px-2 py-1 ${dni ? "bg-accent/15 font-medium text-accent" : "text-muted-foreground"}`}
            >
              DNI
            </button>
            <button
              type="button"
              onClick={() => setDni(false)}
              className={`rounded px-2 py-1 ${!dni ? "bg-accent/15 font-medium text-accent" : "text-muted-foreground"}`}
            >
              Otro
            </button>
          </div>
          {!dni && (
            <Input
              placeholder="Nombre del documento (ej. Recibo de sueldo)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9 max-w-xs"
            />
          )}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={handleFile}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Upload className="mr-2 size-4" />
            )}
            Subir archivo
          </Button>
        </div>
      )}

      {docs.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          Sin documentación cargada
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="group relative flex flex-col overflow-hidden rounded-md border bg-card"
            >
              <button
                type="button"
                onClick={() => setLightbox(doc)}
                className="flex h-24 items-center justify-center bg-muted/40"
                title="Ver"
              >
                {isImage(doc.mimeType) && doc.url ? (
                  <Image
                    src={doc.url}
                    alt={doc.title}
                    width={200}
                    height={96}
                    unoptimized
                    className="h-24 w-full object-cover"
                  />
                ) : (
                  <FileText className="size-8 text-muted-foreground" />
                )}
              </button>
              <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                <span className="truncate text-xs font-medium" title={doc.title}>
                  {doc.kind === "dni" ? "🪪 " : ""}
                  {doc.title}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  {doc.url && (
                    <a
                      href={doc.url}
                      download
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      title="Descargar"
                    >
                      <Download className="size-3.5" />
                    </a>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => remove(doc.id)}
                      disabled={pending}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      title="Eliminar"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="text-sm">{lightbox?.title}</DialogTitle>
          {lightbox?.url ? (
            isImage(lightbox.mimeType) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lightbox.url}
                alt={lightbox.title}
                className="max-h-[75vh] w-full rounded-md object-contain"
              />
            ) : (
              <iframe
                src={lightbox.url}
                title={lightbox.title}
                className="h-[75vh] w-full rounded-md border"
              />
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              No pude cargar la vista previa.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
