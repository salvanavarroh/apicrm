import { CheckCircle2, Clock, Inbox, XCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import { DecisionButtons } from "./decision-buttons";

type Row = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected" | "canceled";
  created_at: string;
  decision_note: string | null;
  company: { id: string; name: string } | null;
  requester: { first_name: string; last_name: string } | null;
};

export default async function BranchRequestsPage() {
  await requireRole(["super_admin"]);

  const supabase = await createClient();
  const { data } = await supabase
    .from("branch_requests")
    .select(
      "id, name, address, city, phone, notes, status, created_at, decision_note, company:companies!branch_requests_company_id_fkey(id, name), requester:profiles!branch_requests_requested_by_fkey(first_name, last_name)",
    )
    .order("created_at", { ascending: false });

  const requests = (data ?? []) as unknown as Row[];
  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Solicitudes de sucursal
        </h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Cada vez que un Admin solicita una nueva sucursal, llega acá para que
          la apruebes o rechaces.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Pendientes ({pending.length})</h2>
        {pending.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <Inbox className="size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No hay solicitudes pendientes.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Concesionaria</th>
                  <th className="px-4 py-3 font-medium">Sucursal</th>
                  <th className="px-4 py-3 font-medium">Dirección</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Solicitado por</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => {
                  const fullAddress = [r.address, r.city]
                    .filter(Boolean)
                    .join(", ");
                  const requester = r.requester
                    ? `${r.requester.first_name} ${r.requester.last_name}`.trim() ||
                      "—"
                    : "—";
                  return (
                    <tr key={r.id} className="border-t border-border bg-card hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium">
                        {r.company?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">{r.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {fullAddress || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.phone ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {requester}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "short",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <DecisionButtons requestId={r.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {resolved.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold">Historial</h2>
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Concesionaria</th>
                  <th className="px-4 py-3 font-medium">Sucursal</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Motivo</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map((r) => (
                  <tr key={r.id} className="border-t border-border bg-card hover:bg-muted/40">
                    <td className="px-4 py-3">{r.company?.name ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                      {r.decision_note ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("es-AR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "pending" | "approved" | "rejected" | "canceled";
}) {
  const map = {
    pending: {
      label: "Pendiente",
      cls: "bg-warning/10 text-warning-foreground",
      icon: Clock,
    },
    approved: {
      label: "Aprobada",
      cls: "bg-success/10 text-success",
      icon: CheckCircle2,
    },
    rejected: {
      label: "Rechazada",
      cls: "bg-destructive/10 text-destructive",
      icon: XCircle,
    },
    canceled: {
      label: "Cancelada",
      cls: "bg-muted text-muted-foreground",
      icon: XCircle,
    },
  } as const;
  const s = map[status];
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}
    >
      <Icon className="size-3" /> {s.label}
    </span>
  );
}
