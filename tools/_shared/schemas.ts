import { z } from "zod";

export const emptyInputSchema = z.object({}).strict();
export const uuidSchema = z.uuid();
export const querySchema = z.string().trim().max(100).optional();
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

export function paginatedInputSchema<T extends z.ZodRawShape>(shape: T) {
  return z.object({
    ...shape,
    page: z.number().int().min(1).max(10_000).default(1),
    pageSize: z.number().int().min(1).max(50).default(25),
  }).strict();
}
