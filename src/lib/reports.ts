import { z } from "zod";
export const REPORT_TYPES = ["issue", "grievance", "lost", "found"] as const;
export const STATUSES = [
  "Submitted",
  "Assigned",
  "In Progress",
  "Resolved",
] as const;
export const PRIORITIES = ["high", "medium", "low"] as const;
export const DEPARTMENTS = [
  "IT",
  "Facilities",
  "Library",
  "Hostel",
  "Administration",
  "Security",
] as const;
export const TOPICS = [
  "Wi-Fi unavailable",
  "Computer not working",
  "Broken furniture",
  "Water leak",
  "Cleaning needed",
  "Library service",
  "Hostel service",
  "Administrative service",
  "Safety concern",
  "Personal belonging",
  "Other",
] as const;
export const ITEMS = [
  "Not applicable",
  "Bottle",
  "Backpack",
  "Laptop",
  "Phone",
  "Headphones",
  "Keys",
  "Book",
  "Wallet",
  "Other item",
] as const;
export const COLORS = [
  "Not specified",
  "Black",
  "Blue",
  "Red",
  "Green",
  "White",
  "Silver",
  "Brown",
  "Other color",
] as const;
export const FEATURES = [
  "Not specified",
  "Metal",
  "Plastic",
  "Fabric",
  "Leather",
  "Patterned",
  "Plain",
  "With a strap",
  "With a case",
] as const;
export const CATEGORIES = [
  "Connectivity",
  "Computer hardware",
  "Maintenance",
  "Cleanliness",
  "Library services",
  "Hostel services",
  "Administration",
  "Safety",
  "Personal belongings",
  "Other",
] as const;
export const sourceSchema = z.enum(["Gemini", "Local fallback"]);
export const safeDetailsSchema = z
  .object({
    intent: z.enum(REPORT_TYPES),
    topic: z.enum(TOPICS),
    item: z.enum(ITEMS),
    color: z.enum(COLORS),
    feature: z.enum(FEATURES),
    urgency: z.enum(PRIORITIES),
  })
  .strict();
export type SafeDetails = z.infer<typeof safeDetailsSchema>;
export const imageSchema = z
  .string()
  .max(300000)
  .refine(
    (v) => v === "" || /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(v),
    "Choose a valid compressed JPEG.",
  );
export const draftSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(5, "Add a title of at least 5 characters.")
      .max(120),
    description: z
      .string()
      .trim()
      .min(15, "Add at least 15 characters of detail.")
      .max(3000),
    location: z.string().trim().min(2, "Add a campus location.").max(120),
    image: imageSchema,
    photoSafe: z.boolean(),
    safeDetails: safeDetailsSchema,
  })
  .strict()
  .refine((v) => !v.image || v.photoSafe, {
    message: "Confirm your photo has no people or identifying information.",
    path: ["photoSafe"],
  });
export type ReportDraft = z.infer<typeof draftSchema>;
export const triageSchema = z
  .object({
    type: z.enum(REPORT_TYPES),
    category: z.enum(CATEGORIES),
    department: z.enum(DEPARTMENTS),
    priority: z.enum(PRIORITIES),
    summary: z.string().min(5).max(400),
  })
  .strict();
