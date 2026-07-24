import { redirect } from "next/navigation";

// Las conexiones ahora son por plataforma (/admin/channels/whatsapp, etc.).
export default function AdminChannelsIndex() {
  redirect("/admin/channels/whatsapp");
}
