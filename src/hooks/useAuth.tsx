import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  supabase,
  configurationError,
  demoMode,
  callRpc,
} from "@/services/supabase";
import type { Profile } from "@/lib/types";
type AuthState = {
  user: Profile | null;
  loading: boolean;
  error: string;
  login: (email?: string, password?: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<string>;
  demo: (role: "student" | "admin", finder?: boolean) => void;
  logout: () => Promise<void>;
};
const Context = createContext<AuthState>(null!);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(configurationError);
  useEffect(() => {
    if (!supabase) {
      if (demoMode)
        try {
          setUser(
            JSON.parse(sessionStorage.getItem("onecampus.user") || "null"),
          );
        } catch {
          /* ignore invalid demo identity */
        }
      setLoading(false);
      return;
    }
    let alive = true,
      revision = 0;
    const client = supabase;
    async function resolve(session: Session | null) {
      const ticket = ++revision;
      if (!alive) return;
      setLoading(true);
      setError("");
      if (!session) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const profile = await callRpc<Profile>("get_my_profile");
        if (alive && ticket === revision) setUser(profile);
      } catch {
        if (alive && ticket === revision) {
          setUser(null);
          setError(
            "We could not load your Supabase profile. Check your connection and the database setup.",
          );
        }
      } finally {
        if (alive && ticket === revision) setLoading(false);
      }
    }
    // Defer database work outside the Auth callback to avoid taking the SDK's auth lock.
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        if (alive) void resolve(session);
      }, 0);
    });
    client.auth.getSession().then(({ data, error }) => {
      if (error) {
        if (alive) {
          setError(
            "Your sign-in session could not load. Please sign in again.",
          );
          setLoading(false);
        }
      } else void resolve(data.session);
    });
    return () => {
      alive = false;
      revision++;
      subscription.unsubscribe();
    };
  }, []);
  async function login(email?: string, password?: string) {
    setError("");
    if (!supabase)
      throw new Error(
        configurationError ||
          "Sign-in needs Supabase setup. Use local demo mode to explore.",
      );
    if (email) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: password || "",
      });
      if (error)
        throw new Error(
          "Sign-in did not complete. Check your credentials and confirm your email.",
        );
    } else {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/login" },
      });
      if (error)
        throw new Error(
          "Google sign-in is unavailable. Enable Google in Supabase Auth or use email sign-in.",
        );
    }
  }
  async function signup(email: string, password: string) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + "/login" },
    });
    if (error)
      throw new Error(
        "Account creation did not complete. Use a valid email and a password of at least 8 characters, then try again.",
      );
    return data.session
      ? "Account created. Signing you in…"
      : "Check your email to confirm your account, then sign in.";
  }
  function demo(role: "student" | "admin", finder = false) {
    if (!demoMode) return;
    const value: Profile = {
      uid: finder ? "demo-finder" : "demo-" + role,
      name: role === "admin" ? "Campus admin" : finder ? "Meera" : "Aarav",
      role,
    };
    sessionStorage.setItem("onecampus.user", JSON.stringify(value));
    setUser(value);
  }
  async function logout() {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setError("Sign-out did not complete. Please try again.");
        return;
      }
    }
    sessionStorage.removeItem("onecampus.user");
    setUser(null);
  }
  return (
    <Context.Provider
      value={{ user, loading, error, login, signup, demo, logout }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
