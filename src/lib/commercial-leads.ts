import { z } from "zod";

import type { Database } from "@/types/database";

export type CommercialLeadStatus =
  Database["public"]["Enums"]["commercial_lead_status"];

export const COMMERCIAL_LEAD_STATUSES: readonly CommercialLeadStatus[] = [
  "new",
  "contacted",
  "demo_scheduled",
  "demo_done",
  "won",
  "lost",
] as const;

export const COMMERCIAL_LEAD_STATUS_LABEL: Record<
  CommercialLeadStatus,
  string
> = {
  new: "Nuevo",
  contacted: "Contactado",
  demo_scheduled: "Demo agendada",
  demo_done: "Demo realizada",
  won: "Convertido",
  lost: "Perdido",
};

export const COMMERCIAL_LEAD_STATUS_CLS: Record<CommercialLeadStatus, string> =
  {
    new: "bg-blue-100 text-blue-700",
    contacted: "bg-amber-100 text-amber-800",
    demo_scheduled: "bg-purple-100 text-purple-700",
    demo_done: "bg-indigo-100 text-indigo-700",
    won: "bg-success/10 text-success",
    lost: "bg-muted text-muted-foreground",
  };

// ============================================================================
// Schema para submit público desde la landing.
// Validación liviana: trim + límites + email opcional para no romper UX
// si el visitante no completa email (aunque marquemos required en el form).
// ============================================================================

const trackingFieldSchema = z.string().max(500).optional().or(z.literal(""));

export const commercialLeadSubmissionSchema = z.object({
  first_name: z.string().min(1, "Nombre obligatorio").max(120),
  last_name: z.string().max(120).optional().or(z.literal("")),
  email: z.string().email("Email inválido").max(255),
  company_name: z.string().max(200).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  team_size: z.string().max(80).optional().or(z.literal("")),
  message: z.string().max(2000).optional().or(z.literal("")),
  // Tracking
  utm_source: trackingFieldSchema,
  utm_medium: trackingFieldSchema,
  utm_campaign: trackingFieldSchema,
  utm_term: trackingFieldSchema,
  utm_content: trackingFieldSchema,
  landing_url: trackingFieldSchema,
  referrer: trackingFieldSchema,
  // Honeypot
  website: z.string().optional().or(z.literal("")),
});

export type CommercialLeadSubmissionInput = z.input<
  typeof commercialLeadSubmissionSchema
>;
