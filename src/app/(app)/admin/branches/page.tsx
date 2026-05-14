import { redirect } from "next/navigation";

// Sucursales ahora viven dentro de Mi Empresa (PRD §6.6 + pedido del cliente).
export default function BranchesRedirect() {
  redirect("/admin/company");
}
