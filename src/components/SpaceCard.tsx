import {
  BookOpen,
  Monitor,
  MapPin,
  Volume2,
  VolumeX,
  Clock3,
  ArrowUpRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Status, bands, statusText } from "./Status";
import { age, VOTE_TTL, hourLabel } from "@/lib/pulse";
import type { Space } from "@/lib/types";
export function SpaceCard({
  space,
  now,
  onVote,
  voted,
  canVote = true,
}: {
  space: Space;
  now: number;
  onVote: () => void;
  voted: boolean;
  canVote?: boolean;
}) {
  const stale = now - space.updatedAt >= VOTE_TTL || !space.reportCount;
  const Icon = space.type === "lab" ? Monitor : BookOpen;
  return (
    <article className={`space-card ${stale ? "outdated" : ""}`}>
      <div className="card-top">
        <span className="space-icon">
          <Icon size={23} />
        </span>
        <Status level={space.level} stale={stale} />
      </div>
      <h3>{space.name}</h3>
      <p className="location">
        <MapPin size={14} />
        {space.zone}
      </p>
      <div className="availability">
        <strong>
          {stale
            ? "Check before you go"
            : space.level
              ? bands[space.level]
              : "Be the first to report"}
        </strong>
        <span>
          {stale
            ? space.level
              ? `Last known: ${statusText[space.level]} · ${age(space.updatedAt, now).replace("Updated ", "")}`
              : "No recent reports"
            : `Based on ${space.reportCount} reports in the last 20 min`}
        </span>
      </div>
      <div className="card-details">
        <span>
          {space.quiet ? <VolumeX size={14} /> : <Volume2 size={14} />}{" "}
          {space.quiet ? "Quiet study" : "Group friendly"}
        </span>
        <span>{age(space.updatedAt, now)}</span>
      </div>
      <div className="best-time">
        <Clock3 size={15} />
        {space.bestHour != null
          ? `Usually quieter after ${hourLabel(space.bestHour)}`
          : "More check-ins will reveal quieter hours"}
      </div>
      {canVote && (
      <Button className="report-button" variant="outline" onClick={onVote}>
        {voted ? <Check size={16} /> : null}
        {voted ? "Update your crowd report" : "Report crowd level"}
        <ArrowUpRight size={16} />
      </Button>
      )}
    </article>
  );
}
