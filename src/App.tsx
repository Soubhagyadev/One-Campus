import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import {
  Activity,
  Flag,
  CalendarDays,
  Heart,
  LayoutDashboard,
  LogOut,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { configured } from "@/services/supabase";
import Login from "@/pages/Login";
import Pulse from "@/pages/Pulse";
const Wellness = lazy(() => import("@/pages/Wellness"));
const Events = lazy(() => import("@/pages/Events"));
const Reports = lazy(() => import("@/pages/Reports"));
const Admin = lazy(() => import("@/pages/Admin"));
function Shell() {
  const { user, logout } = useAuth();
  const admin = user?.role === "admin";
  const links = admin
    ? [
        [LayoutDashboard, "/admin", "Overview"],
        [Activity, "/pulse", "CampusPulse"],
        [Flag, "/reports", "Reports"],
        [CalendarDays, "/events", "Events"],
        [Heart, "/wellness", "Wellness"],
      ]
    : [
        [Activity, "/pulse", "Pulse"],
        [Flag, "/reports", "Report"],
        [CalendarDays, "/events", "Events"],
        [Heart, "/wellness", "Wellness"],
      ];
  return (
    <div className={admin ? "app admin-app" : "app"}>
      <aside className="sidebar">
        <NavLink to={admin ? "/admin" : "/pulse"} className="brand">
          <span className="brand-mark">
            <Activity />
          </span>
          OneCampus<span className="brand-dot">.</span>
        </NavLink>
        <div className="university">
          <GraduationCap size={18} />
          <div>
            Alliance University<small>Bengaluru, India</small>
          </div>
        </div>
        <span className="nav-caption">
          {admin ? "ADMINISTRATION" : "YOUR EVERYDAY CAMPUS"}
        </span>
        <nav>
          {links.map(([Icon, url, label]) => {
            const I = Icon as typeof Activity;
            return (
              <NavLink
                key={String(url)}
                to={String(url)}
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
              >
                <I size={20} />
                <span>{String(label)}</span>
                {![
                  "/pulse",
                  "/admin",
                  "/reports",
                  "/events",
                  "/wellness",
                ].includes(String(url)) && <span className="soon-dot" />}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <Activity size={22} />
          <strong>
            Small updates.
            <br />
            Big difference.
          </strong>
          <p>Your crowd reports help everyone find their space.</p>
        </div>
        <div className="profile">
          <span className="avatar">{user?.name.slice(0, 1)}</span>
          <div>
            <strong>{user?.name}</strong>
            <small>{admin ? "Campus administrator" : "Student"}</small>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            onClick={() => logout()}
          >
            <LogOut size={18} />
          </Button>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div>
            <span className="desktop-crumb">
              OneCampus <span>/</span>
            </span>{" "}
            {admin ? "Administration" : "Student portal"}
          </div>
          <div className="topbar-right">
            {!configured && <span className="demo-pill">Demo mode</span>}
            <span className="date-label">
              {new Intl.DateTimeFormat("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "numeric",
                month: "short",
                weekday: "short",
              }).format(new Date())}
            </span>
            <span className="avatar small-avatar">
              {user?.name.slice(0, 1)}
            </span>
            <Button
              className="mobile-logout"
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={() => logout()}
            >
              <LogOut size={18} />
            </Button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
        <footer>
          OneCampus <span>Made for the way campus moves.</span>
          <span>Alliance University · Bengaluru</span>
        </footer>
      </div>
      <nav className="bottom-nav">
        {links.map(([Icon, url, label]) => {
          const I = Icon as typeof Activity;
          return (
            <NavLink
              key={String(url)}
              to={String(url)}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <I size={21} />
              {String(label)}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="auth-loading" aria-label="Loading account">
        <Skeleton className="h-16 w-64" />
        <Skeleton className="h-64 w-96 max-w-full" />
      </div>
    );
  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate
              replace
              to={user.role === "admin" ? "/admin" : "/pulse"}
            />
          ) : (
            <Login />
          )
        }
      />
      <Route element={user ? <Shell /> : <Navigate replace to="/login" />}>
        <Route path="/pulse" element={<Pulse />} />
        <Route
          path="/admin"
          element={
            user?.role === "admin" ? (
              <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                <Admin />
              </Suspense>
            ) : (
              <Navigate replace to="/pulse" />
            )
          }
        />
        <Route
          path="/reports"
          element={
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <Reports />
            </Suspense>
          }
        />
        <Route
          path="/events"
          element={
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <Events />
            </Suspense>
          }
        />
        <Route
          path="/wellness"
          element={
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <Wellness />
            </Suspense>
          }
        />
      </Route>
      <Route
        path="*"
        element={
          <Navigate replace to={user?.role === "admin" ? "/admin" : "/pulse"} />
        }
      />
    </Routes>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
