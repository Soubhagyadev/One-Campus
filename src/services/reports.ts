import { supabase as db, callRpc, watch, unpack } from "./supabase";
import { matchFound, triageReport } from "./ai";
import { reportDemoData } from "@/data/reportSeed";
import {
  claimInputSchema,
  deadlineFor,
  draftSchema,
  nextStatus,
  visibleReports,
} from "@/lib/reports";
import type {
  CampusReport,
  Claim,
  ReportDraft,
  ReportStatus,
} from "@/lib/reports";
import type { Profile } from "@/lib/types";
const KEY = "onecampus.reports.v2";
type Local = {
  reports: CampusReport[];
  claims: Claim[];
  contacts: Record<string, Record<string, string>>;
};
export function readReportLocal(): Local {
  const raw = localStorage.getItem(KEY);
  if (raw) return JSON.parse(raw);
  const value = { reports: reportDemoData(), claims: [], contacts: {} };
  localStorage.setItem(KEY, JSON.stringify(value));
  return value;
}
function persist(data: Local) {
  localStorage.setItem(KEY, JSON.stringify(data));
  window.dispatchEvent(new Event("reports-change"));
}
function localListener(emit: () => void) {
  emit();
  window.addEventListener("reports-change", emit);
  window.addEventListener("storage", emit);
  return () => {
    window.removeEventListener("reports-change", emit);
    window.removeEventListener("storage", emit);
  };
}
export function listenReports(
  user: Profile,
  next: (reports: CampusReport[]) => void,
  error: (e: Error) => void,
) {
  if (!db)
    return localListener(() => {
      try {
        next(
          visibleReports(
            readReportLocal().reports,
            user.uid,
            user.role === "admin",
          ).sort((a, b) => b.createdAt - a.createdAt),
        );
      } catch (e) {
        error(e as Error);
      }
    });
  return watch(
    [{ table: "reports" }],
    async () => {
      const { data, error } = await db!
        .from("reports")
        .select("id,payload")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []).map((r) => unpack<CampusReport>(r));
    },
    next,
    error,
  );
}

async function openLostReports(): Promise<CampusReport[]> {
  if (!db)
    return readReportLocal()
      .reports.filter((r) => r.type === "lost" && r.status !== "Resolved")
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);
  const { data, error } = await db!
    .from("reports")
    .select("id,payload")
    .eq("type", "lost")
    .neq("status", "Resolved")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []).map((r) => unpack<CampusReport>(r));
}

export async function submitReport(
  user: Profile,
  input: ReportDraft,
): Promise<CampusReport> {
  const draft = draftSchema.parse(input),
    triage = await triageReport(
      draft.safeDetails,
      draft.image,
      draft.photoSafe,
    );
  const candidates =
    draft.safeDetails.intent === "found"
      ? (await openLostReports()).filter((r) => r.ownerUid !== user.uid)
      : [];
  const matching =
    draft.safeDetails.intent === "found"
      ? await matchFound(
          draft.safeDetails,
          candidates,
          draft.image,
          draft.photoSafe,
        )
      : { matches: [], source: "Local fallback" as const };
  const createdAt = Date.now();
  const report: CampusReport = {
    id: crypto.randomUUID(),
    ownerUid: user.uid,
    ...triage.data,
    ...draft,
    type: draft.safeDetails.intent,
    priority: triage.data.priority,
    status: "Submitted",
    deadline: deadlineFor(triage.data.priority, createdAt),
    aiSummary: triage.data.summary,
    aiSource: triage.source,
    matchSource: matching.source,
    comments: [],
    matches: matching.matches,
    timeline: [{ status: "Submitted", at: createdAt }],
    createdAt,
    resolvedAt: null,
    demo: !db,
  };
  // summary is AI output, not a separate persisted raw field.
  const { summary, ...clean } = report as CampusReport & { summary?: string };
  void summary;
  if (!db) {
    const data = readReportLocal();
    data.reports.unshift(clean);
    persist(data);
  } else {
    const { id, ...payload } = clean;
    return callRpc<CampusReport>("submit_report", {
      p_id: id,
      p_report: payload,
    });
  }
  return clean;
}
export async function refreshMatches(user: Profile, report: CampusReport) {
  if (
    report.type !== "found" ||
    report.ownerUid !== user.uid ||
    report.status === "Resolved"
  )
    throw new Error("Only the finder can refresh an open found post.");
  const candidates = (await openLostReports()).filter(
      (r) => r.ownerUid !== user.uid,
    ),
    result = await matchFound(
      report.safeDetails,
      candidates,
      report.image,
      report.photoSafe,
    );
  if (!db) {
    const data = readReportLocal(),
      current = data.reports.find((r) => r.id === report.id);
    if (!current || current.ownerUid !== user.uid)
      throw new Error("Post unavailable.");
    current.matches = result.matches;
    current.matchSource = result.source;
    persist(data);
  } else {
    await callRpc("refresh_report_matches", {
      p_id: report.id,
      p_matches: result.matches,
      p_source: result.source,
    });
  }
}

