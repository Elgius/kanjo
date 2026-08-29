import { z } from "zod";
import { jsonObjectSchema } from "@/tools/_shared/schemas";

export const registerAdministrationInputSchema = z.object({
  status: z.enum(["ALL", "ACTIVE", "ARCHIVED"]).default("ALL"),
}).strict();
export const registerAdministrationOutputSchema = z.object({ registers: z.array(jsonObjectSchema) }).strict();
