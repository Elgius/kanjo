import { createHash } from "node:crypto";
import { serialize, deserialize } from "node:v8";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export class MutationError extends Error {}

export function requestKey(form: FormData): string {
  const key = form.get("requestId");
  if (typeof key !== "string" || !/^[\w-]{16,100}$/.test(key)) {
    throw new MutationError("Reload this form before submitting it.");
  }
  return key;
}

// The result and the business changes commit together. Serialization conflicts retry
// the whole transaction; a retry then reads the already committed result.
export async function mutateOnce<T>(db: PrismaClient, scope: string, key: string | undefined,
  input: unknown, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        if (key) {
          const previous = await tx.mutationRequest.findUnique({ where: { scope_key: { scope, key } } });
          if (previous) {
            if (previous.fingerprint !== fingerprint) throw new MutationError("This request was already used for different details. Reload the form.");
            return deserialize(Buffer.from(previous.result, "base64")) as T;
          }
        }
        const result = await work(tx);
        if (key) await tx.mutationRequest.create({ data: {
          scope, key, fingerprint, result: serialize(result).toString("base64"),
        } });
        return result;
      }, { isolationLevel: "Serializable", timeout: 20000 });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt >= 3 || (code !== "P2034" && !(key && code === "P2002"))) throw error;
    }
  }
}
