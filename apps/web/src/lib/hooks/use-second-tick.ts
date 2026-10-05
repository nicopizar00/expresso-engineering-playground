import { useEffect, useState } from "react";

// Current time, re-rendered once a second while enabled.
export function useSecondTick(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    // Re-sync on enable: `now` may date from mount, long before the caller
    // became visible.
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}
