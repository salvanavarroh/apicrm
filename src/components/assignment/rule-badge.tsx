import { Inbox, Repeat, Scale, UserRound } from "lucide-react";

import {
  weightsToPercent,
  type RuleMember,
  type RuleMode,
  type VendorOption,
} from "@/lib/assignment-rules";
import { cn } from "@/lib/utils";

/**
 * El reparto de un origen, en una línea escaneable.
 *
 * Responde la única pregunta que trae el admin a esta pantalla —¿a quién le
 * llegan estos leads?— sin hacerlo abrir el diálogo. Antes decía "← de la
 * empresa", que es el MECANISMO y no la respuesta: había que acordarse de qué
 * tenía la empresa configurado para saber qué pasaba acá.
 *
 * Sin "use client": es JSX puro y lo usan la pantalla (server) y la lista de
 * Lead Ads (cliente).
 */
export function RuleBadge({
  mode,
  members,
  vendors,
  /** Qué hace la regla de la empresa, para resolver el heredado. */
  inheritedMode,
  inheritedMembers,
}: {
  mode: RuleMode | "inherit";
  members: RuleMember[];
  vendors: VendorOption[];
  inheritedMode: RuleMode;
  inheritedMembers: RuleMember[];
}) {
  const inherited = mode === "inherit";
  // Lo que se muestra es SIEMPRE lo que va a pasar. Si el origen hereda, se
  // resuelve la regla de la empresa y se dice eso, marcado como heredado.
  const effective = inherited ? inheritedMode : mode;
  const effectiveMembers = inherited ? inheritedMembers : members;

  const { Icon, text, tone } = describe(effective, effectiveMembers, vendors);

  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5 sm:items-end">
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
          inherited
            ? "bg-muted text-muted-foreground"
            : tone === "warning"
              ? "bg-warning/10 text-warning-text"
              : tone === "accent"
                ? "bg-accent/10 text-accent"
                : "bg-muted text-foreground",
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{text}</span>
      </span>
      {inherited && (
        <span className="text-[11px] text-muted-foreground">de la empresa</span>
      )}
    </div>
  );
}

function describe(
  mode: RuleMode,
  members: RuleMember[],
  vendors: VendorOption[],
): {
  Icon: typeof Scale;
  text: string;
  tone: "neutral" | "accent" | "warning";
} {
  if (mode === "balanced") {
    return { Icon: Scale, text: "Equilibrado", tone: "neutral" };
  }
  if (mode === "pool") {
    return { Icon: Inbox, text: "Sin asignar", tone: "warning" };
  }
  if (members.length === 0) {
    // Una regla de turnos que se quedó sin nadie reparte al pool. Decirlo es
    // más útil que mostrar "Por turno" y que el admin descubra el hueco solo.
    return { Icon: Inbox, text: "Sin vendedores", tone: "warning" };
  }

  const first = (id: string) =>
    vendors.find((v) => v.id === id)?.name.split(" ")[0] ?? "?";

  if (mode === "fixed") {
    return { Icon: UserRound, text: first(members[0].userId), tone: "accent" };
  }

  const equal = members.every((m) => m.weight === members[0].weight);
  if (equal) {
    return {
      Icon: Repeat,
      text:
        members.length <= 3
          ? members.map((m) => first(m.userId)).join(" · ")
          : `Por turno · ${members.length} vendedores`,
      tone: "accent",
    };
  }
  const pct = weightsToPercent(members);
  const shown = members
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
    .map((m) => `${first(m.userId)} ${pct.get(m.userId)}%`)
    .join(" · ");
  return {
    Icon: Repeat,
    text: members.length > 2 ? `${shown} +${members.length - 2}` : shown,
    tone: "accent",
  };
}
