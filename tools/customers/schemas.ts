import { z } from "zod";
import { jsonObjectSchema, paginatedInputSchema, querySchema, uuidSchema } from "@/tools/_shared/schemas";

export const customersOverviewInputSchema = paginatedInputSchema({ query: querySchema });
export const customerDetailInputSchema = z.object({ customerId: uuidSchema }).strict();
export const customersOverviewOutputSchema = z.object({
  customers: z.array(z.object({
    id: uuidSchema,
    name: z.string(),
    creditLimitLaari: z.number().int(),
    outstandingLaari: z.number().int(),
    availableCreditLaari: z.number().int(),
    atLimit: z.boolean(),
    updatedAt: z.string(),
  }).strict()),
  metrics: jsonObjectSchema,
  pagination: jsonObjectSchema,
}).strict();
export const customerDetailOutputSchema = jsonObjectSchema;
