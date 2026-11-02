import { useState } from "react";
import {
  BookOpen,
  Plus,
  Search,
  ShoppingBag,
  Phone,
  ImagePlus,
  X,
  ShieldCheck,
  ArrowUpRight,
  PackageCheck,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useMarketplace } from "@/hooks/useCommerce";
import { postListing, changeListing, editListing } from "@/services/commerce";
import { MARKET_CATEGORIES, listingSchema, money, when } from "@/lib/commerce";
import type { Listing } from "@/lib/commerce";
import { compressPhoto } from "@/lib/photo";
import { configured } from "@/services/supabase";
export default function Marketplace() {
  const { user } = useAuth();
  const admin = user!.role === "admin",
    { data: listings, loading, error, retry } = useMarketplace();
  const [view, setView] = useState("available"),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All"),
    [create, setCreate] = useState(false),
    [editing, setEditing] = useState<Listing | null>(null),
    [selected, setSelected] = useState<Listing | null>(null),
    [removing, setRemoving] = useState<Listing | null>(null),
    [photos, setPhotos] = useState<string[]>([]),
    [photoBusy, setPhotoBusy] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [formError, setFormError] = useState("");
  const rows = listings.filter(
    (l) =>
      (view === "mine"
        ? l.seller_id === user!.uid
        : view === "manage"
          ? true
          : l.status === "available") &&
      (category === "All" || l.category === category) &&
      `${l.title} ${l.description} ${l.seller_name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const current = selected ? listings.find((l) => l.id === selected.id) : null;
  async function change(
    listing: Listing,
    status: "sold" | "removed",
    reason = "",
  ) {
    setBusy(true);
    setFormError("");
    try {
      await changeListing(user!, listing.id, status, reason);
      setRemoving(null);
      setSelected(null);
      setMessage(
        status === "sold"
          ? "Marked as sold. It is no longer shown in available listings."
          : "Listing removed from the marketplace.",
      );
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function beginEdit(l: Listing) {
    setEditing(l);
    setPhotos([...l.images]);
    setSelected(null);
    setFormError("");
    setCreate(true);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">GOOD FINDS. NEW BEGINNINGS.</span>
          <h1>
            Campus Marketplace<span className="brand-dot">.</span>
          </h1>
          <p>Your next essential might be someone else’s extra.</p>
        </div>
        <Button
          className="primary"
          onClick={() => {
            setEditing(null);
            setPhotos([]);
            setFormError("");
            setCreate(true);
          }}
        >
          <Plus size={17} /> Sell an item
        </Button>
      </div>
      <section className="commerce-banner">
        <div className="commerce-banner-icon">
          <ShoppingBag size={30} />
        </div>
        <div>
          <span className="eyebrow">CIRCULATE SOMETHING GOOD</span>
          <h2>Less clutter. More campus connections.</h2>
          <p>
            Books, tech and everyday essentials. Buy and sell directly with your
            campus community.
          </p>
        </div>
        <span className="commerce-banner-tag">
          <ShieldCheck size={16} /> Campus community
        </span>
      </section>
      <div className="commerce-toolbar">
        <div
          className="commerce-tabs"
          role="group"
          aria-label="Marketplace view"
        >
          {[
            ["available", "Browse items"],
            ["mine", "My listings"],
            ...(admin ? [["manage", "Moderate posts"]] : []),
          ].map(([key, label]) => (
            <Button
              key={key}
              variant={view === key ? "default" : "ghost"}
              onClick={() => setView(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <span className="muted">
          {listings.filter((l) => l.status === "available").length} available
        </span>
      </div>
      {view === "manage" && (
        <p className="notice">
          Posts appear immediately. Review listings here and remove spam,
          inappropriate content or suspected fraud with a reason.
        </p>
      )}
      <div className="commerce-filters">
        <label className="commerce-search">
          <Search size={17} />
          <input
            aria-label="Search marketplace"
            placeholder="Search books, stationery, electronics…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Item category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option>All</option>
          {MARKET_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      {message && (
        <p role="status" className="success-message">
          {message}
        </p>
      )}
      {error ? (
        <div className="empty">
          <p role="alert">{error}</p>
          <Button onClick={retry}>Retry</Button>
        </div>
      ) : loading ? (
        <div className="market-grid">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-80 w-full" />
          ))}
        </div>
      ) : !rows.length ? (
        <div className="panel empty">
          <ShoppingBag size={32} />
          <h3>
            {view === "mine" ? "Your shelf starts here" : "No items found"}
          </h3>
          <p>
            {view === "mine"
              ? "Give something you no longer need a new home."
              : "Try another search, or be the first to list an item."}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setEditing(null);
              setPhotos([]);
              setFormError("");
              setCreate(true);
            }}
          >
            Sell an item
          </Button>
        </div>
      ) : (
        <div className="market-grid">
          {rows.map((l) => (
            <article className="market-card" key={l.id}>
              <button
                className="market-photo"
                aria-label={`View ${l.title}`}
                onClick={() => {
                  setSelected(l);
                  setFormError("");
                }}
              >
                {l.images[0] ? (
                  <img src={l.images[0]} alt={l.title} />
                ) : (
                  <div className="market-no-photo">
                    <BookOpen size={44} />
                    <span>{l.category}</span>
                  </div>
                )}
                <span className={`commerce-pill ${l.status}`}>
                  {l.status === "available" ? l.category : l.status}
                </span>
              </button>
              <div className="market-card-body">
                <div className="market-price">{money(Number(l.price))}</div>
                <h2>{l.title}</h2>
                <p>{l.description}</p>
                <div className="market-seller">
                  <span className="avatar small-avatar">
                    {l.seller_name.slice(0, 1)}
                  </span>
                  <span>{l.seller_name}</span>
                  <small>
                    {l.seller_id === user!.uid
                      ? "Your listing"
                      : "Campus seller"}
                  </small>
                </div>
                <Button
                  variant="outline"
                  className="wide"
                  onClick={() => {
                    setSelected(l);
                    setFormError("");
                  }}
                >
                  View item <ArrowUpRight size={15} />
                </Button>
                {l.seller_id === user!.uid && l.status === "available" && (
                  <Button
                    variant="ghost"
                    className="wide"
                    onClick={() => beginEdit(l)}
                  >
                    <Pencil size={15} /> Edit listing
                  </Button>
                )}
                {view === "manage" && l.status === "available" && (
                  <Button
                    variant="ghost"
                    className="wide commerce-danger"
                    onClick={() => {
                      setRemoving(l);
                      setFormError("");
                    }}
                  >
                    Remove listing
                  </Button>
                )}
                {l.status === "removed" && l.removal_reason && (
                  <small className="error-text">
                    Reason: {l.removal_reason}
                  </small>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="commerce-footnote">
        Meet on campus and inspect the item before paying. Marketplace payments
        happen directly between buyer and seller.{" "}
        {!configured &&
          "Sample listings and phone numbers are for local demo only."}
      </p>
      <Dialog
        open={create}
        onOpenChange={(v) => {
          if (!busy && !photoBusy) setCreate(v);
        }}
      >
        <DialogContent className="report-dialog">
          <DialogTitle>
            {editing ? "Edit your listing" : "Give it a second chapter."}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the item details or photos. Your changes appear to campus buyers immediately."
              : "Create a listing visible to signed-in students immediately. Your contact number is shared with campus buyers."}
          </DialogDescription>
          <form
            key={editing?.id || "new-listing"}
            className="commerce-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (photoBusy || busy) return;
              setBusy(true);
              setFormError("");
              const f = new FormData(e.currentTarget);
              const parsed = listingSchema.safeParse({
                title: f.get("title"),
                description: f.get("description"),
                category: f.get("category"),
                price: Number(f.get("price")),
                contact: f.get("contact"),
                images: photos,
              });
              try {
                if (!parsed.success)
                  throw new Error(parsed.error.issues[0].message);
                if (editing) await editListing(user!, editing.id, parsed.data);
                else await postListing(user!, parsed.data);
                setCreate(false);
                setMessage(
                  editing
                    ? "Listing changes saved. Other students can see the updates now."
                    : "Your listing is live. Other students can see it now.",
                );
              } catch (e) {
                setFormError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Item title
              <input
                name="title"
                defaultValue={editing?.title || ""}
                placeholder="e.g. Computer Networks textbook"
                minLength={3}
                maxLength={100}
                required
              />
            </label>
            <div className="commerce-form-row">
              <label>
                Category
                <select
                  name="category"
                  defaultValue={editing?.category || "Textbooks"}
                >
                  {MARKET_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Price (₹)
                <input
                  name="price"
                  defaultValue={editing ? Number(editing.price) : ""}
                  type="number"
                  min="0"
                  max="100000"
                  step="0.01"
                  placeholder="450"
                  required
                />
              </label>
            </div>
            <label>
              Description
              <textarea
                name="description"
                defaultValue={editing?.description || ""}
                placeholder="Condition, edition and where you can meet…"
                minLength={10}
                maxLength={2000}
                rows={4}
                required
              />
            </label>
            <label>
              Contact number
              <input
                name="contact"
                defaultValue={editing?.contact || ""}
                type="tel"
                autoComplete="tel"
                placeholder="10–15 digits, optional + prefix"
                pattern="\+?[0-9]{10,15}"
                required
              />
            </label>
            <label className="commerce-upload">
              <ImagePlus size={23} />
              <span>
                {photoBusy ? "Preparing photos…" : "Add up to 3 photos"}
              </span>
              <small>
                JPEG, PNG or WebP · up to 10 MB each · compressed before
                publishing
              </small>
              <input
                aria-label="Upload item photos"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={busy || photoBusy || photos.length >= 3}
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = "";
                  setFormError("");
                  if (files.length + photos.length > 3) {
                    setFormError("Choose up to 3 photos in total.");
                    return;
                  }
                  setPhotoBusy(true);
                  try {
                    const prepared: string[] = [];
                    for (const file of files)
                      prepared.push(await compressPhoto(file));
                    setPhotos((p) => [...p, ...prepared]);
                  } catch (e) {
                    setFormError((e as Error).message);
                  } finally {
                    setPhotoBusy(false);
                  }
                }}
              />
            </label>
            {photos.length > 0 && (
              <div className="commerce-thumbnails">
                {photos.map((p, i) => (
                  <div key={i}>
                    <img src={p} alt={`Item photo ${i + 1}`} />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Remove photo ${i + 1}`}
                      disabled={busy}
                      onClick={() =>
                        setPhotos((p) => p.filter((_, n) => n !== i))
                      }
                    >
                      <X size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {formError && (
              <p role="alert" className="error-text">
                {formError}
              </p>
            )}
            <Button className="primary wide" disabled={busy || photoBusy}>
              {busy
                ? editing
                  ? "Saving…"
                  : "Publishing…"
                : editing
                  ? "Save listing changes"
                  : "Publish listing"}
              <ArrowUpRight size={16} />
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v && !busy) setSelected(null);
        }}
      >
        <DialogContent className="report-dialog">
          <DialogTitle>{current?.title || selected?.title}</DialogTitle>
          <DialogDescription>
            Connect with your campus seller.
          </DialogDescription>
          {current ? (
            <>
              <div className="listing-gallery">
                {current.images.map((src, i) => (
                  <img
                    src={src}
                    alt={`${current.title} photo ${i + 1}`}
                    key={i}
                  />
                ))}
              </div>
              <div className="listing-detail-price">
                <strong>{money(Number(current.price))}</strong>
                <span className={`commerce-pill ${current.status}`}>
                  {current.status}
                </span>
              </div>
              <p className="commerce-preserve">{current.description}</p>
              <dl className="receipt-meta">
                <div>
                  <dt>Seller</dt>
                  <dd>{current.seller_name}</dd>
                </div>
                <div>
                  <dt>Posted</dt>
                  <dd>{when(current.created_at)}</dd>
                </div>
              </dl>
              {current.status === "available" && (
                <a className="commerce-contact" href={`tel:${current.contact}`}>
                  <Phone size={19} />
                  <span>
                    Contact seller<strong>{current.contact}</strong>
                  </span>
                  <ArrowUpRight size={18} />
                </a>
              )}
              {current.removal_reason && (
                <p className="error-text">
                  Removal reason: {current.removal_reason}
                </p>
              )}
              {current.status === "available" &&
                current.seller_id === user!.uid && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => beginEdit(current)}
                  >
                    <Pencil size={15} /> Edit listing
                  </Button>
                )}
              {current.status === "available" &&
                current.seller_id === user!.uid && (
                  <Button
                    disabled={busy}
                    onClick={() => change(current, "sold")}
                  >
                    <PackageCheck size={16} /> Mark as sold
                  </Button>
                )}
              {current.status === "available" &&
                (admin || current.seller_id === user!.uid) && (
                  <Button
                    variant="outline"
                    className="commerce-danger"
                    disabled={busy}
                    onClick={() => {
                      if (admin) {
                        setSelected(null);
                        setRemoving(current);
                      } else void change(current, "removed");
                    }}
                  >
                    Remove listing
                  </Button>
                )}
              {formError && (
                <p role="alert" className="error-text">
                  {formError}
                </p>
              )}
            </>
          ) : (
            <p>This listing is no longer available.</p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!removing}
        onOpenChange={(v) => {
          if (!v && !busy) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Remove this listing?</DialogTitle>
          <DialogDescription>
            “{removing?.title}” will be hidden from other students. The seller
            will see your reason.
          </DialogDescription>
          <form
            className="commerce-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void change(removing!, "removed", String(f.get("reason")));
            }}
          >
            <label>
              Reason
              <textarea
                name="reason"
                minLength={3}
                maxLength={300}
                required
                placeholder="e.g. Suspected fraudulent listing"
              />
            </label>
            {formError && (
              <p role="alert" className="error-text">
                {formError}
              </p>
            )}
            <Button className="primary" disabled={busy}>
              {busy ? "Removing…" : "Remove listing"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
