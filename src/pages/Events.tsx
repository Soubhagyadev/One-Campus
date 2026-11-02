import { useEffect, useState, useRef } from "react";
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
  Pencil,
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
  editEvent,
  createTeam,
  editTeam,
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
function EditEventForm({
  event,
  onClose,
}: {
  event: CampusEvent;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [tags, setTags] = useState<string[]>([...event.tags]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Format existing date for datetime-local input (IST)
  const defaultDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(event.date))
    .replace(" ", "T");
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="report-dialog">
        <DialogHeader>
          <DialogTitle>Edit event</DialogTitle>
          <DialogDescription>
            Update the event details. Changes are visible immediately to all students.
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
              await editEvent(user!, event.id, {
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
          <Label htmlFor="edit-event-title">Event title</Label>
          <Input
            id="edit-event-title"
            name="title"
            defaultValue={event.title}
            minLength={5}
            maxLength={120}
            required
          />
          <Label htmlFor="edit-event-club">Club</Label>
          <select
            id="edit-event-club"
            name="club"
            className="native-select"
            defaultValue={event.club}
          >
            {CLUBS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <Label htmlFor="edit-event-date">Date and time (IST)</Label>
          <Input
            id="edit-event-date"
            name="date"
            type="datetime-local"
            defaultValue={defaultDate}
            required
          />
          <Label htmlFor="edit-event-venue">Venue</Label>
          <Input
            id="edit-event-venue"
            name="venue"
            defaultValue={event.venue}
            minLength={3}
            maxLength={120}
            required
          />
          <Label htmlFor="edit-event-description">Description</Label>
          <Textarea
            id="edit-event-description"
            name="description"
            defaultValue={event.description}
            minLength={20}
            maxLength={2000}
            required
          />
          <Label>Tags (1–3)</Label>
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
            {busy ? "Saving…" : "Save changes"}
            <ArrowRight size={16} />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function EventDetail({
  event,
  initialEditId,
  onClose,
}: {
  event: CampusEvent;
  initialEditId?: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<TeamPost[]>([]),
    [loading, setLoading] = useState(true),
    [rsvp, setGoing] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [compose, setCompose] = useState(false),
    [editingPost, setEditingPost] = useState<TeamPost | null>(null),
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
    const r = user?.role !== "admin"
      ? listenRsvp(user!, event.id, setGoing, () =>
          setError("RSVP status could not load. Please retry."),
        )
      : () => {};
    return () => {
      stop();
      r();
    };
  }, [event.id, user, version]);
  const handledEdit = useRef("");
  function startEdit(post: TeamPost) {
    setEditingPost(post);
    setKind(post.kind);
    setSkills([...post.skills]);
    setRoles([...post.roles]);
    setCompose(true);
    setError("");
  }
  useEffect(() => {
    if (!initialEditId || handledEdit.current === initialEditId) return;
    const post = posts.find(
      (p) => p.id === initialEditId && p.ownerUid === user?.uid,
    );
    if (post) {
      handledEdit.current = initialEditId;
      startEdit(post);
    }
  }, [initialEditId, posts, user?.uid]);
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
          {user?.role !== "admin" && (
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
          )}
        </div>
        <section className="team-finder">
          <div className="section-heading">
            <div>
              <h3>Good ideas need good people.</h3>
              <p>Find a team for this event.</p>
            </div>
            {user?.role !== "admin" && (
            <Button
              variant="outline"
              disabled={past || busy}
              onClick={() => {
                setCompose(!compose);
                setEditingPost(null);
                setKind("looking");
                setSkills([]);
                setRoles([]);
                setError("");
              }}
            >
              <Plus size={15} />
              Team post
            </Button>
            )}
          </div>
          {notice && (
            <p role="status" className="success-message">
              {notice}
            </p>
          )}
          {compose && user?.role !== "admin" && (
            <form
              key={editingPost?.id || "new-team-post"}
              className="stack-form team-compose"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  const savePost = editingPost
                    ? (input: Parameters<typeof createTeam>[1]) =>
                        editTeam(user!, editingPost.id, input)
                    : (input: Parameters<typeof createTeam>[1]) =>
                        createTeam(user!, input);
                  const post = await savePost({
                    eventId: event.id,
                    kind,
                    skills: skills as never,
                    roles: roles as never,
                    theme: String(form.get("theme")) as never,
                    idea: String(form.get("idea")),
                  });
                  setMyPostId(post.id);
                  setNotice(
                    editingPost
                      ? "Team request updated. Your changes are visible on the campus board."
                      : "Team request posted to the campus board.",
                  );
                  setCompose(false);
                  setEditingPost(null);
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
              {editingPost && <h3>Edit your team request</h3>}
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
              <select
                id="team-theme"
                name="theme"
                className="native-select"
                defaultValue={editingPost?.theme || THEMES[0]}
              >
                {THEMES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <Label htmlFor="team-idea">Your idea</Label>
              <Textarea
                id="team-idea"
                name="idea"
                defaultValue={editingPost?.idea || ""}
                minLength={15}
                maxLength={1000}
                required
                placeholder="What would you like to build or explore?"
              />
              <p className="field-hint">
                Appears immediately on the campus team board for all signed-in
                students. Don’t add contact details. AI receives only selected
                skills, roles, and the idea theme.
              </p>
              <Button className="primary" disabled={busy}>
                {busy
                  ? editingPost
                    ? "Saving…"
                    : "Posting…"
                  : editingPost
                    ? "Save team changes"
                    : "Post to team finder"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setCompose(false);
                  setEditingPost(null);
                }}
              >
                Cancel
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
                        : p.ownerName ||
                          (p.demo ? "Demo data" : "Campus student")}
                    </small>
                  </div>
                  {p.ownerUid === user?.uid && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || past}
                      onClick={() => startEdit(p)}
                    >
                      <Pencil size={14} /> Edit team request
                    </Button>
                  )}
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

function CampusTeamBoard({
  events,
  onSelect,
  onEdit,
}: {
  events: CampusEvent[];
  onSelect: (id: string) => void;
  onEdit: (eventId: string, postId: string) => void;
}) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<TeamPost[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    setLoading(true);
    setError("");
    return listenTeams(
      null,
      (rows) => {
        setPosts(rows);
        setLoading(false);
      },
      () => {
        setError("Team requests could not load.");
        setLoading(false);
      },
    );
  }, [version]);
  const visible = posts.filter((p) =>
    events.some((e) => e.id === p.eventId && e.date > Date.now()),
  );
  return (
    <section className="campus-team-board panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">OPEN TO EVERY SIGNED-IN STUDENT</span>
          <h2>
            Campus team requests <span className="count">{visible.length}</span>
          </h2>
          <p>
            Requests from all upcoming events appear here immediately. Open an
            event to post your own.
          </p>
        </div>
        <Users size={25} />
      </div>
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : error ? (
        <div>
          <p role="alert">{error}</p>
          <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
            Retry team requests
          </Button>
        </div>
      ) : !visible.length ? (
        <p className="inline-empty">
          No team requests yet. Open an upcoming event and choose “Team post” to
          start one.
        </p>
      ) : (
        <div className="team-board-grid">
          {visible.map((p) => {
            const e = events.find((e) => e.id === p.eventId)!;
            return (
              <article className="team-board-card" key={p.id}>
                <span className="eyebrow">{e.title}</span>
                <h3>
                  {p.kind === "looking"
                    ? "Looking for a team"
                    : "Team needs members"}
                </h3>
                <p>{p.idea}</p>
                <div className="tag-row">
                  {p.skills.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
                {p.roles.length > 0 && (
                  <p className="field-hint">
                    Looking for: {p.roles.join(", ")}
                  </p>
                )}
                <small>
                  Posted by {p.ownerName || "Campus student"} ·{" "}
                  {reportDate(p.createdAt)}
                </small>
                {p.ownerUid === user?.uid && (
                  <Button variant="outline" onClick={() => onEdit(e.id, p.id)}>
                    <Pencil size={14} /> Edit your request
                  </Button>
                )}
                <Button variant="outline" onClick={() => onSelect(e.id)}>
                  Open event & connect <ArrowRight size={15} />
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </section>
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
    [editingEvent, setEditingEvent] = useState<CampusEvent | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(),
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
      {!loading && !error && (
        <CampusTeamBoard
          events={events}
          onSelect={(id) => {
            setSelectedTeamId(undefined);
            setSelected(id);
          }}
          onEdit={(eventId, postId) => {
            setSelectedTeamId(postId);
            setSelected(eventId);
          }}
        />
      )}
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
                {user?.role === "admin" && (
                  <Button
                    variant="ghost"
                    className="event-edit-btn"
                    onClick={() => setEditingEvent(e)}
                  >
                    <Pencil size={15} /> Edit event
                  </Button>
                )}
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
      {editingEvent && (
        <EditEventForm
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
        />
      )}
      {event && (
        <EventDetail
          key={event.id}
          event={event}
          initialEditId={selectedTeamId}
          onClose={() => {
            setSelected(null);
            setSelectedTeamId(undefined);
          }}
        />
      )}
    </>
  );
}
