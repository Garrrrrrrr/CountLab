"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Time actually spent on the chart: it runs while `running` and the tab is
 * visible, so a chart left open overnight (or resumed tomorrow) does not
 * count the night.
 */
export function useActiveClock(running: boolean, initial = 0) {
  const [banked, setBanked] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const since = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const begin = () => { since.current = document.visibilityState === "visible" ? Date.now() : null; setNow(Date.now()); };
    const bank = () => {
      if (since.current === null) return;
      const add = Date.now() - since.current;
      since.current = null;
      setBanked((value) => value + add);
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? bank() : begin());
    begin();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { clearInterval(tick); document.removeEventListener("visibilitychange", onVisibility); bank(); };
  }, [running]);

  const read = useCallback(() => banked + (since.current === null ? 0 : Math.max(0, Date.now() - since.current)), [banked]);
  const set = useCallback((value: number) => { setBanked(value); if (since.current !== null) since.current = Date.now(); }, []);
  // `now` is only there to re-render the clock once a second.
  const ms = banked + (since.current === null ? 0 : Math.max(0, now - since.current));
  return { ms, read, set };
}
