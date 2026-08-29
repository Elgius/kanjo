import { z } from "zod";
import { jsonObjectSchema, uuidSchema } from "@/tools/_shared/schemas";

export const registerSelectionSummaryInputSchema = z.object({ registerId: uuidSchema.optional() }).strict();
export const registerSelectionWorkspaceInputSchema = z.object({
  registerId: uuidSchema,
  receiptId: uuidSchema.optional(),
}).strict();
export const registerSelectionSummaryOutputSchema = z.object({
  registers: z.array(jsonObjectSchema),
  selected: jsonObjectSchema.nullable(),
  selectedShift: jsonObjectSchema.nullable(),
  recentSales: z.array(jsonObjectSchema),
  products: z.array(jsonObjectSchema),
  metrics: jsonObjectSchema,
}).strict();
export const registerSelectionWorkspaceOutputSchema = jsonObjectSchema.nullable();
