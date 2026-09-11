"use client";

import { useCallback, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

function PendingFields({ children, unlock }: { children: ReactNode; unlock: () => void }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (pending) wasPending.current = true;
    else if (wasPending.current) { wasPending.current = false; unlock(); }
  }, [pending, unlock]);
  return <fieldset disabled={pending} aria-busy={pending} className="contents disabled:opacity-60">{children}</fieldset>;
}

export function MutationForm({ children, onSubmit, ...props }: ComponentProps<"form">) {
  const locked = useRef(false);
  const requestInput = useRef<HTMLInputElement>(null);
  const unlock = useCallback(() => { locked.current = false; if (requestInput.current) requestInput.current.value = ""; }, []);
  return <form {...props} onSubmit={(event) => {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    if (locked.current) { event.preventDefault(); return; }
    if (requestInput.current && !requestInput.current.value) requestInput.current.value = crypto.randomUUID();
    locked.current = true;
  }}>
    <input ref={requestInput} type="hidden" name="requestId" defaultValue="" />
    <PendingFields unlock={unlock}>{children}</PendingFields>
  </form>;
}
