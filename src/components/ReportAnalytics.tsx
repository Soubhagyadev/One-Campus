import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { CircleAlert, Clock3, CheckCircle2, Flag, Repeat2 } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { reportAnalytics } from "@/lib/reports";
import type { CampusReport } from "@/lib/reports";
export function ReportAnalytics({
  reports,
  now,
}: {
  reports: CampusReport[];
  now: number;
}) {
  const data = reportAnalytics(reports, now);
  return (
    <div className="report-analytics">
      <div className="admin-stats">
        {[
          [Flag, "Reports this month", data.total],
          [CircleAlert, "Overdue · all open", data.overdue],
          [CheckCircle2, "Resolved this month", data.resolved],
          [
            Clock3,
            "Avg. resolution",
            data.averageHours === null
              ? "No resolved reports"
              : `${data.averageHours.toFixed(1)} hrs`,
          ],
        ].map(([Icon, label, value]) => {
          const I = Icon as typeof Flag;
          return (
            <article key={String(label)}>
              <I size={20} />
              <span>{String(label)}</span>
              <strong>{String(value)}</strong>
            </article>
          );
        })}
      </div>
      <div className="report-chart-grid">
        {(
          [
            ["Most frequent categories", data.categories],
            ["Most reported locations", data.locations],
          ] as const
        ).map(([title, rows]) => (
          <section className="panel" key={title}>
            <h3>{title}</h3>
            <p className="muted">Reports created this month · India time</p>
            {!rows.length ? (
              <div className="empty">
                <Flag />
                <p>No reports to chart yet.</p>
              </div>
            ) : (
              <ChartContainer
                config={{ count: { label: "Reports", color: "#0B1F4B" } }}
                className="report-bar-chart"
              >
                <BarChart
                  accessibilityLayer
                  data={rows.slice(0, 5)}
                  layout="vertical"
                  margin={{ left: 0, right: 20 }}
                >
                  <CartesianGrid horizontal={false} stroke="#edf0f5" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={120}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </section>
        ))}
      </div>
      <section className="panel recurring">
        <h3>
          <Repeat2 size={18} />
          Recurring problems
        </h3>
        <p className="muted">
          Same category and location reported at least twice this month. Based
          on counts, not AI.
        </p>
        {data.recurring.length ? (
          data.recurring.slice(0, 5).map((r) => (
            <div key={r.category + r.location}>
              <strong>{r.category}</strong>
              <span>{r.location}</span>
              <span className="count">{r.count} reports</span>
            </div>
          ))
        ) : (
          <p className="inline-empty">
            No recurring patterns yet. We’ll highlight repeated issues as
            reports arrive.
          </p>
        )}
      </section>
    </div>
  );
}
