import "@fontsource-variable/inter-tight/wght.css";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource-variable/source-serif-4/opsz-italic.css";
import "./styles.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient, router } from "./app/router";
import { installErrorReporting } from "./shared/errorReporting";
import { persistQueries } from "./shared/queryPersist";
import { contentReady, earthReady, keepSplash } from "./shared/splash";

installErrorReporting();
// Public first-screen data (trending, tags, latest, landing teasers) comes back from localStorage, so a repeat visit paints at once.
persistQueries(queryClient);

// Router view transitions reject when the viewport changes mid-transition (rotation, mobile URL bar); that is harmless, so keep it out of the console.
if (document.startViewTransition) {
  const start = document.startViewTransition.bind(document);
  document.startViewTransition = ((arg?: Parameters<typeof start>[0]) => {
    const vt = start(arg);
    for (const p of [vt.ready, vt.finished, vt.updateCallbackDone]) p.catch(() => {});
    return vt;
  }) as typeof document.startViewTransition;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

// Lift the pre-JS loading screen once the page is really there: fonts, and on the home page its first screen of data and the 3D Earth.
// A safety cap keeps a stuck request or texture from trapping the user.
const splash = document.getElementById("splash");
const parked = (window as { __splash?: HTMLElement }).__splash;
if (parked) keepSplash(parked);
else if (splash) keepSplash(splash);
if (splash) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const home = location.pathname === "/";
  const holds = [document.fonts?.ready ?? Promise.resolve(), ...(home ? [contentReady(), earthReady()] : [])];
  Promise.race([Promise.all(holds), wait(home ? 10_000 : 3000)]).then(() => {
    requestAnimationFrame(() => {
      splash.classList.add("out");
      setTimeout(() => splash.remove(), 600);
    });
  });
}
