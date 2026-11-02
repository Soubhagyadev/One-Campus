// Direct Gemini REST API chat service for the student campus assistant.
// Uses VITE_GEMINI_API_KEY — no Firebase required.
// Fetches live context from Supabase (events, food, spaces, marketplace) when signed in.

import { supabase as db, unpack } from "./supabase";
import type { CampusEvent } from "@/lib/community";
import type { MealService, FoodItem, Listing } from "@/lib/commerce";
import type { Space } from "@/lib/types";
import { mealOpen, timeLabel, PRICES } from "@/lib/commerce";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY?.trim() || "";
const MODEL = "gemini-3.5-flash-lite";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

export const chatEnabled = Boolean(API_KEY);

const SYSTEM_PROMPT = `You are CampusBot, a friendly and helpful assistant for students at Alliance University, Bengaluru, built into the OneCampus app. You answer questions about campus life and the app's features clearly and concisely.

Here is everything you know about the OneCampus app and campus:

## CampusPulse
- Students can check how crowded any library or lab space is (Free / Moderate / Crowded).
- You can vote on the crowd level for any space — your vote expires after 20 minutes.
- The app shows the best upcoming hour to visit a space based on the last 7 days of history.
- Spaces are categorized as library or lab, with zones and quiet/group use labels.

## Reporting (Reports page)
- Students can submit four types of reports: Issue, Grievance, Lost item, Found item.
- Issues can be shared on the campus board or kept private. Grievances are always private.
- After submitting, AI automatically routes your report to the right department with a priority and deadline.
- Deadlines: High priority = 24 hours, Medium = 72 hours, Low = 7 days.
- You can track your report's progress (Submitted → Assigned → In Progress → Resolved).
- You can edit your own report (title, description, location, contact details, visibility).
- Lost & Found: The app suggests possible matches from open lost-item reports. Contacts are only shared after the finder approves a claim.

## Events & Teams (Events page)
- Browse upcoming club events: Innovation & Entrepreneurship Cell, Coding Club, Literary Society, Photography Club, Environment Club, Cultural Committee.
- RSVP to events you want to attend.
- Post a team request — "Looking for a team" or "Team needs members" — with your skills, roles needed, and idea theme.
- The Campus Team Board shows all team requests across all upcoming events.
- Skills: Frontend, Backend, UI/UX design, Research, Presentation, Data analysis, Writing, Photography, Event planning.

## Marketplace
- Buy and sell items with other students: Textbooks, Electronics, Stationery, and more.
- Post a listing with title, description, price, contact number, and up to 3 photos.
- Listings go live immediately. You can edit, mark sold, or remove anytime.
- Contact the seller directly using their provided phone number.

## Food Court
- Four meals with fixed prices: Breakfast ₹60, Lunch ₹100, Snacks ₹60, Dinner ₹100.
- Default serving windows (IST): Breakfast 7–10 AM, Lunch 12–2:30 PM, Snacks 4–6 PM, Dinner 7–9:30 PM.
- You can only order during the meal's serving window.
- Payment is a simulated UPI flow — no real money is charged. Generates a DEMO- transaction ID.
- View and download receipts under "My orders & receipts".

## Wellness (Private)
- Log your mood daily (1–5) with optional tags (exams, sleep, homesick, workload, other).
- Private note stays only on your device, never uploaded.
- Distress phrase detection surfaces the Tele-MANAS support helpline.
- One check-in per day per account.

## Accounts & Login
- Sign up with email + password (min 8 chars), confirm email, then sign in.
- Google sign-in also available.
- New accounts are always students.

Keep answers short and friendly. Use the live campus data below when answering specific questions about current events, open meals, spaces, or listings. If asked about something outside the app or campus, politely redirect.`;

export type ChatMessage = {
  role: "user" | "model";
  text: string;
};

