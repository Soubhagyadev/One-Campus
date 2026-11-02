import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
let pg: PGlite;
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222",
  admin = "33333333-3333-4333-8333-333333333333";
let seq = 0;
const id = () => `c0000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
async function as<T>(
  uid: string | null,
  work: () => Promise<T>,
  role = "authenticated",
) {
  await pg.exec("begin");
  try {
    await pg.exec(`set local role ${role}`);
    await pg.query("select set_config('request.jwt.claim.sub',$1,true)", [
      uid || "",
    ]);
    const r = await work();
    await pg.exec("commit");
    return r;
  } catch (e) {
    await pg.exec("rollback");
    throw e;
  }
}
async function rpc(name: string, args: unknown[] = []) {
  return (
    await pg.query<{ r: any }>(
      `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) r`,
      args,
    )
  ).rows[0].r;
}
const listing = {
  title: "Computer Networks textbook",
  description:
    "A clean textbook in good condition, available near the library.",
  category: "Textbooks",
  price: 350,
  contact: "9876543210",
  images: [],
};
async function openLunch() {
  await pg.exec(
    `update public.meal_services set enabled=true,start_minute=(extract(hour from statement_timestamp() at time zone 'Asia/Kolkata')::int*60+extract(minute from statement_timestamp() at time zone 'Asia/Kolkata')::int+1439)%1440,end_minute=(extract(hour from statement_timestamp() at time zone 'Asia/Kolkata')::int*60+extract(minute from statement_timestamp() at time zone 'Asia/Kolkata')::int+30)%1440 where category='Lunch'`,
  );
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pg.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await pg.query(
    `insert into auth.users(id,email,raw_user_meta_data) values($1,'alice@example.test','{"name":"Alice"}'),($2,'bob@example.test','{"name":"Bob"}'),($3,'admin@example.test','{"name":"Admin"}')`,
    [alice, bob, admin],
  );
  await pg.query("update public.profiles set role='admin' where id=$1", [
    admin,
  ]);
}, 30000);
afterAll(async () => {
  await pg?.close();
});
describe("Marketplace and Food Court database authorization", () => {
  it("publishes immediately with server-owned seller identity", async () => {
    const key = id();
    const row = await as(alice, () =>
      rpc("post_marketplace_listing", [key, listing]),
    );
    expect(row.status).toBe("available");
    expect(row.seller_id).toBe(alice);
    expect(row.seller_name).toBe("Alice");
    expect(
      (
        await as(bob, () =>
          pg.query("select id from public.marketplace_listings where id=$1", [
            key,
          ]),
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      as(alice, () =>
        rpc("post_marketplace_listing", [id(), { ...listing, seller_id: bob }]),
      ),
    ).rejects.toThrow();
  });
  it("validates prices, contacts and photos on the server", async () => {
    for (const extra of [
      { price: -1 },
      { price: 10.123 },
      { contact: "555" },
      { images: ["https://tracking.invalid/photo"] },
      { images: Array(4).fill("data:image/jpeg;base64,YQ==") },
    ])
      await expect(
        as(alice, () =>
          rpc("post_marketplace_listing", [id(), { ...listing, ...extra }]),
        ),
      ).rejects.toThrow();
  });
  it("blocks anonymous reads and direct writes", async () => {
    for (const table of [
      "marketplace_listings",
      "meal_services",
      "food_items",
      "food_orders",
    ])
      await expect(
        as(null, () => pg.query(`select * from public.${table}`), "anon"),
      ).rejects.toThrow();
    await expect(
      as(alice, () =>
        pg.query("update public.meal_services set enabled=false"),
      ),
    ).rejects.toThrow();
    await expect(
      as(alice, () => pg.query("delete from public.marketplace_listings")),
    ).rejects.toThrow();
  });
  it("lets admins remove posts with a reason and hides them from other buyers", async () => {
    const key = id();
    await as(alice, () => rpc("post_marketplace_listing", [key, listing]));
    await expect(
      as(bob, () => rpc("change_marketplace_listing", [key, "removed", ""])),
    ).rejects.toThrow();
    await expect(
      as(admin, () => rpc("change_marketplace_listing", [key, "removed", ""])),
    ).rejects.toThrow();
    await as(admin, () =>
      rpc("change_marketplace_listing", [key, "removed", "Suspected spam"]),
    );
    expect(
      (
        await as(bob, () =>
          pg.query("select * from public.marketplace_listings where id=$1", [
            key,
          ]),
        )
      ).rows,
    ).toHaveLength(0);
    const own = await as(alice, () =>
      pg.query<{ removal_reason: string }>(
        "select removal_reason from public.marketplace_listings where id=$1",
        [key],
      ),
    );
    expect(own.rows[0].removal_reason).toBe("Suspected spam");
    await expect(
      as(alice, () => rpc("change_marketplace_listing", [key, "sold", ""])),
    ).rejects.toThrow();
  });
  it("lets only the seller mark a listing sold", async () => {
    const key = id();
    await as(alice, () => rpc("post_marketplace_listing", [key, listing]));
    await expect(
      as(admin, () => rpc("change_marketplace_listing", [key, "sold", ""])),
    ).rejects.toThrow();
    expect(
      (
        await as(alice, () =>
          rpc("change_marketplace_listing", [key, "sold", ""]),
        )
      ).status,
    ).toBe("sold");
  });
  it("restricts kitchen controls to admins and keeps exact meal prices", async () => {
    await expect(
      as(alice, () => rpc("save_meal_service", ["Lunch", 720, 870, true])),
    ).rejects.toThrow();
    await expect(
      as(admin, () => rpc("save_meal_service", ["Lunch", 720, 720, true])),
    ).rejects.toThrow();
    await expect(
      as(alice, () =>
        rpc("save_food_item", [
          id(),
          "Lunch",
          "Rice",
          "Steamed white rice",
          true,
        ]),
      ),
    ).rejects.toThrow();
    await as(admin, () => rpc("save_meal_service", ["Lunch", 720, 870, true]));
    const rows = (
      await as(alice, () =>
        pg.query<{ price: number; category: string }>(
          "select category,price from public.meal_services",
        ),
      )
    ).rows;
    expect(Object.fromEntries(rows.map((r) => [r.category, r.price]))).toEqual({
      Breakfast: 60,
      Lunch: 100,
      Snacks: 60,
      Dinner: 100,
    });
  });
  it("hides closed menus from students and rejects closed orders", async () => {
    await pg.exec(
      "update public.meal_services set enabled=false where category='Lunch'",
    );
    expect(
      (
        await as(alice, () =>
          pg.query("select * from public.food_items where category='Lunch'"),
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await as(admin, () =>
          pg.query("select * from public.food_items where category='Lunch'"),
        )
      ).rows.length,
    ).toBeGreaterThan(0);
    await expect(
      as(alice, () => rpc("prepare_food_order", [id(), "Lunch"])),
    ).rejects.toThrow(/closed/);
    await openLunch();
  });
  it("snapshots server identity, price and menu, supports idempotency, and protects orders", async () => {
    await openLunch();
    const key = id();
    const o = await as(alice, () => rpc("prepare_food_order", [key, "Lunch"]));
    expect(o.amount).toBe(100);
    expect(o.student_name).toBe("Alice");
    expect(o.student_email).toBe("alice@example.test");
    expect(o.items.length).toBeGreaterThan(0);
    expect(o.payment_status).toBe("pending");
    expect(
      (await as(alice, () => rpc("prepare_food_order", [key, "Lunch"]))).id,
    ).toBe(key);
    await expect(
      as(bob, () => rpc("prepare_food_order", [key, "Lunch"])),
    ).rejects.toThrow();
    expect(
      (
        await as(bob, () =>
          pg.query("select * from public.food_orders where id=$1", [key]),
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      as(alice, () =>
        pg.query(
          "update public.food_orders set payment_status='mock_paid' where id=$1",
          [key],
        ),
      ),
    ).rejects.toThrow();
  });
  it("makes successful mock payment idempotent and preserves historical receipts after menu edits", async () => {
    await openLunch();
    const key = id();
    const o = await as(alice, () => rpc("prepare_food_order", [key, "Lunch"]));
    await expect(
      as(bob, () => rpc("pay_food_order", [key, true])),
    ).rejects.toThrow();
    const paid = await as(alice, () => rpc("pay_food_order", [key, true]));
    expect(paid.transaction_id).toMatch(/^DEMO-/);
    expect(paid.paid_at).toBeGreaterThan(0);
    expect(
      (await as(alice, () => rpc("pay_food_order", [key, true])))
        .transaction_id,
    ).toBe(paid.transaction_id);
    const item = o.items[0];
    await as(admin, () =>
      rpc("save_food_item", [
        item.id,
        "Lunch",
        "Updated menu",
        "A different description",
        false,
      ]),
    );
    expect(
      (await as(alice, () => rpc("pay_food_order", [key, true]))).items,
    ).toEqual(o.items);
    await as(admin, () =>
      rpc("save_food_item", [
        item.id,
        "Lunch",
        item.name,
        item.description,
        true,
      ]),
    );
  });
  it("cancels declined payments and issues no transaction or receipt", async () => {
    await openLunch();
    const key = id();
    await as(alice, () => rpc("prepare_food_order", [key, "Lunch"]));
    const cancelled = await as(alice, () =>
      rpc("pay_food_order", [key, false]),
    );
    expect(cancelled.payment_status).toBe("cancelled");
    expect(cancelled.transaction_id).toBeNull();
    await expect(
      as(alice, () => rpc("pay_food_order", [key, true])),
    ).rejects.toThrow(/cancelled/);
  });
  it("rejects expired or newly closed checkouts", async () => {
    await openLunch();
    const key = id();
    await as(alice, () => rpc("prepare_food_order", [key, "Lunch"]));
    await pg.query(
      "update public.food_orders set created_at=created_at-600001 where id=$1",
      [key],
    );
    await expect(
      as(alice, () => rpc("pay_food_order", [key, true])),
    ).rejects.toThrow(/expired/);
    const next = id();
    await as(alice, () => rpc("prepare_food_order", [next, "Lunch"]));
    await pg.exec(
      "update public.meal_services set enabled=false where category='Lunch'",
    );
    await expect(
      as(alice, () => rpc("pay_food_order", [next, true])),
    ).rejects.toThrow(/closed/);
    await openLunch();
  });
  it("allows only admins to mark a paid receipt collected, idempotently", async () => {
    await openLunch();
    const key = id();
    await as(alice, () => rpc("prepare_food_order", [key, "Lunch"]));
    await expect(
      as(admin, () => rpc("collect_food_order", [key])),
    ).rejects.toThrow();
    await as(alice, () => rpc("pay_food_order", [key, true]));
    await expect(
      as(alice, () => rpc("collect_food_order", [key])),
    ).rejects.toThrow();
    const collected = await as(admin, () => rpc("collect_food_order", [key]));
    expect(collected.collected_at).toBeGreaterThan(0);
    expect(
      (await as(admin, () => rpc("collect_food_order", [key]))).collected_at,
    ).toBe(collected.collected_at);
  });
  it("deletes food items without changing earlier receipts", async () => {
    const key = id();
    const item = await as(admin, () =>
      rpc("save_food_item", [
        key,
        "Snacks",
        "Test snack",
        "Fresh campus snack",
        true,
      ]),
    );
    expect(item.name).toBe("Test snack");
    await expect(
      as(bob, () => rpc("remove_food_item", [key])),
    ).rejects.toThrow();
    await as(admin, () => rpc("remove_food_item", [key]));
    expect(
      (
        await as(admin, () =>
          pg.query("select * from public.food_items where id=$1", [key]),
        )
      ).rows,
    ).toHaveLength(0);
  });
});
