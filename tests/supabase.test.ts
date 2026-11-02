import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fallbackTriage } from "../src/lib/reports";
import { campusDay } from "../src/lib/wellness";
let pg: PGlite;
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222",
  admin = "33333333-3333-4333-8333-333333333333";
async function asUser<T>(
  uid: string | null,
  work: () => Promise<T>,
  role = "authenticated",
): Promise<T> {
  await pg.exec("begin");
  try {
    await pg.exec(`set local role ${role}`);
    await pg.query("select set_config('request.jwt.claim.sub',$1,true)", [
      uid || "",
    ]);
    const result = await work();
    await pg.exec("commit");
    return result;
  } catch (e) {
    await pg.exec("rollback");
    throw e;
  }
}
async function rpc(name: string, args: unknown[] = []) {
  const query = `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as result`;
  return (await pg.query<{ result: any }>(query, args)).rows[0].result;
}
function report(ownerUid: string, type = "issue") {
  const details = {
      intent: type as "issue",
      topic: "Wi-Fi unavailable" as const,
      item: "Bottle" as const,
      color: "Blue" as const,
      feature: "Metal" as const,
      urgency: "medium" as const,
    },
    triage = fallbackTriage(details);
  return {
    ownerUid,
    type,
    category: triage.category,
    department: triage.department,
    priority: triage.priority,
    title: "A clear campus report title",
    description:
      "A detailed description of the campus situation or missing item.",
    location: "Central Library",
    image: "",
    photoSafe: false,
    safeDetails: details,
    status: "Submitted",
    deadline: 1,
    aiSummary: triage.summary,
    aiSource: "Local fallback",
    matchSource: "Local fallback",
    comments: [],
    matches: [],
    timeline: [],
    createdAt: 1,
    resolvedAt: null,
    demo: false,
  };
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pg.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await pg.query(
    'insert into auth.users(id,raw_user_meta_data) values($1,\'{"name":"Alice","role":"admin"}\'),($2,\'{}\'),($3,\'{}\')',
    [alice, bob, admin],
  );
  await pg.query("update public.profiles set role='admin' where id=$1", [
    admin,
  ]);
  await asUser(alice, () => rpc("submit_report", ["private", report(alice)]));
  await asUser(alice, () =>
    rpc("submit_report", ["lost", report(alice, "lost")]),
  );
  await asUser(bob, () =>
    rpc("submit_report", ["found", report(bob, "found")]),
  );
}, 30000);
afterAll(async () => {
  await pg?.close();
});
describe("Supabase migration and RLS", () => {
  it("registers students regardless of user metadata and blocks role edits", async () => {
    const profile = await asUser(alice, () => rpc("get_my_profile"));
    expect(profile.role).toBe("student");
    expect(profile.name).toBe("Alice");
    await expect(
      asUser(alice, () =>
        pg.query("update public.profiles set role='admin' where id=$1", [
          alice,
        ]),
      ),
    ).rejects.toThrow(/permission/i);
  });
  it("denies anonymous access and private concern reads by other students", async () => {
    await expect(
      asUser(null, () => pg.query("select * from public.spaces"), "anon"),
    ).rejects.toThrow(/permission/i);
    const rows = await asUser(bob, () =>
      pg.query<{ id: string }>("select id from public.reports"),
    );
    expect(rows.rows.map((r) => r.id).sort()).toEqual(["found", "lost"]);
  });
  it("calculates deadlines on the server and rejects null/preset statuses", async () => {
    const result = await asUser(alice, () =>
      rpc("submit_report", ["deadline", report(alice)]),
    );
    expect(result.deadline - result.createdAt).toBe(72 * 3600000);
    await expect(
      asUser(alice, () =>
        rpc("submit_report", ["bad", { ...report(alice), status: null }]),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(alice, () => rpc("submit_report", ["forged", { ...report(bob) }])),
    ).rejects.toThrow();
  });
  it("replaces crowd votes atomically and logs without identity", async () => {
    await asUser(alice, () => rpc("cast_crowd_vote", ["reading-hall", "free"]));
    const result = await asUser(alice, () =>
      rpc("cast_crowd_vote", ["reading-hall", "crowded"]),
    );
    expect(result.reportCount).toBe(1);
    expect(result.level).toBe("crowded");
    const logs = await pg.query("select * from public.check_ins");
    expect(logs.rows).toHaveLength(2);
    expect(logs.rows[0]).not.toHaveProperty("user_id");
    await expect(
      asUser(bob, () => pg.exec("update public.spaces set payload='{}'")),
    ).rejects.toThrow(/permission/i);
  });
  it("restricts official updates and enforces sequential status changes", async () => {
    await expect(
      asUser(alice, () => rpc("update_report", ["private", "Assigned", ""])),
    ).rejects.toThrow(/Administrator/);
    await expect(
      asUser(admin, () => rpc("update_report", ["private", "Resolved", ""])),
    ).rejects.toThrow(/next status/);
    const result = await asUser(admin, () =>
      rpc("update_report", ["private", "Assigned", "Assigned to IT."]),
    );
    expect(result.timeline).toHaveLength(2);
    expect(result.comments[0].authorUid).toBe(admin);
  });
  it("protects pending contacts, then shares only with approved participants", async () => {
    const claim = await asUser(alice, () =>
      rpc("request_claim", [
        "found",
        "lost",
        "The bottle has a dent near its base.",
        "owner@example.test",
      ]),
    );
    expect(
      (
        await asUser(bob, () =>
          pg.query("select contact from public.claim_contacts"),
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await asUser(admin, () =>
          pg.query("select contact from public.claim_contacts"),
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      asUser(alice, () => rpc("decide_claim", [claim.id, true, "not allowed"])),
    ).rejects.toThrow(/finder/);
    await asUser(bob, () =>
      rpc("decide_claim", [claim.id, true, "finder@example.test"]),
    );
    expect(
      (
        await asUser(alice, () =>
          pg.query("select contact from public.claim_contacts"),
        )
      ).rows,
    ).toHaveLength(2);
    expect(
      (
        await asUser(admin, () =>
          pg.query("select contact from public.claim_contacts"),
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("restricts club creation and makes RSVPs idempotent", async () => {
    const event = {
      title: "An accessible campus workshop",
      club: "Coding Club",
      date: Date.now() + 86400000,
      venue: "Learning Centre",
      description: "A practical event for curious students across campus.",
      tags: ["Workshop"],
    };
    await expect(
      asUser(alice, () => rpc("create_event", ["event", event])),
    ).rejects.toThrow(/club lead/);
    await pg.query("insert into public.club_leads values($1,'Coding Club')", [
      bob,
    ]);
    await asUser(bob, () => rpc("create_event", ["event", event]));
    await asUser(alice, () => rpc("set_event_rsvp", ["event", true]));
    await asUser(alice, () => rpc("set_event_rsvp", ["event", true]));
    expect(
      (
        await pg.query<{ payload: any }>(
          "select payload from public.events where id='event'",
        )
      ).rows[0].payload.rsvpCount,
    ).toBe(1);
    await asUser(alice, () => rpc("set_event_rsvp", ["event", false]));
    expect(
      (
        await pg.query<{ payload: any }>(
          "select payload from public.events where id='event'",
        )
      ).rows[0].payload.rsvpCount,
    ).toBe(0);
  });
  it("validates team skill categories and owner IDs come from Auth", async () => {
    const post = {
      eventId: "event",
      kind: "looking",
      skills: ["Frontend"],
      roles: [],
      theme: "Student productivity",
      idea: "A helpful tool for finding a quiet study spot.",
    };
    const r = await asUser(alice, () =>
      rpc("create_team_post", ["team", post]),
    );
    expect(r.ownerUid).toBe(alice);
    await expect(
      asUser(alice, () =>
        rpc("create_team_post", [
          "badteam",
          { ...post, skills: ["private@example.test"] },
        ]),
      ),
    ).rejects.toThrow();
  });
  it("stores only wellness counters and enforces the ten-count cohort threshold", async () => {
    await asUser(alice, () => rpc("record_wellness", [2, campusDay()]));
    expect(
      (
        await asUser(admin, () =>
          pg.query("select * from public.wellness_daily"),
        )
      ).rows,
    ).toHaveLength(0);
    for (let i = 0; i < 9; i++)
      await asUser(bob, () => rpc("record_wellness", [4, campusDay()]));
    const rows = await asUser(admin, () =>
      pg.query("select * from public.wellness_daily"),
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).not.toHaveProperty("user_id");
    expect(
      (
        await asUser(alice, () =>
          pg.query("select * from public.wellness_daily"),
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      asUser(alice, () => rpc("record_wellness", [5, "2000-01-01"])),
    ).rejects.toThrow();
    await expect(
      asUser(alice, () =>
        pg.exec("update public.wellness_daily set total=999"),
      ),
    ).rejects.toThrow(/permission/i);
  });
});
