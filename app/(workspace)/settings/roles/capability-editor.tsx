"use client";

import { useState } from "react";

import type { CapabilityKey, RegisterScopeMode } from "@/generated/prisma/enums";
import { CAPABILITY_GROUPS, ROLE_PRESETS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type RegisterOption = { id: string; name: string; code: string; active: boolean };

export function CapabilityEditor({
  registers,
  initialCapabilities = [],
  initialScopeMode = "SELECTED",
  initialRegisterIds = [],
}: {
  registers: RegisterOption[];
  initialCapabilities?: CapabilityKey[];
  initialScopeMode?: RegisterScopeMode;
  initialRegisterIds?: string[];
}) {
  const [capabilities, setCapabilities] = useState(() => new Set(initialCapabilities));
  const [scopeMode, setScopeMode] = useState<RegisterScopeMode>(initialScopeMode);
  const [registerIds, setRegisterIds] = useState(() => new Set(initialRegisterIds));

  function toggleCapability(capability: CapabilityKey) {
    setCapabilities((current) => {
      const next = new Set(current);
      if (next.has(capability)) next.delete(capability);
      else next.add(capability);
      return next;
    });
  }

  function applyPreset(index: number) {
    const preset = ROLE_PRESETS[index];
    setCapabilities(new Set(preset.capabilities));
    setScopeMode(preset.scopeMode);
    if (preset.scopeMode === "ALL") setRegisterIds(new Set());
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-2">
        <div><h3 className="text-xs font-semibold">Editable presets</h3><p className="mt-1 text-[10px] text-muted-foreground">Start from a preset, then customize any capability.</p></div>
        <div className="flex flex-wrap gap-2">
          {ROLE_PRESETS.map((preset, index) => (
            <button key={preset.key} type="button" onClick={() => applyPreset(index)} className="h-8 rounded-lg border border-border bg-card px-3 text-[10px] font-semibold hover:bg-accent">{preset.label}</button>
          ))}
        </div>
      </section>

      <fieldset className="grid gap-3 rounded-xl border border-border p-4">
        <legend className="px-1 text-xs font-semibold">Register scope</legend>
        <div className="flex flex-wrap gap-2">
          {(["ALL", "SELECTED"] as const).map((mode) => (
            <label key={mode} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-semibold", scopeMode === mode && "border-primary bg-primary/5")}>
              <input type="radio" name="registerScopeMode" value={mode} checked={scopeMode === mode} onChange={() => setScopeMode(mode)} className="accent-primary" />
              {mode === "ALL" ? "All registers" : "Selected registers"}
            </label>
          ))}
        </div>
        {scopeMode === "SELECTED" ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {registers.map((register) => (
              <label key={register.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[10px]">
                <input
                  type="checkbox"
                  name="registerIds"
                  value={register.id}
                  checked={registerIds.has(register.id)}
                  onChange={() => setRegisterIds((current) => {
                    const next = new Set(current);
                    if (next.has(register.id)) next.delete(register.id); else next.add(register.id);
                    return next;
                  })}
                  className="accent-primary"
                />
                <span className="min-w-0"><span className="block truncate font-semibold">{register.name}</span><span className="font-mono text-muted-foreground">{register.code}{register.active ? "" : " · archived"}</span></span>
              </label>
            ))}
          </div>
        ) : <p className="text-[10px] text-muted-foreground">This role also gains access to registers created later.</p>}
      </fieldset>

      <div className="grid gap-4">
        {CAPABILITY_GROUPS.map((group) => (
          <fieldset key={group.label} className="overflow-hidden rounded-xl border border-border">
            <legend className="sr-only">{group.label}</legend>
            <h3 className="border-b border-border bg-accent px-4 py-3 text-xs font-semibold">{group.label}</h3>
            <div className="grid divide-y divide-border md:grid-cols-2 md:divide-y-0">
              {group.capabilities.map((capability) => (
                <label key={capability.key} className="flex items-start gap-3 border-border px-4 py-3 md:border-b md:odd:border-r">
                  <input type="checkbox" name="capabilities" value={capability.key} checked={capabilities.has(capability.key)} onChange={() => toggleCapability(capability.key)} className="mt-0.5 accent-primary" />
                  <span className="min-w-0"><span className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">{capability.label}<span className={cn("rounded-full px-1.5 py-0.5 text-[8px]", capability.scope === "GLOBAL" ? "bg-chart-1/10 text-chart-1" : "bg-secondary text-muted-foreground")}>{capability.scope}</span></span><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{capability.description}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
