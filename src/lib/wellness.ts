import { z } from "zod";
export const MOODS = ["Very low", "Low", "Okay", "Good", "Great"] as const;
export const WELLNESS_TAGS = [
  "exams",
  "sleep",
  "homesick",
  "workload",
  "other",
] as const;
export const wellnessPublicSchema = z
  .object({
    mood: z.number().int().min(1).max(5),
    tags: z.array(z.enum(WELLNESS_TAGS)).max(5),
  })
  .strict();
export const wellnessEntrySchema = wellnessPublicSchema
  .extend({ note: z.string().max(2000) })
  .strict();
export type WellnessInput = z.infer<typeof wellnessEntrySchema>;
export type DailyCount = {
  m1: number;
  m2: number;
  m3: number;
  m4: number;
  m5: number;
  total: number;
};
export type MoodDay = DailyCount & { date: string; demo?: boolean };
export type PersonalEntry = WellnessInput & {
  date: string;
  createdAt: number;
  message: string;
  suggestion: string;
  source: "Gemini" | "Local fallback";
  shared: boolean;
};
export function campusDay(time = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(time);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function distressInNote(note: string) {
  return /\b(suicid(?:e|al)|kill myself|hurt myself|self[ -]?harm|end my life|can(?:not|'t|’t) go on)\b/i.test(
    note,
  );
}
export const emptyCount = (): DailyCount => ({
  m1: 0,
  m2: 0,
  m3: 0,
  m4: 0,
  m5: 0,
  total: 0,
});
export function incrementCount(count: DailyCount, mood: number): DailyCount {
  wellnessPublicSchema.parse({ mood, tags: [] });
  const key = `m${mood}` as keyof DailyCount;
  return { ...count, [key]: count[key] + 1, total: count.total + 1 };
}
export function visibleMoodDays(rows: MoodDay[]) {
  return rows
    .filter((r) => r.total >= 10)
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function moodAverage(day: DailyCount) {
  return day.total
    ? (day.m1 + 2 * day.m2 + 3 * day.m3 + 4 * day.m4 + 5 * day.m5) / day.total
    : null;
}
