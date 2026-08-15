import { useCallback, useEffect, useState } from "react";

/**
 * Minimal fetch-on-mount hook with a manual reload.
 *
 * Deliberately not react-query: this is a single-user local tool with no need
 * for background refetching, cross-tab invalidation, or optimistic updates.
 */
export const useResource = (loader, deps = [], initial = null) => {
  const [data, setData] = useState(initial);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await load());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await load();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [load]);

  return { data, error, loading, reload, setData };
};
