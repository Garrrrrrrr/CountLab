"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const FocusContext = createContext<{ focused: boolean; setFocused: (focused: boolean) => void }>({ focused: false, setFocused: () => {} });

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.focus = focused ? "on" : "off";
  }, [focused]);
  return <FocusContext.Provider value={{ focused, setFocused }}>{children}</FocusContext.Provider>;
}

/**
 * While `active`, the shell hides its tab bar, top bar and sidebar so a drill
 * gets the whole screen. Drills turn it on when a session starts and off on
 * the summary, so the reader always has a way back to the rest of the app.
 */
export function useFocusMode(active: boolean) {
  const { setFocused } = useContext(FocusContext);
  useEffect(() => {
    setFocused(active);
    return () => setFocused(false);
  }, [active, setFocused]);
}

export const useIsFocused = () => useContext(FocusContext).focused;
