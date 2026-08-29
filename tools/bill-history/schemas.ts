import { z } from "zod";
import { dateSchema, jsonObjectSchema, querySchema, timeSchema, uuidSchema } from "@/tools/_shared/schemas";

export const billFiltersShape = {
  query: querySchema,
  registerId: uuidSchema.optional(),
  paymentMethod: z.enum(["CASH", "CARD", "MOBILE"]).optional(),
  status: z.enum(["UNPAID", "PAID", "AMENDED", "REVERSED", "CANCELLED"]).optional(),
  dateFrom: dateSchema.optional(),
  timeFrom: timeSchema.optional(),
  dateTo: dateSchema.optional(),
  timeTo: timeSchema.optional(),
};
export const billCursorSchema = z.object({ openedAt: z.iso.datetime(), id: uuidSchema }).strict();
export const billHistorySearchInputSchema = z.object(billFiltersShape).strict();
export const billHistoryContinueInputSchema = z.object({ ...billFiltersShape, cursor: billCursorSchema }).strict();
export const billHistorySearchOutputSchema = z.object({
  filters: jsonObjectSchema,
  page: z.object({ bills: z.array(jsonObjectSchema), nextCursor: jsonObjectSchema.nullable() }).strict(),
  totalBills: z.number().int(),
  totalLaari: z.number().int(),
  registers: z.array(jsonObjectSchema),
}).strict();
export const billHistoryContinueOutputSchema = z.object({
  bills: z.array(jsonObjectSchema),
  nextCursor: jsonObjectSchema.nullable(),
}).strict();