export type Triage = z.infer<typeof triageSchema>;
export type ReportStatus = (typeof STATUSES)[number];
export type ReportType = (typeof REPORT_TYPES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Match = { reportId: string; confidence: number; reason: string };
export type CampusReport = {
  id: string;
  ownerUid: string;
  type: ReportType;
  category: string;
  department: (typeof DEPARTMENTS)[number];
  priority: Priority;
  title: string;
  description: string;
  location: string;
  image: string;
  photoSafe: boolean;
  safeDetails: SafeDetails;
  status: ReportStatus;
  deadline: number;
  aiSummary: string;
  aiSource: z.infer<typeof sourceSchema>;
  matchSource: z.infer<typeof sourceSchema>;
  comments: {
    id: string;
    authorUid: string;
    text: string;
    createdAt: number;
  }[];
  matches: Match[];
  timeline: { status: ReportStatus; at: number }[];
  createdAt: number;
  resolvedAt: number | null;
  demo: boolean;
  approvedClaimId?: string;
};
export type Claim = {
  id: string;
  foundId: string;
  lostId: string;
  finderUid: string;
  claimantUid: string;
  proof: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  decidedAt: number | null;
};
export const claimInputSchema = z
  .object({
    proof: z
      .string()
      .trim()
      .min(10, "Describe a detail that helps verify ownership.")
      .max(1000),
    contact: z.string().trim().min(5, "Add a way to contact you.").max(160),
  })
  .strict();
export const SLA_HOURS = { high: 24, medium: 72, low: 168 };
export function deadlineFor(priority: Priority, createdAt: number) {
  return createdAt + SLA_HOURS[priority] * 3600000;
}
export function isOverdue(report: CampusReport, now = Date.now()) {
  return report.status !== "Resolved" && report.deadline < now;
}
export function displayStatus(report: CampusReport, now = Date.now()) {
  return isOverdue(report, now) ? "Escalated" : report.status;
}
export function nextStatus(status: ReportStatus): ReportStatus | null {
  return STATUSES[STATUSES.indexOf(status) + 1] ?? null;
}
export function publicReport(r: CampusReport) {
  return r.type === "lost" || r.type === "found";
}
export function visibleReports(
  rows: CampusReport[],
  uid: string,
  admin = false,
) {
  return rows.filter((r) => admin || r.ownerUid === uid || publicReport(r));
}
export function fallbackTriage(details: SafeDetails): Triage {
  const map: Record<
    SafeDetails["topic"],
    [Triage["category"], Triage["department"]]
  > = {
    "Wi-Fi unavailable": ["Connectivity", "IT"],
    "Computer not working": ["Computer hardware", "IT"],
    "Broken furniture": ["Maintenance", "Facilities"],
    "Water leak": ["Maintenance", "Facilities"],
    "Cleaning needed": ["Cleanliness", "Facilities"],
    "Library service": ["Library services", "Library"],
    "Hostel service": ["Hostel services", "Hostel"],
    "Administrative service": ["Administration", "Administration"],
    "Safety concern": ["Safety", "Security"],
    "Personal belonging": ["Personal belongings", "Security"],
    Other: ["Other", "Administration"],
  };
  const [category, department] =
    details.intent === "lost" || details.intent === "found"
      ? (["Personal belongings", "Security"] as const)
      : map[details.topic];
  return {
    type: details.intent,
    category,
    department,
    priority: details.topic === "Safety concern" ? "high" : details.urgency,
    summary: `${details.intent === "lost" ? "Lost" : details.intent === "found" ? "Found" : details.topic}: ${details.item === "Not applicable" ? category : `${details.color === "Not specified" ? "" : details.color + " "}${details.item.toLowerCase()}`}. Route to ${department} for review.`,
  };
}
// Rebuild this object instead of forwarding a report/draft or its free-text fields.
export function safeObjectDescription(details: SafeDetails) {
  const d = safeDetailsSchema.parse(details);
  return { item: d.item, color: d.color, feature: d.feature };
}
export function localMatches(
  details: SafeDetails,
  candidates: CampusReport[],
): Match[] {
  if (details.item === "Not applicable" || details.item === "Other item")
    return [];
  return candidates
    .filter(
      (r) =>
        r.type === "lost" &&
        r.status !== "Resolved" &&
        r.safeDetails.item === details.item,
    )
    .map((r) => {
      const color =
          details.color !== "Not specified" &&
          details.color === r.safeDetails.color,
        feature =
          details.feature !== "Not specified" &&
          details.feature === r.safeDetails.feature;
      return {
        reportId: r.id,
        confidence: Math.min(
          0.9,
          0.5 + (color ? 0.25 : 0) + (feature ? 0.15 : 0),
        ),
        reason: `Same item type${color ? " and color" : ""}${feature ? " with the same material or feature" : ""}. Verify ownership before sharing contacts.`,
      };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}
export function reportAnalytics(rows: CampusReport[], now = Date.now()) {
  const month = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).format(now);
  const current = rows.filter(
    (r) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
      }).format(r.createdAt) === month,
  );
  const count = (key: "category" | "location") => {
    const map = new Map<string, number>();
    current.forEach((r) => map.set(r[key], (map.get(r[key]) || 0) + 1));
    return [...map]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  };
  const resolved = current.filter(
    (r) => r.resolvedAt !== null && r.resolvedAt >= r.createdAt,
  );
  const recurring = new Map<
    string,
    { category: string; location: string; count: number }
  >();
  current
    .filter((r) => r.type === "issue" || r.type === "grievance")
    .forEach((r) => {
      const key = r.category + "|" + r.location.toLowerCase().trim();
      const item = recurring.get(key) ?? {
        category: r.category,
        location: r.location,
        count: 0,
      };
      item.count++;
      recurring.set(key, item);
    });
  return {
    total: current.length,
    overdue: rows.filter((r) => isOverdue(r, now)).length,
    resolved: resolved.length,
    averageHours: resolved.length
      ? resolved.reduce(
          (sum, r) => sum + (r.resolvedAt! - r.createdAt) / 3600000,
          0,
        ) / resolved.length
      : null,
    categories: count("category"),
    locations: count("location"),
    recurring: [...recurring.values()]
      .filter((x) => x.count >= 2)
      .sort((a, b) => b.count - a.count),
  };
}
export const reportDate = (time: number) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(time);