export async function updateReport(
  user: Profile,
  id: string,
  status: ReportStatus | null,
  comment: string,
) {
  if (user.role !== "admin") throw new Error("Administrator access required.");
  const text = comment.trim();
  if (text.length > 1000)
    throw new Error("Keep comments under 1,000 characters.");
  if (!status && !text)
    throw new Error("Choose the next status or add a comment.");
  const mutate = (r: CampusReport): CampusReport => {
    const now = Date.now();
    if (status && status !== nextStatus(r.status))
      throw new Error("The status changed. Refresh and choose the next step.");
    if (text && r.comments.length >= 50)
      throw new Error("This report has reached the comment limit.");
    return {
      ...r,
      status: status ?? r.status,
      resolvedAt: status === "Resolved" ? now : r.resolvedAt,
      timeline: status ? [...r.timeline, { status, at: now }] : r.timeline,
      comments: text
        ? [
            ...r.comments,
            {
              id: crypto.randomUUID(),
              authorUid: user.uid,
              text,
              createdAt: now,
            },
          ]
        : r.comments,
    };
  };
  if (!db) {
    const data = readReportLocal(),
      index = data.reports.findIndex((r) => r.id === id);
    if (index < 0) throw new Error("Report unavailable.");
    data.reports[index] = mutate(data.reports[index]);
    persist(data);
    return;
  }
  await callRpc("update_report", {
    p_id: id,
    p_status: status,
    p_comment: text,
  });
}
export function listenClaims(
  user: Profile,
  next: (rows: Claim[]) => void,
  error: (e: Error) => void,
) {
  if (!db)
    return localListener(() => {
      try {
        next(
          readReportLocal().claims.filter(
            (c) => c.claimantUid === user.uid || c.finderUid === user.uid,
          ),
        );
      } catch (e) {
        error(e as Error);
      }
    });
  return watch(
    [{ table: "claims" }],
    async () => {
      const { data, error } = await db!.from("claims").select("id,payload");
      if (error) throw error;
      return (data || []).map((r) => unpack<Claim>(r));
    },
    next,
    error,
  );
}

export async function requestClaim(
  user: Profile,
  found: CampusReport,
  lost: CampusReport,
  proof: string,
  contact: string,
) {
  const input = claimInputSchema.parse({ proof, contact });
  if (
    found.type !== "found" ||
    lost.type !== "lost" ||
    lost.ownerUid !== user.uid ||
    found.ownerUid === user.uid ||
    found.status === "Resolved" ||
    lost.status === "Resolved"
  )
    throw new Error(
      "Choose your own open lost post and another student’s open found post.",
    );
  const claim: Claim = {
    id: found.id + "__" + lost.id,
    foundId: found.id,
    lostId: lost.id,
    finderUid: found.ownerUid,
    claimantUid: user.uid,
    proof: input.proof,
    status: "pending",
    createdAt: Date.now(),
    decidedAt: null,
  };
  if (!db) {
    const data = readReportLocal();
    if (data.claims.some((c) => c.id === claim.id))
      throw new Error("A claim already exists for these posts.");
    data.claims.push(claim);
    data.contacts[claim.id] = { [user.uid]: input.contact };
    persist(data);
    return;
  }
  await callRpc("request_claim", {
    p_found_id: found.id,
    p_lost_id: lost.id,
    p_proof: input.proof,
    p_contact: input.contact,
  });
}

export async function decideClaim(
  user: Profile,
  claim: Claim,
  approve: boolean,
  contact: string,
) {
  if (user.uid !== claim.finderUid)
    throw new Error("Only the finder can decide this claim.");
  const safeContact = contact.trim();
  if (approve && (safeContact.length < 5 || safeContact.length > 160))
    throw new Error("Add your contact details (5–160 characters) to approve.");
  const decidedAt = Date.now();
  if (!db) {
    const data = readReportLocal(),
      current = data.claims.find((c) => c.id === claim.id);
    if (!current || current.status !== "pending")
      throw new Error("This claim is no longer pending.");
    current.status = approve ? "approved" : "rejected";
    current.decidedAt = decidedAt;
    if (approve) {
      if (
        data.claims.some(
          (c) =>
            c.id !== claim.id &&
            c.foundId === claim.foundId &&
            c.status === "approved",
        )
      )
        throw new Error(
          "Another claim for this item has already been approved.",
        );
      data.contacts[claim.id] ??= {};
      data.contacts[claim.id][user.uid] = safeContact;
      const found = data.reports.find((r) => r.id === claim.foundId);
      if (found)
        (found as CampusReport & { approvedClaimId?: string }).approvedClaimId =
          claim.id;
    }
    persist(data);
    return;
  }
  await callRpc("decide_claim", {
    p_id: claim.id,
    p_approve: approve,
    p_contact: safeContact,
  });
}

export async function claimContacts(
  user: Profile,
  claim: Claim,
): Promise<{ claimant: string; finder: string }> {
  if (
    claim.status !== "approved" ||
    ![claim.claimantUid, claim.finderUid].includes(user.uid)
  )
    throw new Error("Contacts are private until the finder approves.");
  if (!db) {
    const data = readReportLocal(),
      current = data.claims.find((c) => c.id === claim.id);
    if (current?.status !== "approved")
      throw new Error("This claim is not approved.");
    const contacts = data.contacts[claim.id] || {};
    return {
      claimant: contacts[claim.claimantUid] || "Not provided",
      finder: contacts[claim.finderUid] || "Not provided",
    };
  }
  const { data, error } = await db!
    .from("claim_contacts")
    .select("user_id,contact")
    .eq("claim_id", claim.id);
  if (error) throw error;
  const contacts = Object.fromEntries(
    (data || []).map((r) => [r.user_id, r.contact]),
  );
  return {
    claimant: contacts[claim.claimantUid] || "Not provided",
    finder: contacts[claim.finderUid] || "Not provided",
  };
}
