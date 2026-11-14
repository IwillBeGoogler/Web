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
import { keepSplash } from "./shared/splash";

installErrorReporting();

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

// Lift the pre-JS loading screen once the shell and fonts are ready. The 3D Earth loads later (see router Shell), so it no longer holds the splash;
// a 3s safety cap keeps a stuck font load from trapping the user.
const splash = document.getElementById("splash");
const parked = (window as { __splash?: HTMLElement }).__splash;
if (parked) keepSplash(parked);
else if (splash) keepSplash(splash);
if (splash) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  Promise.race([document.fonts?.ready ?? Promise.resolve(), wait(3000)]).then(() => {
    requestAnimationFrame(() => {
      splash.classList.add("out");
      setTimeout(() => splash.remove(), 600);
    });
  });
}
