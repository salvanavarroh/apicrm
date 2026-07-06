"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { setLeadsArchived } from "@/app/(app)/admin/leads/actions";
import { Button } from "@/components/ui/button";

// Archiva / desarchiva un lead desde su detalle. Un lead archivado sale de las
// vistas normales (kanban, tabla, conteos) pero conserva su historial.
export function ArchiveLeadButton({
  leadId,
  archived,
}: {
  leadId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = await setLeadsArchived([leadId], !archived);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(archived ? "Lead desarchivado" : "Lead archivado");
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={pending}>
      {archived ? (
        <>
          <ArchiveRestore className="mr-2 size-4" /> Desarchivar
        </>
      ) : (
        <>
          <Archive className="mr-2 size-4" /> Archivar
        </>
      )}
    </Button>
  );
}
