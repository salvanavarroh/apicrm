"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { PublicForm } from "@/components/forms/public-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_FIELDS,
  FIELD_KEYS,
  type FieldsConfig,
  type FormInput,
} from "@/lib/forms";

import {
  createForm,
  updateForm,
  uploadFormAsset,
} from "@/app/(app)/admin/forms/actions";

export type FormBuilderOption = { id: string; label: string };

type Initial = FormInput & { id?: string };

type Props = {
  mode: "create" | "edit";
  initial?: Initial;
  branches: FormBuilderOption[];
  productTypes: FormBuilderOption[];
  campaigns: FormBuilderOption[];
  redirectTo: string;
};

const EMPTY: FormInput = {
  name: "",
  branch_id: "",
  product_type_id: "",
  campaign_id: "",
  status: "active",
  title: "Dejanos tus datos",
  subtitle: "Un asesor te contacta en menos de 24 hs hábiles.",
  submit_label: "Enviar",
  success_message: "¡Gracias! Te vamos a contactar a la brevedad.",
  logo_url: "",
  banner_url: "",
  primary_color: "#FF5906",
  fields: DEFAULT_FIELDS,
};

// Sentinel para representar 'sin campaña' en el Select (Radix no acepta value="").
const NONE = "__none__";

export function FormBuilder({
  mode,
  initial,
  branches,
  productTypes,
  campaigns,
  redirectTo,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploadingKind, setUploadingKind] = useState<
    "logo" | "banner" | null
  >(null);
  const [data, setData] = useState<FormInput>({
    ...EMPTY,
    ...(initial as Partial<FormInput>),
    fields: (initial?.fields as FieldsConfig | undefined) ?? DEFAULT_FIELDS,
  });

  function update<K extends keyof FormInput>(key: K, value: FormInput[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function updateField(
    key: (typeof FIELD_KEYS)[number],
    patch: Partial<FieldsConfig[(typeof FIELD_KEYS)[number]]>,
  ) {
    setData((d) => ({
      ...d,
      fields: {
        ...(d.fields as FieldsConfig),
        [key]: { ...(d.fields as FieldsConfig)[key], ...patch },
      },
    }));
  }

  async function handleUpload(
    kind: "logo" | "banner",
    file: File,
  ) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("La imagen supera los 2 MB");
      return;
    }
    setUploadingKind(kind);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read"));
      reader.readAsDataURL(file);
    });
    const result = await uploadFormAsset(kind, dataUrl);
    setUploadingKind(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    if (kind === "logo") update("logo_url", result.url);
    else update("banner_url", result.url);
    toast.success(`${kind === "logo" ? "Logo" : "Banner"} subido`);
  }

  function submit() {
    // Validaciones rápidas pre-submit con mensajes claros.
    if (!data.name.trim()) {
      toast.error("Ponele un nombre interno al form.");
      return;
    }
    if (!data.branch_id) {
      toast.error("Elegí una sucursal antes de guardar.");
      return;
    }
    if (!data.product_type_id) {
      toast.error("Elegí un tipo de producto antes de guardar.");
      return;
    }
    if (!data.title.trim()) {
      toast.error("Cargá un título visible para el form.");
      return;
    }
    startTransition(async () => {
      const result =
        mode === "edit" && initial?.id
          ? await updateForm(initial.id, data)
          : await createForm(data);
      if (!result.ok) {
        toast.error(result.message);
        if (process.env.NODE_ENV !== "production") {
          console.error("Form save error:", result.message);
        }
        return;
      }
      toast.success(mode === "edit" ? "Form actualizado" : "Form creado");
      router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,420px)]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Configuración general</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Row label="Nombre interno (no se muestra al lead)">
              <Input
                value={data.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Ej: Captura Meta Ads Marzo"
              />
            </Row>
            <div className="grid grid-cols-2 gap-4">
              <Row label="Sucursal *">
                {branches.length === 0 ? (
                  <EmptySelector tone="warning">
                    No hay sucursales activas. Cargá una desde Mi Empresa.
                  </EmptySelector>
                ) : (
                  <Select
                    value={data.branch_id}
                    onValueChange={(v) => update("branch_id", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Row>
              <Row label="Tipo de producto *">
                {productTypes.length === 0 ? (
                  <EmptySelector tone="warning">
                    No hay tipos activos. Cargá uno desde Tipos de Producto.
                  </EmptySelector>
                ) : (
                  <Select
                    value={data.product_type_id}
                    onValueChange={(v) => update("product_type_id", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {productTypes.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Row>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Row label="Campaña (opcional)">
                {campaigns.length === 0 ? (
                  <EmptySelector>
                    No hay campañas creadas. Podés crear el form igual.
                  </EmptySelector>
                ) : (
                  <Select
                    value={data.campaign_id || NONE}
                    onValueChange={(v) =>
                      update("campaign_id", v === NONE ? "" : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Sin campaña —</SelectItem>
                      {campaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Row>
              <Row label="Estado">
                <Select
                  value={data.status}
                  onValueChange={(v) =>
                    update("status", v as FormInput["status"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="inactive">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contenido visible</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Row label="Título">
              <Input
                value={data.title}
                onChange={(e) => update("title", e.target.value)}
              />
            </Row>
            <Row label="Subtítulo">
              <Textarea
                rows={2}
                value={data.subtitle ?? ""}
                onChange={(e) => update("subtitle", e.target.value)}
              />
            </Row>
            <div className="grid grid-cols-2 gap-4">
              <Row label="Texto del botón">
                <Input
                  value={data.submit_label}
                  onChange={(e) => update("submit_label", e.target.value)}
                />
              </Row>
              <Row label="Color principal">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={data.primary_color}
                    onChange={(e) => update("primary_color", e.target.value)}
                    className="h-9 w-12 cursor-pointer border border-input bg-card"
                  />
                  <Input
                    value={data.primary_color}
                    onChange={(e) => update("primary_color", e.target.value)}
                    placeholder="#FF5906"
                  />
                </div>
              </Row>
            </div>
            <Row label="Mensaje de éxito (después de enviar)">
              <Textarea
                rows={2}
                value={data.success_message}
                onChange={(e) => update("success_message", e.target.value)}
              />
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Branding (landing /f/[slug])</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Row label="Logo">
              <FileSlot
                kind="logo"
                url={data.logo_url || null}
                uploading={uploadingKind === "logo"}
                onSelect={(file) => handleUpload("logo", file)}
                onClear={() => update("logo_url", "")}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Recomendado: <strong>cuadrado, 256×256 px</strong> (mín. 128
                px). Fondo transparente queda mejor. PNG / JPG / WEBP / SVG,
                máx. 2 MB.
              </p>
            </Row>
            <Row label="Banner (cabecera de la landing)">
              <FileSlot
                kind="banner"
                url={data.banner_url || null}
                uploading={uploadingKind === "banner"}
                onSelect={(file) => handleUpload("banner", file)}
                onClear={() => update("banner_url", "")}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Recomendado: <strong>1600×400 px (4:1 apaisado)</strong>,
                mín. 1200 px de ancho. Foto del salón o vehículos funciona
                bien — el lado inferior se funde con el fondo oscuro. Máx.
                2 MB.
              </p>
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campos del formulario</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {FIELD_KEYS.map((k) => {
              const f = (data.fields as FieldsConfig)[k];
              return (
                <div
                  key={k}
                  className="grid items-center gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0 md:grid-cols-[1fr_1fr_auto]"
                >
                  <Row label="Label">
                    <Input
                      value={f.label}
                      onChange={(e) =>
                        updateField(k, { label: e.target.value })
                      }
                    />
                  </Row>
                  <Row label="Placeholder">
                    <Input
                      value={f.placeholder}
                      onChange={(e) =>
                        updateField(k, { placeholder: e.target.value })
                      }
                    />
                  </Row>
                  <label className="flex shrink-0 items-center gap-2 pt-5 text-xs">
                    <Checkbox
                      checked={f.required}
                      onCheckedChange={(v) =>
                        updateField(k, { required: Boolean(v) })
                      }
                      disabled={k === "phone" || k === "email"}
                    />
                    Obligatorio
                  </label>
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground">
              Teléfono y email se validan en el server (al menos uno debe
              estar completo). Los marcás como obligatorios desde su row.
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(redirectTo)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Guardando…" : mode === "edit" ? "Guardar" : "Crear form"}
          </Button>
        </div>
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
              Vista previa
            </CardTitle>
          </CardHeader>
          <CardContent className="bg-[#0a0c10] p-4 text-white">
            <PublicForm
              slug="preview"
              title={data.title || "Dejanos tus datos"}
              subtitle={data.subtitle || null}
              submitLabel={data.submit_label || "Enviar"}
              successMessage={data.success_message}
              primaryColor={data.primary_color}
              fields={data.fields as FieldsConfig}
              previewOnly
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function EmptySelector({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "warning";
}) {
  return (
    <div
      className={
        tone === "warning"
          ? "flex h-9 items-center border border-warning/40 bg-warning/5 px-3 text-xs text-warning-foreground"
          : "flex h-9 items-center border border-input bg-card px-3 text-xs text-muted-foreground"
      }
    >
      {children}
    </div>
  );
}

function FileSlot({
  kind,
  url,
  uploading,
  onSelect,
  onClear,
}: {
  kind: "logo" | "banner";
  url: string | null;
  uploading: boolean;
  onSelect: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {url && (
        <div
          className={`flex items-center justify-center border border-border bg-[#0a0c10] ${
            kind === "banner" ? "h-24 w-44" : "h-20 w-20"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={kind}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onSelect(f);
            e.currentTarget.value = "";
          }}
          disabled={uploading}
        />
        {url && (
          <button
            type="button"
            onClick={onClear}
            className="self-start text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
          >
            Quitar imagen
          </button>
        )}
      </div>
    </div>
  );
}
