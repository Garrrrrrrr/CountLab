/** Registers the offline/installability service worker. Production only — dev's hot-reloaded assets would otherwise get stuck behind a stale cache. */
export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;
  if (!("serviceWorker" in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("[countlab] service worker registration failed", error);
    });
  };
  // This runs inside a React effect well after hydration, so `load` may have
  // already fired — a listener added after the fact would never call back.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);
}
