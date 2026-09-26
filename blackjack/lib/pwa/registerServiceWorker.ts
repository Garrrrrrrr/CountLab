/** Registers the offline worker and reports a version that is waiting to activate. */
type UpdateListener = (activate: () => void) => void;

const listeners = new Set<UpdateListener>();
let pendingActivate: (() => void) | null = null;
let reloading = false;
let recoveryInstalled = false;

function installChunkRecovery() {
  if (recoveryInstalled) return;
  recoveryInstalled = true;
  const recover = () => {
    const key = `countlab:chunk-recovery:${process.env.NEXT_PUBLIC_COMMIT_SHA || "local"}`;
    if (reloading || sessionStorage.getItem(key)) return;
    reloading = true;
    sessionStorage.setItem(key, "1");
    // Unregistering makes the next navigation fetch a fresh HTML shell even if
    // the current worker still holds an older page in its offline cache.
    void navigator.serviceWorker.getRegistration().then((registration) => registration?.unregister()).finally(() => window.location.reload());
  };
  window.addEventListener("error", (event) => {
    const target = event.target;
    if (target instanceof HTMLScriptElement && target.src && new URL(target.src).pathname.startsWith("/_next/static/chunks/")) recover();
    else if (event.message && /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module/i.test(event.message)) recover();
  }, true);
  window.addEventListener("unhandledrejection", (event) => {
    if (/ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module/i.test(String(event.reason))) recover();
  });
}

export function onServiceWorkerUpdate(listener: UpdateListener): () => void {
  listeners.add(listener);
  if (pendingActivate) listener(pendingActivate);
  return () => listeners.delete(listener);
}

function announce(registration: ServiceWorkerRegistration) {
  const activate = () => registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  pendingActivate = activate;
  listeners.forEach((listener) => listener(activate));
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  installChunkRecovery();
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  const register = () => {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      // Some embedded and automated browsers resolve without a registration
      // when service workers are blocked; there is nothing to watch then.
      if (!registration) return;
      if (registration.waiting && navigator.serviceWorker.controller) announce(registration);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) announce(registration);
        });
      });
    }).catch((error) => console.error("[countlab] service worker registration failed", error));
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
