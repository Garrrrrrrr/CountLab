"use client";
import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cx } from "./cx";

type ToastTone = "info" | "pos" | "neg";
type ToastItem = { id: number; message: string; tone: ToastTone };

const EVENT = "countlab:toast";
const ANNOUNCE = "countlab:announce";
let nextId = 1;

/** Shows a short message above the tab bar. Safe to call from anywhere, including outside React. */
export function toast(message: string, tone: ToastTone = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastItem>(EVENT, { detail: { id: nextId++, message, tone } }));
}

/** Speaks a message to screen readers without showing anything. */
export function announce(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(ANNOUNCE, { detail: message }));
}

const ICON = { info: Info, pos: CircleCheck, neg: CircleAlert };

/** Mounted once by the shell. Holds the one live region every toast and announcement goes through. */
export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [spoken, setSpoken] = useState("");
  useEffect(() => {
    const onToast = (event: Event) => {
      const item = (event as CustomEvent<ToastItem>).detail;
      setItems((current) => [...current.slice(-2), item]);
      setSpoken(item.message);
      setTimeout(() => setItems((current) => current.filter((entry) => entry.id !== item.id)), 3800);
    };
    const onAnnounce = (event: Event) => {
      // Clearing first makes a repeated message speak again.
      setSpoken("");
      requestAnimationFrame(() => setSpoken((event as CustomEvent<string>).detail));
    };
    window.addEventListener(EVENT, onToast);
    window.addEventListener(ANNOUNCE, onAnnounce);
    return () => { window.removeEventListener(EVENT, onToast); window.removeEventListener(ANNOUNCE, onAnnounce); };
  }, []);
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{spoken}</div>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4" style={{ bottom: "calc(var(--tabbar-h) + var(--safe-b) + 1rem)" }}>
        {items.map((item) => {
          const Icon = ICON[item.tone];
          return (
            <div key={item.id} className="animate-pop flex max-w-md items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium shadow-2">
              <Icon size={18} className={cx(item.tone === "pos" ? "text-pos" : item.tone === "neg" ? "text-neg" : "text-info")} />
              {item.message}
            </div>
          );
        })}
      </div>
    </>
  );
}
