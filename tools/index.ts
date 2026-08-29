import "server-only";

import type { AiCooTool } from "@/tools/_shared/tool";
import { billHistoryTools } from "@/tools/bill-history";
import { customerTools } from "@/tools/customers";
import { inventoryTools } from "@/tools/inventory";
import { overviewTools } from "@/tools/overview";
import { registerAdministrationTools } from "@/tools/register-administration";
import { registerSelectionTools } from "@/tools/register-selection";
import { registerSessionTools } from "@/tools/register-sessions";
import { settingsTools } from "@/tools/settings";
import { stockTools } from "@/tools/stock";

export const aiCooTools = [
  ...overviewTools,
  ...registerSelectionTools,
  ...registerSessionTools,
  ...registerAdministrationTools,
  ...inventoryTools,
  ...stockTools,
  ...billHistoryTools,
  ...customerTools,
  ...settingsTools,
] as const satisfies readonly AiCooTool[];

export const aiCooToolRegistry = Object.fromEntries(aiCooTools.map((tool) => [tool.name, tool])) as Record<
  (typeof aiCooTools)[number]["name"],
  (typeof aiCooTools)[number]
>;

if (Object.keys(aiCooToolRegistry).length !== aiCooTools.length) {
  throw new Error("AI COO tool names must be unique.");
}
