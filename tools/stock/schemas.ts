import { z } from "zod";
import { jsonObjectSchema, querySchema, uuidSchema } from "@/tools/_shared/schemas";

const movementTypeSchema = z.enum(["all", "INITIAL", "ADJUSTMENT", "SALE", "REFUND"]);
export const stockSnapshotInputSchema = z.object({
  registerId: uuidSchema.optional(),
  query: querySchema,
  movementType: movementTypeSchema.default("all"),
}).strict();
export const stockRiskInputSchema = z.object({
  registerId: uuidSchema.optional(),
  expiryWindowDays: z.number().int().min(1).max(365).default(30),
}).strict();
export const stockSnapshotOutputSchema = z.object({
  registers: z.array(jsonObjectSchema),
  products: z.array(jsonObjectSchema),
  movements: z.array(jsonObjectSchema),
  batches: z.array(jsonObjectSchema),
  movementCount: z.number().int(),
  metrics: jsonObjectSchema,
}).strict();
export const stockRiskOutputSchema = z.object({
  asOfDate: z.string(),
  expiryWindowDays: z.number().int(),
  risks: z.array(jsonObjectSchema),
  counts: jsonObjectSchema,
}).strict();
