import { useEffect, useState, useCallback } from "react";
import { listenSpaces } from "@/services/store";
import type { Space } from "@/lib/types";
export function usePulse() {
  const [spaces, setSpaces] = useState<Space[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    setLoading(true);
    setError("");
    return listenSpaces(
      (s) => {
        setSpaces(s);
        setLoading(false);
      },
      () => {
        setError(
          "Campus updates could not load. Check your connection and try again.",
        );
        setLoading(false);
      },
    );
  }, [version]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  return {
    spaces,
    loading,
    error,
    now,
    retry: useCallback(() => setVersion((v) => v + 1), []),
  };
}
