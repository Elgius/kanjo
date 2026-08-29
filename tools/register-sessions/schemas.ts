import { z } from "zod";
import { emptyInputSchema, jsonObjectSchema, paginatedInputSchema, uuidSchema } from "@/tools/_shared/schemas";

export const sessionRegistersInputSchema = emptyInputSchema;
export const sessionListInputSchema = paginatedInputSchema({ registerId: uuidSchema });
export const sessionDetailInputSchema = z.object({ registerId: uuidSchema, sessionId: uuidSchema }).strict();
export const sessionRegistersOutputSchema = z.object({ registers: z.array(jsonObjectSchema), metrics: jsonObjectSchema }).strict();
export const sessionListOutputSchema = z.object({
  register: jsonObjectSchema,
  sessions: z.array(jsonObjectSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalSessions: z.number().int(),
  pageCount: z.number().int(),
}).strict();
export const sessionDetailOutputSchema = jsonObjectSchema;
