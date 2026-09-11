"use client";

import { useState } from "react";
import type { CapabilityKey } from "@/generated/prisma/enums";
import { CAPABILITY_BY_KEY, expandCapabilityDependencies } from "@/lib/permissions";
import { accessSummary, isWorkspace, SETTINGS_PERMISSION_GROUPS, toggleSettingCapability, WORKSPACES, workspaceCapabilities, type WorkspaceKey } from "@/lib/access-settings";
import { cn } from "@/lib/utils";

export function CapabilityEditor({ initialCapabilities = [], initialWorkspace = "CUSTOM" }: {
  initialCapabilities?: CapabilityKey[];
  initialWorkspace?: string;
}) {
  const [capabilities, setCapabilities] = useState(() => expandCapabilityDependencies(initialCapabilities));
  const [workspace, setWorkspace] = useState<WorkspaceKey>(isWorkspace(initialWorkspace) ? initialWorkspace : "CUSTOM");
  const [changed, setChanged] = useState(false);
  const [search, setSearch] = useState("");
  const summaries = accessSummary(capabilities);

  return (
    <div className="grid gap-6">
      <input type="hidden" name="workspace" value={workspace} />
      {[...capabilities].map((key) => <input key={key} type="hidden" name="capabilities" value={key} />)}
      <fieldset>
        <legend className="text-sm font-semibold">1. Choose the job</legend>
        <p className="mb-4 mt-1 text-xs leading-5 text-muted-foreground">Start with a preset, then adjust its actions. Applying a preset replaces the current selection.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {WORKSPACES.map((item) => (
            <button key={item.key} type="button" aria-pressed={workspace === item.key} onClick={() => {
              setWorkspace(item.key);
              if (item.key !== "CUSTOM") setCapabilities(workspaceCapabilities(item.key));
              setChanged(false);
            }} className={cn("rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring", workspace === item.key ? "border-primary bg-accent" : "border-border hover:bg-accent/50")}>
              <span className="flex items-center justify-between text-xs font-semibold">{item.label}{workspace === item.key && <span className="size-1.5 rounded-full bg-chart-1" />}</span>
              <span className="mt-2 block text-[11px] leading-5 text-muted-foreground">{item.description}</span>
            </button>
          ))}
        </div>
        {changed && workspace !== "CUSTOM" && <p className="mt-2 text-[11px] text-muted-foreground">Customized {WORKSPACES.find(({ key }) => key === workspace)?.label.toLowerCase()} permissions.</p>}
      </fieldset>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-sm font-semibold">2. Choose allowed actions</h3><p className="mt-1 text-xs text-muted-foreground">Required viewing permissions are included automatically.</p></div>
          <label><span className="sr-only">Find a permission</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a permission…" className="h-10 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-ring" /></label>
        </div>
        {SETTINGS_PERMISSION_GROUPS.map((group) => {
          const matching = group.capabilities.filter((key) => `${CAPABILITY_BY_KEY[key].label} ${CAPABILITY_BY_KEY[key].description}`.toLowerCase().includes(search.toLowerCase()));
          if (!matching.length) return null;
          return (
            <details key={group.label} open={!!search || ["Everyday checkout", "History & reporting", "Supervisor actions"].includes(group.label)} className="overflow-hidden rounded-xl border border-border">
              <summary className="cursor-pointer bg-accent px-4 py-3 text-xs font-semibold">{group.label}<span className="ml-2 font-normal text-muted-foreground">{group.capabilities.filter((key) => capabilities.has(key)).length} enabled</span></summary>
              <p className="border-t border-border px-4 pt-3 text-[11px] leading-5 text-muted-foreground">{group.description}</p>
              {group.label === "Supervisor actions" && <p className="px-4 pt-1 text-[11px] leading-5 text-muted-foreground">Paid-bill corrections and reversals remain site-administrator actions.</p>}
              <fieldset>
              <legend className="sr-only">{group.label}</legend>
              <div className="grid sm:grid-cols-2">
                {matching.map((key) => {
                  const item = CAPABILITY_BY_KEY[key];
                  const requiredBy = [...capabilities].filter((candidate) => CAPABILITY_BY_KEY[candidate].implies === key);
                  return (
                    <label key={key} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:odd:border-r">
                      <input type="checkbox" checked={capabilities.has(key)} onChange={() => { setCapabilities((current) => toggleSettingCapability(current, key)); setChanged(true); }} className="mt-1 accent-primary" />
                      <span><span className="text-xs font-semibold">{item.label}</span><span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{item.description}</span>
                        {item.scope === "GLOBAL" && <span className="mt-1 block text-[10px] font-semibold text-muted-foreground">Applies across the workspace</span>}
                        {requiredBy.length > 0 && <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">Required by {requiredBy.map((candidate) => CAPABILITY_BY_KEY[candidate].label.toLowerCase()).join(", ")}. Turning this off also turns those actions off.</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
              </fieldset>
            </details>
          );
        })}
        {search && !SETTINGS_PERMISSION_GROUPS.some((group) => group.capabilities.some((key) => `${CAPABILITY_BY_KEY[key].label} ${CAPABILITY_BY_KEY[key].description}`.toLowerCase().includes(search.toLowerCase()))) && <p className="py-4 text-xs text-muted-foreground">No permissions match your search.</p>}
      </section>

      <section aria-label="Role access summary" className="rounded-xl border border-border bg-accent p-4">
        <h3 className="text-sm font-semibold">3. Review access</h3>
        <p className="mt-1 text-xs text-muted-foreground">{capabilities.size} allowed actions. Assign registers separately on each team account.</p>
        <ul className="mt-3 grid gap-2 text-xs leading-5">{summaries.map((summary) => <li key={summary}>{summary}</li>)}</ul>
        {capabilities.has("REGISTER_CREATE_GLOBAL") && <p className="mt-3 text-xs font-semibold">Accounts using this role must have all-register access to create registers.</p>}
      </section>
    </div>
  );
}
