import "server-only";

import { Resend } from "resend";

let cached: Resend | null = null;

function getResend(): Resend | null {
  if (cached) return cached;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  cached = new Resend(apiKey);
  return cached;
}

function getFrom(): string {
  const email = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const name = process.env.RESEND_FROM_NAME ?? "API CRM";
  return `${name} <${email}>`;
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const resend = getResend();
  if (!resend) {
    return {
      ok: false,
      message: "RESEND_API_KEY no configurado en el servidor",
    };
  }
  const { data, error } = await resend.emails.send({
    from: args.from ?? getFrom(),
    to: args.to,
    subject: args.subject,
    html: args.html,
    replyTo: args.replyTo,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, id: data?.id ?? "" };
}
