import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="text-5xl font-bold text-accent">404</span>
        <h1 className="text-2xl font-semibold">Página no encontrada</h1>
        <p className="text-sm text-muted-foreground">
          La página que buscás no existe o ya no está disponible.
        </p>
        <Button asChild className="mt-2">
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    </div>
  );
}
