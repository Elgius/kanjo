import Link from "next/link";

import { PageContainer, Surface } from "@/components/pos/primitives";
import { firstAccessiblePath, requireAuthorization } from "@/lib/authorization";

export default async function AccessDeniedPage() {
  const authorization = await requireAuthorization();
  const home = firstAccessiblePath(authorization);
  return (
    <PageContainer className="min-h-[70svh] items-center justify-center">
      <Surface className="w-full max-w-lg p-8 text-center"><p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground">ACCESS DENIED</p><h1 className="mt-3 font-serif text-3xl font-semibold">This page is not assigned to your role.</h1><p className="mt-3 text-sm text-muted-foreground">Your role is {authorization.user.roleName}. Ask a site administrator if you need additional access.</p>{home ? <Link prefetch={false} href={home} className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Go to an available page</Link> : <p className="mt-6 text-xs text-muted-foreground">No pages are currently assigned to this account.</p>}</Surface>
    </PageContainer>
  );
}
