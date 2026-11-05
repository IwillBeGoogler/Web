import { useSyncExternalStore } from "react";

const isDark = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");

/** True while the page shows a dark palette (follows <html class="dark">). */
export const useDark = () =>
  useSyncExternalStore(
    (l) => {
      const mo = new MutationObserver(l);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => mo.disconnect();
    },
    isDark,
    () => false,
  );
