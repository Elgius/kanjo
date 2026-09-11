"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { CapabilityKey, RegisterScopeMode } from "@/generated/prisma/enums";
import { accessSummary, validateAccountScope, WORKSPACES } from "@/lib/access-settings";
import { cn } from "@/lib/utils";

type RegisterOption = { id: string; name: string; code: string; active: boolean };
type RoleOption = { id: string; name: string; workspace: string; capabilities: CapabilityKey[] };
const fieldClass = "h-10 w-full rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

export function SettingsSubmit({ children, disabled = false }: { children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} className="h-10 w-fit rounded-lg bg-primary px-5 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving…" : children}</button>;
}

export function AccountAccessEditor({ roles, registers, initialRoleId = "", initialScopeMode = "SELECTED", initialRegisterIds = [], isSiteAdmin = false, submitLabel = "Save access" }: {
  roles: RoleOption[]; registers: RegisterOption[]; initialRoleId?: string; initialScopeMode?: RegisterScopeMode;
  initialRegisterIds?: string[]; isSiteAdmin?: boolean; submitLabel?: string;
}) {
  const [roleId, setRoleId] = useState(initialRoleId);
  const [scope, setScope] = useState(initialScopeMode);
  const [registerIds, setRegisterIds] = useState(() => new Set(initialRegisterIds));
  const role = roles.find(({ id }) => id === roleId);
  const scopeError = role ? validateAccountScope(role.capabilities, scope, isSiteAdmin) : null;
  const assigned = registers.filter(({ id }) => registerIds.has(id));
  const activeAssigned = assigned.filter(({ active }) => active);

  return (
    <div className="grid gap-5">
      <label className="grid gap-2 text-xs font-semibold">1. Job role
        <select name="roleId" required value={roleId} onChange={(event) => setRoleId(event.target.value)} className={fieldClass}>
          <option value="" disabled>Select a role</option>
          {roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {role && <p className="-mt-3 text-[11px] text-muted-foreground">{WORKSPACES.find(({ key }) => key === role.workspace)?.label ?? "Custom"} · {role.capabilities.length} actions</p>}
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-xs font-semibold">2. Assigned registers</legend>
        <p className="text-[11px] leading-5 text-muted-foreground">Assignments belong to this account. Changing the role keeps these assignments.</p>
        <div className="flex flex-wrap gap-2">{(["SELECTED", "ALL"] as const).map((mode) => <label key={mode} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-xs", scope === mode ? "border-primary bg-accent" : "border-border")}><input name="registerScopeMode" type="radio" value={mode} checked={scope === mode} onChange={() => setScope(mode)} className="accent-primary" />{mode === "ALL" ? "All registers" : "Selected registers"}</label>)}</div>
        {scope === "SELECTED" ? <div className="grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2">
          {registers.map((register) => <label key={register.id} className={cn("flex items-start gap-2 rounded-lg border border-border p-3 text-xs", !register.active && "text-muted-foreground")}>
            <input type="checkbox" name="registerIds" value={register.id} checked={registerIds.has(register.id)} disabled={!register.active && !initialRegisterIds.includes(register.id)} onChange={() => setRegisterIds((current) => { const next = new Set(current); if (next.has(register.id)) next.delete(register.id); else next.add(register.id); return next; })} className="mt-0.5 accent-primary" />
            <span className="min-w-0 break-words">{register.name}<span className="mt-1 block break-all font-mono text-[10px] text-muted-foreground">{register.code}{register.active ? "" : " · Archived"}</span></span>
          </label>)}
          {!registers.length && <p className="text-xs text-muted-foreground">No registers have been created yet.</p>}
        </div> : <p className="text-xs leading-5 text-muted-foreground">Includes active registers and any registers created later.</p>}
      </fieldset>
      <section aria-label="Account access summary" className="rounded-xl border border-border bg-accent p-4">
        <h3 className="text-xs font-semibold">3. Review access</h3>
        <p className="mt-2 text-xs leading-5">{isSiteAdmin ? "Site administrator · All registers" : scope === "ALL" ? "All registers, including future registers." : activeAssigned.length ? `Can access: ${activeAssigned.map(({ name }) => name).join(", ")}.` : "No active registers assigned. This account cannot open a register or start a shift."}</p>
        {scope === "SELECTED" && assigned.some(({ active }) => !active) && <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Archived assignments are retained and become available if those registers are restored.</p>}
        {role ? <ul className="mt-3 grid gap-1.5 text-[11px] leading-5 text-muted-foreground">{accessSummary(role.capabilities, isSiteAdmin).map((summary) => <li key={summary}>{summary}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">Choose a role to see allowed actions.</p>}
      </section>
      {scopeError && <p role="alert" className="text-xs leading-5 text-destructive">{scopeError}</p>}
      <SettingsSubmit disabled={!role || !!scopeError}>{submitLabel}</SettingsSubmit>
    </div>
  );
}