// Fetch live data from Supabase to give the bot real-time context
async function fetchLiveContext(): Promise<string> {
  if (!db) return "";
  try {
    const now = Date.now();
    const [eventsRes, servicesRes, itemsRes, spacesRes, listingsRes] =
      await Promise.all([
        db.from("events").select("id,payload").order("id").limit(50),
        db.from("meal_services").select("*"),
        db.from("food_items").select("*").eq("available", true),
        db.from("spaces").select("id,payload").order("id"),
        db
          .from("marketplace_listings")
          .select("*")
          .eq("status", "available")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    const lines: string[] = ["\n\n--- LIVE CAMPUS DATA (right now) ---"];

    // Upcoming events
    const events = (eventsRes.data || [])
      .map((r) => unpack<CampusEvent>(r))
      .filter((e) => e.date > now)
      .sort((a, b) => a.date - b.date)
      .slice(0, 10);
    lines.push("\n## Upcoming Events");
    if (events.length) {
      events.forEach((e) => {
        const date = new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(e.date));
        lines.push(
          `- ${e.title} | ${e.club} | ${date} | Venue: ${e.venue} | RSVPs: ${e.rsvpCount}`,
        );
      });
    } else {
      lines.push("No upcoming events scheduled.");
    }

    // Food court status
    const services = (servicesRes.data || []) as MealService[];
    const items = (itemsRes.data || []) as FoodItem[];
    lines.push("\n## Food Court — Right Now");
    if (services.length) {
      services.forEach((s) => {
        const open = mealOpen(s, now);
        const mealItems = items
          .filter((i) => i.category === s.category)
          .map((i) => i.name)
          .join(", ");
        lines.push(
          `- ${s.category}: ₹${PRICES[s.category]} | ${timeLabel(s.start_minute)}–${timeLabel(s.end_minute)} | ${open ? "OPEN NOW" : "Closed"} | Items: ${mealItems || "none listed"}`,
        );
      });
    } else {
      lines.push("Food court data unavailable.");
    }

    // Campus spaces
    const spaces = (spacesRes.data || []).map((r) => unpack<Space>(r));
    lines.push("\n## Campus Spaces");
    if (spaces.length) {
      spaces.forEach((s) => {
        const level = s.level
          ? s.level.charAt(0).toUpperCase() + s.level.slice(1)
          : "Unknown";
        lines.push(
          `- ${s.name} (${s.type}, ${s.zone}) | Crowd: ${level} | ${s.quiet ? "Quiet study" : "Group friendly"}`,
        );
      });
    } else {
      lines.push("No spaces data available.");
    }

    // Marketplace listings
    lines.push("\n## Marketplace — Available Now");
    if (listingsRes.data && listingsRes.data.length) {
      (listingsRes.data as Listing[]).slice(0, 10).forEach((l) => {
        lines.push(
          `- ${l.title} | ₹${l.price} | ${l.category} | Seller: ${l.seller_name} | Contact: ${l.contact}`,
        );
      });
    } else {
      lines.push("No listings available right now.");
    }

    lines.push("\n--- END OF LIVE DATA ---");
    return lines.join("\n");
  } catch {
    // Silently fall back to static knowledge if fetch fails
    return "";
  }
}

export async function sendMessage(
  history: ChatMessage[],
  userText: string,
): Promise<string> {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");

  const liveContext = await fetchLiveContext();
  const systemWithContext = SYSTEM_PROMPT + liveContext;

  const contents: { role: string; parts: { text: string }[] }[] = [
    { role: "user", parts: [{ text: systemWithContext }] },
    {
      role: "model",
      parts: [
        {
          text: "Got it! I'm CampusBot, ready to help Alliance University students with live campus info and anything about the OneCampus app.",
        },
      ],
    },
    ...history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: "user", parts: [{ text: userText }] },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: 512, temperature: 0.7 },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        (err as { error?: { message?: string } }).error?.message ||
          `API error ${res.status}`,
      );
    }

    const data = await res.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) throw new Error("Empty response from Gemini.");
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}
