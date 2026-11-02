import { z } from "zod";
export const MARKET_CATEGORIES = [
  "Textbooks",
  "Electronics",
  "Stationery",
  "Other",
] as const;
export const MEALS = ["Breakfast", "Lunch", "Snacks", "Dinner"] as const;
export type MealCategory = (typeof MEALS)[number];
export const PRICES: Record<MealCategory, number> = {
  Breakfast: 60,
  Lunch: 100,
  Snacks: 60,
  Dinner: 100,
};
export const listingSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(2000),
  category: z.enum(MARKET_CATEGORIES),
  price: z
    .number()
    .min(0)
    .max(100000)
    .refine(
      (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001,
      "Use at most two decimal places",
    ),
  contact: z
    .string()
    .trim()
    .regex(
      /^\+?[0-9]{10,15}$/,
      "Enter 10–15 digits, optionally starting with +",
    ),
  images: z
    .array(
      z
        .string()
        .max(280000)
        .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
    )
    .max(3),
});
export type ListingDraft = z.infer<typeof listingSchema>;
export type Listing = ListingDraft & {
  id: string;
  seller_id: string;
  seller_name: string;
  status: "available" | "sold" | "removed";
  removal_reason: string;
  created_at: number;
  updated_at: number;
};
export type MealService = {
  category: MealCategory;
  price: number;
  start_minute: number;
  end_minute: number;
  enabled: boolean;
};
export const foodSchema = z.object({
  id: z.uuid(),
  category: z.enum(MEALS),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(3).max(500),
  available: z.boolean(),
});
export type FoodItem = z.infer<typeof foodSchema>;
export type FoodOrder = {
  id: string;
  user_id: string;
  student_name: string;
  student_email: string;
  category: MealCategory;
  items: Pick<FoodItem, "id" | "name" | "description">[];
  amount: number;
  payment_status: "pending" | "mock_paid" | "cancelled";
  transaction_id: string | null;
  created_at: number;
  paid_at: number | null;
  collected_at: number | null;
};
export const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
export function campusMinute(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  return (
    Number(parts.find((p) => p.type === "hour")?.value) * 60 +
    Number(parts.find((p) => p.type === "minute")?.value)
  );
}
export function mealOpen(s: MealService, now = Date.now()) {
  const m = campusMinute(now);
  return (
    s.enabled &&
    s.start_minute !== s.end_minute &&
    (s.start_minute < s.end_minute
      ? m >= s.start_minute && m < s.end_minute
      : m >= s.start_minute || m < s.end_minute)
  );
}
export const timeInput = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const fromTime = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
export function timeLabel(m: number) {
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
export const when = (n: number) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(n));
export function defaultMeals(): MealService[] {
  return MEALS.map((category, i) => ({
    category,
    price: PRICES[category],
    start_minute: [420, 720, 960, 1140][i],
    end_minute: [600, 870, 1080, 1290][i],
    enabled: true,
  }));
}
export function defaultFood(): FoodItem[] {
  return [
    [
      "Breakfast",
      "Idli & sambar",
      "Steamed idlis, vegetable sambar and coconut chutney.",
    ],
    ["Breakfast", "Fresh fruit & tea", "Seasonal fruit and a cup of tea."],
    ["Lunch", "Campus thali", "Rice, roti, dal, vegetables and curd."],
    ["Snacks", "Samosa & tea", "Vegetable samosas, chutney and tea."],
    [
      "Dinner",
      "Roti, rice & curry",
      "Fresh rotis, rice, dal and vegetable curry.",
    ],
  ].map(([category, name, description], i) => ({
    id: `b0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    category: category as MealCategory,
    name,
    description,
    available: true,
  }));
}
