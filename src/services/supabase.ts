import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL?.trim() || "";
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || "";
export const demoMode =
  import.meta.env.VITE_DEMO_MODE === "true" || (!url && !key);
export const configured = !demoMode;
export const configurationError =
  !demoMode && (!url || !key)
    ? "Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart the app."
    : "";
export const supabase =
  !demoMode && !configurationError
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      })
    : null;
export async function callRpc<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase)
    throw new Error(configurationError || "Supabase is not configured.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export type PayloadRow = { id: string; payload: unknown };
export const unpack = <T>(row: PayloadRow): T =>
  ({ ...(row.payload as object), id: row.id }) as T;
/** Reload only rows allowed by RLS; Realtime invalidates and polling covers reconnects. */
export function watch<T>(
  tables: { table: string; filter?: string }[],
  read: () => Promise<T>,
  next: (value: T) => void,
  error: (e: Error) => void,
) {
  if (!supabase) throw new Error("Supabase is not configured.");
  let disposed = false,
    busy = false,
    dirty = false;
  const refresh = async () => {
    if (disposed) return;
    if (busy) {
      dirty = true;
      return;
    }
    busy = true;
    do {
      dirty = false;
      try {
        const value = await read();
        if (!disposed) next(value);
      } catch (e) {
        if (!disposed)
          error(e instanceof Error ? e : new Error("Updates could not load."));
      }
    } while (dirty && !disposed);
    busy = false;
  };
  let channel = supabase.channel("onecampus-" + crypto.randomUUID());
  for (const table of tables)
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", ...table },
      () => {
        void refresh();
      },
    );
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") void refresh();
  });
  void refresh();
  const timer = setInterval(() => {
      void refresh();
    }, 30000),
    online = () => {
      void refresh();
    };
  window.addEventListener("online", online);
  return () => {
    disposed = true;
    clearInterval(timer);
    window.removeEventListener("online", online);
    void supabase.removeChannel(channel);
  };
}

export async function googleSignInEnabled(): Promise<boolean> {
  if (!supabase) return false;
  const response = await fetch(url + "/auth/v1/settings", {
    headers: { apikey: key },
  });
  if (!response.ok) throw new Error("Sign-in options could not load.");
  const data = await response.json();
  return data.external?.google === true;
}
