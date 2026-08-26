import { Skeleton } from "@/components/ui/skeleton";

// Skeletons de las vistas de leads. Se usan como fallback de <Suspense> al
// cambiar de pestaña y en los loading.tsx al entrar a la sección.

export function KanbanSkeleton() {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid auto-rows-min grid-flow-col gap-3 [grid-auto-columns:minmax(220px,1fr)]">
        {Array.from({ length: 6 }).map((_, col) => (
          <div
            key={col}
            className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3"
          >
            <div className="flex items-center justify-between px-1 py-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-6 rounded-md" />
            </div>
            {Array.from({ length: 3 - (col % 3) }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
              >
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-3 w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LeadsTableSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full max-w-sm" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="ml-auto h-4 w-24" />
      </div>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-40" />
        ))}
      </div>
      <div className="overflow-hidden rounded-md border">
        <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-24" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-0">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="ml-auto h-6 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LeadsListSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex items-center gap-4 border-b bg-muted px-4 py-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-24" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-0">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

// Elige el skeleton según la vista activa (para el <Suspense> de las pestañas).
export function LeadsSectionSkeleton({ view }: { view: string }) {
  if (view === "table" || view === "archived") return <LeadsTableSkeleton />;
  if (view === "unassigned") return <LeadsListSkeleton />;
  return <KanbanSkeleton />;
}

export function LeadDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-24" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
