"use client";

import { useEffect, useState } from "react";

import { ChannelPill } from "@/components/inbox/channel-pill";
import { Card } from "@/components/ui/card";
import {
  getInboxInsights,
  type InboxInsights as Insights,
} from "@/app/(app)/admin/inbox/actions";

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const tones = {
    default: "text-foreground",
    warning: "text-amber-600",
    danger: "text-red-600",
    success: "text-emerald-600",
  };
  return (
    <Card className="p-4">
      <div className={`text-3xl font-semibold ${tones[tone]}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

export function InboxInsights() {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInboxInsights()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Cargando insights…</p>;
  }
  if (!data) {
    return <p className="p-6 text-sm text-muted-foreground">Sin datos.</p>;
  }

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Conversaciones abiertas" value={data.total} />
        <Stat label="Sin asignar (pool)" value={data.pool} tone={data.pool ? "warning" : "success"} />
        <Stat label="Asignadas" value={data.assigned} />
        <Stat label="Sin responder" value={data.unanswered} tone={data.unanswered ? "danger" : "success"} />
        <Stat label="Ventana por vencer (menos de 1h)" value={data.windowClosing} tone={data.windowClosing ? "warning" : "default"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Por vendedor</h3>
          {data.byVendor.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna conversación asignada.</p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between border-b pb-1 text-xs text-muted-foreground">
                <span>Vendedor</span>
                <span className="flex gap-6">
                  <span>Asignadas</span>
                  <span>Sin responder</span>
                </span>
              </div>
              {data.byVendor.map((v) => (
                <div key={v.name} className="flex items-center justify-between py-1 text-sm">
                  <span className="truncate">{v.name}</span>
                  <span className="flex gap-6">
                    <span className="w-16 text-right tabular-nums">{v.assigned}</span>
                    <span
                      className={`w-20 text-right tabular-nums ${v.unanswered ? "font-medium text-red-600" : "text-muted-foreground"}`}
                    >
                      {v.unanswered}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Por canal</h3>
          {data.byPlatform.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin conversaciones.</p>
          ) : (
            <div className="space-y-2">
              {data.byPlatform.map((p) => (
                <div key={p.platform} className="flex items-center justify-between text-sm">
                  <ChannelPill platform={p.platform} size="sm" />
                  <span className="tabular-nums">{p.count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
