import { CircleCheck, Users, CircleAlert, Clock3 } from "lucide-react";
import type { Level } from "@/lib/types";
export const statusText = {
  free: "Free",
  moderate: "Moderate",
  crowded: "Crowded",
};
export const bands = {
  free: "Plenty of seats",
  moderate: "A few seats",
  crowded: "Almost full",
};
export function Status({
  level,
  stale = false,
}: {
  level: Level | null;
  stale?: boolean;
}) {
  const Icon =
    stale || !level
      ? Clock3
      : level === "free"
        ? CircleCheck
        : level === "moderate"
          ? Users
          : CircleAlert;
  return (
    <span className={`status ${stale || !level ? "stale" : level}`}>
      <Icon size={14} />
      {stale
        ? "No recent reports"
        : level
          ? statusText[level]
          : "No reports yet"}
    </span>
  );
}
