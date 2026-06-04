"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

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

const TEAM_SIZE_OPTIONS = [
  "1-5 vendedores",
  "6-15 vendedores",
  "16-30 vendedores",
  "+30 vendedores",
] as const;

/**
 * Form del #contacto de la landing pública. Cliente porque maneja state,
 * captura tracking y postea al endpoint /api/commercial-leads/submit.
 */
export function ContactForm() {
  const [nameFull, setNameFull] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [teamSize, setTeamSize] = useState<string>(TEAM_SIZE_OPTIONS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const trackingRef = useRef<Tracking>(EMPTY_TRACKING);

  useEffect(() => {
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
      // si falla algo silencioso, mandamos lo que tengamos
    }
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!nameFull.trim()) {
      setError("Necesitamos tu nombre");
      return;
    }
    if (!email.trim()) {
      setError("Necesitamos tu email");
      return;
    }
    if (!company.trim()) {
      setError("Necesitamos el nombre de tu empresa");
      return;
    }

    // Partir "Juan Pérez" → first_name="Juan", last_name="Pérez"
    const trimmed = nameFull.trim();
    const spaceIdx = trimmed.indexOf(" ");
    const firstName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const lastName =
      spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

    setSubmitting(true);
    try {
      const res = await fetch("/api/commercial-leads/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          company_name: company,
          phone,
          team_size: teamSize,
          ...trackingRef.current,
        }),
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
      setDone(true);
    } catch {
      setError("Error de red. Probá de nuevo en un momento.");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 border border-[#1f242c] bg-[#0d1015]/60 p-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-[#FF5906] text-white">
          <Check className="size-7" strokeWidth={3} />
        </span>
        <h3 className="text-lg font-semibold text-white">
          ¡Recibimos tu mensaje!
        </h3>
        <p className="max-w-sm text-sm leading-relaxed text-white/55">
          Te contactamos dentro de las próximas 24 horas hábiles para
          coordinar la demo.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[#1f242c] bg-[#0d1015]/60 p-6 md:p-8">
      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Nombre y apellido" required>
            <FormInput
              placeholder="Juan Pérez"
              value={nameFull}
              onChange={(v) => setNameFull(v)}
              autoComplete="name"
              required
            />
          </FormField>
          <FormField label="Email corporativo" required>
            <FormInput
              type="email"
              placeholder="juan@concesionaria.com"
              value={email}
              onChange={(v) => setEmail(v)}
              autoComplete="email"
              required
            />
          </FormField>
          <FormField label="Empresa" required>
            <FormInput
              placeholder="Concesionaria Central"
              value={company}
              onChange={(v) => setCompany(v)}
              autoComplete="organization"
              required
            />
          </FormField>
          <FormField label="Teléfono">
            <FormInput
              placeholder="+54 11 1234 5678"
              value={phone}
              onChange={(v) => setPhone(v)}
              autoComplete="tel"
              type="tel"
            />
          </FormField>
        </div>

        <FormField label="Tamaño del equipo de ventas">
          <select
            value={teamSize}
            onChange={(e) => setTeamSize(e.target.value)}
            className="h-11 w-full appearance-none border border-[#262b35] bg-[#13161c] bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22><path d=%22M5.5 7.5L10 12l4.5-4.5%22 stroke=%22white%22 stroke-width=%221.5%22 fill=%22none%22 stroke-linecap=%22round%22/></svg>')] bg-[right_0.75rem_center] bg-[length:18px_18px] bg-no-repeat px-3 pr-10 text-sm text-white outline-none transition focus:border-[#FF5906]/60"
          >
            {TEAM_SIZE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </FormField>

        {/* Honeypot */}
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
          <p className="border-l-2 border-red-500 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 inline-flex h-12 w-full items-center justify-center bg-[#FF5906] text-sm font-semibold text-white transition hover:bg-[#FF5906]/90 disabled:opacity-60"
        >
          {submitting ? "Enviando…" : "Solicitar demo"}
        </button>

        <p className="text-center text-[11px] text-white/40">
          Respuesta garantizada en menos de 24 horas hábiles. Tus datos no se
          comparten con terceros.
        </p>
      </form>
    </div>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
        {label}
        {required && <span className="text-[#FF5906]"> *</span>}
      </span>
      {children}
    </label>
  );
}

function FormInput({
  type = "text",
  placeholder,
  value,
  onChange,
  autoComplete,
  required,
}: {
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      required={required}
      autoComplete={autoComplete}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full border border-[#262b35] bg-[#13161c] px-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#FF5906]/60"
    />
  );
}
