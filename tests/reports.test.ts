import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/services/supabase", () => ({ supabase: null }));
vi.mock("../src/services/firebase", () => ({ firebaseApp: null }));
import { reportDemoData } from "../src/data/reportSeed";
import {
  submitReport,
  requestClaim,
  decideClaim,
  claimContacts,
  updateReport,
  readReportLocal,
} from "../src/services/reports";
import {
  deadlineFor,
  displayStatus,
  draftSchema,
  localMatches,
  reportAnalytics,
  visibleReports,
} from "../src/lib/reports";
import type { ReportDraft } from "../src/lib/reports";
const student = {
    uid: "demo-student",
    name: "Student",
    role: "student" as const,
  },
  finder = { uid: "demo-finder", name: "Finder", role: "student" as const },
  admin = { uid: "demo-admin", name: "Admin", role: "admin" as const };
const draft: ReportDraft = {
  title: "Found blue bottle by reading desks",
  description:
    "A blue metal bottle was left beside the reading desks this afternoon.",
  location: "Central Library · Ground floor",
  image: "",
  photoSafe: false,
  safeDetails: {
    intent: "found",
    topic: "Personal belonging",
    item: "Bottle",
    color: "Blue",
    feature: "Metal",
    urgency: "medium",
  },
};
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
  vi.stubGlobal("window", new EventTarget());
});
describe("report workflow", () => {
  it("saves a report with triage, exact SLA and anonymous-attribute matches", async () => {
    const report = await submitReport(finder, draft);
    expect(report.status).toBe("Submitted");
    expect(report.deadline - report.createdAt).toBe(72 * 3600000);
    expect(report.aiSource).toBe("Local fallback");
    expect(report.matches[0].reportId).toBe("demo-report-2");
    expect(report.matches[0].confidence).toBe(0.9);
    expect(report).not.toHaveProperty("summary");
  });
  it("keeps private concerns out of another student view", () => {
    const rows = readReportLocal().reports;
    expect(
      visibleReports(rows, finder.uid).some((r) => r.type === "grievance"),
    ).toBe(false);
    expect(
      visibleReports(rows, student.uid).some((r) => r.type === "grievance"),
    ).toBe(true);
  });
  it("does not permit skipping statuses or non-admin updates", async () => {
    await expect(
      updateReport(student, "demo-report-2", "Assigned", ""),
    ).rejects.toThrow();
    await expect(
      updateReport(admin, "demo-report-2", "Resolved", ""),
    ).rejects.toThrow();
    await updateReport(
      admin,
      "demo-report-2",
      "Assigned",
      "Sent to the help desk.",
    );
    expect(
      readReportLocal().reports.find((r) => r.id === "demo-report-2")?.comments,
    ).toHaveLength(1);
  });
  it("keeps contacts locked until the finder approves and rejects duplicate claims", async () => {
    const found = await submitReport(finder, draft),
      lost = readReportLocal().reports.find((r) => r.id === "demo-report-2")!;
    await requestClaim(
      student,
      found,
      lost,
      "There is a small dent near the base.",
      "owner@example.test",
    );
    await expect(
      requestClaim(
        student,
        found,
        lost,
        "There is a small dent near the base.",
        "owner@example.test",
      ),
    ).rejects.toThrow("already exists");
    const claim = readReportLocal().claims[0];
    await expect(claimContacts(finder, claim)).rejects.toThrow("private");
    await expect(
      decideClaim(student, claim, true, "owner@example.test"),
    ).rejects.toThrow("finder");
    await decideClaim(finder, claim, true, "finder@example.test");
    const approved = readReportLocal().claims[0];
    expect(await claimContacts(student, approved)).toEqual({
      claimant: "owner@example.test",
      finder: "finder@example.test",
    });
    await expect(claimContacts(admin, approved)).rejects.toThrow();
  });
  it("computes escalation without mutating a report", () => {
    const report = readReportLocal().reports.find(
      (r) => r.id === "demo-report-3",
    )!;
    expect(displayStatus(report)).toBe("Escalated");
    expect(report.status).toBe("Assigned");
  });
  it("validates photos and required details", () => {
    expect(
      draftSchema.safeParse({
        ...draft,
        image: "data:image/jpeg;base64,YQ==",
        photoSafe: false,
      }).success,
    ).toBe(false);
    expect(
      draftSchema.safeParse({ ...draft, description: "short" }).success,
    ).toBe(false);
  });
  it("uses exact deadlines and rejects unrelated matches", () => {
    expect(deadlineFor("high", 0)).toBe(86400000);
    expect(deadlineFor("low", 0)).toBe(7 * 86400000);
    expect(
      localMatches(
        { ...draft.safeDetails, item: "Phone" },
        readReportLocal().reports,
      ),
    ).toEqual([]);
  });
  it("finds recurring categories and measures resolved durations", () => {
    const now = Date.parse("2026-11-15T12:00:00Z"),
      data = reportAnalytics(reportDemoData(now), now);
    expect(data.overdue).toBeGreaterThan(0);
    expect(data.averageHours).toBe(4);
    expect(data.recurring.some((x) => x.count >= 2)).toBe(true);
  });
});
