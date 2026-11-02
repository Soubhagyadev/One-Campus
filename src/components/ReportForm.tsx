import { useRef, useState } from "react";
import {
  ArrowRight,
  Upload,
  ImageOff,
  ShieldCheck,
  CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { compressPhoto } from "@/lib/photo";
import { COLORS, FEATURES, ITEMS, TOPICS, draftSchema } from "@/lib/reports";
import type { ReportDraft, SafeDetails } from "@/lib/reports";
import { submitReport } from "@/services/reports";
const initial: SafeDetails = {
  intent: "issue",
  topic: "Wi-Fi unavailable",
  item: "Not applicable",
  color: "Not specified",
  feature: "Not specified",
  urgency: "medium",
};
export function ReportForm({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { user } = useAuth();
  const [details, setDetails] = useState<SafeDetails>(initial),
    [image, setImage] = useState(""),
    [photoSafe, setPhotoSafe] = useState(false),
    [busy, setBusy] = useState(false),
    [photoBusy, setPhotoBusy] = useState(false),
    [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const item = details.intent === "lost" || details.intent === "found";
  function update(key: keyof SafeDetails, value: string) {
    setDetails((d) => ({ ...d, [key]: value }));
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    setError("");
    const data = new FormData(e.currentTarget),
      parsed = draftSchema.safeParse({
        title: data.get("title"),
        description: data.get("description"),
        location: data.get("location"),
        image,
        photoSafe,
        safeDetails: details,
        customDetails: {
          topic: String(data.get("other-topic") || ""),
          item: String(data.get("other-item") || ""),
          color: String(data.get("other-color") || ""),
        },
        contactNumber: String(data.get("contact-number") || ""),
        contactAddress: String(data.get("contact-address") || ""),
        visibility:
          details.intent === "grievance"
            ? "private"
            : String(data.get("visibility") || "campus"),
      });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const r = await submitReport(user, parsed.data as ReportDraft);
      onSaved(r.id);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error && e.name === "ZodError"
          ? "Please check your report details."
          : "Your report could not be saved. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy && !photoBusy) onClose();
      }}
    >
      <DialogContent className="report-dialog">
        <DialogHeader>
          <span className="eyebrow">ONE PLACE. A CLEAR NEXT STEP.</span>
          <DialogTitle>Report something</DialogTitle>
          <DialogDescription>
            Share what happened. We’ll help route it to the right team.
          </DialogDescription>
        </DialogHeader>
        <form ref={form} onSubmit={save} className="report-form">
          <fieldset disabled={busy || photoBusy}>
            <legend>What would you like to report?</legend>
            <div className="intent-options">
              {(
                [
                  ["issue", "Campus issue"],
                  ["grievance", "Grievance"],
                  ["lost", "Lost an item"],
                  ["found", "Found an item"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={details.intent === value ? "selected" : ""}
                >
                  <input
                    type="radio"
                    name="intent"
                    value={value}
                    checked={details.intent === value}
                    onChange={() =>
                      setDetails({
                        ...initial,
                        intent: value,
                        topic:
                          value === "lost" || value === "found"
                            ? "Personal belonging"
                            : "Wi-Fi unavailable",
                        item:
                          value === "lost" || value === "found"
                            ? "Bottle"
                            : "Not applicable",
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="form-grid">
              <div>
                <Label htmlFor="report-topic">
                  {item ? "Item type" : "Topic"}
                </Label>
                <select
                  id="report-topic"
                  className="native-select"
                  value={item ? details.item : details.topic}
                  onChange={(e) =>
                    update(item ? "item" : "topic", e.target.value)
                  }
                >
                  {(item
                    ? ITEMS.filter((x) => x !== "Not applicable")
                    : TOPICS.filter((x) => x !== "Personal belonging")
                  ).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="report-urgency">Priority</Label>
                <select
                  id="report-urgency"
                  className="native-select"
                  value={details.urgency}
                  onChange={(e) => update("urgency", e.target.value)}
                >
                  <option value="low">Low · within 7 days</option>
                  <option value="medium">Medium · within 72 hours</option>
                  <option value="high">High · within 24 hours</option>
                </select>
              </div>
              {item && (
                <>
                  <div>
                    <Label htmlFor="item-color">Item color</Label>
                    <select
                      id="item-color"
                      className="native-select"
                      value={details.color}
                      onChange={(e) => update("color", e.target.value)}
                    >
                      {COLORS.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="item-feature">Material or feature</Label>
                    <select
                      id="item-feature"
                      className="native-select"
                      value={details.feature}
                      onChange={(e) => update("feature", e.target.value)}
                    >
                      {FEATURES.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            {(
              [
                ["topic", "Other"],
                ["item", "Other item"],
                ["color", "Other color"],
              ] as const
            ).map(
              ([key, sentinel]) =>
                details[key] === sentinel && (
                  <div key={key}>
                    <Label htmlFor={`other-${key}`}>
                      Describe the other {key}
                    </Label>
                    <Input
                      id={`other-${key}`}
                      name={`other-${key}`}
                      minLength={2}
                      maxLength={120}
                      required
                      placeholder={`Write the ${key} manually`}
                    />
                  </div>
                ),
            )}
            <Label htmlFor="report-title">Title</Label>
            <Input
              id="report-title"
              name="title"
              placeholder={
                item
                  ? "e.g. Blue metal bottle left in the library"
                  : "e.g. Wi-Fi keeps disconnecting in the reading hall"
              }
              minLength={5}
              maxLength={120}
              required
            />
            <Label htmlFor="report-description">What happened?</Label>
            <Textarea
              id="report-description"
              name="description"
              placeholder="Add details that will help the campus team understand the situation."
              minLength={15}
              maxLength={3000}
              rows={3}
              required
            />
            <p className="field-hint">
              {details.intent === "grievance"
                ? "Grievances are visible only to you and administrators."
                : "Your name and any contact details you choose to add are visible with a shared report. Use a campus meeting point for returns."}{" "}
              Free-text fields are never sent to Gemini.
            </p>
            <Label htmlFor="report-location">Campus location</Label>
            <Input
              id="report-location"
              name="location"
              placeholder="Building, floor, or nearest landmark"
              minLength={2}
              maxLength={120}
              required
            />
            {details.intent === "issue" && (
              <>
                <Label htmlFor="report-visibility">
                  Who can see this report?
                </Label>
                <select
                  id="report-visibility"
                  name="visibility"
                  className="native-select"
                  defaultValue="campus"
                >
                  <option value="campus">
                    Campus board · signed-in students and admins
                  </option>
                  <option value="private">Private · only me and admins</option>
                </select>
              </>
            )}
            <div className="form-grid">
              <div>
                <Label htmlFor="contact-number">
                  Contact number (optional)
                </Label>
                <Input
                  id="contact-number"
                  name="contact-number"
                  type="tel"
                  maxLength={16}
                  pattern="\+?[0-9]{10,15}"
                  placeholder="10–15 digits, optional + prefix"
                />
              </div>
              <div>
                <Label htmlFor="contact-address">
                  Contact address / meeting point (optional)
                </Label>
                <Input
                  id="contact-address"
                  name="contact-address"
                  maxLength={160}
                  placeholder="e.g. Library help desk, Block A"
                />
              </div>
            </div>
            <p className="field-hint">
              Submitting as {user?.name}. Shared issue and lost/found posts
              display your name and these optional contact details. Private
              grievances stay restricted. Claim verification details remain
              private until approval.
            </p>
            <div className="photo-upload">
              <div>
                <Label htmlFor="report-photo">
                  <Upload size={16} />
                  Add a photo <span className="muted">(optional)</span>
                </Label>
                <p>Don't include people in photos.</p>
                <small>
                  JPEG, PNG, or WebP · max 10 MB. Compressed on your device.
                </small>
              </div>
              <Input
                id="report-photo"
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const file = e.currentTarget.files?.[0];
                  setImage("");
                  setPhotoSafe(false);
                  if (!file) return;
                  setPhotoBusy(true);
                  setError("");
                  try {
                    setImage(await compressPhoto(file));
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setPhotoBusy(false);
                  }
                }}
              />
              {photoBusy && <p role="status">Compressing your photo…</p>}
              {image && (
                <>
                  <div className="photo-preview">
                    <img src={image} alt="Compressed report attachment" />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setImage("");
                        setPhotoSafe(false);
                      }}
                    >
                      <ImageOff size={16} />
                      Remove photo
                    </Button>
                  </div>
                  <label className="check-label">
                    <Checkbox
                      checked={photoSafe}
                      onCheckedChange={(v) => setPhotoSafe(v === true)}
                      aria-label="Photo has no people or identifying information"
                    />
                    <span>
                      I confirm this photo has no people, names, contact
                      details, or student IDs. It may be sent to Gemini for
                      triage and matching.
                    </span>
                  </label>
                </>
              )}
            </div>
            <div className="privacy-note">
              <ShieldCheck size={18} />
              <p>
                AI sees only selected categories, item attributes, and a
                confirmed safe photo. Your title, description, location, and
                contact details stay out of AI requests.
              </p>
            </div>
          </fieldset>
          {error && (
            <p className="error-text" role="alert">
              <CircleAlert size={16} />
              {error}
            </p>
          )}
          <Button
            className="primary wide"
            type="submit"
            disabled={busy || photoBusy}
          >
            {busy ? "Routing and saving your report…" : "Submit report"}
            <ArrowRight size={16} />
          </Button>
          <small>
            AI is advisory. If it’s unavailable, a labeled local rule routes
            your report.
          </small>
        </form>
      </DialogContent>
    </Dialog>
  );
}
