import { ctaButton, emailShell, escapeHtml, linkFallback } from "./shared";

export type PasswordResetTemplate = {
  firstName?: string;
  actionLink: string;
};

export const PASSWORD_RESET_SUBJECT = "Recuperá tu contraseña · API CRM";

export function passwordResetEmailHtml(t: PasswordResetTemplate): string {
  const greeting = t.firstName ? `, ${escapeHtml(t.firstName)}` : "";

  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#0f172a;letter-spacing:-0.01em;">
      Recuperá tu contraseña${greeting}
    </h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#334155;">
      Recibimos un pedido para resetear la contraseña de tu cuenta en API CRM.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#334155;">
      Hacé clic en el botón para elegir una nueva contraseña.
    </p>
    ${ctaButton({ href: t.actionLink, label: "Cambiar contraseña" })}
    ${linkFallback(t.actionLink)}
  `;

  return emailShell({
    preheader: "Cambiá tu contraseña en API CRM",
    bodyHtml: body,
    footerHtml:
      "Si no pediste este cambio, ignorá este email. El link expira en 1 hora.",
  });
}
