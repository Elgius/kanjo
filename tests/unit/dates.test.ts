import { describe, expect, test } from "bun:test";

import { formatHour, getBusinessDayRange, getMaldivesHour } from "@/lib/pos/dates";

describe("Maldives business dates", () => {
  test("builds midnight-to-midnight ranges in UTC+5", () => {
    const range = getBusinessDayRange(new Date("2026-08-09T20:00:00.000Z"));
    expect(range.start.toISOString()).toBe("2026-08-09T19:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-08-10T19:00:00.000Z");
  });

  test("maps UTC timestamps to Maldives hours", () => {
    expect(getMaldivesHour(new Date("2026-08-09T19:30:00.000Z"))).toBe(0);
    expect(formatHour(0)).toBe("12am");
    expect(formatHour(13)).toBe("1pm");
  });
});
