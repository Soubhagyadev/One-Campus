import { supabase as db, callRpc, watch } from "./supabase";
import {
  defaultFood,
  defaultMeals,
  foodSchema,
  listingSchema,
  mealOpen,
} from "@/lib/commerce";
import type {
  Listing,
  ListingDraft,
  MealService,
  FoodItem,
  FoodOrder,
  MealCategory,
} from "@/lib/commerce";
import type { Profile } from "@/lib/types";
const KEY = "onecampus.commerce.v1";
type Local = {
  listings: Listing[];
  services: MealService[];
  items: FoodItem[];
  orders: FoodOrder[];
};
function read(): Local {
  const raw = localStorage.getItem(KEY);
  if (raw) return JSON.parse(raw);
  const data: Local = {
    listings: [
      {
        id: "a0000000-0000-4000-8000-000000000001",
        seller_id: "demo-finder",
        seller_name: "Meera",
        title: "Introduction to Algorithms",
        description:
          "Third edition in good condition. A few useful pencil notes. Collect near the library.",
        category: "Textbooks",
        price: 450,
        contact: "9999999999",
        images: [],
        status: "available",
        removal_reason: "",
        created_at: Date.now() - 3600000,
        updated_at: Date.now() - 3600000,
      },
    ],
    services: defaultMeals(),
    items: defaultFood(),
    orders: [],
  };
  save(data);
  return data;
}
function save(data: Local) {
  localStorage.setItem(KEY, JSON.stringify(data));
  window.dispatchEvent(new Event("commerce-change"));
}
function localWatch<T>(
  load: () => T,
  next: (v: T) => void,
  error: (e: Error) => void,
) {
  const emit = () => {
    try {
      next(load());
    } catch (e) {
      error(e as Error);
    }
  };
  emit();
  window.addEventListener("commerce-change", emit);
  window.addEventListener("storage", emit);
  const t = setInterval(emit, 30000);
  return () => {
    clearInterval(t);
    window.removeEventListener("commerce-change", emit);
    window.removeEventListener("storage", emit);
  };
}
export function listenListings(
  user: Profile,
  next: (v: Listing[]) => void,
  error: (e: Error) => void,
) {
  if (!db)
    return localWatch(
      () =>
        read()
          .listings.filter(
            (l) =>
              l.status === "available" ||
              l.seller_id === user.uid ||
              user.role === "admin",
          )
          .sort((a, b) => b.created_at - a.created_at),
      next,
      error,
    );
  return watch(
    [{ table: "marketplace_listings" }],
    async () => {
      const { data, error } = await db!
        .from("marketplace_listings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data as Listing[];
    },
    next,
    error,
  );
}
export async function postListing(user: Profile, input: ListingDraft) {
  const data = listingSchema.parse(input),
    id = crypto.randomUUID();
  if (db)
    return callRpc<Listing>("post_marketplace_listing", {
      p_id: id,
      p_data: data,
    });
  const local = read(),
    t = Date.now(),
    listing: Listing = {
      ...data,
      id,
      seller_id: user.uid,
      seller_name: user.name,
      status: "available",
      removal_reason: "",
      created_at: t,
      updated_at: t,
    };
  local.listings.unshift(listing);
  save(local);
  return listing;
}
export async function changeListing(
  user: Profile,
  id: string,
  status: "sold" | "removed",
  reason = "",
) {
  if (db)
    return callRpc<Listing>("change_marketplace_listing", {
      p_id: id,
      p_status: status,
      p_reason: reason,
    });
  const local = read(),
    row = local.listings.find((l) => l.id === id);
  if (!row || (row.seller_id !== user.uid && user.role !== "admin"))
    throw new Error("Listing not accessible.");
  if (row.status !== "available")
    throw new Error("This listing is no longer available.");
  if (status === "sold" && row.seller_id !== user.uid)
    throw new Error("Only the seller can mark an item sold.");
  if (
    user.role === "admin" &&
    status === "removed" &&
    (reason.trim().length < 3 || reason.trim().length > 300)
  )
    throw new Error("Add a removal reason (3–300 characters).");
  row.status = status;
  row.updated_at = Date.now();
  row.removal_reason = user.role === "admin" ? reason.trim() : "";
  save(local);
  return row;
}
export type FoodData = {
  services: MealService[];
  items: FoodItem[];
  orders: FoodOrder[];
};
export function listenFood(
  user: Profile,
  next: (v: FoodData) => void,
  error: (e: Error) => void,
) {
  if (!db)
    return localWatch(
      () => {
        const d = read();
        return {
          services: d.services,
          items: d.items.filter(
            (i) =>
              user.role === "admin" ||
              (i.available &&
                d.services.some(
                  (s) => s.category === i.category && mealOpen(s),
                )),
          ),
          orders: d.orders
            .filter((o) => o.user_id === user.uid || user.role === "admin")
            .sort((a, b) => b.created_at - a.created_at),
        };
      },
      next,
      error,
    );
  return watch(
    [
      { table: "meal_services" },
      { table: "food_items" },
      { table: "food_orders" },
    ],
    async () => {
      const responses = await Promise.all([
        db!.from("meal_services").select("*"),
        db!.from("food_items").select("*"),
        db!
          .from("food_orders")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);
      for (const r of responses) if (r.error) throw r.error;
      return {
        services: responses[0].data as MealService[],
        items: responses[1].data as FoodItem[],
        orders: responses[2].data as FoodOrder[],
      };
    },
    next,
    error,
  );
}
function requireAdmin(user: Profile) {
  if (user.role !== "admin") throw new Error("Admin access required.");
}
export async function saveService(user: Profile, input: MealService) {
  requireAdmin(user);
  if (
    !Number.isInteger(input.start_minute) ||
    !Number.isInteger(input.end_minute) ||
    input.start_minute < 0 ||
    input.end_minute < 0 ||
    input.start_minute > 1439 ||
    input.end_minute > 1439 ||
    input.start_minute === input.end_minute
  )
    throw new Error("Choose valid, different start and end times.");
  if (db)
    return callRpc("save_meal_service", {
      p_category: input.category,
      p_start: input.start_minute,
      p_end: input.end_minute,
      p_enabled: input.enabled,
    });
  const local = read();
  local.services = local.services.map((s) =>
    s.category === input.category
      ? {
          ...s,
          start_minute: input.start_minute,
          end_minute: input.end_minute,
          enabled: input.enabled,
        }
      : s,
  );
  save(local);
}
export async function saveFood(user: Profile, input: FoodItem) {
  requireAdmin(user);
  const item = foodSchema.parse(input);
  if (db)
    return callRpc<FoodItem>("save_food_item", {
      p_id: item.id,
      p_category: item.category,
      p_name: item.name,
      p_description: item.description,
      p_available: item.available,
    });
  const local = read(),
    existing = local.items.find((i) => i.id === item.id);
  if (existing && existing.category !== item.category)
    throw new Error("Create a new item to move it between meals.");
  local.items = local.items.filter((i) => i.id !== item.id);
  local.items.push(item);
  save(local);
  return item;
}
export async function removeFood(user: Profile, id: string) {
  requireAdmin(user);
  if (db) return callRpc("remove_food_item", { p_id: id });
  const local = read();
  local.items = local.items.filter((i) => i.id !== id);
  save(local);
}
export async function prepareOrder(
  user: Profile,
  category: MealCategory,
  id: string,
) {
  if (db)
    return callRpc<FoodOrder>("prepare_food_order", {
      p_id: id,
      p_category: category,
    });
  const local = read(),
    existing = local.orders.find((o) => o.id === id);
  if (existing) {
    if (existing.user_id !== user.uid) throw new Error("Order not accessible.");
    return existing;
  }
  const s = local.services.find((s) => s.category === category),
    items = local.items.filter((i) => i.category === category && i.available);
  if (!s || !mealOpen(s))
    throw new Error(
      "This meal is closed. Please order during its serving time.",
    );
  if (!items.length) throw new Error("No food is available for this meal yet.");
  const order: FoodOrder = {
    id,
    user_id: user.uid,
    student_name: user.name,
    student_email: "Local demo account",
    category,
    items: items.map(({ id, name, description }) => ({
      id,
      name,
      description,
    })),
    amount: s.price,
    payment_status: "pending",
    transaction_id: null,
    created_at: Date.now(),
    paid_at: null,
    collected_at: null,
  };
  local.orders.unshift(order);
  save(local);
  return order;
}
export async function payOrder(user: Profile, id: string, success: boolean) {
  if (db)
    return callRpc<FoodOrder>("pay_food_order", {
      p_id: id,
      p_success: success,
    });
  const local = read(),
    o = local.orders.find((o) => o.id === id);
  if (!o || o.user_id !== user.uid) throw new Error("Order not accessible.");
  if (o.payment_status === "mock_paid") return o;
  if (o.payment_status !== "pending")
    throw new Error("This order was cancelled. Start a new order.");
  if (success) {
    const s = local.services.find((s) => s.category === o.category);
    if (Date.now() - o.created_at >= 600000 || !s || !mealOpen(s))
      throw new Error(
        "Checkout expired or meal closed. Start a new order during serving hours.",
      );
    o.payment_status = "mock_paid";
    o.transaction_id = "DEMO-" + crypto.randomUUID();
    o.paid_at = Date.now();
  } else o.payment_status = "cancelled";
  save(local);
  return o;
}
export async function collectOrder(user: Profile, id: string) {
  requireAdmin(user);
  if (db) return callRpc<FoodOrder>("collect_food_order", { p_id: id });
  const local = read(),
    o = local.orders.find((o) => o.id === id);
  if (!o || o.payment_status !== "mock_paid")
    throw new Error("Only a paid demo receipt can be collected.");
  o.collected_at ??= Date.now();
  save(local);
  return o;
}
