import { ctaButton, emailShell, escapeHtml, linkFallback } from "./shared";

export type InvitationRole =
  | "admin"
  | "manager"
  | "sales"
  | "data_provider"
  | "super_admin";

const ROLE_LABEL: Record<InvitationRole, string> = {
  super_admin: "super administrador",
  admin: "administrador",
  manager: "gerente",
  sales: "vendedor",
  data_provider: "proveedor de datos",
};

export type InvitationTemplate = {
  firstName: string;
  companyName: string;
  role: InvitationRole;
  actionLink: string;
};

export function invitationSubject(args: { companyName: string }): string {
  return `Te invitaron a ${args.companyName} en API CRM`;
}

export function invitationEmailHtml(t: InvitationTemplate): string {
  const roleLabel = ROLE_LABEL[t.role] ?? t.role;
  const greeting = t.firstName ? `, ${escapeHtml(t.firstName)}` : "";
  const company = escapeHtml(t.companyName);

  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#0f172a;letter-spacing:-0.01em;">
      ¡Hola${greeting}!
    </h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#334155;">
      Te invitaron a <strong>${company}</strong> en API CRM como <strong>${roleLabel}</strong>.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#334155;">
      Hacé clic en el botón para activar tu cuenta, elegir una contraseña y aceptar los Términos.
    </p>
    ${ctaButton({ href: t.actionLink, label: "Activar mi cuenta" })}
    ${linkFallback(t.actionLink)}
  `;

  return emailShell({
    preheader: `Activá tu cuenta en ${t.companyName}`,
    bodyHtml: body,
    footerHtml:
      "Si no esperabas esta invitación, podés ignorar este mensaje. El link expira en 24 horas.",
  });
}
