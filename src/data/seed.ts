import type { Space, CheckIn, Level } from "@/lib/types";
export const SPACE_SEEDS: Omit<Space, "level" | "reportCount" | "updatedAt">[] =
  [
    {
      id: "reading-hall",
      name: "Library Ground Floor Reading Hall",
      type: "library",
      zone: "Central Library · Ground floor",
      quiet: true,
    },
    {
      id: "quiet-zone",
      name: "Library 2nd Floor Quiet Zone",
      type: "library",
      zone: "Central Library · Second floor",
      quiet: true,
    },
    {
      id: "discussion-a",
      name: "Discussion Room A",
      type: "library",
      zone: "Central Library · First floor",
      quiet: false,
    },
    {
      id: "lab-1",
      name: "Computer Lab 1",
      type: "lab",
      zone: "Learning Centre · Block A",
      quiet: true,
    },
    {
      id: "lab-2",
      name: "Computer Lab 2",
      type: "lab",
      zone: "Learning Centre · Block B",
      quiet: true,
    },
    {
      id: "lab-3",
      name: "Computer Lab 3",
      type: "lab",
      zone: "Learning Centre · Block B",
      quiet: false,
    },
  ];
export function demoData(now = Date.now()) {
  const levels: Level[] = [
    "moderate",
    "free",
    "crowded",
    "free",
    "crowded",
    "moderate",
  ];
  const spaces: Space[] = SPACE_SEEDS.map((s, i) => ({
    ...s,
    level: levels[i],
    reportCount: [8, 5, 6, 4, 9, 3][i],
    updatedAt: now - (i + 1) * 60000,
    demo: true,
  }));
  const checkIns: CheckIn[] = [];
  for (let d = 0; d < 7; d++)
    for (let h = 8; h <= 20; h++)
      spaces.forEach((s, i) => {
        const date = new Date(now + 19800000);
        date.setUTCDate(date.getUTCDate() - d);
        date.setUTCHours(h, 0, 0, 0);
        date.setTime(date.getTime() - 19800000);
        if (date.getTime() > now) return;
        for (let n = 0; n < 3; n++) {
          const busy = h >= 11 && h <= 15 ? 2 : (h + i + d) % 3 === 0 ? 1 : 0;
          checkIns.push({
            spaceId: s.id,
            level: (["free", "moderate", "crowded"] as Level[])[busy],
            weekday: new Date(date.getTime() + 19800000).getUTCDay(),
            hour: h,
            createdAt: date.getTime() + n,
          });
        }
      });
  return { spaces, checkIns };
}
