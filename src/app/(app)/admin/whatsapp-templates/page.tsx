import { redirect } from "next/navigation";

// Las plantillas de WhatsApp se gestionan desde la pantalla unificada de Integraciones.
export default function WhatsappTemplatesPage() {
  redirect("/admin/integraciones?tab=templates");
}
