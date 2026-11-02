import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { createSpace } from "@/services/store";
export function SpaceForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="report-dialog">
        <DialogTitle>Add a campus space</DialogTitle>
        <DialogDescription>
          Add a library area or computer lab. It starts with no crowd reports;
          students can submit live updates.
        </DialogDescription>
        <form
          className="commerce-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              await createSpace(user!, {
                name: String(f.get("name")),
                zone: String(f.get("zone")),
                type: String(f.get("type")) as "library" | "lab",
                quiet: f.has("quiet"),
              });
              onSaved();
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Space name
            <input
              name="name"
              minLength={3}
              maxLength={120}
              placeholder="e.g. Computer Lab 4"
              required
            />
          </label>
          <label>
            Space type
            <select name="type">
              <option value="library">Library / study area</option>
              <option value="lab">Computer lab</option>
            </select>
          </label>
          <label>
            Building / floor / zone
            <input
              name="zone"
              minLength={3}
              maxLength={120}
              placeholder="e.g. Learning Centre · Block C"
              required
            />
          </label>
          <label className="commerce-check">
            <input type="checkbox" name="quiet" defaultChecked /> Quiet study
            space
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <Button className="primary" disabled={busy}>
            <Plus size={16} />
            {busy ? "Adding space…" : "Add space"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
