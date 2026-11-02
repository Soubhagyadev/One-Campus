import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/services/supabase", () => ({ supabase: null }));
vi.mock("../src/services/firebase", () => ({ firebaseApp: null }));
import {
  campusDay,
  distressInNote,
  emptyCount,
  incrementCount,
  visibleMoodDays,
} from "../src/lib/wellness";
import {
  localMoodDays,
  personalHistory,
  saveWellness,
} from "../src/services/wellness";
beforeEach(() => {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
  });
  vi.stubGlobal("window", new EventTarget());
});
describe("private wellness check-in", () => {
  it("keeps notes on device and shares only anonymous numeric counts", async () => {
    const entry = await saveWellness("student", {
      mood: 2,
      tags: ["exams"],
      note: "A private thought about my exams.",
    });
    expect(entry.shared).toBe(true);
    expect(personalHistory("student")[0].note).toContain("private thought");
    expect(Object.keys(localMoodDays()[0]).sort()).toEqual(
      ["date", "m1", "m2", "m3", "m4", "m5", "total"].sort(),
    );
    expect(JSON.stringify(localMoodDays())).not.toContain("private thought");
    expect(JSON.stringify(localMoodDays())).not.toContain("student");
  });
  it("allows one check-in per day per account on this device", async () => {
    await saveWellness("student", { mood: 3, tags: [], note: "" });
    await expect(
      saveWellness("student", { mood: 4, tags: [], note: "" }),
    ).rejects.toThrow("already checked in");
    expect(localMoodDays()[0].total).toBe(1);
  });
  it("detects distress locally and uses campus date across UTC midnight boundaries", () => {
    expect(distressInNote("I might hurt myself")).toBe(true);
    expect(distressInNote("I have a busy week")).toBe(false);
    expect(campusDay(Date.parse("2026-11-01T20:00:00Z"))).toBe("2026-11-02");
  });
  it("suppresses cohorts smaller than ten and increments exactly one category", () => {
    const count = incrementCount(emptyCount(), 5);
    expect(count).toEqual({ m1: 0, m2: 0, m3: 0, m4: 0, m5: 1, total: 1 });
    expect(
      visibleMoodDays([
        { ...count, date: "2026-11-01" },
        { ...count, total: 10, m5: 10, date: "2026-11-02" },
      ]),
    ).toHaveLength(1);
  });
});
