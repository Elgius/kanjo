import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { registerUiPath } from "@/lib/landing";

export async function getRegisterRedirect() {
  const live = (await headers()).get("x-kanjo-register-ui") === "live";
  return function redirectResult(registerId: string | undefined, kind: "success" | "error", message: string, extra?: Record<string, string>): never {
    const params = new URLSearchParams({ [kind]: message, ...extra });
    redirect(`${registerUiPath(registerId, live)}?${params.toString()}`);
  };
}
