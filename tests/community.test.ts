import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/services/supabase", () => ({ supabase: null }));
import {
  createEvent,
  createTeam,
  editTeam,
  readCommunity,
  setRsvp,
} from "../src/services/community";
import { rankTeams } from "../src/lib/community";
const student = {
    uid: "demo-student",
    name: "Student",
    role: "student" as const,
  },
  lead = { uid: "demo-finder", name: "Lead", role: "student" as const },
  admin = { uid: "demo-admin", name: "Admin", role: "admin" as const };
beforeEach(() => {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
  });
  vi.stubGlobal("window", new EventTarget());
});
describe("community", () => {
  it("keeps RSVP idempotent and supports withdrawal", async () => {
    const id = "demo-innovation",
      before = readCommunity().events[0].rsvpCount;
    await setRsvp(student, id, true);
    await setRsvp(student, id, true);
    expect(readCommunity().events[0].rsvpCount).toBe(before + 1);
    await setRsvp(student, id, false);
    expect(readCommunity().events[0].rsvpCount).toBe(before);
  });
  it("restricts event creation to admins and the relevant club lead", async () => {
    const input = {
      title: "Accessible campus workshop",
      club: "Coding Club" as const,
      date: Date.now() + 86400000,
      venue: "Learning Centre",
      description: "A hands-on session about accessible design for students.",
      tags: ["Workshop" as const],
    };
    await expect(createEvent(student, input)).rejects.toThrow();
    await expect(
      createEvent(lead, { ...input, club: "Photography Club" }),
    ).rejects.toThrow();
    expect((await createEvent(lead, input)).club).toBe("Coding Club");
    expect(
      (await createEvent(admin, { ...input, club: "Photography Club" })).club,
    ).toBe("Photography Club");
  });
  it("ranks complementary roles for the same event only", async () => {
    const post = await createTeam(student, {
      eventId: "demo-innovation",
      kind: "looking",
      skills: ["Frontend", "UI/UX design"],
      roles: [],
      theme: "Student productivity",
      idea: "An idea about making it easier for students to find a quiet place.",
    });
    const results = rankTeams(post, readCommunity().posts);
    expect(results[0].postId).toBe("demo-team-1");
    expect(results[0].score).toBeGreaterThan(0.5);
  });
});

it("lets the owner edit a team request without moving it or changing its author", async () => {
  const input = {
    eventId: "demo-innovation",
    kind: "looking" as const,
    skills: ["Frontend" as const],
    roles: [],
    theme: "Open innovation" as const,
    idea: "An accessible campus tool for all students.",
  };
  const post = await createTeam(student, input);
  await expect(
    editTeam(admin, post.id, {
      ...input,
      idea: "An updated idea from somebody else.",
    }),
  ).rejects.toThrow(/author/);
  const edited = await editTeam(student, post.id, {
    ...input,
    idea: "An updated campus idea from the original student.",
  });
  expect(edited.idea).toContain("updated campus");
  expect(edited.ownerUid).toBe(student.uid);
  expect(edited.createdAt).toBe(post.createdAt);
  await expect(
    editTeam(student, post.id, { ...input, eventId: "different" }),
  ).rejects.toThrow(/move/);
});
