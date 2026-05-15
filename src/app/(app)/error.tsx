"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <AlertTriangle className="size-10 text-destructive" />
        <h1 className="text-xl font-semibold">Algo no anduvo</h1>
        <p className="text-sm text-muted-foreground">
          Tuvimos un problema cargando esta pantalla. Probá refrescar; si sigue
          fallando, avisanos.
        </p>
        {error.digest && (
          <p className="text-[10px] text-muted-foreground">
            Ref: {error.digest}
          </p>
        )}
        <Button onClick={reset} className="mt-2">
          Reintentar
        </Button>
      </div>
    </div>
  );
}
