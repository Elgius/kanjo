import { requireAuthorization } from "@/lib/authorization";

export async function requireUser() {
  return (await requireAuthorization()).user;
}
