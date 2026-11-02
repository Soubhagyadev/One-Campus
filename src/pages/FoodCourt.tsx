import { useEffect, useState } from "react";
import {
  Coffee,
  UtensilsCrossed,
  Cookie,
  Moon,
  Clock3,
  ArrowRight,
  ReceiptText,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useFood } from "@/hooks/useCommerce";
import {
  saveService,
  saveFood,
  removeFood,
  prepareOrder,
  payOrder,
  collectOrder,
} from "@/services/commerce";
import { FoodReceipt } from "@/components/FoodReceipt";
import {
  MEALS,
  mealOpen,
  money,
  timeLabel,
  timeInput,
  fromTime,
  foodSchema,
  when,
} from "@/lib/commerce";
import type { MealCategory, FoodItem, FoodOrder } from "@/lib/commerce";
const ICONS = {
  Breakfast: Coffee,
  Lunch: UtensilsCrossed,
  Snacks: Cookie,
  Dinner: Moon,
};
export default function FoodCourt() {
  const { user } = useAuth(),
    admin = user!.role === "admin",
    { data, loading, error, retry } = useFood();
  const [tab, setTab] = useState("menu"),
    [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [actionError, setActionError] = useState(""),
    [editing, setEditing] = useState<FoodItem | null>(null),
    [deleting, setDeleting] = useState<FoodItem | null>(null),
    [checkout, setCheckout] = useState<FoodOrder | null>(null),
    [stage, setStage] = useState("review"),
    [receipt, setReceipt] = useState<FoodOrder | null>(null),
    [statusFilter, setStatusFilter] = useState("all"),
    [orderSearch, setOrderSearch] = useState("");
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);
  async function action<T>(
    work: () => Promise<T>,
    success?: (value: T) => void,
  ) {
    setBusy(true);
    setActionError("");
    try {
      const v = await work();
      success?.(v);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const currentReceipt = receipt
    ? data.orders.find(
        (o) => o.id === receipt.id && o.payment_status === "mock_paid",
      ) || receipt
    : null;
  const orders = data.orders.filter(
    (o) =>
      (statusFilter === "all" || o.payment_status === statusFilter) &&
      `${o.student_name} ${o.student_email} ${o.id} ${o.transaction_id || ""}`
        .toLowerCase()
        .includes(orderSearch.toLowerCase()),
  );
  function newFood(category: MealCategory) {
    setActionError("");
    setEditing({
      id: crypto.randomUUID(),
      category,
      name: "",
      description: "",
      available: true,
    });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR NEXT MEAL, WITHOUT THE QUEUE</span>
          <h1>
            Food Court<span className="brand-dot">.</span>
          </h1>
          <p>Pick your meal. Get your receipt. Head straight to the counter.</p>
        </div>
        <span className="food-clock">
          <Clock3 size={17} />
          {new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "numeric",
            minute: "2-digit",
          }).format(now)}{" "}
          IST
        </span>
      </div>
      <div className="food-demo-notice">
        <ShieldCheck size={22} />
        <div>
          <strong>A demo checkout. A smoother campus day.</strong>
          <p>
            Payments are simulated. No real UPI transfer, bank account or PIN is
            required.
          </p>
        </div>
        <span className="commerce-pill">SIMULATION</span>
      </div>
      <div className="commerce-toolbar">
        <div
          className="commerce-tabs"
          role="group"
          aria-label="Food Court view"
        >
          {[
            ["menu", "Today’s meals"],
            [
              "orders",
              admin ? "All orders & receipts" : "My orders & receipts",
            ],
            ...(admin ? [["manage", "Manage menus"]] : []),
          ].map(([key, label]) => (
            <Button
              key={key}
              variant={tab === key ? "default" : "ghost"}
              onClick={() => {
                setTab(key);
                setActionError("");
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {message && (
        <p role="status" className="success-message">
          {message}
        </p>
      )}
      {actionError && !editing && !checkout && !deleting && !receipt && (
        <p role="alert" className="error-text">
          {actionError}
        </p>
      )}
      {error ? (
        <div className="empty">
          <p role="alert">{error}</p>
          <Button onClick={retry}>Retry</Button>
        </div>
      ) : loading ? (
        <Skeleton className="h-80 w-full" />
      ) : tab === "menu" ? (
        <>
          <div className="section-heading">
            <div>
              <h2>What’s serving?</h2>
              <p>
                Four meals, thoughtfully timed. Menus appear only during serving
                hours.
              </p>
            </div>
          </div>
          <div className="meal-grid">
            {MEALS.map((category) => {
              const s = data.services.find((s) => s.category === category);
              if (!s) return null;
              const open = mealOpen(s, now),
                items = data.items.filter(
                  (i) => i.category === category && i.available,
                ),
                Icon = ICONS[category];
              return (
                <article
                  key={category}
                  className={`meal-card ${open ? "meal-open" : ""}`}
                >
                  <div className="meal-card-top">
                    <span className="meal-icon">
                      <Icon size={25} />
                    </span>
                    <span
                      className={`commerce-pill ${open ? "available" : "closed"}`}
                    >
                      {open
                        ? "Serving now"
                        : s.enabled
                          ? "Closed"
                          : "Unavailable"}
                    </span>
                  </div>
                  <h2>{category}</h2>
                  <div className="meal-price">
                    {money(s.price)}
                    <span>/ meal</span>
                  </div>
                  <p className="meal-hours">
                    <Clock3 size={14} />
                    {timeLabel(s.start_minute)} – {timeLabel(s.end_minute)} IST
                  </p>
                  <div className="meal-menu">
                    {open ? (
                      items.length ? (
                        <>
                          {items.map((i) => (
                            <div key={i.id}>
                              <strong>{i.name}</strong>
                              <p>{i.description}</p>
                            </div>
                          ))}
                          <small>
                            All listed items are included in this meal.
                          </small>
                        </>
                      ) : (
                        <p>
                          The kitchen is updating this menu. Please check back
                          shortly.
                        </p>
                      )
                    ) : (
                      <div className="meal-closed">
                        <Clock3 size={26} />
                        <strong>
                          {s.enabled
                            ? "Good food takes timing."
                            : "Service paused"}
                        </strong>
                        <p>
                          {s.enabled
                            ? "Come back during this meal’s serving hours to see the menu."
                            : "The kitchen has marked this meal unavailable."}
                        </p>
                      </div>
                    )}
                  </div>
                  <Button
                    className={open && !admin ? "primary wide" : "wide"}
                    variant={open && !admin ? "default" : "outline"}
                    disabled={!open || !items.length || busy || admin}
                    onClick={() =>
                      action(
                        () =>
                          prepareOrder(user!, category, crypto.randomUUID()),
                        (o) => {
                          setCheckout(o);
                          setStage("review");
                        },
                      )
                    }
                  >
                    {admin ? "Admin view only" : open ? "View meal & continue" : "Outside serving hours"}
                    <ArrowRight size={15} />
                  </Button>
                </article>
              );
            })}
          </div>
          <p className="commerce-footnote">
            Meal prices are fixed: Breakfast & Snacks ₹60 · Lunch & Dinner ₹100.
            Serving windows use India Standard Time. Starting menus are
            illustrative and can be updated by campus admins.
          </p>
        </>
      ) : tab === "orders" ? (
        <section className="panel commerce-orders">
          <div className="section-heading">
            <div>
              <h2>{admin ? "Order desk" : "Your meal receipts"}</h2>
              <p>
                {admin
                  ? "Monitor mock payments and verify receipts before marking a meal collected."
                  : "Reopen your digital receipt whenever you need it."}
              </p>
            </div>
            <ReceiptText size={24} />
          </div>
          <div className="commerce-filters">
            <input
              aria-label="Search food orders"
              placeholder={
                admin
                  ? "Search student, receipt or transaction…"
                  : "Search receipt or transaction…"
              }
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
            />
            <select
              aria-label="Payment status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All payment statuses</option>
              <option value="mock_paid">Mock paid</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          {!orders.length ? (
            <div className="empty">
              <ReceiptText size={30} />
              <h3>No orders here yet</h3>
              <p>Choose an available meal to start your first checkout.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="commerce-table">
                <thead>
                  <tr>
                    <th>Meal / order</th>
                    {admin && <th>Student</th>}
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Collection</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.category}</strong>
                        <small>{when(o.created_at)}</small>
                        <small className="receipt-code">{o.id}</small>
                      </td>
                      {admin && (
                        <td>
                          <strong>{o.student_name}</strong>
                          <small>{o.student_email}</small>
                        </td>
                      )}
                      <td>{money(o.amount)}</td>
                      <td>
                        <span
                          className={`commerce-pill ${o.payment_status === "mock_paid" ? "available" : "closed"}`}
                        >
                          {o.payment_status === "mock_paid"
                            ? "Mock paid"
                            : o.payment_status}
                        </span>
                      </td>
                      <td>{o.collected_at ? "Collected" : "—"}</td>
                      <td>
                        <div className="commerce-row-actions">
                          {o.payment_status === "mock_paid" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setReceipt(o);
                                setActionError("");
                              }}
                            >
                              View receipt
                            </Button>
                          )}
                          {admin &&
                            o.payment_status === "mock_paid" &&
                            !o.collected_at && (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  action(
                                    () => collectOrder(user!, o.id),
                                    () =>
                                      setMessage(
                                        "Meal marked as collected. This receipt cannot be reused.",
                                      ),
                                  )
                                }
                              >
                                Mark collected
                              </Button>
                            )}
                          {o.payment_status === "pending" &&
                            o.user_id === user!.uid && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    busy || now - o.created_at >= 600000
                                  }
                                  onClick={() => {
                                    setCheckout(o);
                                    setStage("review");
                                    setActionError("");
                                  }}
                                >
                                  Resume checkout
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() =>
                                    action(
                                      () => payOrder(user!, o.id, false),
                                      () => setMessage("Order cancelled."),
                                    )
                                  }
                                >
                                  Cancel
                                </Button>
                              </>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="field-hint">
            Pending checkouts expire after 10 minutes or when the meal closes.
            Only successful mock payments generate receipts.
          </p>
        </section>
      ) : admin ? (
        <>
          <div className="section-heading">
            <div>
              <h2>Kitchen controls</h2>
              <p>
                Set serving hours and update the items included in each
                fixed-price meal.
              </p>
            </div>
          </div>
          <div className="kitchen-grid">
            {MEALS.map((category) => {
              const s = data.services.find((s) => s.category === category);
              if (!s) return null;
              const items = data.items.filter((i) => i.category === category),
                Icon = ICONS[category];
              return (
                <section className="panel kitchen-card" key={category}>
                  <div className="section-heading">
                    <h2>
                      <Icon size={21} /> {category}
                    </h2>
                    <strong>{money(s.price)} / meal</strong>
                  </div>
                  <form
                    key={`${s.start_minute}-${s.end_minute}-${s.enabled}`}
                    className="commerce-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void action(
                        () =>
                          saveService(user!, {
                            ...s,
                            start_minute: fromTime(String(f.get("start"))),
                            end_minute: fromTime(String(f.get("end"))),
                            enabled: f.has("enabled"),
                          }),
                        () => setMessage(`${category} serving hours saved.`),
                      );
                    }}
                  >
                    <div className="commerce-form-row">
                      <label>
                        Opens (IST)
                        <input
                          type="time"
                          name="start"
                          defaultValue={timeInput(s.start_minute)}
                          required
                        />
                      </label>
                      <label>
                        Closes (IST)
                        <input
                          type="time"
                          name="end"
                          defaultValue={timeInput(s.end_minute)}
                          required
                        />
                      </label>
                    </div>
                    <div className="schedule-actions">
                      <label className="commerce-check">
                        <input
                          name="enabled"
                          type="checkbox"
                          defaultChecked={s.enabled}
                        />{" "}
                        Meal available
                      </label>
                      <Button variant="outline" size="sm" disabled={busy}>
                        Save timings
                      </Button>
                    </div>
                  </form>
                  <p className="field-hint">
                    End time is exclusive. An earlier end time means the window
                    continues overnight.
                  </p>
                  <div className="kitchen-items">
                    {items.map((i) => (
                      <div className="kitchen-item" key={i.id}>
                        <div>
                          <strong>{i.name}</strong>
                          <p>{i.description}</p>
                          <span className="field-hint">
                            {i.available ? "On the menu" : "Unavailable"}
                          </span>
                        </div>
                        <div className="commerce-row-actions">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Edit ${i.name}`}
                            onClick={() => {
                              setEditing(i);
                              setActionError("");
                            }}
                          >
                            <Pencil size={15} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Remove ${i.name}`}
                            onClick={() => {
                              setDeleting(i);
                              setActionError("");
                            }}
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    className="wide"
                    onClick={() => newFood(category)}
                  >
                    <Plus size={16} /> Add food item
                  </Button>
                </section>
              );
            })}
          </div>
        </>
      ) : null}
      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!v && !busy) setEditing(null);
        }}
      >
        <DialogContent className="report-dialog">
          <DialogTitle>
            {editing?.name ? "Edit food item" : "Add food item"}
          </DialogTitle>
          <DialogDescription>
            Items are included together in the selected meal. Meal prices stay
            fixed.
          </DialogDescription>
          {editing && (
            <form
              className="commerce-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  parsed = foodSchema.safeParse({
                    id: editing.id,
                    category: editing.category,
                    name: f.get("name"),
                    description: f.get("description"),
                    available: f.has("available"),
                  });
                if (!parsed.success) {
                  setActionError(parsed.error.issues[0].message);
                  return;
                }
                void action(
                  () => saveFood(user!, parsed.data),
                  () => {
                    setEditing(null);
                    setMessage("Menu item saved.");
                  },
                );
              }}
            >
              <label>
                Meal
                <input value={editing.category} disabled />
              </label>
              <label>
                Food name
                <input
                  name="name"
                  defaultValue={editing.name}
                  minLength={2}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  defaultValue={editing.description}
                  minLength={3}
                  maxLength={500}
                  required
                />
              </label>
              <label className="commerce-check">
                <input
                  type="checkbox"
                  name="available"
                  defaultChecked={editing.available}
                />{" "}
                Available on the menu
              </label>
              {actionError && (
                <p role="alert" className="error-text">
                  {actionError}
                </p>
              )}
              <Button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save item"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(v) => {
          if (!v && !busy) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Remove {deleting?.name}?</DialogTitle>
          <DialogDescription>
            This removes the item from future menus. Existing receipts keep
            their original meal details.
          </DialogDescription>
          {actionError && (
            <p role="alert" className="error-text">
              {actionError}
            </p>
          )}
          <Button
            className="primary"
            disabled={busy}
            onClick={() =>
              action(
                () => removeFood(user!, deleting!.id),
                () => {
                  setDeleting(null);
                  setMessage("Food item removed.");
                },
              )
            }
          >
            {busy ? "Removing…" : "Remove item"}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!checkout}
        onOpenChange={(v) => {
          if (!v && !busy) setCheckout(null);
        }}
      >
        <DialogContent className="report-dialog">
          <DialogTitle>
            {stage === "review"
              ? "Your meal, ready to review"
              : "UPI demo checkout"}
          </DialogTitle>
          <DialogDescription>
            {stage === "review"
              ? "Check your meal and student details before continuing. Checkout is valid for 10 minutes while this meal is open."
              : "A simulation only. Do not send money or enter a real UPI PIN."}
          </DialogDescription>
          {checkout && (
            <>
              <div className="checkout-summary">
                <span className="commerce-pill">{checkout.category}</span>
                <h3>{checkout.student_name}</h3>
                <small>{checkout.student_email}</small>
                <div className="receipt-items">
                  {checkout.items.map((i) => (
                    <div key={i.id}>
                      <strong>{i.name}</strong>
                      <small>{i.description}</small>
                    </div>
                  ))}
                </div>
                <div className="receipt-total">
                  <span>Meal total</span>
                  <strong>{money(checkout.amount)}</strong>
                </div>
              </div>
              {stage === "payment" && (
                <div className="upi-demo">
                  <span className="upi-wordmark">
                    UPI <small>DEMO</small>
                  </span>
                  <p>Paying OneCampus Demo Kitchen</p>
                  <code>campus-demo@upi.invalid</code>
                  <div className="upi-methods">
                    <span>UPI app simulation</span>
                    <ShieldCheck size={19} />
                  </div>
                  <p>
                    No payment app will open. The buttons below simulate a
                    successful or declined payment.
                  </p>
                </div>
              )}
              {actionError && (
                <p role="alert" className="error-text">
                  {actionError}
                </p>
              )}
              {stage === "review" ? (
                <Button
                  className="primary wide"
                  disabled={busy}
                  onClick={() => setStage("payment")}
                >
                  Continue to mock payment <ArrowRight size={16} />
                </Button>
              ) : (
                <>
                  <Button
                    className="primary wide"
                    disabled={busy}
                    onClick={() =>
                      action(
                        () => payOrder(user!, checkout.id, true),
                        (o) => {
                          setCheckout(null);
                          setReceipt(o);
                          setMessage(
                            "Mock payment successful. Your digital receipt is ready.",
                          );
                        },
                      )
                    }
                  >
                    <CheckCircle2 size={17} />
                    {busy
                      ? "Processing simulation…"
                      : `Simulate payment · ${money(checkout.amount)}`}
                  </Button>
                  <Button
                    variant="outline"
                    className="wide"
                    disabled={busy}
                    onClick={() =>
                      action(
                        () => payOrder(user!, checkout.id, false),
                        () => {
                          setCheckout(null);
                          setMessage(
                            "Mock payment declined. No receipt was issued and no money was transferred.",
                          );
                        },
                      )
                    }
                  >
                    Simulate declined payment
                  </Button>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!receipt}
        onOpenChange={(v) => {
          if (!v) {
            setReceipt(null);
            setActionError("");
          }
        }}
      >
        <DialogContent className="report-dialog">
          <DialogTitle>Digital meal receipt</DialogTitle>
          <DialogDescription>
            Saved in your account. Show this at the demo food counter.
          </DialogDescription>
          {currentReceipt && <FoodReceipt order={currentReceipt} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
