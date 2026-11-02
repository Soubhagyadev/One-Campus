import { z } from "zod";
export const CLUBS = [
  "Innovation & Entrepreneurship Cell",
  "Coding Club",
  "Literary Society",
  "Photography Club",
  "Environment Club",
  "Cultural Committee",
] as const;
export const SKILLS = [
  "Frontend",
  "Backend",
  "UI/UX design",
  "Research",
  "Presentation",
  "Data analysis",
  "Writing",
  "Photography",
  "Event planning",
] as const;
export const THEMES = [
  "Campus sustainability",
  "Student productivity",
  "Accessible learning",
  "Community wellbeing",
  "Creative storytelling",
  "Open innovation",
] as const;
export const TAGS = [
  "Technology",
  "Design",
  "Culture",
  "Sustainability",
  "Workshop",
  "Competition",
] as const;
export const eventSchema = z
  .object({
    title: z.string().trim().min(5).max(120),
    club: z.enum(CLUBS),
    date: z.number().int().positive(),
    venue: z.string().trim().min(3).max(120),
    description: z.string().trim().min(20).max(2000),
    tags: z.array(z.enum(TAGS)).min(1).max(3),
  })
  .strict();
export type EventDraft = z.infer<typeof eventSchema>;
export type CampusEvent = EventDraft & {
  id: string;
  ownerUid: string;
  createdAt: number;
  rsvpCount: number;
  demo: boolean;
};
export const teamSchema = z
  .object({
    eventId: z.string().min(1).max(128),
    kind: z.enum(["looking", "recruiting"]),
    skills: z.array(z.enum(SKILLS)).min(1).max(6),
    roles: z.array(z.enum(SKILLS)).max(6),
    theme: z.enum(THEMES),
    idea: z.string().trim().min(15).max(1000),
  })
  .strict()
  .refine((v) => v.kind !== "recruiting" || v.roles.length > 0, {
    message: "Choose at least one role your team needs.",
    path: ["roles"],
  });
export type TeamDraft = z.infer<typeof teamSchema>;
export type TeamPost = TeamDraft & {
  ownerName?: string;
  id: string;
  ownerUid: string;
  createdAt: number;
  demo: boolean;
};
export const safeTeamSchema = z
  .object({
    kind: z.enum(["looking", "recruiting"]),
    skills: z.array(z.enum(SKILLS)).max(6),
    roles: z.array(z.enum(SKILLS)).max(6),
    theme: z.enum(THEMES),
  })
  .strict();
export type TeamSuggestion = { postId: string; score: number; reason: string };
export function teamAttributes(post: TeamPost) {
  return safeTeamSchema.parse({
    kind: post.kind,
    skills: post.skills,
    roles: post.roles,
    theme: post.theme,
  });
}
export function rankTeams(
  post: TeamPost,
  candidates: TeamPost[],
): TeamSuggestion[] {
  return candidates
    .filter(
      (c) =>
        c.id !== post.id &&
        c.ownerUid !== post.ownerUid &&
        c.eventId === post.eventId &&
        c.kind !== post.kind,
    )
    .map((c) => {
      const team = post.kind === "recruiting" ? post : c,
        person = post.kind === "looking" ? post : c,
        overlap = team.roles.filter((s) => person.skills.includes(s));
      const sameTheme = post.theme === c.theme;
      return {
        postId: c.id,
        score: Math.min(0.95, overlap.length * 0.3 + (sameTheme ? 0.2 : 0)),
        reason: overlap.length
          ? `Skills align with ${overlap.join(", ")}${sameTheme ? " and a shared idea theme" : ""}.`
          : "A shared idea theme may be worth exploring.",
      };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
