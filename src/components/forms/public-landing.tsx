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
 * Fondo blanco. Hero con banner que se funde al blanco vía gradient,
 * después grid 2-col con form (ancho) e info card (sucursal: dirección,
 * teléfono, badges). Mobile colapsa a una columna.
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
    <div className="min-h-screen bg-white text-slate-900">
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
            {/* Gradient overlay: oscurece levemente arriba para contraste y
                se funde a blanco abajo para mezclar con el fondo del body. */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-b from-black/10 via-white/0 to-white"
            />
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-white"
            />
          </div>
        ) : (
          <div className="h-12 sm:h-16" />
        )}

        {/* Logo + nombre superpuesto al fondo del banner */}
        <div className="relative -mt-12 flex flex-col items-center gap-3 px-6 text-center sm:-mt-14">
          {logoUrl ? (
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-300/40 sm:h-24 sm:w-24">
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
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                {companyName}
              </h1>
              {branchName && (
                <p className="text-sm text-slate-500">{branchName}</p>
              )}
            </div>
          )}
        </div>
      </header>

      {/* CONTENT GRID */}
      <main className="mx-auto w-full max-w-5xl px-6 pt-10 pb-14">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
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

        <p className="mt-10 text-center text-[11px] leading-relaxed text-slate-500">
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
    <div className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-md shadow-slate-200/60">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Encontranos
        </span>
        {branchName && (
          <h2 className="text-base font-semibold text-slate-900">
            {branchName}
          </h2>
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
      <div className="flex flex-col gap-3 border-t border-slate-200 pt-5">
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
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </span>
        <span className="text-sm leading-snug text-slate-700">{children}</span>
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
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <span aria-hidden className="text-slate-400">
        {icon}
      </span>
      <span>{text}</span>
    </div>
  );
}
