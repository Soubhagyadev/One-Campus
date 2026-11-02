import type { CampusEvent, TeamPost } from "@/lib/community";
export function communityDemo(now = Date.now()): {
  events: CampusEvent[];
  posts: TeamPost[];
  rsvps: Record<string, string[]>;
} {
  const events: CampusEvent[] = [
    {
      id: "demo-innovation",
      ownerUid: "demo-admin",
      title: "Build for a better campus",
      club: "Innovation & Entrepreneurship Cell",
      date: now + 3 * 86400000,
      venue: "Innovation Hub · Block A",
      description:
        "A one-day build sprint for ideas that make everyday campus life better. Bring your curiosity, meet a team, and turn a small problem into a working prototype.",
      tags: ["Technology", "Competition"],
      createdAt: now - 2 * 86400000,
      rsvpCount: 24,
      demo: true,
    },
    {
      id: "demo-design",
      ownerUid: "demo-admin",
      title: "Design that includes everyone",
      club: "Coding Club",
      date: now + 5 * 86400000,
      venue: "Learning Centre · Seminar Hall",
      description:
        "Explore accessible product design with hands-on exercises. Learn how thoughtful interfaces can help more students take part in campus life.",
      tags: ["Design", "Workshop"],
      createdAt: now - 86400000,
      rsvpCount: 18,
      demo: true,
    },
    {
      id: "demo-stories",
      ownerUid: "demo-admin",
      title: "Campus through a different lens",
      club: "Photography Club",
      date: now + 7 * 86400000,
      venue: "Central Courtyard",
      description:
        "A relaxed photo walk exploring the familiar corners of campus. Meet other photographers and practice visual storytelling through light and composition.",
      tags: ["Culture", "Workshop"],
      createdAt: now - 86400000,
      rsvpCount: 12,
      demo: true,
    },
    {
      id: "demo-green",
      ownerUid: "demo-admin",
      title: "Small steps, greener spaces",
      club: "Environment Club",
      date: now + 9 * 86400000,
      venue: "Student Activity Centre",
      description:
        "Share practical ideas for reducing waste on campus, then form small teams to develop a simple sustainability initiative for the semester.",
      tags: ["Sustainability"],
      createdAt: now - 86400000,
      rsvpCount: 9,
      demo: true,
    },
  ];
  const posts: TeamPost[] = [
    {
      id: "demo-team-1",
      ownerUid: "demo-finder",
      eventId: "demo-innovation",
      kind: "recruiting",
      skills: ["Backend", "Data analysis"],
      roles: ["Frontend", "UI/UX design"],
      theme: "Student productivity",
      idea: "A simple study-space companion that helps students choose quieter hours and coordinate group sessions.",
      createdAt: now - 3600000,
      demo: true,
    },
    {
      id: "demo-team-2",
      ownerUid: "demo-other",
      eventId: "demo-innovation",
      kind: "looking",
      skills: ["Research", "Presentation", "UI/UX design"],
      roles: [],
      theme: "Campus sustainability",
      idea: "Interested in exploring how students can reduce everyday waste through better shared campus services.",
      createdAt: now - 7200000,
      demo: true,
    },
  ];
  const rsvps = Object.fromEntries(
    events.map((e) => [
      e.id,
      Array.from({ length: e.rsvpCount }, (_, i) => `synthetic-rsvp-${i}`),
    ]),
  );
  return { events, posts, rsvps };
}
