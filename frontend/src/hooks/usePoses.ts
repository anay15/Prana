import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Pose } from "../lib/types";

let cache: Pose[] | null = null;
let inflight: Promise<Pose[]> | null = null;

export function usePoses() {
  const [poses, setPoses] = useState<Pose[] | null>(cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) return;
    inflight ??= api.poses().then((p) => (cache = p));
    inflight
      .then(setPoses)
      .catch((e: Error) => {
        inflight = null;
        setError(e.message);
      });
  }, []);

  return { poses, error, loading: !poses && !error };
}
