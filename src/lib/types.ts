export type Level = "free" | "moderate" | "crowded";
export type Profile = { uid: string; name: string; role: "student" | "admin" };
export type Space = {
  id: string;
  name: string;
  type: "library" | "lab";
  zone: string;
  quiet: boolean;
  level: Level | null;
  reportCount: number;
  updatedAt: number;
  demo?: boolean;
  bestHour?: number | null;
};
export type CheckIn = {
  spaceId: string;
  level: Level;
  weekday: number;
  hour: number;
  createdAt: number;
};
export type Vote = { level: Level; updatedAt: number };
