import { supabase as db, callRpc, watch } from "./supabase";
import { supportiveMessage } from "./ai";
import {
  campusDay,
  emptyCount,
  incrementCount,
  visibleMoodDays,
  wellnessEntrySchema,
} from "@/lib/wellness";
import type { MoodDay, PersonalEntry, WellnessInput } from "@/lib/wellness";
const COUNT_KEY = "onecampus.wellness.aggregate.v4";
function historyKey(uid: string) {
  return "onecampus.wellness.device.v4:" + uid;
}
export function personalHistory(uid: string): PersonalEntry[] {
  const raw = localStorage.getItem(historyKey(uid));
  return raw ? JSON.parse(raw) : [];
}
export function localMoodDays(): MoodDay[] {
  const raw = localStorage.getItem(COUNT_KEY);
  return raw ? JSON.parse(raw) : [];
}
function storeDays(days: MoodDay[]) {
  localStorage.setItem(COUNT_KEY, JSON.stringify(days));
  window.dispatchEvent(new Event("wellness-change"));
}
async function shareCount(mood: number, date: string) {
  if (!db) {
    const days = localMoodDays(),
      index = days.findIndex((d) => d.date === date),
      before = index >= 0 ? days[index] : { ...emptyCount(), date };
    const after = { ...before, ...incrementCount(before, mood) };
    if (index >= 0) days[index] = after;
    else days.push(after);
    storeDays(days);
    return;
  }
  await callRpc("record_wellness", { p_mood: mood, p_day: date });
}

export async function saveWellness(
  uid: string,
  input: WellnessInput,
): Promise<PersonalEntry> {
  const safe = wellnessEntrySchema.parse(input),
    date = campusDay();
  const entries = personalHistory(uid);
  if (entries.some((e) => e.date === date))
    throw new Error("You have already checked in today on this device.");
  // Persist the note only on this device, before any network operation. It is never a server payload.
  const entry: PersonalEntry = {
    ...safe,
    date,
    createdAt: Date.now(),
    message: "Thank you for checking in with yourself today.",
    suggestion: "Make room for one small pause.",
    source: "Local fallback",
    shared: false,
  };
  entries.push(entry);
  localStorage.setItem(historyKey(uid), JSON.stringify(entries));
  try {
    await shareCount(safe.mood, date);
    entry.shared = true;
  } catch {
    /* Keep the local entry; do not blindly retry ambiguous anonymous increments. */
  }
  try {
    const response = await supportiveMessage({
      mood: safe.mood,
      tags: safe.tags,
    });
    entry.message = response.data.message;
    entry.suggestion = response.data.suggestion;
    entry.source = response.source;
  } catch {
    /* The saved local check-in remains useful if reflection is unavailable. */
  }
  localStorage.setItem(
    historyKey(uid),
    JSON.stringify(entries.map((e) => (e.date === date ? entry : e))),
  );
  return entry;
}
export function listenMoodDays(
  next: (days: MoodDay[]) => void,
  error: (e: Error) => void,
) {
  if (db)
    return watch(
      [{ table: "wellness_daily" }],
      async () => {
        const { data, error } = await db!
          .from("wellness_daily")
          .select("day,m1,m2,m3,m4,m5,total")
          .gte("total", 10)
          .order("day");
        if (error) throw error;
        return visibleMoodDays(
          (data || []).map((r) => ({
            date: r.day,
            m1: r.m1,
            m2: r.m2,
            m3: r.m3,
            m4: r.m4,
            m5: r.m5,
            total: r.total,
          })),
        );
      },
      next,
      error,
    );
  const emit = () => {
    try {
      next(visibleMoodDays(localMoodDays()));
    } catch (e) {
      error(e as Error);
    }
  };
  emit();
  window.addEventListener("wellness-change", emit);
  window.addEventListener("storage", emit);
  return () => {
    window.removeEventListener("wellness-change", emit);
    window.removeEventListener("storage", emit);
  };
}
export function loadMoodDemo() {
  if (db)
    throw new Error("Aggregate samples are available only in local demo mode.");
  const days = localMoodDays();
  for (let i = 1; i <= 7; i++) {
    const date = campusDay(Date.now() - i * 86400000);
    if (days.some((d) => d.date === date)) continue;
    const count = {
      m1: 1,
      m2: 2,
      m3: 5 + (i % 3),
      m4: 6,
      m5: 3,
      total: 17 + (i % 3),
    };
    days.push({ ...count, date, demo: true });
  }
  storeDays(days);
}
