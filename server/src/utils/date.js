import { HttpError } from "./errors.js";

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function assertIsoDate(value, fieldName = "date") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `${fieldName} must use YYYY-MM-DD format`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${fieldName} is not a valid calendar date`);
  }

  return value;
}

export function dateRangeUtc(date) {
  assertIsoDate(date);
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function assertReasonableRange(from, to, maxDays = 370) {
  assertIsoDate(from, "from");
  assertIsoDate(to, "to");
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (end < start) throw new HttpError(400, "to must not be earlier than from");
  const days = Math.floor((end - start) / 86400000) + 1;
  if (days > maxDays) {
    throw new HttpError(400, `Date range is too large. Maximum is ${maxDays} days.`);
  }
  return days;
}
