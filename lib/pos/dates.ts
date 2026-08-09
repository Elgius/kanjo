const MALDIVES_OFFSET_MINUTES = 5 * 60;

export function getBusinessDayRange(
  date = new Date(),
  utcOffsetMinutes = MALDIVES_OFFSET_MINUTES,
) {
  const offsetMs = utcOffsetMinutes * 60_000;
  const shifted = new Date(date.getTime() + offsetMs);
  const start = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ) - offsetMs;

  return {
    start: new Date(start),
    end: new Date(start + 86_400_000),
  };
}

export function shiftRange(
  range: { start: Date; end: Date },
  days: number,
) {
  const delta = days * 86_400_000;
  return {
    start: new Date(range.start.getTime() + delta),
    end: new Date(range.end.getTime() + delta),
  };
}

export function getMaldivesHour(date: Date) {
  return (date.getUTCHours() + 5) % 24;
}

export function formatHour(hour: number) {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}
