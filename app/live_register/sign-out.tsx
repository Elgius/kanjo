"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function RegisterSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return <div><button disabled={busy} className="ml-3 rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-50" onClick={async () => {
    setBusy(true); setError(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed");
      router.replace("/login");
      router.refresh();
    } catch { setError(true); setBusy(false); }
  }}>{busy ? "Signing out…" : "Sign out"}</button>{error && <p role="alert" className="text-xs text-destructive">Could not sign out. Try again.</p>}</div>;
}
