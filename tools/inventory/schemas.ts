import { z } from "zod";
import { jsonObjectSchema, querySchema, uuidSchema } from "@/tools/_shared/schemas";

export const inventorySearchInputSchema = z.object({
  query: querySchema,
  category: z.string().trim().max(100).optional(),
  registerId: uuidSchema.optional(),
  status: z.enum(["all", "low", "out", "in"]).default("all"),
  sort: z.enum(["recent", "name", "stock"]).default("recent"),
  page: z.number().int().min(1).max(10_000).default(1),
}).strict();
export const inventorySearchOutputSchema = z.object({
  products: z.array(jsonObjectSchema),
  registers: z.array(jsonObjectSchema),
  categories: z.array(jsonObjectSchema),
  page: z.number().int(),
  pageCount: z.number().int(),
  total: z.number().int(),
  metrics: jsonObjectSchema,
}).strict();
