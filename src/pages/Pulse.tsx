import { useEffect, useState } from "react";
import {
  Activity,
  Search,
  SlidersHorizontal,
  BookOpen,
  Monitor,
  ArrowRight,
  Info,
  CircleCheck,
  Users,
  CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { usePulse } from "@/hooks/usePulse";
import { castVote, history } from "@/services/store";
import { configured } from "@/services/supabase";
import { bestHour, VOTE_TTL } from "@/lib/pulse";
import { SpaceCard } from "@/components/SpaceCard";
import type { CheckIn, Level, Space } from "@/lib/types";
export default function Pulse() {
  const { user } = useAuth(),
    { spaces, loading, error, now, retry } = usePulse();
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [quiet, setQuiet] = useState(false),
    [selected, setSelected] = useState<Space | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [voteError, setVoteError] = useState(""),
    [voted, setVoted] = useState<string[]>([]),
    [logs, setLogs] = useState<CheckIn[]>([]),
    [historyError, setHistoryError] = useState(false);
  useEffect(() => {
    history()
      .then(setLogs)
      .catch(() => setHistoryError(true));
  }, []);
  const visible = spaces
    .filter(
      (s) =>
        (filter === "all" || s.type === filter) &&
        (!quiet || s.quiet) &&
        `${s.name} ${s.zone}`.toLowerCase().includes(search.toLowerCase()),
    )
    .map((s) => ({
      ...s,
      bestHour: configured ? bestHour(logs, s.id, now) : s.bestHour,
    }));
  async function vote(level: Level) {
    if (!selected || !user) return;
    setBusy(true);
    setVoteError("");
    try {
      await castVote(selected, user.uid, level);
      setVoted((v) => [...v, selected.id]);
      setMessage(`Thanks! Your update for ${selected.name} is live.`);
      setSelected(null);
    } catch {
      setVoteError(
        "Your report could not be saved. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const free = spaces.filter(
    (s) => s.level === "free" && s.reportCount && now - s.updatedAt < VOTE_TTL,
  ).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR CAMPUS, AT A GLANCE</span>
          <h1>Find your space.</h1>
          <p>A quiet corner or a free computer. Know before you go.</p>
        </div>
        <span className="live-label">
          <span />
          {configured ? "Live campus updates" : "Demo campus updates"}
        </span>
      </div>
      <section className="pulse-banner">
        <div>
          <span className="banner-label">
            <Activity size={17} /> CAMPUSPULSE
          </span>
          <h2>
            A little heads-up.
            <br />A better campus day.
          </h2>
          <p>
            Real updates from students, for students.
            <br />
            Find the right spot to focus, connect, or get things done.
          </p>
          <a href="#spaces">
            Explore campus spaces <ArrowRight size={17} />
          </a>
        </div>
        <div className="campus-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="building">
            <div className="building-roof" />
            <div className="building-name">ALLIANCE</div>
            <div className="columns">
              {[0, 1, 2, 3, 4].map((i) => (
                <i key={i} />
              ))}
            </div>
            <div className="building-steps" />
          </div>
          <div className="art-badge">
            <CircleCheck size={18} /> Your next spot is closer than you think
          </div>
        </div>
      </section>
      <div className="summary-strip">
        <div>
          <span className="mini-icon">
            <BookOpen size={19} />
          </span>
          <p>
            <strong>{spaces.length || "—"}</strong>
            <span>Campus spaces</span>
          </p>
        </div>
        <div>
          <span className="mini-icon green">
            <CircleCheck size={19} />
          </span>
          <p>
            <strong>{loading ? "—" : free}</strong>
            <span>Spaces with room</span>
          </p>
        </div>
        <div>
          <span className="mini-icon">
            <Users size={19} />
          </span>
          <p>
            <strong>Student powered</strong>
            <span>Every report makes a difference</span>
          </p>
        </div>
      </div>
      <section id="spaces" className="spaces-section">
        <div className="section-heading">
          <div>
            <h2>
              Campus spaces <span className="count">{spaces.length}</span>
            </h2>
            <p>Find a place that fits what you need.</p>
          </div>
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Search spaces"
              placeholder="Search spaces or zones"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="filters">
          <div role="group" aria-label="Space type">
            {[
              ["all", "All spaces", Activity],
              ["library", "Library", BookOpen],
              ["lab", "Computer labs", Monitor],
            ].map(([id, label, Icon]) => {
              const I = Icon as typeof Activity;
              return (
                <Button
                  key={String(id)}
                  variant="ghost"
                  aria-pressed={filter === id}
                  className={filter === id ? "active" : ""}
                  onClick={() => setFilter(String(id))}
                >
                  <I size={16} />
                  {String(label)}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            aria-pressed={quiet}
            className={quiet ? "quiet-filter active" : "quiet-filter"}
            onClick={() => setQuiet(!quiet)}
          >
            <SlidersHorizontal size={16} />
            Quiet spaces
          </Button>
        </div>
        {message && (
          <div role="status" className="success-message">
            <CircleCheck size={17} />
            {message}
          </div>
        )}
        {historyError && (
          <p className="muted" role="status">
            Quieter-hour suggestions are temporarily unavailable. Current crowd
            reports are still shown.
          </p>
        )}
        {error ? (
          <div className="empty">
            <CircleAlert />
            <h3>Let’s try that again</h3>
            <p>{error}</p>
            <Button variant="outline" onClick={retry}>
              Retry updates
            </Button>
          </div>
        ) : loading ? (
          <div className="space-grid">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-80 w-full rounded-xl" />
            ))}
          </div>
        ) : !visible.length ? (
          <div className="empty">
            <Search />
            <h3>
              {spaces.length
                ? "No spaces match your search"
                : "Your campus spaces are on their way"}
            </h3>
            <p>
              {spaces.length
                ? "Try another keyword or clear the filters."
                : "Ask your administrator to load the campus spaces."}
            </p>
            {spaces.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                  setQuiet(false);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="space-grid">
            {visible.map((s) => (
              <SpaceCard
                key={s.id}
                space={s}
                now={now}
                voted={voted.includes(s.id)}
                onVote={() => {
                  setVoteError("");
                  setSelected(s);
                }}
              />
            ))}
          </div>
        )}
      </section>
      <aside className="info-note">
        <Info size={17} />
        <p>
          A snapshot, not a guarantee. Crowd levels reflect reports from the
          last 20 minutes. Your update helps the next person.
        </p>
      </aside>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How busy is it right now?</DialogTitle>
            <DialogDescription>
              {selected?.name}. Your latest report replaces your previous one
              and is active for 20 minutes.
            </DialogDescription>
          </DialogHeader>
          <div className="vote-options">
            {(
              [
                ["free", "Free", "Plenty of seats", CircleCheck],
                ["moderate", "Moderate", "A few seats", Users],
                ["crowded", "Crowded", "Almost full", CircleAlert],
              ] as const
            ).map(([level, label, band, Icon]) => (
              <Button
                key={level}
                variant="outline"
                className={`vote-option ${level}`}
                disabled={busy}
                onClick={() => vote(level)}
              >
                <Icon size={23} />
                <span>
                  <strong>{label}</strong>
                  <small>{band}</small>
                </span>
                <ArrowRight size={18} />
              </Button>
            ))}
          </div>
          {busy && <p role="status">Saving your report…</p>}
          {voteError && (
            <p role="alert" className="error-text">
              {voteError}
            </p>
          )}
          <p className="muted">
            Your name is never included in crowd analytics.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
