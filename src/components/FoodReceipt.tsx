import { CheckCircle2, Download, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FoodOrder } from "@/lib/commerce";
import { money, when } from "@/lib/commerce";
export function FoodReceipt({ order }: { order: FoodOrder }) {
  if (order.payment_status !== "mock_paid")
    return (
      <p>
        This order has no receipt yet. A successful simulated payment is
        required.
      </p>
    );
  function download() {
    const lines = [
      "ONECAMPUS · DIGITAL FOOD COURT",
      "DEMO RECEIPT · NO REAL PAYMENT",
      `Receipt: ${order.id}`,
      `Student: ${order.student_name}`,
      `Email: ${order.student_email}`,
      `Student ID: ${order.user_id}`,
      `Meal: ${order.category}`,
      "Items:",
      ...order.items.map((i) => `  • ${i.name} — ${i.description}`),
      `Amount: ${money(order.amount)}`,
      `Transaction: ${order.transaction_id}`,
      `Paid: ${when(order.paid_at!)}`,
      `Collection: ${order.collected_at ? "Collected at " + when(order.collected_at) : "Awaiting collection"}`,
      "Demo only. Not valid as proof of a real financial transaction.",
    ];
    const url = URL.createObjectURL(
      new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `OneCampus-receipt-${order.id}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="food-receipt">
      <div className="receipt-head">
        <UtensilsCrossed size={25} />
        <strong>OneCampus Food Court</strong>
        <span>DEMO RECEIPT · NO REAL PAYMENT</span>
      </div>
      <div className="receipt-success">
        <CheckCircle2 size={28} />
        <h3>Mock payment successful</h3>
        <p>
          {order.collected_at
            ? "Meal marked as collected"
            : "Show this receipt at the food counter"}
        </p>
      </div>
      <dl className="receipt-meta">
        <div>
          <dt>Student</dt>
          <dd>{order.student_name}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{order.student_email || "Not supplied"}</dd>
        </div>
        <div>
          <dt>Student account ID</dt>
          <dd className="receipt-code">{order.user_id}</dd>
        </div>
        <div>
          <dt>Meal</dt>
          <dd>{order.category}</dd>
        </div>
        <div>
          <dt>Date & time (IST)</dt>
          <dd>{when(order.paid_at!)}</dd>
        </div>
      </dl>
      <div className="receipt-items">
        {order.items.map((i) => (
          <div key={i.id}>
            <strong>{i.name}</strong>
            <small>{i.description}</small>
          </div>
        ))}
      </div>
      <div className="receipt-total">
        <span>Amount paid (simulated)</span>
        <strong>{money(order.amount)}</strong>
      </div>
      <dl className="receipt-meta">
        <div>
          <dt>Receipt ID</dt>
          <dd className="receipt-code">{order.id}</dd>
        </div>
        <div>
          <dt>Transaction ID</dt>
          <dd className="receipt-code">{order.transaction_id}</dd>
        </div>
        <div>
          <dt>Collection</dt>
          <dd>
            {order.collected_at
              ? `Collected · ${when(order.collected_at)}`
              : "Awaiting collection"}
          </dd>
        </div>
      </dl>
      <p className="field-hint">
        For demonstration only. No money was transferred. Counter staff can
        verify this receipt’s collection status in the admin order list.
      </p>
      <Button variant="outline" className="wide" onClick={download}>
        <Download size={16} /> Download receipt
      </Button>
    </div>
  );
}
