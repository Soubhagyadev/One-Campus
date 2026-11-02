import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { listenClaims, listenReports } from "@/services/reports";
import type { CampusReport, Claim } from "@/lib/reports";
export function useReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState<CampusReport[]>([]),
    [claims, setClaims] = useState<Claim[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!user) return;
    setReports([]);
    setClaims([]);
    setLoading(true);
    setError("");
    const stop = listenReports(
      user,
      (rows) => {
        setReports(rows);
        setLoading(false);
      },
      () => {
        setError(
          "Reports could not load. Check your connection and try again.",
        );
        setLoading(false);
      },
    );
    const stopClaims = listenClaims(user, setClaims, () =>
      setError("Item claims could not load. Please try again."),
    );
    return () => {
      stop();
      stopClaims();
    };
  }, [user, version]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  return {
    reports,
    claims,
    loading,
    error,
    now,
    retry: () => setVersion((v) => v + 1),
  };
}
