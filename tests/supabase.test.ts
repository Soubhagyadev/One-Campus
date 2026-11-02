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
  it("restricts official updates and allows direct admin status choices", async () => {
    await expect(
      asUser(alice, () => rpc("update_report", ["private", "Assigned", ""])),
    ).rejects.toThrow(/Administrator/);
    const resolved = await asUser(admin, () =>
      rpc("update_report", ["private", "Resolved", ""]),
    );
    expect(resolved.status).toBe("Resolved");
    await expect(
      asUser(admin, () => rpc("update_report", ["private", "Rejected", ""])),
    ).rejects.toThrow(/reason/);
    const result = await asUser(admin, () =>
      rpc("update_report", ["private", "Assigned", "Assigned to IT."]),
    );
    expect(result.timeline).toHaveLength(3);
    expect(result.resolvedAt).toBeNull();
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

describe("report controls, campus sharing and space administration", () => {
  it("validates manual Other details and uses the server's reporter name", async () => {
    const r = report(alice);
    r.safeDetails.topic = "Other" as never;
    await expect(
      asUser(alice, () => rpc("submit_report", ["other-invalid", r])),
    ).rejects.toThrow(/Other/);
    const valid = await asUser(alice, () =>
      rpc("submit_report", [
        "other-valid",
        {
          ...r,
          customDetails: { topic: "Lift access issue", item: "", color: "" },
          reporterName: "Forged name",
          contactNumber: "9876543210",
          contactAddress: "Library desk",
          visibility: "campus",
        },
      ]),
    );
    expect(valid.reporterName).toBe("Alice");
    const rows = await asUser(bob, () =>
      pg.query<{ payload: any }>(
        "select payload from public.reports where id='other-valid'",
      ),
    );
    expect(rows.rows[0].payload.contactNumber).toBe("9876543210");
  });
  it("keeps old private reports and grievances restricted", async () => {
    expect(
      (
        await asUser(bob, () =>
          pg.query("select id from public.reports where id='private'"),
        )
      ).rows,
    ).toHaveLength(0);
    const r = await asUser(alice, () =>
      rpc("submit_report", [
        "private-grievance",
        { ...report(alice, "grievance"), visibility: "campus" },
      ]),
    );
    expect(r.visibility).toBe("private");
    expect(
      (
        await asUser(bob, () =>
          pg.query(
            "select id from public.reports where id='private-grievance'",
          ),
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("lets admins reject directly with a bounded explanation", async () => {
    const r = await asUser(admin, () =>
      rpc("update_report", [
        "other-valid",
        "Rejected",
        "Duplicate report; linked to the existing repair.",
      ]),
    );
    expect(r.status).toBe("Rejected");
    expect(r.timeline.at(-1).status).toBe("Rejected");
    expect(r.resolvedAt).toBeNull();
    await expect(
      asUser(bob, () => rpc("update_report", ["other-valid", "Assigned", ""])),
    ).rejects.toThrow();
  });
  it("allows only the owner to complete an open lost item and rejects pending claims", async () => {
    await asUser(alice, () =>
      rpc("submit_report", ["close-lost", report(alice, "lost")]),
    );
    await asUser(bob, () =>
      rpc("submit_report", ["close-found", report(bob, "found")]),
    );
    await asUser(alice, () =>
      rpc("request_claim", [
        "close-found",
        "close-lost",
        "A tiny scratch beside the lid.",
        "owner@example.test",
      ]),
    );
    await expect(
      asUser(bob, () =>
        rpc("manage_own_report", ["close-lost", "complete", {}]),
      ),
    ).rejects.toThrow(/reporter/);
    await asUser(alice, () =>
      rpc("manage_own_report", ["close-lost", "complete", {}]),
    );
    const r = (
      await asUser(bob, () =>
        pg.query<{ payload: any }>(
          "select payload from public.reports where id='close-lost'",
        ),
      )
    ).rows[0].payload;
    expect(r.status).toBe("Completed");
    expect(r.resolvedAt).toBeGreaterThan(0);
    const c = (
      await asUser(bob, () =>
        pg.query<{ status: string }>(
          "select status from public.claims where id='close-found__close-lost'",
        ),
      )
    ).rows[0];
    expect(c.status).toBe("rejected");
    await expect(
      asUser(bob, () =>
        rpc("decide_claim", [
          "close-found__close-lost",
          true,
          "finder@example.test",
        ]),
      ),
    ).rejects.toThrow();
  });
  it("hides deleted reports from every app reader and prevents further writes", async () => {
    await asUser(alice, () =>
      rpc("submit_report", ["to-delete", report(alice, "lost")]),
    );
    await expect(
      asUser(admin, () =>
        rpc("manage_own_report", ["to-delete", "delete", {}]),
      ),
    ).rejects.toThrow();
    await asUser(alice, () =>
      rpc("manage_own_report", ["to-delete", "delete", {}]),
    );
    for (const uid of [alice, bob, admin])
      expect(
        (
          await asUser(uid, () =>
            pg.query("select id from public.reports where id='to-delete'"),
          )
        ).rows,
      ).toHaveLength(0);
    await expect(
      asUser(admin, () => rpc("update_report", ["to-delete", "Assigned", ""])),
    ).rejects.toThrow();
    expect(
      (
        await pg.query<{ deleted_at: number }>(
          "select deleted_at from public.reports where id='to-delete'",
        )
      ).rows[0].deleted_at,
    ).toBeGreaterThan(0);
  });
  it("requires the reporter to choose sharing and validates contact updates", async () => {
    await expect(
      asUser(bob, () =>
        rpc("manage_own_report", [
          "private",
          "details",
          { visibility: "campus" },
        ]),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(alice, () =>
        rpc("manage_own_report", [
          "private",
          "details",
          { contactNumber: "bad" },
        ]),
      ),
    ).rejects.toThrow();
    await asUser(alice, () =>
      rpc("manage_own_report", [
        "private",
        "details",
        {
          contactNumber: "9876543210",
          contactAddress: "IT desk",
          visibility: "campus",
        },
      ]),
    );
    const r = (
      await asUser(bob, () =>
        pg.query<{ payload: any }>(
          "select payload from public.reports where id='private'",
        ),
      )
    ).rows[0].payload;
    expect(r.reporterName).toBe("Alice");
    expect(r.contactAddress).toBe("IT desk");
  });
  it("allows admins to add real campus spaces with unknown initial occupancy", async () => {
    const space = {
      name: "New Computer Lab",
      type: "lab",
      zone: "Learning Centre Block C",
      quiet: true,
    };
    await expect(
      asUser(alice, () => rpc("create_campus_space", ["new-lab", space])),
    ).rejects.toThrow(/Administrator/);
    const created = await asUser(admin, () =>
      rpc("create_campus_space", ["new-lab", space]),
    );
    expect(created.level).toBeNull();
    expect(created.reportCount).toBe(0);
    expect(created.demo).toBe(false);
    expect(
      (
        await asUser(bob, () =>
          pg.query("select id from public.spaces where id='new-lab'"),
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("shares team posts with all students independent of RSVP", async () => {
    await asUser(admin, () =>
      rpc("create_event", [
        "board-event",
        {
          title: "Campus open workshop",
          club: "Coding Club",
          date: Date.now() + 86400000,
          venue: "Main auditorium",
          description:
            "An open workshop for all campus students to form teams.",
          tags: ["Workshop"],
        },
      ]),
    );
    const post = await asUser(alice, () =>
      rpc("create_team_post", [
        "board-post",
        {
          eventId: "board-event",
          kind: "looking",
          skills: ["Frontend"],
          roles: [],
          theme: "Open innovation",
          idea: "Building an inclusive campus resource app.",
        },
      ]),
    );
    expect(post.ownerName).toBe("Alice");
    expect(
      (
        await asUser(bob, () =>
          pg.query("select id from public.team_posts where id='board-post'"),
        )
      ).rows,
    ).toHaveLength(1);
  });
});

describe("owner content edits", () => {
  it("checks report ownership and preserves admin status, timeline and private grievances", async () => {
    await asUser(alice, () =>
      rpc("submit_report", ["edit-own", report(alice, "grievance")]),
    );
    await asUser(admin, () =>
      rpc("update_report", [
        "edit-own",
        "In Progress",
        "Processing the report.",
      ]),
    );
    const input = {
      title: "Updated grievance title",
      description: "Updated details describing the same underlying grievance.",
      location: "Hostel reception",
      contactNumber: "9876543210",
      contactAddress: "Help desk",
      visibility: "campus",
    };
    await expect(
      asUser(bob, () => rpc("edit_own_report", ["edit-own", input])),
    ).rejects.toThrow(/reporter/);
    await expect(
      asUser(admin, () => rpc("edit_own_report", ["edit-own", input])),
    ).rejects.toThrow(/reporter/);
    await expect(
      asUser(alice, () =>
        rpc("edit_own_report", ["edit-own", { ...input, status: "Resolved" }]),
      ),
    ).rejects.toThrow();
    const r = await asUser(alice, () =>
      rpc("edit_own_report", ["edit-own", input]),
    );
    expect(r.title).toBe(input.title);
    expect(r.status).toBe("In Progress");
    expect(r.visibility).toBe("private");
    expect(r.timeline).toHaveLength(2);
    expect(r.comments).toHaveLength(1);
    expect(r.ownerUid).toBe(alice);
    await asUser(alice, () =>
      rpc("manage_own_report", ["edit-own", "delete", {}]),
    );
    await expect(
      asUser(alice, () => rpc("edit_own_report", ["edit-own", input])),
    ).rejects.toThrow();
  });
  it("checks team post ownership, event identity, and end time", async () => {
    await asUser(admin, () =>
      rpc("create_event", [
        "editing-event",
        {
          title: "Campus editing workshop",
          club: "Coding Club",
          date: Date.now() + 86400000,
          venue: "Main hall",
          description:
            "An upcoming workshop for students forming campus project teams.",
          tags: ["Workshop"],
        },
      ]),
    );
    await asUser(alice, () =>
      rpc("create_team_post", [
        "editing-post",
        {
          eventId: "editing-event",
          kind: "looking",
          skills: ["Frontend"],
          roles: [],
          theme: "Open innovation",
          idea: "An initial idea for our campus team project.",
        },
      ]),
    );
    const input = {
      eventId: "editing-event",
      kind: "looking",
      skills: ["Frontend"],
      roles: [],
      theme: "Open innovation",
      idea: "Updated details for a campus project team.",
    };
    await expect(
      asUser(bob, () => rpc("edit_team_post", ["editing-post", input])),
    ).rejects.toThrow(/author/);
    await expect(
      asUser(alice, () =>
        rpc("edit_team_post", [
          "editing-post",
          { ...input, eventId: "elsewhere" },
        ]),
      ),
    ).rejects.toThrow(/move/);
    const r = await asUser(alice, () =>
      rpc("edit_team_post", ["editing-post", input]),
    );
    expect(r.idea).toBe(input.idea);
    expect(r.ownerUid).toBe(alice);
    await pg.exec(
      "update public.events set payload=payload||jsonb_build_object('date',1) where id='editing-event'",
    );
    await expect(
      asUser(alice, () => rpc("edit_team_post", ["editing-post", input])),
    ).rejects.toThrow(/closed/);
  });
});
