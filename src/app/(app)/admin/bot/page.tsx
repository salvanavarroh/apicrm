import { Bot } from "lucide-react";

import { requireRole } from "@/lib/auth";

import { listBotConfigs, listBotIntents } from "./actions";
import { BotConfigView } from "./bot-config-view";

export default async function BotPage() {
  await requireRole(["admin"]);
  const [configs, intents] = await Promise.all([
    listBotConfigs(),
    listBotIntents(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Bot className="size-6 text-accent" /> Respuesta automática
        </h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Qué contesta el inbox cuando no hay nadie disponible. Las respuestas las
          escribís vos: el bot elige cuál corresponde, nunca redacta ni improvisa
          un precio.
        </p>
      </header>

      <BotConfigView configs={configs} intents={intents} />
    </div>
  );
}
