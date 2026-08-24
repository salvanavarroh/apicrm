import { Card } from "@/components/ui/card";

/**
 * Pantalla de carga del informe ejecutivo.
 *
 * Sin esto, la navegación no muestra NADA hasta que el server termina: el
 * usuario clickea "Informe ejecutivo" y parece que el menú no funciona. Es
 * literalmente cómo se reportó el bug.
 */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-64 rounded bg-muted" />
        <div className="h-4 w-96 rounded bg-muted" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-24 bg-muted/40" />
        ))}
      </div>
      <Card className="h-64 bg-muted/40" />
      <Card className="h-80 bg-muted/40" />
    </div>
  );
}
