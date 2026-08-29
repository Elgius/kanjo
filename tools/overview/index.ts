import "server-only";

import { getOverviewData } from "@/lib/pos/queries";
import { defineAiCooTool } from "@/tools/_shared/tool";
import { operatingBriefInputSchema, operatingBriefOutputSchema } from "./schemas";

export const overviewGetOperatingBrief = defineAiCooTool({
  name: "overview_get_operating_brief",
  description: "Return today's all-register operating brief, comparisons, sales mix, and register pulse.",
  inputSchema: operatingBriefInputSchema,
  outputSchema: operatingBriefOutputSchema,
  execute: () => getOverviewData(null),
});

export const overviewTools = [overviewGetOperatingBrief] as const;
