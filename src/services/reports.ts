import { supabase as db, callRpc, watch, unpack } from "./supabase";
import { matchFound, triageReport } from "./ai";
import { reportDemoData } from "@/data/reportSeed";
import {
  claimInputSchema,
  deadlineFor,
  draftSchema,
  terminalReport,
  reportEditSchema,
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
      .reports.filter(
        (r) => r.type === "lost" && !terminalReport(r) && !r.deletedAt,
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);
  const { data, error } = await db!
    .from("reports")
    .select("id,payload")
    .eq("type", "lost")
    .not("status", "in", "(Resolved,Rejected,Completed)")
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
    reporterName: user.name,
    ...triage.data,
    ...draft,
    type: draft.safeDetails.intent,
    visibility:
      draft.safeDetails.intent === "grievance"
        ? "private"
        : draft.safeDetails.intent === "issue"
          ? (draft.visibility ?? "campus")
          : "campus",
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
    terminalReport(report)
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
  if (!status && !text) throw new Error("Choose a status or add a comment.");
  const mutate = (r: CampusReport): CampusReport => {
    const now = Date.now();
    if (r.deletedAt) throw new Error("Report unavailable.");
    if (
      status &&
      !["Assigned", "In Progress", "Resolved", "Rejected"].includes(status)
    )
      throw new Error("Choose a valid admin status.");
    if (status === "Rejected" && text.length < 3)
      throw new Error("Add a reason when rejecting a report.");
    if (text && r.comments.length >= 50)
      throw new Error("This report has reached the comment limit.");
    return {
      ...r,
      status: status ?? r.status,
      resolvedAt: status ? (status === "Resolved" ? now : null) : r.resolvedAt,
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
    if (status && terminalReport({ status }))
      data.claims.forEach((c) => {
        if ((c.foundId === id || c.lostId === id) && c.status === "pending") {
          c.status = "rejected";
          c.decidedAt = Date.now();
        }
      });
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
    terminalReport(found) ||
    terminalReport(lost)
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
    if (
      [found.id, lost.id].some(
        (id) =>
          !data.reports.some(
            (r) => r.id === id && !r.deletedAt && !terminalReport(r),
          ),
      )
    )
      throw new Error("One of these reports is no longer open.");
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
    if (
      approve &&
      [claim.foundId, claim.lostId].some(
        (id) =>
          !data.reports.some(
            (r) => r.id === id && !r.deletedAt && !terminalReport(r),
          ),
      )
    )
      throw new Error("One of these reports is no longer open.");
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

export async function manageOwnReport(
  user: Profile,
  id: string,
  action: "delete" | "complete" | "details",
  details: {
    contactNumber?: string;
    contactAddress?: string;
    visibility?: "campus" | "private";
  } = {},
) {
  const phone = (details.contactNumber || "").trim(),
    address = (details.contactAddress || "").trim();
  if (phone && !/^\+?[0-9]{10,15}$/.test(phone))
    throw new Error("Use 10–15 digits for your contact number.");
  if (address.length > 160)
    throw new Error("Keep the contact address under 160 characters.");
  if (db) {
    await callRpc("manage_own_report", {
      p_id: id,
      p_action: action,
      p_details: details,
    });
    return;
  }
  const data = readReportLocal(),
    r = data.reports.find((r) => r.id === id && !r.deletedAt);
  if (!r || r.ownerUid !== user.uid)
    throw new Error("Only the reporter can change this report.");
  const now = Date.now();
  if (action === "delete") r.deletedAt = now;
  else if (action === "complete") {
    if (!["lost", "found"].includes(r.type) || terminalReport(r))
      throw new Error("Only an open lost/found report can be completed.");
    r.status = "Completed";
    r.resolvedAt = now;
    r.timeline.push({ status: "Completed", at: now });
  } else {
    r.contactNumber = phone;
    r.contactAddress = address;
    r.reporterName = user.name;
    r.visibility =
      r.type === "grievance"
        ? "private"
        : r.type === "issue"
          ? details.visibility || "private"
          : "campus";
  }
  if (action !== "details")
    data.claims.forEach((c) => {
      if ((c.foundId === id || c.lostId === id) && c.status === "pending") {
        c.status = "rejected";
        c.decidedAt = now;
      }
    });
  persist(data);
}

export async function editOwnReport(
  user: Profile,
  id: string,
  input: import("@/lib/reports").ReportEdit,
) {
  const edit = reportEditSchema.parse(input);
  if (db) {
    await callRpc("edit_own_report", { p_id: id, p_details: edit });
    return;
  }
  const data = readReportLocal(),
    r = data.reports.find((r) => r.id === id && !r.deletedAt);
  if (!r || r.ownerUid !== user.uid)
    throw new Error("Only the reporter may edit this report.");
  const validated = draftSchema.parse({
    title: edit.title,
    description: edit.description,
    location: edit.location,
    image: r.image,
    photoSafe: r.photoSafe,
    safeDetails: r.safeDetails,
    customDetails: edit.customDetails ?? r.customDetails,
    contactNumber: edit.contactNumber ?? r.contactNumber,
    contactAddress: edit.contactAddress ?? r.contactAddress,
    visibility: edit.visibility ?? r.visibility,
  });
  Object.assign(r, validated, {
    reporterName: user.name,
    visibility:
      r.type === "grievance"
        ? "private"
        : r.type === "issue"
          ? (validated.visibility ?? "private")
          : "campus",
  });
  persist(data);
}
