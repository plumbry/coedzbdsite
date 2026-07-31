import { useEffect, useRef } from "react";
import { toast } from "sonner";

const ASSET_RECOVERY_KEY = "sw-asset-recovery";

async function recoverFromBrokenAssets() {
  if (!("serviceWorker" in navigator)) return;
  if (sessionStorage.getItem(ASSET_RECOVERY_KEY) === "1") return;

  sessionStorage.setItem(ASSET_RECOVERY_KEY, "1");

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } finally {
    window.location.reload();
  }
}

export function useServiceWorker() {
  const toastShown = useRef(false);

  useEffect(() => {
    // Service worker caching breaks Vite HMR and can white-screen local dev.
    if (import.meta.env.DEV) return;
    if (!("serviceWorker" in navigator)) return;

    const onResourceError = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLLinkElement && target.rel === "stylesheet") {
        void recoverFromBrokenAssets();
        return;
      }
      // Stale index.html after deploy can point at a missing hashed bundle;
      // SPA fallback used to return HTML for that URL (MIME module error).
      if (target instanceof HTMLScriptElement && target.src) {
        void recoverFromBrokenAssets();
      }
    };

    window.addEventListener("error", onResourceError, true);

    const showUpdateToast = () => {
      if (toastShown.current) return;
      toastShown.current = true;

      toast("A new version is available!", {
        duration: Infinity,
        action: { label: "Refresh", onClick: () => window.location.reload() },
      });
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("Service Worker registered:", registration);

        // Check if update is already waiting
        if (registration.waiting) {
          showUpdateToast();
          return;
        }

        // Listen for new updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateToast();
            }
          });
        });
      })
      .catch((err) => console.log("Service Worker registration failed:", err));

    return () => {
      window.removeEventListener("error", onResourceError, true);
    };
  }, []);
}
