import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/services/supabase", () => ({ supabase: null }));
import {
  mealOpen,
  listingSchema,
  campusMinute,
  defaultMeals,
} from "../src/lib/commerce";
import {
  postListing,
  changeListing,
  prepareOrder,
  payOrder,
  saveService,
  collectOrder,
} from "../src/services/commerce";
const student = {
    uid: "demo-student",
    name: "Student",
    role: "student" as const,
  },
  admin = { uid: "demo-admin", name: "Admin", role: "admin" as const };
beforeEach(() => {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
  });
  vi.stubGlobal("window", new EventTarget());
});
describe("Commerce time boundaries and demo parity", () => {
  it("uses India time with exclusive closing boundaries and overnight windows", () => {
    const s = { ...defaultMeals()[0], start_minute: 420, end_minute: 600 };
    expect(mealOpen(s, Date.parse("2026-11-02T01:30:00Z"))).toBe(true);
    expect(mealOpen(s, Date.parse("2026-11-02T04:30:00Z"))).toBe(false);
    const overnight = { ...s, start_minute: 1380, end_minute: 60 };
    expect(mealOpen(overnight, Date.parse("2026-11-02T18:00:00Z"))).toBe(true);
    expect(mealOpen(overnight, Date.parse("2026-11-02T19:30:00Z"))).toBe(false);
    expect(mealOpen({ ...s, enabled: false })).toBe(false);
  });
  it("publishes immediately and blocks another student's removal", async () => {
    const l = await postListing(student, {
      title: "Useful textbook",
      description: "A good condition textbook for your next semester.",
      price: 250,
      category: "Textbooks",
      contact: "9876543210",
      images: [],
    });
    expect(l.status).toBe("available");
    await expect(
      changeListing({ ...student, uid: "other" }, l.id, "removed"),
    ).rejects.toThrow();
    await changeListing(admin, l.id, "removed", "Spam listing");
  });
  it("rejects invalid listing details before writing", () => {
    expect(
      listingSchema.safeParse({
        title: "Book",
        description: "A sufficiently long description",
        price: 25.555,
        category: "Textbooks",
        contact: "9876543210",
        images: [],
      }).success,
    ).toBe(false);
  });
  it("simulates idempotent payment and admin collection", async () => {
    const minute = campusMinute();
    await saveService(admin, {
      ...defaultMeals()[1],
      start_minute: (minute + 1439) % 1440,
      end_minute: (minute + 30) % 1440,
    });
    const key = crypto.randomUUID(),
      o = await prepareOrder(student, "Lunch", key);
    expect(o.amount).toBe(100);
    const paid = await payOrder(student, o.id, true);
    expect((await payOrder(student, o.id, true)).transaction_id).toBe(
      paid.transaction_id,
    );
    await expect(collectOrder(student, o.id)).rejects.toThrow();
    expect((await collectOrder(admin, o.id)).collected_at).toBeGreaterThan(0);
  });
  it("rejects closed demo meals and student kitchen edits", async () => {
    const s = { ...defaultMeals()[1], enabled: false };
    await saveService(admin, s);
    await expect(
      prepareOrder(student, "Lunch", crypto.randomUUID()),
    ).rejects.toThrow(/closed/);
    await expect(saveService(student, s)).rejects.toThrow(/Admin/);
  });
});
