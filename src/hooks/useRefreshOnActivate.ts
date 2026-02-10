import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Calls `refresh` whenever the page at `path` becomes visible again
 * (transition from inactive → active). Skips the initial mount.
 */
export function useRefreshOnActivate(path: string, refresh: () => void) {
  const { pathname } = useLocation();
  const active = pathname === path;
  const prevActive = useRef(active);

  useEffect(() => {
    if (active && !prevActive.current) {
      refresh();
    }
    prevActive.current = active;
  }, [active, refresh]);
}
