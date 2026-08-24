import { redirect } from "next/navigation";

import { GroupReportView } from "@/components/groups/group-report-view";
import { requireProfile } from "@/lib/auth";
import { loadGroupReport } from "@/lib/group-report";

const PRESETS = [
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function rangeFor(days: number): { from: string; to: string } {
  return {
    from: ymd(new Date(Date.now() - days * 86_400_000)),
    to: ymd(new Date()),
  };
}

export default async function GroupPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const profile = await requireProfile();
  // Sólo el admin de grupo tiene grupo. Cualquier otro rol no tiene nada que ver
  // acá y se va a su propia home.
  if (profile.role !== "group_admin" || !profile.group_id) redirect("/");

  const { dias } = await searchParams;
  const days = PRESETS.some((p) => String(p.days) === dias) ? Number(dias) : 30;
  const range = rangeFor(days);

  const report = await loadGroupReport(profile.group_id, range);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Grupo</h1>
          <p className="text-sm text-muted-foreground">
            Todas tus marcas juntas: quién trae leads, quién vende y a qué costo.
          </p>
        </div>
        <div className="inline-flex max-w-full shrink-0 overflow-x-auto rounded-lg border p-0.5">
          {PRESETS.map((p) => (
            <a
              key={p.days}
              href={`/group?dias=${p.days}`}
              className={
                p.days === days
                  ? "rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground"
                  : "rounded-md px-3 py-1 text-sm hover:bg-muted"
              }
            >
              {p.label}
            </a>
          ))}
        </div>
      </header>

      <GroupReportView report={report} />
    </div>
  );
}
