import { redirect } from "next/navigation";

// Las conexiones se gestionan desde la pantalla unificada de Integraciones.
export default function AdminChannelsIndex() {
  redirect("/admin/integraciones?tab=connections");
}
