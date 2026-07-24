// Helpers de formato para el inbox.

export function msgTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("es", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// Hora si es hoy; día/mes si es otro día. Para el listado de conversaciones.
export function listTime(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (sameDay) {
      return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
    }
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    const isYest =
      d.getDate() === yest.getDate() &&
      d.getMonth() === yest.getMonth() &&
      d.getFullYear() === yest.getFullYear();
    if (isYest) return "Ayer";
    return d.toLocaleDateString("es", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}

// Etiqueta de fecha para separadores en el hilo ("Hoy", "Ayer", "24/07").
export function dayLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();
  if (sameDay(d, now)) return "Hoy";
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (sameDay(d, yest)) return "Ayer";
  return d.toLocaleDateString("es", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// Tiempo restante de la ventana de 24h → { text, urgent, expired }.
export function windowRemaining(expiresAt: string | null): {
  text: string;
  urgent: boolean;
  expired: boolean;
} {
  if (!expiresAt) return { text: "sin ventana", urgent: false, expired: true };
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { text: "cerrada", urgent: false, expired: true };
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const text = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return { text, urgent: totalMin <= 60, expired: false };
}
