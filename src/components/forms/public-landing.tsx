import Image from "next/image";

import { PublicForm, type PublicFormProps } from "./public-form";

type Props = PublicFormProps & {
  logoUrl: string | null;
  bannerUrl: string | null;
  companyName: string | null;
};

/**
 * Wrapper de la landing pública (/f/[slug]).
 * Si hay banner se muestra arriba. Si hay logo, en el header.
 * El form se renderiza dentro de una columna centrada.
 */
export function PublicLanding({
  logoUrl,
  bannerUrl,
  companyName,
  ...formProps
}: Props) {
  return (
    <div className="min-h-screen bg-[#0a0c10] text-white">
      {bannerUrl && (
        <div className="relative h-48 w-full overflow-hidden sm:h-64">
          <Image
            src={bannerUrl}
            alt={companyName ? `Banner de ${companyName}` : "Banner"}
            fill
            className="object-cover"
            sizes="100vw"
          />
        </div>
      )}

      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-10">
        {logoUrl && (
          <div className="flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={companyName ? `Logo de ${companyName}` : "Logo"}
              className="h-16 w-auto object-contain"
            />
          </div>
        )}

        <PublicForm {...formProps} />

        <p className="text-center text-[11px] text-white/40">
          Tus datos se usan solo para que un representante te contacte. No los
          compartimos con terceros.
        </p>
      </div>
    </div>
  );
}
