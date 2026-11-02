import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import {
  clubLead,
  createEvent,
  createTeam,
  listenEvents,
  listenRsvp,
  listenTeams,
  setRsvp,
} from "@/services/community";
import { suggestTeams } from "@/services/ai";
import { CLUBS, SKILLS, TAGS, THEMES } from "@/lib/community";
import type { CampusEvent, TeamPost, TeamSuggestion } from "@/lib/community";
import { reportDate } from "@/lib/reports";
function Chips({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly string[];
  value: string[];
  onChange: (value: string[]) => void;
  label: string;
}) {
  return (
    <div className="chip-choices" role="group" aria-label={label}>
      {options.map((s) => (
        <Button
          key={s}
          type="button"
          variant="outline"
          aria-pressed={value.includes(s)}
          className={value.includes(s) ? "selected" : ""}
          onClick={() =>
            onChange(
              value.includes(s) ? value.filter((v) => v !== s) : [...value, s],
            )
          }
        >
          {s}
        </Button>
      ))}
    </div>
  );
}
function EventForm({ lead, onClose }: { lead: string; onClose: () => void }) {
  const { user } = useAuth();
  const [tags, setTags] = useState<string[]>(["Workshop"]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="report-dialog">
        <DialogHeader>
          <DialogTitle>Create a campus event</DialogTitle>
          <DialogDescription>
            Give students a clear reason to show up. Event time is entered in
            India time.
          </DialogDescription>
        </DialogHeader>
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await createEvent(user!, {
                title: String(f.get("title")),
                club: String(f.get("club")) as never,
                date: Date.parse(String(f.get("date")) + ":00+05:30"),
                venue: String(f.get("venue")),
                description: String(f.get("description")),
                tags: tags as never,
              });
              onClose();
            } catch (e) {
              setError(
                (e as Error).name === "ZodError"
                  ? "Check all fields and choose one to three tags."
                  : (e as Error).message,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Label htmlFor="event-title">Event title</Label>
          <Input
            id="event-title"
            name="title"
            minLength={5}
            maxLength={120}
            required
          />
          <Label htmlFor="event-club">Club</Label>
          <select
            id="event-club"
            name="club"
            className="native-select"
            defaultValue={lead === "*" ? CLUBS[0] : lead}
          >
            {CLUBS.filter((c) => lead === "*" || c === lead).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <Label htmlFor="event-date">Date and time (IST)</Label>
          <Input id="event-date" name="date" type="datetime-local" required />
          <Label htmlFor="event-venue">Venue</Label>
          <Input
            id="event-venue"
            name="venue"
            minLength={3}
            maxLength={120}
            required
          />
          <Label htmlFor="event-description">Description</Label>
          <Textarea
            id="event-description"
            name="description"
            minLength={20}
            maxLength={2000}
            required
          />
          <Label>Tags (choose up to 3)</Label>
          <Chips
            options={TAGS}
            value={tags}
            onChange={setTags}
            label="Event tags"
          />
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <Button className="primary" disabled={busy}>
            {busy ? "Saving event…" : "Create event"}
            <ArrowRight size={16} />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function EventDetail({
  event,
  onClose,
}: {
  event: CampusEvent;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<TeamPost[]>([]),
    [loading, setLoading] = useState(true),
    [rsvp, setGoing] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [compose, setCompose] = useState(false),
    [kind, setKind] = useState<"looking" | "recruiting">("looking"),
    [skills, setSkills] = useState<string[]>([]),
    [roles, setRoles] = useState<string[]>([]),
    [suggestions, setSuggestions] = useState<{
      items: TeamSuggestion[];
      source: string;
    } | null>(null),
    [myPostId, setMyPostId] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    setLoading(true);
    setError("");
    const stop = listenTeams(
      event.id,
      (rows) => {
        setPosts(rows);
        setLoading(false);
      },
      () => {
        setError("Team posts could not load. Please try again.");
        setLoading(false);
      },
    );
    const r = listenRsvp(user!, event.id, setGoing, () =>
      setError("RSVP status could not load. Please retry."),
    );
    return () => {
      stop();
      r();
    };
  }, [event.id, user, version]);
  const mine = posts.filter((p) => p.ownerUid === user?.uid);
  const selectedPost = mine.find((p) => p.id === myPostId) || mine[0];
  const past = event.date <= Date.now();
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="report-dialog event-detail">
        <DialogHeader>
          <span className="eyebrow">{event.club}</span>
          <DialogTitle>{event.title}</DialogTitle>
          <DialogDescription>
            {reportDate(event.date)} IST · {event.venue}
            {event.demo ? " · Demo data" : ""}
          </DialogDescription>
        </DialogHeader>
        <p className="report-description">{event.description}</p>
        <div className="event-rsvp">
          <span>
            <Users size={16} />
            {event.rsvpCount} going
          </span>
          <Button
            className={rsvp || compose ? "" : "primary"}
            variant={rsvp || compose ? "outline" : "default"}
            disabled={busy || past || loading || !!error}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await setRsvp(user!, event.id, !rsvp);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {rsvp ? <CheckCircle2 size={16} /> : <Plus size={16} />}{" "}
            {past
              ? "Event ended"
              : rsvp
                ? "Going · withdraw RSVP"
                : "Count me in"}
          </Button>
        </div>
        <section className="team-finder">
          <div className="section-heading">
            <div>
              <h3>Good ideas need good people.</h3>
              <p>Find a team for this event.</p>
            </div>
            <Button
              variant="outline"
              disabled={past || busy}
              onClick={() => setCompose(!compose)}
            >
              <Plus size={15} />
              Team post
            </Button>
          </div>
          {compose && (
            <form
              className="stack-form team-compose"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  const post = await createTeam(user!, {
                    eventId: event.id,
                    kind,
                    skills: skills as never,
                    roles: roles as never,
                    theme: String(form.get("theme")) as never,
                    idea: String(form.get("idea")),
                  });
                  setMyPostId(post.id);
                  setCompose(false);
                  setSkills([]);
                  setRoles([]);
                  setSuggestions(null);
                } catch (e) {
                  setError(
                    (e as Error).name === "ZodError"
                      ? "Choose at least one skill; recruiting teams also need a role. Add an idea of at least 15 characters."
                      : (e as Error).message,
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Label htmlFor="team-kind">What are you looking for?</Label>
              <select
                id="team-kind"
                className="native-select"
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option value="looking">I’m looking for a team</option>
                <option value="recruiting">My team needs members</option>
              </select>
              <Label>Your skills (up to 6)</Label>
              <Chips
                options={SKILLS}
                value={skills}
                onChange={setSkills}
                label="Your skills"
              />
              {kind === "recruiting" && (
                <>
                  <Label>Roles your team needs (up to 6)</Label>
                  <Chips
                    options={SKILLS}
                    value={roles}
                    onChange={setRoles}
                    label="Roles needed"
                  />
                </>
              )}
              <Label htmlFor="team-theme">Idea theme for matching</Label>
              <select id="team-theme" name="theme" className="native-select">
                {THEMES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <Label htmlFor="team-idea">Your idea</Label>
              <Textarea
                id="team-idea"
                name="idea"
                minLength={15}
                maxLength={1000}
                required
                placeholder="What would you like to build or explore?"
              />
              <p className="field-hint">
                Visible to signed-in students. Don’t add contact details. AI
                receives only selected skills, roles, and the idea theme.
              </p>
              <Button className="primary" disabled={busy}>
                {busy ? "Posting…" : "Post to team finder"}
              </Button>
            </form>
          )}
          {mine.length > 0 && (
            <div className="team-suggest">
              <label htmlFor="match-team">Suggest matches for</label>
              <select
                id="match-team"
                className="native-select"
                value={selectedPost?.id || ""}
                onChange={(e) => {
                  setMyPostId(e.target.value);
                  setSuggestions(null);
                }}
              >
                {mine.map((p, i) => (
                  <option value={p.id} key={p.id}>
                    {p.kind === "looking"
                      ? "Looking for a team"
                      : "Team needs members"}{" "}
                    · Post {i + 1}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                disabled={busy || past || !selectedPost}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const result = await suggestTeams(selectedPost!, posts);
                    setSuggestions({
                      items: result.suggestions,
                      source: result.source,
                    });
                  } catch {
                    setError(
                      "Suggestions are unavailable. You can still browse team posts.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Sparkles size={15} />
                {busy ? "Finding matches…" : "Suggest matches"}
              </Button>
            </div>
          )}
          {suggestions && (
            <div className="team-suggestions">
              <span className="eyebrow">{suggestions.source}</span>
              {!suggestions.items.length ? (
                <p className="inline-empty">
                  No complementary posts yet. Check back as more students join.
                </p>
              ) : (
                suggestions.items.map((s) => {
                  const p = posts.find((p) => p.id === s.postId);
                  return (
                    <div key={s.postId}>
                      <strong>
                        {p?.kind === "recruiting"
                          ? "Team needs members"
                          : "Looking for a team"}{" "}
                        · {Math.round(s.score * 100)}% fit
                      </strong>
                      <p>{s.reason}</p>
                      <small>{p?.idea}</small>
                    </div>
                  );
                })
              )}
            </div>
          )}
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : !posts.length ? (
            <div className="empty">
              <Users />
              <h3>Start the conversation.</h3>
              <p>
                No team posts yet. Share your skills or invite someone into your
                team.
              </p>
            </div>
          ) : (
            <div className="team-posts">
              {posts.map((p) => (
                <article key={p.id}>
                  <div className="section-heading">
                    <span className="status stale">
                      <Users size={14} />
                      {p.kind === "looking"
                        ? "Looking for a team"
                        : "Team needs members"}
                    </span>
                    <small>
                      {p.ownerUid === user?.uid
                        ? "Your post"
                        : p.demo
                          ? "Demo data"
                          : "Student post"}
                    </small>
                  </div>
                  <h4>{p.theme}</h4>
                  <p>{p.idea}</p>
                  <div className="tag-row">
                    {p.skills.map((s) => (
                      <span key={s}>{s}</span>
                    ))}
                  </div>
                  {p.roles.length > 0 && (
                    <small>Looking for: {p.roles.join(", ")}</small>
                  )}
                  <p className="team-meet">
                    Connect at {event.venue} during the event. Contact details
                    are not posted here.
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
        {error && (
          <div role="alert">
            <p className="error-text">{error}</p>
            <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
              Retry connection
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
export default function Events() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CampusEvent[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("all"),
    [lead, setLead] = useState<string | null>(null),
    [creating, setCreating] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [version, setVersion] = useState(0);
  useEffect(() => {
    setLoading(true);
    setError("");
    const stop = listenEvents(
      (rows) => {
        setEvents(rows);
        setLoading(false);
      },
      () => {
        setError("Events could not load. Please try again.");
        setLoading(false);
      },
    );
    clubLead(user!)
      .then(setLead)
      .catch(() => setLead(null));
    return stop;
  }, [user, version]);
  const visible = events.filter(
      (e) => (filter === "all" || e.club === filter) && e.date >= Date.now(),
    ),
    event = events.find((e) => e.id === selected);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CAMPUS IS BETTER TOGETHER</span>
          <h1>Find your people.</h1>
          <p>Follow your curiosity. There’s something happening around you.</p>
        </div>
        {lead && (
          <Button className="primary" onClick={() => setCreating(true)}>
            <Plus size={16} />
            Create event
          </Button>
        )}
      </div>
      <section className="community-banner">
        <div>
          <span className="eyebrow">YOUR NEXT GOOD STORY STARTS HERE</span>
          <h2>
            A new idea.
            <br />A familiar campus.
            <br />A team you haven’t met yet.
          </h2>
          <p>
            Discover events and find people who bring something different to the
            table.
          </p>
        </div>
        <div className="community-art" aria-hidden="true">
          <Users size={110} strokeWidth={1} />
          <span>Make room for possibility.</span>
        </div>
      </section>
      <div className="section-heading events-heading">
        <div>
          <h2>
            Coming up on campus <span className="count">{visible.length}</span>
          </h2>
          <p>Real plans, shared interests, and a reason to show up.</p>
        </div>
        <label className="club-filter" htmlFor="club-filter">
          Filter by club
          <select
            id="club-filter"
            className="native-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All clubs</option>
            {CLUBS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <div className="empty">
          <CircleAlert />
          <h3>Let’s reconnect</h3>
          <p role="alert">{error}</p>
          <Button onClick={() => setVersion((v) => v + 1)}>Retry events</Button>
        </div>
      ) : loading ? (
        <div className="report-cards">
          {[1, 2].map((i) => (
            <Skeleton className="h-72 w-full" key={i} />
          ))}
        </div>
      ) : !visible.length ? (
        <div className="empty">
          <CalendarDays />
          <h3>No upcoming events for this club.</h3>
          <p>Try another club or check back when new events are announced.</p>
        </div>
      ) : (
        <div className="event-grid">
          {visible.map((e) => (
            <article className="event-card" key={e.id}>
              <div className="event-date">
                <strong>
                  {new Intl.DateTimeFormat("en-IN", {
                    timeZone: "Asia/Kolkata",
                    day: "numeric",
                  }).format(e.date)}
                </strong>
                <span>
                  {new Intl.DateTimeFormat("en-IN", {
                    timeZone: "Asia/Kolkata",
                    month: "short",
                  }).format(e.date)}
                </span>
                <CalendarDays size={18} />
              </div>
              <div className="event-card-body">
                <span className="eyebrow">{e.club}</span>
                <h3>{e.title}</h3>
                <p>{e.description}</p>
                <div className="tag-row">
                  {e.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <div className="event-meta">
                  <span>
                    <MapPin size={14} />
                    {e.venue}
                  </span>
                  <span>
                    <Users size={14} />
                    {e.rsvpCount} going
                  </span>
                </div>
                <small>
                  {reportDate(e.date)} IST{e.demo ? " · Demo data" : ""}
                </small>
                <Button variant="outline" onClick={() => setSelected(e.id)}>
                  View event & find a team <ArrowRight size={16} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="privacy-note report-footnote">
        <ShieldCheck size={18} />
        <p>
          Team matching uses selected skills, roles, and idea themes. Your name,
          contact details, and free-text idea are never sent to AI.
        </p>
      </div>
      {creating && lead && (
        <EventForm lead={lead} onClose={() => setCreating(false)} />
      )}{" "}
      {event && (
        <EventDetail
          key={event.id}
          event={event}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
