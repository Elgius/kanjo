import { describe, expect, test } from "bun:test";

import {
  detectPaymentSlipContentType,
  normalizePaymentPhone,
} from "@/lib/pos/payment-links";

describe("payment link phone numbers", () => {
  test("normalizes local Maldives and international formats consistently", () => {
    expect(normalizePaymentPhone("777 1234")?.normalized).toBe("9607771234");
    expect(normalizePaymentPhone("+960 777-1234")?.normalized).toBe("9607771234");
    expect(normalizePaymentPhone("00960 777 1234")?.normalized).toBe("9607771234");
  });

  test("rejects malformed or implausible phone numbers", () => {
    expect(normalizePaymentPhone("hello")).toBeNull();
    expect(normalizePaymentPhone("123")).toBeNull();
    expect(normalizePaymentPhone("+1234567890123456")).toBeNull();
  });
});

describe("payment slip files", () => {
  test("detects supported files from their contents", () => {
    expect(detectPaymentSlipContentType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
    expect(detectPaymentSlipContentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectPaymentSlipContentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectPaymentSlipContentType(new TextEncoder().encode("RIFF0000WEBP"))).toBe("image/webp");
    expect(detectPaymentSlipContentType(new Uint8Array([0, 0, 0, 0, ...new TextEncoder().encode("ftypheic")]))).toBe("image/heic");
  });

  test("rejects unsupported content regardless of its filename or browser MIME type", () => {
    expect(detectPaymentSlipContentType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});
