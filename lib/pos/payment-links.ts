const MALDIVES_COUNTRY_CODE = "960";
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;

export const MAX_PAYMENT_SLIP_BYTES = 5 * 1024 * 1024;

export type PaymentSlipContentType =
  | "application/pdf"
  | "image/heic"
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export type NormalizedPaymentPhone = {
  display: string;
  normalized: string;
};

export function normalizePaymentPhone(value: string): NormalizedPaymentPhone | null {
  const display = value.trim().replace(/\s+/g, " ");
  if (!display || !/^\+?[\d\s()-]+$/.test(display)) return null;

  let digits = display.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === MIN_PHONE_DIGITS) digits = `${MALDIVES_COUNTRY_CODE}${digits}`;
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) return null;

  return { display, normalized: digits };
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function detectPaymentSlipContentType(bytes: Uint8Array): PaymentSlipContentType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";

  const heicBrands = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);
  if (ascii(bytes, 4, 4) === "ftyp" && heicBrands.has(ascii(bytes, 8, 4))) return "image/heic";

  return null;
}
