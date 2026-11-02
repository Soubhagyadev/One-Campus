import { useState } from "react";
import {
  ArrowRight,
  CircleAlert,
  Flag,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useReports } from "@/hooks/useReports";
import { ReportForm } from "@/components/ReportForm";
import { ReportDetail } from "@/components/ReportDetail";
import { ReportStatus } from "@/components/ReportStatus";
import { ReportAnalytics } from "@/components/ReportAnalytics";
import {
  DEPARTMENTS,
  displayStatus,
  PRIORITIES,
  publicReport,
  reportDate,
  REPORT_TYPES,
  STATUSES,
} from "@/lib/reports";
export default function Reports() {
  const { user } = useAuth(),
    { reports, claims, loading, error, now, retry } = useReports();
  const [compose, setCompose] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [tab, setTab] = useState("mine"),
    [search, setSearch] = useState(""),
    [type, setType] = useState("all"),
    [department, setDepartment] = useState("all"),
    [priority, setPriority] = useState("all"),
    [status, setStatus] = useState("all"),
    [notice, setNotice] = useState("");
  const admin = user?.role === "admin",
    mine = reports.filter((r) => r.ownerUid === user?.uid),
    board = reports.filter(publicReport),
    all = admin ? reports : tab === "board" ? board : mine;
  const visible = all.filter(
    (r) =>
      (type === "all" || r.type === type) &&
      (department === "all" || r.department === department) &&
      (priority === "all" || r.priority === priority) &&
      (status === "all" || displayStatus(r, now) === status) &&
      `${r.title} ${r.location}`.toLowerCase().includes(search.toLowerCase()),
  );
  const report = reports.find((r) => r.id === selected);
  const matchCount = (id: string) =>
    reports.filter(
      (r) => r.type === "found" && r.matches.some((m) => m.reportId === id),
    ).length;
  const content = loading ? (
    <div className="space-grid">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-64 w-full" />
      ))}
    </div>
  ) : error ? (
    <div className="empty">
      <CircleAlert />
      <h3>Reports are temporarily unavailable</h3>
      <p role="alert">{error}</p>
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  ) : !visible.length ? (
    <div className="empty">
      <Flag />
      <h3>
        {search ||
        type !== "all" ||
        department !== "all" ||
        priority !== "all" ||
        status !== "all"
          ? "No reports match these filters"
          : tab === "board"
            ? "No shared reports yet."
            : "Your reports will live here."}
      </h3>
      <p>
        {tab === "board"
          ? "Shared campus issues and lost/found posts appear here for everyone signed in."
          : "Share a campus issue and follow its progress, all in one place."}
      </p>
    </div>
  ) : admin ? (
    <div className="panel report-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Report</TableHead>
            <TableHead>Type / team</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Deadline</TableHead>
            <TableHead>
              <span className="sr-only">Open report</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <strong>{r.title}</strong>
                <small>
                  {r.location}
                  {r.demo ? " · Demo data" : ""}
                </small>
              </TableCell>
              <TableCell>
                <span className="capitalize">{r.type}</span>
                <small>{r.department}</small>
              </TableCell>
              <TableCell>
                <span className={`priority-label ${r.priority}`}>
                  <CircleAlert size={12} />
                  {r.priority}
                </span>
              </TableCell>
              <TableCell>
                <ReportStatus report={r} now={now} />
              </TableCell>
              <TableCell>{reportDate(r.deadline)}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  aria-label={"Open " + r.title}
                  onClick={() => setSelected(r.id)}
                >
                  <ArrowRight size={16} />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ) : (
    <div className="report-cards">
      {visible.map((r) => (
        <article className="report-card" key={r.id}>
          <div className="section-heading">
            <span className="eyebrow">
              {r.type.toUpperCase()} · {r.department.toUpperCase()}
            </span>
            <ReportStatus report={r} now={now} />
          </div>
          <h3>{r.title}</h3>
          <p className="report-excerpt">{r.description}</p>
          <p className="field-hint">
            Reported by{" "}
            {r.reporterName ||
              (r.ownerUid === user?.uid ? user.name : "Campus member")}
            {r.contactNumber ? ` · ${r.contactNumber}` : ""}
          </p>
          <p className="location">
            <MapPin size={14} />
            {r.location}
          </p>
          <div className="report-card-meta">
            <small>
              {reportDate(r.createdAt)}
              {r.demo ? " · Demo data" : ""}
            </small>
            <span>{r.priority} priority</span>
          </div>
          {((r.type === "found" && r.matches.length > 0) ||
            (r.type === "lost" && matchCount(r.id) > 0)) && (
            <p className="match-hint">
              <Sparkles size={14} />
              Possible match available
            </p>
          )}
          <Button
            variant="outline"
            className="wide"
            onClick={() => setSelected(r.id)}
          >
            {r.type === "lost" || r.type === "found"
              ? "View item & matches"
              : "Track report"}
            <ArrowRight size={16} />
          </Button>
        </article>
      ))}
    </div>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A CAMPUS THAT LISTENS</span>
          <h1>
            {admin
              ? "Every report. A next step."
              : "Small report. Real progress."}
          </h1>
          <p>
            {admin
              ? "Route, respond, and resolve. Keep students in the loop."
              : "Report a concern, find what’s missing, and follow what happens next."}
          </p>
        </div>
        <Button className="primary" onClick={() => setCompose(true)}>
          <Plus size={17} />
          Report something
        </Button>
      </div>
      {notice && (
        <p role="status" className="success-message">
          <ShieldCheck size={17} />
          {notice}
        </p>
      )}
      <Tabs value={tab} onValueChange={setTab} className="reports-tabs">
        <TabsList>
          <TabsTrigger value="mine">
            {admin ? "All reports" : "My reports"}{" "}
            <span>{admin ? reports.length : mine.length}</span>
          </TabsTrigger>
          {admin ? (
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          ) : (
            <TabsTrigger value="board">
              Campus board <span>{board.length}</span>
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value={admin ? "analytics" : "unused"}>
          {loading ? (
            <Skeleton className="h-96 w-full" />
          ) : error ? (
            <div className="empty">
              <p role="alert">{error}</p>
              <Button onClick={retry}>Retry</Button>
            </div>
          ) : (
            <ReportAnalytics reports={reports} now={now} />
          )}
        </TabsContent>
        {["mine", ...(admin ? [] : ["board"])].map((value) => (
          <TabsContent key={value} value={value}>
            <div className="report-toolbar">
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="Search reports"
                  placeholder="Search reports or locations"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="report-filters">
                {[
                  ["Type", type, setType, REPORT_TYPES],
                  ...(admin
                    ? [
                        ["Department", department, setDepartment, DEPARTMENTS],
                        ["Priority", priority, setPriority, PRIORITIES],
                        [
                          "Status",
                          status,
                          setStatus,
                          [...STATUSES, "Escalated"],
                        ],
                      ]
                    : []),
                ].map(([label, value, setter, options]) => (
                  <label key={String(label)}>
                    <span>{String(label)}</span>
                    <select
                      aria-label={String(label) + " filter"}
                      value={String(value)}
                      onChange={(e) =>
                        (setter as (v: string) => void)(e.target.value)
                      }
                    >
                      <option value="all">
                        All{" "}
                        {
                          (
                            {
                              Type: "types",
                              Department: "departments",
                              Priority: "priorities",
                              Status: "statuses",
                            } as Record<string, string>
                          )[String(label)]
                        }
                      </option>
                      {(options as readonly string[]).map((x) => (
                        <option value={x} key={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            {content}
          </TabsContent>
        ))}
      </Tabs>
      <div className="privacy-note report-footnote">
        <ShieldCheck size={19} />
        <p>
          Campus issues can be shared or kept private. Lost & found posts show
          the reporter’s name and any contact details they choose to add.
          Grievances stay between the reporter and admins. Private claim
          contacts unlock only after approval.
        </p>
      </div>
      {compose && (
        <ReportForm
          open
          onClose={() => setCompose(false)}
          onSaved={(id) => {
            setNotice(
              "Report submitted. Your timeline and routing summary are ready.",
            );
            setSelected(id);
            setTab("mine");
          }}
        />
      )}
      {report && (
        <ReportDetail
          key={report.id}
          onDeleted={() => {
            setSelected(null);
            setNotice("Report deleted.");
            retry();
          }}
          report={report}
          reports={reports}
          claims={claims}
          now={now}
          onClose={() => setSelected(null)}
          onSelect={setSelected}
        />
      )}
    </>
  );
}
