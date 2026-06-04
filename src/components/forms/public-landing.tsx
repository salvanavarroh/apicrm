import Image from "next/image";
import { Clock, MapPin, Phone, ShieldCheck } from "lucide-react";

import { PublicForm, type PublicFormProps } from "./public-form";

type Props = PublicFormProps & {
  logoUrl: string | null;
  bannerUrl: string | null;
  companyName: string | null;
  branchName?: string | null;
  address?: string | null;
  phone?: string | null;
};

/**
 * Landing pública (/f/[slug]):
 * Hero con banner + logo overlay, después grid 2-col con form (ancho) e
 * info card (sucursal: dirección, teléfono, badges de confianza).
 * En mobile colapsa a una columna y la info queda debajo del form.
 */
export function PublicLanding({
  logoUrl,
  bannerUrl,
  companyName,
  branchName,
  address,
  phone,
  ...formProps
}: Props) {
  const primaryColor = formProps.primaryColor;
  const hasContactInfo = Boolean(address || phone);

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background:
          "radial-gradient(ellipse at top, #1a1f2b 0%, #0a0c10 60%)",
      }}
    >
      {/* HERO */}
      <header className="relative">
        {bannerUrl ? (
          <div className="relative h-56 w-full overflow-hidden sm:h-72 md:h-80">
            <Image
              src={bannerUrl}
              alt={companyName ? `Banner de ${companyName}` : "Banner"}
              fill
              className="object-cover"
              sizes="100vw"
              priority
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-[#0a0c10]"
            />
          </div>
        ) : (
          <div className="h-16 sm:h-20" />
        )}

        {/* Logo + nombre superpuesto al fondo del banner */}
        <div className="relative -mt-12 flex flex-col items-center gap-3 px-6 text-center sm:-mt-14">
          {logoUrl ? (
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-xl shadow-black/40 sm:h-24 sm:w-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt={companyName ? `Logo de ${companyName}` : "Logo"}
                className="max-h-full max-w-full object-contain p-2"
              />
            </div>
          ) : null}
          {companyName && (
            <div className="flex flex-col items-center gap-0.5">
              <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {companyName}
              </h1>
              {branchName && (
                <p className="text-sm text-white/60">{branchName}</p>
              )}
            </div>
          )}
        </div>
      </header>

      {/* CONTENT GRID */}
      <main className="mx-auto w-full max-w-5xl px-6 pt-10 pb-14">
        <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
          {/* Form: 2/3 en desktop, full en mobile */}
          <div className="lg:col-span-2">
            <PublicForm {...formProps} />
          </div>

          {/* Info card sticky a la derecha en desktop */}
          {hasContactInfo ? (
            <aside className="lg:col-span-1">
              <div className="lg:sticky lg:top-6">
                <ContactCard
                  branchName={branchName}
                  address={address}
                  phone={phone}
                  primaryColor={primaryColor}
                />
              </div>
            </aside>
          ) : null}
        </div>

        <p className="mt-10 text-center text-[11px] leading-relaxed text-white/40">
          Tus datos se usan solo para que un representante te contacte. No los
          compartimos con terceros.
        </p>
      </main>
    </div>
  );
}

function ContactCard({
  branchName,
  address,
  phone,
  primaryColor,
}: {
  branchName?: string | null;
  address?: string | null;
  phone?: string | null;
  primaryColor: string;
}) {
  // Limpia número para tel:
  const telHref = phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : null;

  return (
    <div className="flex flex-col gap-5 border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
          Encontranos
        </span>
        {branchName && (
          <h2 className="text-base font-semibold text-white">{branchName}</h2>
        )}
      </div>

      <div className="flex flex-col gap-4 text-sm">
        {address && (
          <InfoRow icon={<MapPin className="size-4" />} label="Dirección">
            {address}
          </InfoRow>
        )}
        {phone && (
          <InfoRow icon={<Phone className="size-4" />} label="Teléfono">
            {telHref ? (
              <a
                href={telHref}
                className="hover:underline"
                style={{ color: primaryColor }}
              >
                {phone}
              </a>
            ) : (
              phone
            )}
          </InfoRow>
        )}
      </div>

      {/* Trust signals */}
      <div className="flex flex-col gap-3 border-t border-white/10 pt-5">
        <TrustBadge
          icon={<Clock className="size-3.5" />}
          text="Respuesta en menos de 24 hs hábiles"
        />
        <TrustBadge
          icon={<ShieldCheck className="size-3.5" />}
          text="Atención personalizada"
        />
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
          {label}
        </span>
        <span className="text-sm leading-snug text-white/90">{children}</span>
      </div>
    </div>
  );
}

function TrustBadge({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-white/60">
      <span aria-hidden className="text-white/40">
        {icon}
      </span>
      <span>{text}</span>
    </div>
  );
}
