import { redirect } from "next/navigation";

// Las conexiones por plataforma ahora viven en la pantalla unificada de Integraciones.
export default async function ChannelPlatformPage() {
  redirect("/admin/integraciones?tab=connections");
}
