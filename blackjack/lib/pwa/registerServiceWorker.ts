/** Registers the offline worker and reports a version that is waiting to activate. */
type UpdateListener = (activate: () => void) => void;

const listeners = new Set<UpdateListener>();
let pendingActivate: (() => void) | null = null;
let reloading = false;

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
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  const register = () => {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
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
