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
    Icon =
      status === "Escalated"
        ? CircleAlert
        : status === "Resolved"
          ? CheckCircle2
          : status === "Assigned"
            ? UserRoundCheck
            : status === "In Progress"
              ? Wrench
              : Clock3;
  return (
    <span
      className={`status report-status ${status === "Escalated" ? "crowded" : status === "Resolved" ? "free" : status === "In Progress" ? "moderate" : "stale"}`}
    >
      <Icon size={14} />
      {status}
    </span>
  );
}
