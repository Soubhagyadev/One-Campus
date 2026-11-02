import { describe, it, expect } from "vitest";
import { summarize, VOTE_TTL, bestHour, campusDate } from "../src/lib/pulse";
import { demoData } from "../src/data/seed";
describe("crowd summaries", () => {
  it("expires votes exactly at 20 minutes and excludes future votes", () => {
    expect(
      summarize(
        [
          { level: "crowded", updatedAt: 0 },
          { level: "free", updatedAt: VOTE_TTL },
          { level: "crowded", updatedAt: VOTE_TTL + 1 },
        ],
        VOTE_TTL,
      ),
    ).toEqual({ level: "free", reportCount: 1 });
  });
  it("does not invent availability when no votes are active", () =>
    expect(summarize([], 100)).toEqual({ level: null, reportCount: 0 }));
  it("uses a rounded mean for mixed reports", () =>
    expect(
      summarize(
        [
          { level: "free", updatedAt: 1 },
          { level: "crowded", updatedAt: 1 },
        ],
        2,
      ),
    ).toEqual({ level: "moderate", reportCount: 2 }));
  it("replacement preserves one vote per student", () => {
    const votes: Record<
      string,
      { level: "free" | "crowded"; updatedAt: number }
    > = { alice: { level: "crowded", updatedAt: 1 } };
    votes.alice = { level: "free", updatedAt: 2 };
    expect(summarize(Object.values(votes), 3)).toEqual({
      level: "free",
      reportCount: 1,
    });
  });
});
describe("history", () => {
  it("uses the campus timezone", () =>
    expect(campusDate(Date.parse("2026-11-01T05:30:00Z"))).toEqual({
      weekday: 0,
      hour: 11,
    }));
  it("chooses an upcoming quietest hour today", () => {
    const now = Date.parse("2026-11-01T05:30:00Z");
    expect(
      bestHour(
        [
          {
            spaceId: "a",
            level: "crowded",
            weekday: 0,
            hour: 12,
            createdAt: now - 100,
          },
          {
            spaceId: "a",
            level: "free",
            weekday: 0,
            hour: 15,
            createdAt: now - 100,
          },
        ],
        "a",
        now,
      ),
    ).toBe(15);
  });
  it("does not invent a prediction without history", () =>
    expect(bestHour([], "a")).toBeNull());
  it("seeds six realistic spaces and one week of anonymous history", () => {
    const data = demoData();
    expect(data.spaces).toHaveLength(6);
    expect(data.checkIns.length).toBeGreaterThan(1000);
    expect(
      data.checkIns.every((x) => !("uid" in x) && x.createdAt <= Date.now()),
    ).toBe(true);
  });
});
