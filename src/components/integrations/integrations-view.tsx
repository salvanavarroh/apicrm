"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConnectionsGrid, type Channel } from "@/components/integrations/connections-grid";
import {
  LeadAdsManager,
  type LeadAdFormRow,
} from "@/components/messaging/lead-ads-manager";
import {
  TemplatesManager,
  type StandardTemplateView,
  type WaChannel,
  type WaTemplate,
} from "@/components/messaging/templates-manager";

type Opt = { id: string; name: string };

export function IntegrationsView({
  initialTab,
  channels,
  waChannels,
  templates,
  standardSet,
  forms,
  branches,
  productTypes,
  campaigns,
}: {
  initialTab: string;
  channels: Channel[];
  waChannels: WaChannel[];
  templates: WaTemplate[];
  standardSet: StandardTemplateView[];
  forms: LeadAdFormRow[];
  branches: Opt[];
  productTypes: Opt[];
  campaigns: Opt[];
}) {
  return (
    <Tabs defaultValue={initialTab} className="gap-6">
      <TabsList>
        <TabsTrigger value="connections">Conexiones</TabsTrigger>
        <TabsTrigger value="templates">Plantillas WhatsApp</TabsTrigger>
        <TabsTrigger value="leadads">Lead Ads</TabsTrigger>
      </TabsList>

      <TabsContent value="connections">
        <ConnectionsGrid channels={channels} />
      </TabsContent>

      <TabsContent value="templates">
        <TemplatesManager
          channels={waChannels}
          templates={templates}
          standardSet={standardSet}
        />
      </TabsContent>

      <TabsContent value="leadads">
        <LeadAdsManager
          forms={forms}
          branches={branches}
          productTypes={productTypes}
          campaigns={campaigns}
        />
      </TabsContent>
    </Tabs>
  );
}
