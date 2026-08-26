// Skeleton del dashboard de Ads: Next lo muestra al instante al entrar (mientras
// el server trae las métricas de Zernio), así la navegación se siente inmediata.
function Box({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} />;
}

export default function AdsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="h-7 w-56 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded bg-muted/70" />
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Box className="h-9 w-72" />
        <Box className="h-4 w-32" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Box className="h-9 w-52" />
        <Box className="h-9 w-64" />
        <Box className="ml-auto h-9 w-52" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Box key={i} className="h-24" />
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Box className="h-64" />
        <Box className="h-64" />
      </div>

      {/* Tabla */}
      <Box className="h-96" />
    </div>
  );
}
