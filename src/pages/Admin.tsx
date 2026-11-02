import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Activity,
  CircleCheck,
  CircleAlert,
  Database,
  Sparkles,
  ArrowRight,
  Clock3,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePulse } from "@/hooks/usePulse";
import { history, listenOpenReports, loadDemo } from "@/services/store";
import { cachedInsights, getInsights } from "@/services/ai";
import type { Insights } from "@/services/ai";
import { Status } from "@/components/Status";
import { age, hourLabel, VOTE_TTL } from "@/lib/pulse";
import type { CheckIn } from "@/lib/types";
import { configured } from "@/services/supabase";
import { SpaceForm } from "@/components/SpaceForm";
import { Link } from "react-router-dom";
export default function Admin() {
  const { spaces, loading, error, retry, now } = usePulse();
  const [addingSpace, setAddingSpace] = useState(false);
  const [logs, setLogs] = useState<CheckIn[]>([]),
    [spaceId, setSpaceId] = useState("reading-hall"),
    [reports, setReports] = useState<number | null>(null),
    [insights, setInsights] = useState<Insights | null>(cachedInsights),
    [busy, setBusy] = useState(false),
    [seeding, setSeeding] = useState(false),
    [notice, setNotice] = useState(""),
    [analyticsError, setAnalyticsError] = useState("");
  useEffect(() => {
    history()
      .then(setLogs)
      .catch(() =>
        setAnalyticsError(
          "Historical check-ins could not load. Try refreshing.",
        ),
      );
    return listenOpenReports(setReports, () =>
      setAnalyticsError("The open report count is unavailable."),
    );
  }, []);
  async function seed() {
    setSeeding(true);
    setNotice("");
    try {
      await loadDemo();
      setLogs(await history());
      setNotice("Demo data loaded. All seeded spaces are labeled below.");
    } catch {
      setNotice(
        "Demo data could not finish loading. Check admin permissions and try again.",
      );
    } finally {
      setSeeding(false);
    }
  }
  const data = Array.from({ length: 13 }, (_, i) => {
    const h = i + 8,
      rows = logs.filter((c) => c.spaceId === spaceId && c.hour === h);
    return {
      hour: hourLabel(h),
      free: rows.filter((x) => x.level === "free").length,
      moderate: rows.filter((x) => x.level === "moderate").length,
      crowded: rows.filter((x) => x.level === "crowded").length,
    };
  });
  const current = spaces.filter(
    (s) => s.reportCount && now - s.updatedAt < VOTE_TTL,
  );
  return (
    <>
      {addingSpace && (
        <SpaceForm
          onClose={() => setAddingSpace(false)}
          onSaved={() => setNotice("Campus space added.")}
        />
      )}
      <div className="page-heading">
        <div>
          <span className="eyebrow">CAMPUS OPERATIONS</span>
          <h1>A clearer view of campus.</h1>
          <p>See where it’s busy. Make room for a better day.</p>
        </div>
        <div className="action-row">
          <Button className="primary" onClick={() => setAddingSpace(true)}>
            <Plus size={16} /> Add space
          </Button>
          <Button variant="outline" disabled={seeding} onClick={seed}>
            <Database size={16} />
            {seeding ? "Loading demo data…" : "Load demo data"}
          </Button>
        </div>
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <section
        className="admin-commerce-links"
        aria-label="Marketplace and food court administration"
      >
        <Link to="/marketplace">
          <span className="eyebrow">CAMPUS MARKETPLACE</span>
          <h2>Keep the community trustworthy.</h2>
          <p>
            Monitor student listings and remove spam or inappropriate posts.
          </p>
          <strong>
            Manage marketplace <ArrowRight size={16} />
          </strong>
        </Link>
        <Link to="/food-court">
          <span className="eyebrow">DIGITAL FOOD COURT</span>
          <h2>A smoother service, from the kitchen.</h2>
          <p>
            Edit menus and timings, monitor mock orders and verify receipts.
          </p>
          <strong>
            Manage food court <ArrowRight size={16} />
          </strong>
        </Link>
      </section>
      <div className="admin-stats">
        {[
          [Activity, "Spaces monitored", spaces.length],
          [
            CircleCheck,
            "Free right now",
            current.filter((s) => s.level === "free").length,
          ],
          [
            CircleAlert,
            "Crowded right now",
            current.filter((s) => s.level === "crowded").length,
          ],
          [Clock3, "Open reports", reports ?? "Unavailable"],
        ].map(([Icon, label, value]) => {
          const I = Icon as typeof Activity;
          return (
            <article key={String(label)}>
              <I size={20} />
              <span>{String(label)}</span>
              <strong>{loading ? "—" : String(value)}</strong>
            </article>
          );
        })}
      </div>
      {analyticsError && (
        <p role="alert" className="notice">
          {analyticsError}
        </p>
      )}
      <div className="admin-panels">
        <section className="panel chart-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">THE LAST 7 DAYS</span>
              <h2>Busiest hours</h2>
            </div>
            <Select
              value={spaceId}
              onValueChange={(v) => {
                if (v) setSpaceId(v);
              }}
            >
              <SelectTrigger aria-label="Chart space" className="chart-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {spaces.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="muted">
            Number of student check-ins by crowd level · India time
          </p>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : !logs.length ? (
            <div className="empty">
              <Activity />
              <h3>No crowd history yet</h3>
              <p>Load demo data or collect student check-ins.</p>
            </div>
          ) : (
            <>
              <ChartContainer
                config={{
                  free: { label: "Free", color: "#16A34A" },
                  moderate: { label: "Moderate", color: "#F59E0B" },
                  crowded: { label: "Crowded", color: "#DC2626" },
                }}
                className="h-64 w-full"
              >
                <BarChart accessibilityLayer data={data}>
                  <CartesianGrid vertical={false} stroke="#edf0f5" />
                  <XAxis
                    dataKey="hour"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={18}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={25}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="free" fill="var(--color-free)" stackId="a" />
                  <Bar
                    dataKey="moderate"
                    fill="var(--color-moderate)"
                    stackId="a"
                  />
                  <Bar
                    dataKey="crowded"
                    fill="var(--color-crowded)"
                    stackId="a"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
              <div className="chart-legend">
                <Status level="free" />
                <Status level="moderate" />
                <Status level="crowded" />
              </div>
            </>
          )}
        </section>
        <section className="panel insights-panel">
          <span className="insight-icon">
            <Sparkles size={22} />
          </span>
          <span className="eyebrow">FROM DATA TO ACTION</span>
          <h2>A fresh perspective.</h2>
          <p>Three practical ways to make better use of your campus spaces.</p>
          {insights ? (
            <>
              <ol>
                {insights.findings.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ol>
              <small>
                {insights.source} · {age(insights.at)} · cached for 1 hour
              </small>
            </>
          ) : (
            <div className="insight-placeholder">
              Generate findings from the last 7 days of crowd reports.
            </div>
          )}
          <Button
            className="primary wide"
            disabled={busy || loading || !logs.length}
            onClick={async () => {
              setBusy(true);
              try {
                setInsights(await getInsights(spaces, logs));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Reviewing aggregate data…"
              : insights
                ? "Refresh AI insights"
                : "Generate AI insights"}
            <ArrowRight size={16} />
          </Button>
          <small>
            Only aggregate statistics are shared. No personal information.
          </small>
        </section>
      </div>
      <section className="panel overview">
        <div className="section-heading">
          <div>
            <h2>Live space overview</h2>
            <p>Reports from the last 20 minutes.</p>
          </div>
          <span className="live-label">
            <span />
            {configured ? "Live updates" : "Demo data"}
          </span>
        </div>
        {error ? (
          <div className="empty">
            <p role="alert">{error}</p>
            <Button onClick={retry}>Retry</Button>
          </div>
        ) : loading ? (
          <Skeleton className="h-48 w-full" />
        ) : !spaces.length ? (
          <div className="empty">
            <Database />
            <h3>No spaces configured</h3>
            <p>Use Load demo data to populate the editable campus seed.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Space</th>
                  <th>Current status</th>
                  <th>Recent reports</th>
                  <th>Last update</th>
                </tr>
              </thead>
              <tbody>
                {spaces.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                      <small>
                        {s.zone}
                        {s.demo ? " · Demo data" : ""}
                      </small>
                    </td>
                    <td>
                      <Status
                        level={s.level}
                        stale={!s.reportCount || now - s.updatedAt >= VOTE_TTL}
                      />
                    </td>
                    <td>{now - s.updatedAt >= VOTE_TTL ? 0 : s.reportCount}</td>
                    <td>{age(s.updatedAt, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
