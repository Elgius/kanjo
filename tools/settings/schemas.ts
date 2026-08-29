import { z } from "zod";
import { dateSchema, emptyInputSchema, jsonObjectSchema, querySchema, uuidSchema } from "@/tools/_shared/schemas";

export const settingsListInputSchema = emptyInputSchema;
export const settingsAccountsOutputSchema = z.object({ accounts: z.array(jsonObjectSchema) }).strict();
export const settingsRolesOutputSchema = z.object({ roles: z.array(jsonObjectSchema) }).strict();
export const auditSearchInputSchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  actor: uuidSchema.optional(),
  outcome: z.enum(["SUCCESS", "FAILURE", "DENIED"]).optional(),
  event: z.string().trim().max(100).optional(),
  area: z.enum(["AI_COO", "OVERVIEW", "REGISTERS", "INVENTORY", "STOCK", "REPORTING", "BILL_HISTORY", "CUSTOMERS", "SETTINGS", "AUDIT_LOG"]).optional(),
  targetType: z.string().trim().max(100).optional(),
  query: querySchema,
  after: z.string().max(500).optional(),
  before: z.string().max(500).optional(),
}).strict().refine(({ after, before }) => !(after && before), {
  message: "Use either after or before, not both.",
  path: ["after"],
});
export const auditSearchOutputSchema = z.object({
  rows: z.array(jsonObjectSchema),
  previousCursor: z.string().nullable(),
  nextCursor: z.string().nullable(),
}).strict();
