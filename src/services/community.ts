import { supabase as db, callRpc, watch, unpack } from "./supabase";
import { communityDemo } from "@/data/communitySeed";
import { eventSchema, teamSchema } from "@/lib/community";
import type {
  CampusEvent,
  EventDraft,
  TeamDraft,
  TeamPost,
} from "@/lib/community";
import type { Profile } from "@/lib/types";
const KEY = "onecampus.community.v3";
type Local = ReturnType<typeof communityDemo>;
export function readCommunity(): Local {
  const raw = localStorage.getItem(KEY);
  if (raw) return JSON.parse(raw);
  const data = communityDemo();
  localStorage.setItem(KEY, JSON.stringify(data));
  return data;
}
function save(data: Local) {
  localStorage.setItem(KEY, JSON.stringify(data));
  window.dispatchEvent(new Event("community-change"));
}
function localWatch(emit: () => void) {
  emit();
  window.addEventListener("community-change", emit);
  window.addEventListener("storage", emit);
  return () => {
    window.removeEventListener("community-change", emit);
    window.removeEventListener("storage", emit);
  };
}
export function listenEvents(
  next: (events: CampusEvent[]) => void,
  error: (e: Error) => void,
) {
  if (!db)
    return localWatch(() => {
      try {
        next(readCommunity().events.sort((a, b) => a.date - b.date));
      } catch (e) {
        error(e as Error);
      }
    });
  return watch(
    [{ table: "events" }],
    async () => {
      const { data, error } = await db!.from("events").select("id,payload");
      if (error) throw error;
      return (data || [])
        .map((r) => unpack<CampusEvent>(r))
        .sort((a, b) => a.date - b.date);
    },
    next,
    error,
  );
}

export async function clubLead(user: Profile): Promise<string | null> {
  if (user.role === "admin") return "*";
  if (!db) return user.uid === "demo-finder" ? "Coding Club" : null;
  const { data, error } = await db!
    .from("club_leads")
    .select("club")
    .eq("user_id", user.uid)
    .maybeSingle();
  if (error) throw error;
  return data?.club ?? null;
}

export async function createEvent(user: Profile, input: EventDraft) {
  const data = eventSchema.parse(input);
  if (data.date <= Date.now())
    throw new Error("Choose a future date and time.");
  const lead = await clubLead(user);
  if (lead !== "*" && lead !== data.club)
    throw new Error(
      "Only an admin or this club’s designated lead can create its events.",
    );
  const event: CampusEvent = {
    ...data,
    id: crypto.randomUUID(),
    ownerUid: user.uid,
    createdAt: Date.now(),
    rsvpCount: 0,
    demo: !db,
  };
  if (!db) {
    const local = readCommunity();
    local.events.push(event);
    local.rsvps[event.id] = [];
    save(local);
  } else {
    return callRpc<CampusEvent>("create_event", {
      p_id: event.id,
      p_event: data,
    });
  }
  return event;
}
export function listenRsvp(
  user: Profile,
  eventId: string,
  next: (value: boolean) => void,
  error: (e: Error) => void,
) {
  if (!db)
    return localWatch(() =>
      next((readCommunity().rsvps[eventId] || []).includes(user.uid)),
    );
  return watch(
    [{ table: "event_rsvps", filter: "user_id=eq." + user.uid }],
    async () => {
      const { data, error } = await db!
        .from("event_rsvps")
        .select("active")
        .eq("event_id", eventId)
        .eq("user_id", user.uid)
        .maybeSingle();
      if (error) throw error;
      return data?.active === true;
    },
    next,
    error,
  );
}

export async function setRsvp(user: Profile, eventId: string, active: boolean) {
  if (!db) {
    const data = readCommunity(),
      event = data.events.find((e) => e.id === eventId);
    if (!event || event.date <= Date.now())
      throw new Error("RSVP is closed for this event.");
    const users = (data.rsvps[eventId] ??= []);
    const before = users.includes(user.uid);
    data.rsvps[eventId] = active
      ? [...new Set([...users, user.uid])]
      : users.filter((uid) => uid !== user.uid);
    event.rsvpCount = Math.max(
      0,
      event.rsvpCount + (before === active ? 0 : active ? 1 : -1),
    );
    save(data);
    return;
  }
  await callRpc("set_event_rsvp", { p_event_id: eventId, p_active: active });
}

export function listenTeams(
  eventId: string | null,
  next: (posts: TeamPost[]) => void,
  error: (e: Error) => void,
) {
  if (!db)
    return localWatch(() => {
      try {
        next(
          readCommunity()
            .posts.filter((p) => !eventId || p.eventId === eventId)
            .sort((a, b) => b.createdAt - a.createdAt),
        );
      } catch (e) {
        error(e as Error);
      }
    });
  return watch(
    [
      {
        table: "team_posts",
        ...(eventId ? { filter: "event_id=eq." + eventId } : {}),
      },
    ],
    async () => {
      let query = db!.from("team_posts").select("id,payload");
      if (eventId) query = query.eq("event_id", eventId);
      const { data, error } = await query.order("id").limit(2000);
      if (error) throw error;
      return (data || [])
        .map((r) => unpack<TeamPost>(r))
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    next,
    error,
  );
}

export async function createTeam(user: Profile, input: TeamDraft) {
  const data = teamSchema.parse(input),
    post: TeamPost = {
      ...data,
      ownerName: user.name,
      id: crypto.randomUUID(),
      ownerUid: user.uid,
      createdAt: Date.now(),
      demo: !db,
    };
  if (!db) {
    const local = readCommunity(),
      event = local.events.find((e) => e.id === data.eventId);
    if (!event || event.date <= Date.now())
      throw new Error("Team posts are closed for this event.");
    local.posts.push(post);
    save(local);
  } else {
    return callRpc<TeamPost>("create_team_post", {
      p_id: post.id,
      p_post: data,
    });
  }
  return post;
}
