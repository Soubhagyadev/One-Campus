import { supabase as db, callRpc, watch, unpack } from "./supabase";
import { listenReports } from "./reports";
import { demoData } from "@/data/seed";
import { bestHour, campusDate, summarize } from "@/lib/pulse";
import type { Space, CheckIn, Level, Vote } from "@/lib/types";
type Local = {
  spaces: Space[];
  checkIns: CheckIn[];
  votes: Record<string, Record<string, Vote>>;
};
const KEY = "onecampus.demo.v1";
export function readLocal(): Local {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    /* reset invalid demo */
  }
  const data = demoData();
  const votes: Local["votes"] = {};
  data.spaces.forEach((s) => {
    votes[s.id] = {};
    for (let i = 0; i < s.reportCount; i++)
      votes[s.id][`seed-${i}`] = { level: s.level!, updatedAt: s.updatedAt };
  });
  const value = { ...data, votes };
  localStorage.setItem(KEY, JSON.stringify(value));
  return value;
}
function saveLocal(value: Local) {
  localStorage.setItem(KEY, JSON.stringify(value));
  window.dispatchEvent(new Event("pulse-change"));
}
export function listenSpaces(
  next: (s: Space[]) => void,
  error: (e: Error) => void,
) {
  if (db)
    return watch(
      [{ table: "spaces" }],
      async () => {
        const { data, error } = await db!
          .from("spaces")
          .select("id,payload")
          .order("id");
        if (error) throw error;
        return (data || []).map((row) => unpack<Space>(row));
      },
      next,
      error,
    );
  const emit = () => {
    try {
      const data = readLocal();
      next(
        data.spaces.map((s) => {
          const summary = summarize(Object.values(data.votes[s.id] || {}));
          return {
            ...s,
            reportCount: summary.reportCount,
            level: summary.level ?? s.level,
            bestHour: bestHour(data.checkIns, s.id),
          };
        }),
      );
    } catch (e) {
      error(e as Error);
    }
  };
  emit();
  window.addEventListener("storage", emit);
  window.addEventListener("pulse-change", emit);
  return () => {
    window.removeEventListener("storage", emit);
    window.removeEventListener("pulse-change", emit);
  };
}
export async function history(): Promise<CheckIn[]> {
  if (!db) return readLocal().checkIns;
  const { data, error } = await db!
    .from("check_ins")
    .select("space_id,level,weekday,hour,created_at")
    .gte("created_at", Date.now() - 7 * 86400000)
    .order("created_at", { ascending: false })
    .limit(10000);
  if (error) throw error;
  return (data || []).map((r) => ({
    spaceId: r.space_id,
    level: r.level,
    weekday: r.weekday,
    hour: r.hour,
    createdAt: Number(r.created_at),
  }));
}

export async function castVote(space: Space, uid: string, level: Level) {
  const now = Date.now(),
    { weekday, hour } = campusDate(now);
  const log: CheckIn = {
    spaceId: space.id,
    level,
    weekday,
    hour,
    createdAt: now,
  };
  if (!db) {
    const data = readLocal();
    data.votes[space.id] ??= {};
    data.votes[space.id][uid] = { level, updatedAt: now };
    const summary = summarize(Object.values(data.votes[space.id]));
    data.spaces = data.spaces.map((s) =>
      s.id === space.id ? { ...s, ...summary, updatedAt: now } : s,
    );
    data.checkIns.push(log);
    saveLocal(data);
    return;
  }
  await callRpc("cast_crowd_vote", { p_space_id: space.id, p_level: level });
}

export async function loadDemo() {
  const data = demoData();
  if (!db) {
    localStorage.removeItem(KEY);
    readLocal();
    window.dispatchEvent(new Event("pulse-change"));
    return;
  }
  await callRpc("load_campus_demo", {
    p_spaces: data.spaces,
    p_logs: data.checkIns,
  });
}

export function listenOpenReports(
  next: (n: number) => void,
  error: (e: Error) => void,
) {
  if (!db) {
    return listenReports(
      { uid: "demo-admin", name: "Admin", role: "admin" },
      (rows) => next(rows.filter((r) => r.status !== "Resolved").length),
      error,
    );
  }
  return watch(
    [{ table: "reports" }],
    async () => {
      const { count, error } = await db!
        .from("reports")
        .select("id", { count: "exact", head: true })
        .neq("status", "Resolved");
      if (error) throw error;
      return count || 0;
    },
    next,
    error,
  );
}
