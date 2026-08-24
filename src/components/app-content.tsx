"use client";

import { usePathname } from "next/navigation";

// Decide el contenedor según la ruta ACTUAL (en cliente, para que se actualice
// al navegar — el layout server persiste entre navegaciones). El inbox usa todo
// el ancho/alto; el resto va centrado en max-w-7xl.
export function AppContent({
  banner,
  children,
}: {
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const fullBleed = pathname.includes("/inbox");

  if (fullBleed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {banner && <div className="px-4 pt-4">{banner}</div>}
        {children}
      </div>
    );
  }
  return (
    // px-8 en un teléfono son 64px de los 390 disponibles. Escala: 16 → 24 → 32.
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      {banner && <div className="mb-4 sm:mb-6">{banner}</div>}
      {children}
    </div>
  );
}
