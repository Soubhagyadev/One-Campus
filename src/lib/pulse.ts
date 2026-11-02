import type { CheckIn, Level, Vote } from "./types";
export const VOTE_TTL = 20 * 60 * 1000;
export const scores = { free: 0, moderate: 1, crowded: 2 };
export function summarize(votes: Vote[], now = Date.now()) {
  const active = votes.filter(
    (v) => now - v.updatedAt < VOTE_TTL && v.updatedAt <= now,
  );
  if (!active.length) return { level: null, reportCount: 0 };
  const mean = active.reduce((s, v) => s + scores[v.level], 0) / active.length;
  return {
    level: (mean < 0.5 ? "free" : mean < 1.5 ? "moderate" : "crowded") as Level,
    reportCount: active.length,
  };
}
export function campusDate(time = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(time);
  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value) % 24,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      parts.find((p) => p.type === "weekday")?.value || "Sun",
    ),
  };
}
export function bestHour(logs: CheckIn[], id: string, now = Date.now()) {
  const { hour } = campusDate(now);
  const bins = new Map<number, number[]>();
  logs
    .filter(
      (x) =>
        x.spaceId === id &&
        now - x.createdAt <= 7 * 86400000 &&
        x.createdAt <= now &&
        x.hour > hour &&
        x.hour <= 20,
    )
    .forEach((x) =>
      bins.set(x.hour, [...(bins.get(x.hour) || []), scores[x.level]]),
    );
  return (
    [...bins].sort(
      (a, b) =>
        a[1].reduce((s, x) => s + x, 0) / a[1].length -
          b[1].reduce((s, x) => s + x, 0) / b[1].length || a[0] - b[0],
    )[0]?.[0] ?? null
  );
}
export const hourLabel = (h: number) =>
  `${h % 12 || 12} ${h >= 12 ? "PM" : "AM"}`;
export function age(time: number, now = Date.now()) {
  if (!time) return "Not updated yet";
  const m = Math.max(0, Math.floor((now - time) / 60000));
  return m < 1
    ? "Updated just now"
    : m < 60
      ? `Updated ${m} min ago`
      : `Updated ${Math.floor(m / 60)} hr ago`;
}
