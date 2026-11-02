import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Monitor,
  ShieldCheck,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { configured, googleSignInEnabled } from "@/services/supabase";
export default function Login() {
  const { login, signup, demo, error: authError } = useAuth();
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    if (configured)
      googleSignInEnabled()
        .then((value) => {
          if (active) setGoogleEnabled(value);
        })
        .catch(() => {
          if (active) setGoogleEnabled(false);
        });
    return () => {
      active = false;
    };
  }, []);
  const [creating, setCreating] = useState(false),
    [notice, setNotice] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(email?: string, password?: string) {
    setBusy(true);
    setError("");
    try {
      if (email && creating) setNotice(await signup(email, password || ""));
      else await login(email, password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Activity />
          </span>
          OneCampus<span className="brand-dot">.</span>
        </div>
        <div className="login-copy">
          <span className="eyebrow">ALLIANCE UNIVERSITY · BENGALURU</span>
          <h1>
            Your campus.
            <br />A little more
            <br />
            <span>connected.</span>
          </h1>
          <p>Less walking around. More getting things done.</p>
          <div className="login-feature">
            <BookOpen /> Find your next study spot
          </div>
          <div className="login-feature">
            <Monitor /> Check the labs before you go
          </div>
          <div className="login-feature">
            <ShieldCheck /> A campus that listens
          </div>
        </div>
        <small>Built for life at Alliance.</small>
      </section>
      <main className="login-main">
        <div className="login-form">
          <GraduationCap size={32} />
          <h2>Welcome to OneCampus</h2>
          <p>Find a space, share an update, and make campus work for you.</p>
          <Button
            className="google"
            variant="outline"
            disabled={busy || (configured && googleEnabled !== true)}
            onClick={() => submit()}
          >
            Continue with Google <ArrowRight size={16} />
          </Button>
          {configured && googleEnabled === false && (
            <p className="field-hint" style={{ marginTop: 12 }}>
              Google sign-in is not enabled for this campus yet. Use email to
              continue.
            </p>
          )}
          <div className="or">
            {creating ? "create your student account" : "or sign in with email"}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              submit(String(f.get("email")), String(f.get("password")));
            }}
          >
            <label htmlFor="email">University email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@alliance.edu.in"
              required
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={creating ? "new-password" : "current-password"}
              placeholder={
                creating
                  ? "Choose a password (at least 8 characters)"
                  : "Enter your password"
              }
              minLength={creating ? 8 : 1}
              required
            />
            <Button className="primary wide" disabled={busy}>
              {busy
                ? creating
                  ? "Creating account…"
                  : "Signing in…"
                : creating
                  ? "Create student account"
                  : "Sign in"}
              <ArrowRight size={16} />
            </Button>
          </form>
          {configured && (
            <Button
              variant="ghost"
              className="wide"
              disabled={busy}
              onClick={() => {
                setCreating((v) => !v);
                setError("");
                setNotice("");
              }}
            >
              {creating
                ? "Already have an account? Sign in"
                : "New here? Create a student account"}
            </Button>
          )}
          {notice && (
            <p role="status" className="success-message">
              {notice}
            </p>
          )}
          {(error || authError) && (
            <p role="alert" className="error-text">
              {error || authError}
            </p>
          )}
          {!configured && (
            <div className="demo-entry">
              <span className="eyebrow">EXPLORE THE PROTOTYPE</span>
              <p>No account needed. Uses sample data on this device.</p>
              <div>
                <Button variant="outline" onClick={() => demo("student")}>
                  Student demo <ArrowRight size={15} />
                </Button>
                <Button variant="outline" onClick={() => demo("admin")}>
                  Admin demo <ArrowRight size={15} />
                </Button>
              </div>
              <Button
                variant="ghost"
                className="wide finder-demo"
                onClick={() => demo("student", true)}
              >
                Try another student · Finder demo <ArrowRight size={15} />
              </Button>
            </div>
          )}
          <small>One place for your everyday campus life.</small>
        </div>
      </main>
    </div>
  );
}
