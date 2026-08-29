import "server-only";

import { getRegisterAdministrationData } from "@/lib/pos/register-administration";
import { defineAiCooTool } from "@/tools/_shared/tool";
import { registerAdministrationInputSchema, registerAdministrationOutputSchema } from "./schemas";

export const registerAdministrationList = defineAiCooTool({
  name: "register_administration_list",
  description: "List active or archived registers with type, open-shift state, usage counts, and lifecycle constraints.",
  inputSchema: registerAdministrationInputSchema,
  outputSchema: registerAdministrationOutputSchema,
  execute: async ({ status }) => ({ registers: await getRegisterAdministrationData(status, null) }),
});

export const registerAdministrationTools = [registerAdministrationList] as const;
