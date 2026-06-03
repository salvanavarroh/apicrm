import Image from "next/image";

import { PublicForm, type PublicFormProps } from "./public-form";

type Props = PublicFormProps & {
  logoUrl: string | null;
  bannerUrl: string | null;
  companyName: string | null;
};

/**
 * Wrapper de la landing pública (/f/[slug]).
 * Si hay banner se muestra arriba. Si hay logo, en el header sobre un frame.
 * El form se renderiza dentro de una columna centrada.
 */
export function PublicLanding({
  logoUrl,
  bannerUrl,
  companyName,
  ...formProps
}: Props) {
  return (
    <div
      className="min-h-screen text-white"
      style={{
        background:
          "radial-gradient(ellipse at top, #1a1f2b 0%, #0a0c10 60%)",
      }}
    >
      {bannerUrl ? (
        <div className="relative h-48 w-full overflow-hidden sm:h-60">
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
            className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0a0c10]"
          />
        </div>
      ) : (
        <div className="h-12 sm:h-16" />
      )}

      <div className="mx-auto flex w-full max-w-xl flex-col gap-7 px-6 pb-12">
        <header className="flex flex-col items-center gap-3 text-center">
          {logoUrl ? (
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg shadow-black/30 sm:h-24 sm:w-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt={companyName ? `Logo de ${companyName}` : "Logo"}
                className="max-h-full max-w-full object-contain p-2"
              />
            </div>
          ) : (
            companyName && (
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                {companyName}
              </h1>
            )
          )}
          {logoUrl && companyName && (
            <p className="text-sm font-medium text-white/70">{companyName}</p>
          )}
        </header>

        <PublicForm {...formProps} />

        <p className="text-center text-[11px] text-white/40">
          Tus datos se usan solo para que un representante te contacte. No los
          compartimos con terceros.
        </p>
      </div>
    </div>
  );
}
