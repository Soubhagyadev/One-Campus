import {
  CheckCircle2,
  Clock3,
  CircleAlert,
  UserRoundCheck,
  Wrench,
} from "lucide-react";
import { displayStatus } from "@/lib/reports";
import type { CampusReport } from "@/lib/reports";
export function ReportStatus({
  report,
  now = Date.now(),
}: {
  report: CampusReport;
  now?: number;
}) {
  const status = displayStatus(report, now),
    Icon = ["Escalated", "Rejected"].includes(status)
      ? CircleAlert
      : ["Resolved", "Completed"].includes(status)
        ? CheckCircle2
        : status === "Assigned"
          ? UserRoundCheck
          : status === "In Progress"
            ? Wrench
            : Clock3;
  return (
    <span
      className={`status report-status ${["Escalated", "Rejected"].includes(status) ? "crowded" : ["Resolved", "Completed"].includes(status) ? "free" : status === "In Progress" ? "moderate" : "stale"}`}
    >
      <Icon size={14} />
      {status}
    </span>
  );
}
