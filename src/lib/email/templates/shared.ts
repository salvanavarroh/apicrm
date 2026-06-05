export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Wrapper común para todos los emails transaccionales. Mantiene look & feel
// consistente: card blanca centrada, accent color del CRM, footer minimal.
export function emailShell(args: {
  preheader?: string;
  bodyHtml: string;
  footerHtml?: string;
}): string {
  const accent = "#FF5906";
  const preheader = args.preheader ? escapeHtml(args.preheader) : "";
  const footer =
    args.footerHtml ??
    `Este mensaje fue enviado desde API CRM. Si no lo esperabas, podés ignorarlo.`;

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <title>API CRM</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 8px;border-bottom:1px solid #f1f5f9;">
                <div style="display:inline-flex;align-items:center;gap:10px;">
                  <span style="display:inline-block;width:28px;height:28px;border-radius:8px;background:${accent};color:#ffffff;font-weight:700;font-size:14px;line-height:28px;text-align:center;">A</span>
                  <span style="font-size:14px;font-weight:600;color:#0f172a;letter-spacing:-0.01em;">API CRM</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px;">
                ${args.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #f1f5f9;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
                  ${footer}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function ctaButton(args: { href: string; label: string }): string {
  const accent = "#FF5906";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
    <tr>
      <td style="border-radius:10px;background:${accent};">
        <a href="${args.href}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
          ${escapeHtml(args.label)}
        </a>
      </td>
    </tr>
  </table>`;
}

export function linkFallback(href: string): string {
  return `<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">
    Si el botón no funciona, copiá y pegá este link en tu navegador:<br/>
    <a href="${href}" style="color:#64748b;word-break:break-all;">${href}</a>
  </p>`;
}
