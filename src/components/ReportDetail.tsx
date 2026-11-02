import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  LockKeyhole,
  MapPin,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Phone,
  UserRound,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import {
  claimContacts,
  decideClaim,
  refreshMatches,
  requestClaim,
  updateReport,
  manageOwnReport,
  editOwnReport,
} from "@/services/reports";
import { isOverdue, terminalReport, reportDate } from "@/lib/reports";
import type {
  CampusReport,
  Claim,
  ReportStatus as StatusType,
} from "@/lib/reports";
import { ReportStatus } from "./ReportStatus";
function ClaimCard({
  claim,
  reports,
}: {
  claim: Claim;
  reports: CampusReport[];
}) {
  const { user } = useAuth();
  const [contact, setContact] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [contacts, setContacts] = useState<{
      claimant: string;
      finder: string;
    } | null>(null);
  async function action(approve: boolean) {
    setBusy(true);
    setError("");
    try {
      await decideClaim(user!, claim, approve, contact);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="claim-card">
      <div className="section-heading">
        <strong>Ownership claim</strong>
        <span
          className={`status ${claim.status === "approved" ? "free" : claim.status === "rejected" ? "crowded" : "stale"}`}
        >
          <ShieldCheck size={14} />
          {claim.status}
        </span>
      </div>
      <p>
        {reports.find((r) => r.id === claim.lostId)?.title || "Lost item"} →{" "}
        {reports.find((r) => r.id === claim.foundId)?.title || "Found item"}
      </p>
      <p className="claim-proof">{claim.proof}</p>
      {claim.status === "pending" && claim.finderUid === user?.uid ? (
        <>
          <Label htmlFor={"finder-contact-" + claim.id}>
            Your contact details (shared only if you approve)
          </Label>
          <Input
            id={"finder-contact-" + claim.id}
            value={contact}
            maxLength={160}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Email or phone for coordinating a return"
          />
          <div className="action-row">
            <Button
              className="primary"
              disabled={busy}
              onClick={() => action(true)}
            >
              Approve & share contacts
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => action(false)}
            >
              Decline claim
            </Button>
          </div>
        </>
      ) : claim.status === "pending" ? (
        <p className="privacy-inline">
          <LockKeyhole size={14} />
          Waiting for the finder. Your contact details are still private.
        </p>
      ) : claim.status === "approved" ? (
        contacts ? (
          <div className="shared-contacts">
            <p>
              <strong>Owner:</strong> {contacts.claimant}
            </p>
            <p>
              <strong>Finder:</strong> {contacts.finder}
            </p>
            <small>Shared only with both parties after approval.</small>
          </div>
        ) : (
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setContacts(await claimContacts(user!, claim));
              } catch {
                setError("Contact details could not load. Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <LockKeyhole size={15} />
            View shared contacts
          </Button>
        )
      ) : (
        <p className="muted">
          This claim was declined. Contact details remain private.
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </article>
  );
}
export function ReportDetail({
  report,
  reports,
  claims,
  onClose,
  onSelect,
  onDeleted,
  now,
}: {
  report: CampusReport;
  reports: CampusReport[];
  claims: Claim[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onDeleted?: () => void;
  now: number;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [status, setStatus] = useState("unchanged"),
    [comment, setComment] = useState(""),
    [claiming, setClaiming] = useState(false),
    [lostId, setLostId] = useState(""),
    [proof, setProof] = useState(""),
    [contact, setContact] = useState(""),
    [deleting, setDeleting] = useState(false),
    [editingContacts, setEditingContacts] = useState(false);
  const admin = user?.role === "admin",
    own = report.ownerUid === user?.uid;
  const lost = reports.filter(
    (r) => r.type === "lost" && r.ownerUid === user?.uid && !terminalReport(r),
  );
  const relatedClaims = claims.filter(
    (c) => c.foundId === report.id || c.lostId === report.id,
  );
  const matches =
    report.type === "found"
      ? report.matches.map((m) => ({
          report: reports.find((r) => r.id === m.reportId),
          ...m,
        }))
      : reports
          .filter((r) => r.type === "found")
          .flatMap((r) =>
            r.matches
              .filter((m) => m.reportId === report.id)
              .map((m) => ({ report: r, ...m })),
          );
  useEffect(() => setStatus("unchanged"), [report.status]);
  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
    } catch (e) {
      setError(
        (e as Error).message || "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="report-dialog detail-dialog">
        <DialogHeader>
          <div className="detail-kicker">
            <span className="eyebrow">
              {report.type.toUpperCase()} · {report.id.slice(0, 8)}
            </span>
            <ReportStatus report={report} now={now} />
          </div>
          <DialogTitle>{report.title}</DialogTitle>
          <DialogDescription>
            <MapPin size={14} />
            {report.location} · {reportDate(report.createdAt)}
            {report.demo ? " · Demo data" : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="detail-body">
          <p className="report-description">{report.description}</p>
          <section className="report-reporter">
            <h3>
              <UserRound size={17} /> Reported by{" "}
              {report.reporterName || (own ? user?.name : "Campus member")}
            </h3>
            <p className="field-hint">
              {report.type === "grievance" ||
              (report.type === "issue" && report.visibility !== "campus")
                ? "Private report · owner and admins only"
                : "Campus board · visible to signed-in students"}
            </p>
            {report.contactNumber && (
              <a
                className="commerce-contact"
                href={`tel:${report.contactNumber}`}
              >
                <Phone size={16} /> {report.contactNumber}
              </a>
            )}
            {report.contactAddress && (
              <p>
                <MapPin size={15} /> {report.contactAddress}
              </p>
            )}
            {report.customDetails &&
              Object.entries(report.customDetails)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <p key={k}>
                    <strong className="capitalize">Other {k}:</strong> {v}
                  </p>
                ))}
            {!report.contactNumber && !report.contactAddress && (
              <p className="muted">No contact details were provided.</p>
            )}
          </section>
          {own && (
            <section className="report-owner-actions">
              <h3>Your report</h3>
              <div className="action-row">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setEditingContacts(!editingContacts)}
                >
                  <Pencil size={15} /> Edit report
                </Button>
                {["lost", "found"].includes(report.type) &&
                  !terminalReport(report) && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => manageOwnReport(user!, report.id, "complete"),
                          "Marked completed. This item is no longer open for claims.",
                        )
                      }
                    >
                      <CheckCircle2 size={15} />{" "}
                      {report.type === "lost"
                        ? "I found my item · Complete"
                        : "Item returned · Complete"}
                    </Button>
                  )}
                <Button
                  variant="outline"
                  className="commerce-danger"
                  disabled={busy}
                  onClick={() => setDeleting(!deleting)}
                >
                  <Trash2 size={15} /> Delete report
                </Button>
              </div>
              {editingContacts && (
                <form
                  className="commerce-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(async () => {
                      await editOwnReport(user!, report.id, {
                        title: String(f.get("title") || ""),
                        description: String(f.get("description") || ""),
                        location: String(f.get("location") || ""),
                        customDetails: {
                          topic: String(
                            f.get("custom-topic") ??
                              report.customDetails?.topic ??
                              "",
                          ),
                          item: String(
                            f.get("custom-item") ??
                              report.customDetails?.item ??
                              "",
                          ),
                          color: String(
                            f.get("custom-color") ??
                              report.customDetails?.color ??
                              "",
                          ),
                        },
                        contactNumber: String(f.get("phone") || ""),
                        contactAddress: String(f.get("address") || ""),
                        visibility:
                          report.type === "issue"
                            ? (String(f.get("visibility")) as
                                | "campus"
                                | "private")
                            : report.type === "grievance"
                              ? "private"
                              : "campus",
                      });
                      setEditingContacts(false);
                    }, "Report changes saved.");
                  }}
                >
                  <label>
                    Title
                    <input
                      name="title"
                      defaultValue={report.title}
                      minLength={5}
                      maxLength={120}
                      required
                    />
                  </label>
                  <label>
                    What happened?
                    <textarea
                      name="description"
                      defaultValue={report.description}
                      minLength={15}
                      maxLength={3000}
                      rows={4}
                      required
                    />
                  </label>
                  <label>
                    Campus location
                    <input
                      name="location"
                      defaultValue={report.location}
                      minLength={2}
                      maxLength={120}
                      required
                    />
                  </label>
                  {(
                    [
                      ["topic", "Other"],
                      ["item", "Other item"],
                      ["color", "Other color"],
                    ] as const
                  ).map(
                    ([key, sentinel]) =>
                      report.safeDetails[key] === sentinel && (
                        <label key={key}>
                          Describe the other {key}
                          <input
                            name={`custom-${key}`}
                            defaultValue={report.customDetails?.[key] || ""}
                            minLength={2}
                            maxLength={120}
                            required
                          />
                        </label>
                      ),
                  )}
                  <label>
                    Contact number
                    <input
                      name="phone"
                      type="tel"
                      defaultValue={report.contactNumber || ""}
                      pattern="\+?[0-9]{10,15}"
                      maxLength={16}
                    />
                  </label>
                  <label>
                    Contact address / meeting point
                    <input
                      name="address"
                      defaultValue={report.contactAddress || ""}
                      maxLength={160}
                    />
                  </label>
                  {report.type === "issue" && (
                    <label>
                      Report visibility
                      <select
                        name="visibility"
                        defaultValue={report.visibility || "private"}
                      >
                        <option value="campus">
                          Campus board · signed-in students
                        </option>
                        <option value="private">
                          Private · only me and admins
                        </option>
                      </select>
                    </label>
                  )}
                  <p className="field-hint">
                    Contact details on a shared post are visible to signed-in
                    students. Grievances remain private.
                  </p>
                  <div className="action-row">
                    <Button disabled={busy}>Save report changes</Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setEditingContacts(false)}
                    >
                      Cancel editing
                    </Button>
                  </div>
                </form>
              )}
              {deleting && (
                <div className="notice">
                  <p>
                    Delete this report from the app? It will disappear from your
                    reports and the campus board. Pending ownership claims will
                    close.
                  </p>
                  <Button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await manageOwnReport(user!, report.id, "delete");
                        (onDeleted || onClose)();
                      }, "Report deleted.")
                    }
                  >
                    Confirm delete report
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setDeleting(false)}
                  >
                    Keep report
                  </Button>
                </div>
              )}
            </section>
          )}
          {report.image && (
            <img
              className="detail-photo"
              src={report.image}
              alt="Report attachment"
            />
          )}
          <div className="triage-summary">
            <ShieldCheck size={18} />
            <div>
              <strong>
                Routing summary <span>{report.aiSource}</span>
              </strong>
              <p>{report.aiSummary}</p>
              <small>
                {report.department} · {report.category} · {report.priority}{" "}
                priority
              </small>
            </div>
          </div>
          <section>
            <h3>Report progress</h3>
            <ol className="status-timeline">
              {report.timeline.map((entry, index) => {
                const s = entry.status;
                return (
                  <li key={`${s}-${index}`} className="done">
                    {entry ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}
                    <div>
                      <strong>{s}</strong>
                      <small>
                        {entry ? reportDate(entry.at) : "Next step"}
                      </small>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className={isOverdue(report, now) ? "overdue-note" : "muted"}>
              {isOverdue(report, now) ? (
                <CircleAlert size={16} />
              ) : (
                <Clock3 size={14} />
              )}{" "}
              {terminalReport(report)
                ? `${report.status}${report.resolvedAt ? " · " + reportDate(report.resolvedAt) : ""}`
                : `Target resolution: ${reportDate(report.deadline)}`}
              {isOverdue(report, now)
                ? " · Escalated automatically because the deadline has passed."
                : ""}
            </p>
          </section>
          {(report.type === "lost" || report.type === "found") && (
            <section className="matching-section">
              <div className="section-heading">
                <h3>Possible matches</h3>
                {report.type === "found" && own && !terminalReport(report) && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => refreshMatches(user!, report),
                        "Matches refreshed.",
                      )
                    }
                  >
                    <RefreshCw size={14} />
                    Check again
                  </Button>
                )}
              </div>
              <p className="muted">
                Suggestions are not proof of ownership.{" "}
                {report.type === "found"
                  ? report.matchSource
                  : "A match appears here when a found post points to this item."}
              </p>
              {!matches.length ? (
                <p className="inline-empty">
                  No suggested matches yet. New found posts may reveal a match.
                </p>
              ) : (
                matches.map(
                  (m, i) =>
                    m.report && (
                      <button
                        className="match-result"
                        key={m.report.id + "-" + i}
                        onClick={() => onSelect(m.report!.id)}
                      >
                        <div>
                          <strong>{m.report.title}</strong>
                          <p>{m.reason}</p>
                        </div>
                        <span>
                          {Math.round(m.confidence * 100)}%
                          <small>confidence</small>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    ),
                )
              )}
              {report.type === "found" &&
                !own &&
                !admin &&
                !terminalReport(report) &&
                !report.approvedClaimId && (
                  <>
                    <Button
                      variant="outline"
                      className="wide"
                      onClick={() => {
                        setClaiming(!claiming);
                        setLostId(lost[0]?.id || "");
                      }}
                    >
                      <LockKeyhole size={15} />
                      Claim this item
                    </Button>
                    {claiming && (
                      <form
                        className="claim-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const target = lost.find((r) => r.id === lostId);
                          if (!target) {
                            setError(
                              "Create an open lost-item post before claiming.",
                            );
                            return;
                          }
                          run(async () => {
                            await requestClaim(
                              user!,
                              report,
                              target,
                              proof,
                              contact,
                            );
                            setClaiming(false);
                          }, "Claim sent. Your contact details remain private until approval.");
                        }}
                      >
                        {!lost.length ? (
                          <p className="muted">
                            Submit a lost-item report first. It helps the finder
                            verify your claim.
                          </p>
                        ) : (
                          <>
                            <Label htmlFor="claim-lost">
                              Your lost-item report
                            </Label>
                            <select
                              id="claim-lost"
                              className="native-select"
                              value={lostId}
                              onChange={(e) => setLostId(e.target.value)}
                            >
                              {lost.map((r) => (
                                <option value={r.id} key={r.id}>
                                  {r.title}
                                </option>
                              ))}
                            </select>
                            <Label htmlFor="claim-proof">
                              How can the finder verify it’s yours?
                            </Label>
                            <Textarea
                              id="claim-proof"
                              value={proof}
                              onChange={(e) => setProof(e.target.value)}
                              minLength={10}
                              maxLength={1000}
                              required
                              placeholder="Describe a detail only the owner would know."
                            />
                            <Label htmlFor="claim-contact">
                              Your contact details
                            </Label>
                            <Input
                              id="claim-contact"
                              value={contact}
                              onChange={(e) => setContact(e.target.value)}
                              minLength={5}
                              maxLength={160}
                              required
                              placeholder="Email or phone for arranging a return"
                            />
                            <p className="privacy-inline">
                              <LockKeyhole size={14} />
                              Only you can see this contact until the finder
                              approves.
                            </p>
                            <Button className="primary" disabled={busy}>
                              Send ownership claim
                            </Button>
                          </>
                        )}
                      </form>
                    )}
                  </>
                )}
              {report.approvedClaimId && (
                <p className="privacy-inline">
                  <CheckCircle2 size={15} />
                  The finder has approved an ownership claim.
                </p>
              )}
              {relatedClaims.map((c) => (
                <ClaimCard key={c.id} claim={c} reports={reports} />
              ))}
            </section>
          )}
          <section>
            <h3>
              <MessageSquare size={17} />
              Official updates
            </h3>
            {report.comments.length ? (
              report.comments.map((c) => (
                <article className="official-comment" key={c.id}>
                  <strong>
                    Campus team <small>{reportDate(c.createdAt)}</small>
                  </strong>
                  <p>{c.text}</p>
                </article>
              ))
            ) : (
              <p className="inline-empty">
                No official updates yet. The campus team’s comments will appear
                here.
              </p>
            )}
          </section>
          {admin && (
            <form
              className="admin-update"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await updateReport(
                    user!,
                    report.id,
                    status === "unchanged" ? null : (status as StatusType),
                    comment,
                  );
                  setComment("");
                }, "Report updated.");
              }}
            >
              <h3>Update this report</h3>
              <Label htmlFor="next-status">Status</Label>
              <select
                id="next-status"
                className="native-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="unchanged">Keep {report.status}</option>
                {(["Assigned", "In Progress", "Resolved", "Rejected"] as const)
                  .filter((s) => s !== report.status)
                  .map((s) => (
                    <option value={s} key={s}>
                      {s}
                    </option>
                  ))}
              </select>
              <Label htmlFor="official-comment">Official comment</Label>
              <Textarea
                id="official-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
                placeholder={
                  status === "Rejected"
                    ? "Explain why this report is rejected (required)."
                    : "Share a clear update with the student."
                }
                required={status === "Rejected"}
                minLength={status === "Rejected" ? 3 : undefined}
              />
              <Button
                className="primary"
                disabled={busy || (!comment.trim() && status === "unchanged")}
              >
                {busy ? "Saving…" : "Save update"}
                <ArrowRight size={16} />
              </Button>
            </form>
          )}
          {notice && (
            <p role="status" className="success-message">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
