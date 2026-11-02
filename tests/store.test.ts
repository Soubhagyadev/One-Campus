import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/services/supabase", () => ({ supabase: null }));
import { castVote, history, readLocal } from "../src/services/store";
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, v: string) => values.set(key, v),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal("window", new EventTarget());
});
describe("demo crowd reporting service", () => {
  it("replaces an active vote while appending only anonymous analytics", async () => {
    const space = readLocal().spaces[0];
    await castVote(space, "student-a", "free");
    const first = readLocal();
    expect(first.spaces[0].reportCount).toBe(space.reportCount + 1);
    await castVote(space, "student-a", "crowded");
    const second = readLocal();
    expect(second.spaces[0].reportCount).toBe(space.reportCount + 1);
    expect(second.votes[space.id]["student-a"].level).toBe("crowded");
    expect(second.checkIns.length).toBe(first.checkIns.length + 1);
    expect(Object.keys(second.checkIns.at(-1)!)).toEqual([
      "spaceId",
      "level",
      "weekday",
      "hour",
      "createdAt",
    ]);
    expect((await history()).length).toBe(second.checkIns.length);
  });
  it("notifies other screens after a saved report", async () => {
    const listener = vi.fn();
    window.addEventListener("pulse-change", listener);
    await castVote(readLocal().spaces[0], "student-b", "moderate");
    expect(listener).toHaveBeenCalledOnce();
  });
});
