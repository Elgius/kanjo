const MVR_FORMATTER = new Intl.NumberFormat("en-MV", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMvr(laari: number): string {
  return `MVR ${MVR_FORMATTER.format(laari / 100)}`;
}

export function parseMvr(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().replaceAll(",", "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;

  const [whole, fraction = ""] = normalized.split(".");
  const laari = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  return Number.isSafeInteger(laari) ? laari : null;
}
