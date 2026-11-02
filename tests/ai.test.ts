import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("../src/services/firebase", () => ({ firebaseApp: {} }));
vi.mock("firebase/ai", () => ({
  getAI: () => ({}),
  GoogleAIBackend: class {},
  getGenerativeModel: () => ({ generateContent: mocks.generate }),
  Schema: {
    object: (x: unknown) => x,
    array: (x: unknown) => x,
    string: () => ({}),
    enumString: (x: unknown) => x,
    integer: () => ({}),
    number: () => ({}),
  },
}));
import {
  suggestTeams,
  supportiveMessage,
  triageReport,
} from "../src/services/ai";
const details = {
  intent: "issue" as const,
  topic: "Wi-Fi unavailable" as const,
  item: "Not applicable" as const,
  color: "Not specified" as const,
  feature: "Not specified" as const,
  urgency: "high" as const,
};
beforeEach(() => mocks.generate.mockReset());
describe("single AI boundary", () => {
  it("retries once on invalid JSON and falls back safely", async () => {
    mocks.generate.mockResolvedValue({ response: { text: () => "{bad json" } });
    const result = await triageReport(details);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("Local fallback");
    expect(result.data.priority).toBe("high");
  });
  it("does not change privacy type and rejects unknown identifying input fields", async () => {
    mocks.generate.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            type: "lost",
            category: "Connectivity",
            department: "IT",
            priority: "high",
            summary: "A lost wireless device.",
          }),
      },
    });
    expect((await triageReport(details)).source).toBe("Local fallback");
    await expect(
      triageReport({ ...details, email: "secret@example.test" } as never),
    ).rejects.toThrow();
  });
  it("sends only allowed attributes and confirmed photos", async () => {
    mocks.generate.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            type: "issue",
            category: "Connectivity",
            department: "IT",
            priority: "high",
            summary: "Wireless connectivity requires urgent review.",
          }),
      },
    });
    await triageReport(details, "data:image/jpeg;base64,YQ==", false);
    expect(mocks.generate.mock.calls[0][0]).toHaveLength(1);
    await triageReport(details, "data:image/jpeg;base64,YQ==", true);
    expect(mocks.generate.mock.calls[1][0][1]).toEqual({
      inlineData: { mimeType: "image/jpeg", data: "YQ==" },
    });
  });
});

it("rejects a wellness note at the AI boundary and falls back from diagnostic output", async () => {
  mocks.generate.mockResolvedValue({
    response: {
      text: () =>
        JSON.stringify({
          message: "You have depression and need treatment.",
          suggestion: "Ask for a prescription.",
        }),
    },
  });
  await expect(
    supportiveMessage({
      mood: 1,
      tags: ["exams"],
      note: "Never transmit this note",
    } as never),
  ).rejects.toThrow();
  expect(mocks.generate).not.toHaveBeenCalled();
  expect((await supportiveMessage({ mood: 1, tags: ["exams"] })).source).toBe(
    "Local fallback",
  );
  expect(mocks.generate).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(mocks.generate.mock.calls)).not.toContain(
    "Never transmit",
  );
});

it("team AI sends selected attributes without free text or account identifiers", async () => {
  mocks.generate.mockResolvedValue({
    response: {
      text: () =>
        JSON.stringify({
          matches: [
            {
              index: 0,
              score: 0.8,
              reason: "Complementary frontend and backend skills.",
            },
          ],
        }),
    },
  });
  const post = {
    id: "private-post-id",
    ownerUid: "secret-owner",
    eventId: "private-event",
    kind: "looking" as const,
    skills: ["Frontend" as const],
    roles: [],
    theme: "Student productivity" as const,
    idea: "Private idea with a name and contact details.",
    createdAt: 1,
    demo: true,
  };
  const candidate = {
    ...post,
    id: "candidate",
    ownerUid: "secret-candidate",
    kind: "recruiting" as const,
    roles: ["Frontend" as const],
  };
  const result = await suggestTeams(post, [candidate]);
  expect(result.source).toBe("Gemini");
  const payload = JSON.stringify(mocks.generate.mock.calls);
  expect(payload).toContain("Frontend");
  expect(payload).not.toContain("secret-owner");
  expect(payload).not.toContain("Private idea");
  expect(payload).not.toContain("private-post-id");
});
