import type { CapabilityKey } from "@/generated/prisma/enums";
import { CAPABILITY_BY_KEY, PAGE_DEFINITIONS } from "@/lib/permissions";

type LandingAccess = { user: { isSiteAdmin: boolean }; capabilities: ReadonlySet<CapabilityKey> };

export function isRegisterOnly(access: LandingAccess) {
  return !access.user.isSiteAdmin
    && access.capabilities.has("REGISTERS_VIEW")
    && [...access.capabilities].every((key) => CAPABILITY_BY_KEY[key].page === "REGISTERS");
}

export function resolveLandingPath(access: LandingAccess): string | null {
  if (access.user.isSiteAdmin) return "/";
  if (isRegisterOnly(access)) return "/live_register";
  for (const page of PAGE_DEFINITIONS) {
    if (page.key === "REGISTERS") {
      if (access.capabilities.has("REGISTERS_VIEW")) return "/registers";
      if (access.capabilities.has("REGISTER_SESSIONS_VIEW")) return "/registers/sessions";
      if (access.capabilities.has("REGISTER_ADMIN_VIEW")) return "/registers/edit";
      continue;
    }
    if ([...access.capabilities].some((key) => CAPABILITY_BY_KEY[key].page === page.key)) return page.href;
  }
  return null;
}

export function navigationRedirect(pathname: string, access: LandingAccess) {
  if (pathname === "/login") return resolveLandingPath(access) ?? "/access-denied";
  if (!isRegisterOnly(access)) return null;
  if (pathname === "/" || pathname === "/registers") return "/live_register";
  const legacyRegister = pathname.match(/^\/registers\/([0-9a-f-]{36})$/i);
  if (legacyRegister) return `/live_register/${legacyRegister[1]}`;
  if (!pathname.startsWith("/registers/") && !pathname.startsWith("/live_register") && pathname !== "/access-denied") return "/live_register";
  return null;
}

export function registerUiPath(registerId: string | undefined, live: boolean) {
  const base = live ? "/live_register" : "/registers";
  return registerId ? `${base}/${encodeURIComponent(registerId)}` : base;
}
