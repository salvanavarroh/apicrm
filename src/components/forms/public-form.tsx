"use client";

import { useState } from "react";

import { FIELD_KEYS, type FieldsConfig } from "@/lib/forms";

export type PublicFormProps = {
  slug: string;
  title: string;
  subtitle: string | null;
  submitLabel: string;
  successMessage: string;
  primaryColor: string;
  fields: FieldsConfig;
  // Si está en modo preview, el submit no llama al API real.
  previewOnly?: boolean;
};

/**
 * Renderiza el form público que va en /f/[slug] y /embed/[slug].
 * Hace POST a /api/forms/[slug]/submit. Sin libs externas.
 */
export function PublicForm(props: PublicFormProps) {
  const {
    slug,
    title,
    subtitle,
    submitLabel,
    successMessage,
    primaryColor,
    fields,
    previewOnly,
  } = props;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneMessage, setDoneMessage] = useState(successMessage);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (previewOnly) {
      setDone(true);
      setDoneMessage(successMessage);
      return;
    }
    setError(null);
    setSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    try {
      const res = await fetch(`/api/forms/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.message ?? "No pudimos enviar el formulario.");
        setSubmitting(false);
        return;
      }
      setDoneMessage(json.message ?? successMessage);
      setDone(true);
    } catch {
      setError("Error de red. Probá de nuevo en un momento.");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md bg-card p-8 text-center">
        <span
          className="flex size-12 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: primaryColor }}
        >
          ✓
        </span>
        <h2 className="text-lg font-semibold">¡Recibimos tus datos!</h2>
        <p className="text-sm text-muted-foreground">{doneMessage}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-md bg-card p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          name="first_name"
          cfg={fields.first_name}
          autoComplete="given-name"
        />
        <Field
          name="last_name"
          cfg={fields.last_name}
          autoComplete="family-name"
        />
        <Field
          name="phone"
          cfg={fields.phone}
          type="tel"
          autoComplete="tel"
        />
        <Field
          name="email"
          cfg={fields.email}
          type="email"
          autoComplete="email"
        />
        <Field
          name="city"
          cfg={fields.city}
          autoComplete="address-level2"
        />
        <Field name="vehicle_model" cfg={fields.vehicle_model} />
      </div>

      <Field name="initial_notes" cfg={fields.initial_notes} multiline />

      {/* Honeypot field — escondido para humanos, lleno por bots = descartado */}
      <div className="hidden" aria-hidden="true">
        <label>
          Sitio web
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-1 inline-flex h-11 items-center justify-center px-5 text-sm font-semibold text-white transition disabled:opacity-60"
        style={{ backgroundColor: primaryColor }}
      >
        {submitting ? "Enviando…" : submitLabel}
      </button>
    </form>
  );
}

function Field({
  name,
  cfg,
  type = "text",
  multiline,
  autoComplete,
}: {
  name: (typeof FIELD_KEYS)[number];
  cfg: FieldsConfig[(typeof FIELD_KEYS)[number]];
  type?: string;
  multiline?: boolean;
  autoComplete?: string;
}) {
  const shared = {
    name,
    required: cfg.required,
    placeholder: cfg.placeholder,
    autoComplete,
    className:
      "h-11 w-full border border-[#262b35] bg-[#13161c] px-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-white/40",
  };
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
        {cfg.label}
        {cfg.required && <span className="text-[#FF5906]"> *</span>}
      </span>
      {multiline ? (
        <textarea
          {...shared}
          rows={3}
          className="min-h-[88px] w-full border border-[#262b35] bg-[#13161c] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-white/40"
        />
      ) : (
        <input {...shared} type={type} />
      )}
    </label>
  );
}
