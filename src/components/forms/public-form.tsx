"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { FIELD_KEYS, type FieldsConfig } from "@/lib/forms";

type Tracking = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  landing_url: string;
  referrer: string;
};

const EMPTY_TRACKING: Tracking = {
  utm_source: "",
  utm_medium: "",
  utm_campaign: "",
  utm_term: "",
  utm_content: "",
  landing_url: "",
  referrer: "",
};

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
 * Card blanca con tipografía oscura. El primaryColor del dealer se aplica
 * vía CSS var (--form-accent) → focus borders, asterisco de required y CTA.
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
  // Tracking se completa post-mount para evitar mismatch SSR/hidratación.
  const trackingRef = useRef<Tracking>(EMPTY_TRACKING);

  useEffect(() => {
    if (previewOnly) return;
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const pick = (k: string) => params.get(k) ?? "";
      trackingRef.current = {
        utm_source: pick("utm_source"),
        utm_medium: pick("utm_medium"),
        utm_campaign: pick("utm_campaign"),
        utm_term: pick("utm_term"),
        utm_content: pick("utm_content"),
        landing_url: window.location.href,
        referrer: document.referrer || "",
      };
    } catch {
      // Si algún campo no se puede leer, mandamos lo que tengamos.
    }
  }, [previewOnly]);

  const accentStyle = {
    "--form-accent": primaryColor,
  } as CSSProperties;

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
    const payload = {
      ...Object.fromEntries(formData.entries()),
      ...trackingRef.current,
    };
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
      <div
        style={accentStyle}
        className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-900 shadow-md shadow-slate-200/60"
      >
        <span
          className="flex size-14 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: primaryColor }}
        >
          <Check className="size-7" strokeWidth={3} />
        </span>
        <h2 className="text-xl font-semibold">¡Recibimos tus datos!</h2>
        <p className="max-w-sm text-sm text-slate-600">{doneMessage}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={accentStyle}
      className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-7 text-slate-900 shadow-md shadow-slate-200/60 sm:p-8"
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm leading-relaxed text-slate-600">{subtitle}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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

      {/* Honeypot — escondido para humanos, lleno por bots = descartado */}
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
        <p className="rounded-md border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={{ backgroundColor: primaryColor }}
        className="mt-1 inline-flex h-12 items-center justify-center rounded-lg px-6 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
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
  const sharedInputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-(--form-accent) focus:ring-2 focus:ring-(--form-accent)/20";
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
        {cfg.label}
        {cfg.required && (
          <span className="text-(--form-accent)"> *</span>
        )}
      </span>
      {multiline ? (
        <textarea
          name={name}
          required={cfg.required}
          placeholder={cfg.placeholder}
          autoComplete={autoComplete}
          rows={3}
          className={`min-h-[96px] py-2.5 ${sharedInputClass}`}
        />
      ) : (
        <input
          name={name}
          required={cfg.required}
          placeholder={cfg.placeholder}
          autoComplete={autoComplete}
          type={type}
          className={`h-11 ${sharedInputClass}`}
        />
      )}
    </label>
  );
}
