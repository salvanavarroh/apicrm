import { stopImpersonation } from "@/app/(app)/super-admin/impersonation-actions";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Gerente",
  sales: "Vendedor",
  data_provider: "Proveedor",
};

export function ImpersonationBanner({
  name,
  role,
}: {
  name: string;
  role: string;
}) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
      <span>
        Estás viendo como <strong>{name}</strong> ({ROLE_LABEL[role] ?? role})
      </span>
      <form action={stopImpersonation}>
        <button
          type="submit"
          className="rounded-md bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-900"
        >
          Salir
        </button>
      </form>
    </div>
  );
}
