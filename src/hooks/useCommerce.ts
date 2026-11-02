import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { listenFood, listenListings } from "@/services/commerce";
import type { FoodData } from "@/services/commerce";
import type { Listing } from "@/lib/commerce";
import type { Profile } from "@/lib/types";
function useResource<T>(
  listen: (
    user: Profile,
    next: (v: T) => void,
    error: (e: Error) => void,
  ) => () => void,
  initial: T,
) {
  const { user } = useAuth();
  const [data, setData] = useState(initial),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    if (!user) return;
    setData(initial);
    setLoading(true);
    setError("");
    return listen(
      user,
      (v) => {
        setData(v);
        setLoading(false);
        setError("");
      },
      (e) => {
        setError(e.message || "Could not load. Please retry.");
        setLoading(false);
      },
    );
  }, [user?.uid, user?.role, version]);
  return { data, loading, error, retry: () => setVersion((v) => v + 1) };
}
const EMPTY_LISTINGS: Listing[] = [];
const EMPTY_FOOD: FoodData = { services: [], items: [], orders: [] };
export const useMarketplace = () => useResource(listenListings, EMPTY_LISTINGS);
export const useFood = () => useResource(listenFood, EMPTY_FOOD);
