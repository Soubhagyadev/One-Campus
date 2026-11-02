import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  Database,
  Frown,
  Heart,
  LockKeyhole,
  Meh,
  ShieldCheck,
  Smile,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { SupportCard } from "@/components/SupportCard";
import { useAuth } from "@/hooks/useAuth";
import { configured } from "@/services/supabase";
import {
  listenMoodDays,
  loadMoodDemo,
  personalHistory,
  saveWellness,
} from "@/services/wellness";
import {
  campusDay,
  distressInNote,
  MOODS,
  moodAverage,
  WELLNESS_TAGS,
} from "@/lib/wellness";
import type { MoodDay, PersonalEntry } from "@/lib/wellness";
function AdminWellness() {
  const [days, setDays] = useState<MoodDay[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    setLoading(true);
    setError("");
    return listenMoodDays(
      (rows) => {
        setDays(rows);
        setLoading(false);
      },
      () => {
        setError(
          "Aggregate trends could not load. Check your connection and try again.",
        );
        setLoading(false);
      },
    );
  }, [version]);
  const recent = days.filter(
    (d) => d.date >= campusDay(Date.now() - 7 * 86400000),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PRIVACY BEFORE PATTERNS</span>
          <h1>A kinder view of campus.</h1>
          <p>
            Daily mood counts, with a minimum of 10 check-ins before a day is
            shown.
          </p>
        </div>
        {!configured && (
          <Button variant="outline" onClick={() => loadMoodDemo()}>
            <Database size={16} />
            Load aggregate demo
          </Button>
        )}
      </div>
      <div className="privacy-note">
        <ShieldCheck size={20} />
        <p>
          Individual wellness entries never reach the server. No identities,
          tags, or notes are stored with daily counts. Days with fewer than 10
          check-ins are not readable in this view.
        </p>
      </div>
      <section className="panel mood-trends">
        <div className="section-heading">
          <div>
            <h2>The last 7 days</h2>
            <p>
              Aggregate moods, shared voluntarily.
              {recent.some((d) => d.demo)
                ? " Includes labeled synthetic demo counts."
                : ""}
            </p>
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-72 w-full" />
        ) : error ? (
          <div className="empty">
            <p role="alert">{error}</p>
            <Button onClick={() => setVersion((v) => v + 1)}>
              Retry trends
            </Button>
          </div>
        ) : !recent.length ? (
          <div className="empty">
            <LockKeyhole />
            <h3>Not enough data to show</h3>
            <p>
              A day becomes visible only after at least 10 check-ins. No
              individual entries are available to administrators.
            </p>
          </div>
        ) : (
          <>
            <ChartContainer
              config={{
                m1: { label: "Very low", color: "#7283a0" },
                m2: { label: "Low", color: "#91a1b9" },
                m3: { label: "Okay", color: "#c6d0df" },
                m4: { label: "Good", color: "#3d658d" },
                m5: { label: "Great", color: "#0b1f4b" },
              }}
              className="h-72 w-full"
            >
              <BarChart
                accessibilityLayer
                data={recent.map((d) => ({ ...d, label: d.date.slice(5) }))}
              >
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                {[1, 2, 3, 4, 5].map((m) => (
                  <Bar
                    key={m}
                    dataKey={"m" + m}
                    stackId="moods"
                    fill={`var(--color-m${m})`}
                  />
                ))}
              </BarChart>
            </ChartContainer>
            <div className="mood-day-list">
              {recent.map((d) => (
                <article key={d.date}>
                  <strong>{d.date}</strong>
                  <span>
                    {d.total} check-ins{d.demo ? " · Demo data" : ""}
                  </span>
                  <small>
                    Average {moodAverage(d)?.toFixed(1)} / 5 ·{" "}
                    {MOODS.map(
                      (label, i) => `${label}: ${d[("m" + (i + 1)) as "m1"]}`,
                    ).join(" · ")}
                  </small>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      <p className="muted">
        A mood count is a voluntary snapshot, not a diagnosis or a measure of
        any individual student.
      </p>
    </>
  );
}
export default function Wellness() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<PersonalEntry[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [mood, setMood] = useState<number | null>(null),
    [tags, setTags] = useState<string[]>([]),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      setEntries(personalHistory(user!.uid));
    } catch {
      setError(
        "Your device history could not be read. Check browser storage settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [user]);
  if (user?.role === "admin") return <AdminWellness />;
  const today = entries.find((e) => e.date === campusDay()),
    distress = distressInNote(note) || (!!today && distressInNote(today.note));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A MOMENT, JUST FOR YOU</span>
          <h1>How are you, really?</h1>
          <p>No right answer. No pressure. Just a little room to check in.</p>
        </div>
        <span className="private-label">
          <LockKeyhole size={15} />
          Private by design
        </span>
      </div>
      <div
        className={`wellness-layout ${distress ? "show-support-first" : ""}`}
      >
        <section className="wellness-main">
          <div className="wellness-intro">
            <Heart size={24} />
            <h2>Your day doesn’t have to be perfect.</h2>
            <p>Take a breath. Notice where you are. Start with that.</p>
          </div>
          {loading ? (
            <Skeleton className="h-72 w-full" />
          ) : today ? (
            <article className="daily-complete">
              <span className="status free">
                <CheckCircle2 size={15} />
                Today’s check-in saved
              </span>
              <h2>{today.message}</h2>
              <p>{today.suggestion}</p>
              <small>
                {today.source} · A supportive reflection, not medical advice.
              </small>
              <div className="daily-summary">
                <strong>{MOODS[today.mood - 1]}</strong>
                <span>
                  {today.tags.length
                    ? today.tags.join(" · ")
                    : "No tags selected"}
                </span>
              </div>
              <p className="muted">
                {today.shared
                  ? "One anonymous mood count was shared."
                  : "Your entry is saved on this device. The anonymous count could not be shared; it has not been retried."}{" "}
                You can check in again tomorrow.
              </p>
            </article>
          ) : (
            <form
              className="wellness-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (mood === null) {
                  setError("Choose a mood before saving your check-in.");
                  return;
                }
                setBusy(true);
                setError("");
                try {
                  const result = await saveWellness(user!.uid, {
                    mood,
                    tags: tags as never,
                    note,
                  });
                  setEntries((previous) => [...previous, result]);
                  setNote("");
                } catch (e) {
                  setError(
                    (e as Error).message ||
                      "Your check-in could not be saved. Check browser storage and try again.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <fieldset disabled={busy}>
                <legend>What does today feel like?</legend>
                <div className="mood-options">
                  {[Frown, Cloud, Meh, Smile, Sun].map((Icon, i) => (
                    <Button
                      key={i}
                      type="button"
                      variant="outline"
                      aria-pressed={mood === i + 1}
                      className={mood === i + 1 ? "selected" : ""}
                      onClick={() => setMood(i + 1)}
                    >
                      <Icon size={25} />
                      <span>{MOODS[i]}</span>
                      <small>{i + 1}</small>
                    </Button>
                  ))}
                </div>
                <Label>
                  What’s on your mind? <span className="muted">(optional)</span>
                </Label>
                <div
                  className="chip-choices"
                  role="group"
                  aria-label="Wellness tags"
                >
                  {WELLNESS_TAGS.map((t) => (
                    <Button
                      type="button"
                      key={t}
                      variant="outline"
                      aria-pressed={tags.includes(t)}
                      className={tags.includes(t) ? "selected" : ""}
                      onClick={() =>
                        setTags((v) =>
                          v.includes(t) ? v.filter((x) => x !== t) : [...v, t],
                        )
                      }
                    >
                      {t}
                    </Button>
                  ))}
                </div>
                <Label htmlFor="wellness-note">
                  A note to yourself <span className="muted">(optional)</span>
                </Label>
                <Textarea
                  id="wellness-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  placeholder="You can leave a thought here. It stays on this device."
                />
                <div className="privacy-note">
                  <LockKeyhole size={18} />
                  <p>
                    Your note stays on your device. Only an anonymous daily
                    count is shared. AI receives only the mood score and
                    selected tags.
                  </p>
                </div>
              </fieldset>
              <Button className="primary wide" disabled={busy}>
                {busy
                  ? "Saving your private check-in…"
                  : "Save today’s check-in"}
                <ArrowRight size={16} />
              </Button>
              <small>
                One check-in per day on this device. No individual wellness
                entries on the server.
              </small>
            </form>
          )}
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <section className="personal-history">
            <div className="section-heading">
              <h2>Your recent days</h2>
              <span>
                <LockKeyhole size={14} />
                Only on this device
              </span>
            </div>
            {entries.length ? (
              entries
                .slice(-7)
                .reverse()
                .map((e) => (
                  <article key={e.date}>
                    <div>
                      <strong>{MOODS[e.mood - 1]}</strong>
                      <span>{e.date}</span>
                    </div>
                    <p>
                      {e.tags.join(" · ") || "A moment to notice how you feel."}
                    </p>
                    {e.note && <p className="device-note">{e.note}</p>}
                  </article>
                ))
            ) : (
              <div className="inline-empty">
                Your check-ins will appear here. Your history and notes stay in
                this browser.
              </div>
            )}
            <small>
              Anyone with access to this browser profile may be able to read
              device storage. This history does not sync across devices.
            </small>
          </section>
        </section>
        <SupportCard prominent={distress} />
      </div>
    </>
  );
}
