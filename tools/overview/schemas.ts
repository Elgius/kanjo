import { z } from "zod";
import { emptyInputSchema, jsonObjectSchema } from "@/tools/_shared/schemas";

export const operatingBriefInputSchema = emptyInputSchema;
export const operatingBriefOutputSchema = z.object({
  metrics: jsonObjectSchema,
  hourly: z.array(jsonObjectSchema),
  topProducts: z.array(jsonObjectSchema),
  categoryMix: z.array(jsonObjectSchema),
  registerPulse: z.array(jsonObjectSchema),
}).strict();
