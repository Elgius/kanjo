import { after } from "next/server";

import { auth } from "@/lib/auth";
import {
  auditRequestContextFromHeaders,
  safeWriteAudit,
  type AuditInput,
} from "@/lib/audit";

function deferAudit(input: AuditInput) {
  after(() => safeWriteAudit(input));
}

async function readIdentifier(request: Request) {
  try {
    const body = (await request.clone().json()) as Record<string, unknown>;
    const identifier = body.username ?? body.email;
    return typeof identifier === "string" ? identifier.slice(0, 320) : undefined;
  } catch {
    return undefined;
  }
}

async function authHandler(request: Request) {
  const pathname = new URL(request.url).pathname;
  const isUsernameSignIn = pathname.endsWith("/sign-in/username");
  const isEmailSignIn = pathname.endsWith("/sign-in/email");
  const isSignIn = isUsernameSignIn || isEmailSignIn;
  const isSignOut = pathname.endsWith("/sign-out");
  const identifier = isSignIn ? await readIdentifier(request) : undefined;
  const sessionBefore = isSignOut
    ? await auth.api.getSession({ headers: request.headers }).catch(() => null)
    : null;

  const response = await auth.handler(request);

  if (isSignIn) {
    let responseUser: { id?: string; username?: string; email?: string } | undefined;
    if (response.ok) {
      try {
        const body = (await response.clone().json()) as {
          user?: { id?: string; username?: string; email?: string };
        };
        responseUser = body.user;
      } catch {
        responseUser = undefined;
      }
    }
    deferAudit({
      outcome: response.ok ? "SUCCESS" : "FAILURE",
      event: "AUTH_SIGN_IN",
      actorId: response.ok ? responseUser?.id : undefined,
      actorLabel: responseUser?.username ?? responseUser?.email ?? identifier ?? "unknown",
      summary: response.ok ? "Account signed in." : "Sign-in attempt failed.",
      metadata: { method: isUsernameSignIn ? "username" : "email", status: response.status },
      request: auditRequestContextFromHeaders(request.headers),
    });
  } else if (isSignOut) {
    deferAudit({
      outcome: response.ok ? "SUCCESS" : "FAILURE",
      event: "AUTH_SIGN_OUT",
      actorId: sessionBefore?.user.id,
      actorLabel:
        (sessionBefore?.user as { username?: string } | undefined)?.username ??
        sessionBefore?.user.email ??
        "unknown",
      summary: response.ok ? "Account signed out." : "Sign-out attempt failed.",
      metadata: { status: response.status },
      request: auditRequestContextFromHeaders(request.headers),
    });
  }

  return response;
}

export { authHandler as GET, authHandler as POST };
