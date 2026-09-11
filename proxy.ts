import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizationFromHeaders } from "@/lib/auth-context";
import { navigationRedirect } from "@/lib/landing";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  // Overwrite any client-supplied value. This controls only the destination after a mutation.
  requestHeaders.set("x-kanjo-register-ui", pathname === "/live_register" || pathname.startsWith("/live_register/") ? "live" : "standard");
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  // Server actions enforce authentication and exact capabilities themselves; never redirect a POST before it runs.
  if (request.method !== "GET" && request.method !== "HEAD") return next();
  const authorization = await getAuthorizationFromHeaders(request.headers);
  if (!authorization) {
    if (pathname === "/login") return next();
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const destination = navigationRedirect(pathname, authorization);
  if (destination && destination !== pathname) {
    const url = request.nextUrl.clone();
    url.pathname = destination;
    return NextResponse.redirect(url);
  }
  return next();
}

export const config = {
  // Auth APIs, payment links, internal APIs and static assets retain their own access policies.
  matcher: ["/", "/login", "/live_register/:path*", "/registers/:path*", "/inventory/:path*", "/stock/:path*", "/customers/:path*", "/reporting/:path*", "/bill-history/:path*", "/settings/:path*", "/ai-coo/:path*", "/access-denied"],
};
