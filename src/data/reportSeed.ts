import { deadlineFor, fallbackTriage } from "@/lib/reports";
import type { CampusReport, SafeDetails } from "@/lib/reports";
export function reportDemoData(now = Date.now()): CampusReport[] {
  const entries: [
    string,
    string,
    string,
    SafeDetails["intent"],
    SafeDetails["topic"],
    number,
    "Submitted" | "Assigned" | "In Progress" | "Resolved",
    string,
  ][] = [
    [
      "Library Wi-Fi keeps disconnecting",
      "The wireless connection drops repeatedly near the ground-floor study desks. Please check the access point.",
      "Central Library · Ground floor",
      "issue",
      "Wi-Fi unavailable",
      4,
      "In Progress",
      "demo-student",
    ],
    [
      "Blue metal bottle left in the library",
      "A blue metal water bottle was left near the reading desks. There is a small dent near its base.",
      "Central Library · Ground floor",
      "lost",
      "Personal belonging",
      8,
      "Submitted",
      "demo-student",
    ],
    [
      "Ceiling leak near the study desks",
      "Water is dripping near a reading desk after the rain. The affected desk needs to be checked.",
      "Central Library · Ground floor",
      "issue",
      "Water leak",
      30,
      "Assigned",
      "demo-other",
    ],
    [
      "Broken chair in the reading hall",
      "The backrest on a chair beside the window is loose. Please repair or remove the chair.",
      "Central Library · Ground floor",
      "issue",
      "Broken furniture",
      5,
      "Submitted",
      "demo-other",
    ],
    [
      "Hostel service request still awaiting a reply",
      "A request submitted at the service desk has not received a response. Please share a clear follow-up process.",
      "Hostel · Service desk",
      "grievance",
      "Hostel service",
      80,
      "Assigned",
      "demo-student",
    ],
    [
      "Computer display flickering in Lab 2",
      "The screen on a workstation flickers during use. The display cable and monitor need checking.",
      "Learning Centre · Block B",
      "issue",
      "Computer not working",
      12,
      "Resolved",
      "demo-other",
    ],
    [
      "Reading hall Wi-Fi was unavailable",
      "Wireless access was unavailable at the ground-floor reading desks during an afternoon study session.",
      "Central Library · Ground floor",
      "issue",
      "Wi-Fi unavailable",
      40,
      "Resolved",
      "demo-other",
    ],
    [
      "Black backpack near the discussion room",
      "A plain black backpack was left beside the discussion-room entrance. It has been handed to the help desk.",
      "Central Library · First floor",
      "found",
      "Personal belonging",
      3,
      "Submitted",
      "demo-finder",
    ],
  ];
  return entries.map(
    (
      [title, description, location, intent, topic, hours, status, ownerUid],
      i,
    ) => {
      const createdAt = now - hours * 3600000;
      const safeDetails: SafeDetails = {
        intent,
        topic,
        item:
          intent === "lost"
            ? "Bottle"
            : intent === "found"
              ? "Backpack"
              : "Not applicable",
        color:
          intent === "lost"
            ? "Blue"
            : intent === "found"
              ? "Black"
              : "Not specified",
        feature: intent === "lost" ? "Metal" : "Not specified",
        urgency: i === 2 ? "high" : "medium",
      };
      const triage = fallbackTriage(safeDetails),
        timeline: CampusReport["timeline"] = [
          { status: "Submitted", at: createdAt },
        ];
      if (status !== "Submitted")
        timeline.push({ status: "Assigned", at: createdAt + 3600000 });
      if (status === "In Progress" || status === "Resolved")
        timeline.push({ status: "In Progress", at: createdAt + 2 * 3600000 });
      if (status === "Resolved")
        timeline.push({ status: "Resolved", at: createdAt + 4 * 3600000 });
      const { summary, ...routing } = triage;
      return {
        id: `demo-report-${i + 1}`,
        ownerUid,
        ...routing,
        priority: triage.priority,
        title,
        description,
        location,
        image: "",
        photoSafe: false,
        safeDetails,
        status,
        deadline: deadlineFor(triage.priority, createdAt),
        aiSummary: summary,
        aiSource: "Local fallback",
        matchSource: "Local fallback",
        comments:
          status === "In Progress"
            ? [
                {
                  id: "demo-comment",
                  authorUid: "demo-admin",
                  text: "The IT team is checking the access point. We will post the next update here.",
                  createdAt: createdAt + 2 * 3600000,
                },
              ]
            : [],
        matches: [],
        timeline,
        createdAt,
        resolvedAt: status === "Resolved" ? createdAt + 4 * 3600000 : null,
        demo: true,
      };
    },
  );
}
