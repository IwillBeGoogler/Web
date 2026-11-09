import "./styles.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient, router } from "./app/router";
import { installErrorReporting } from "./shared/errorReporting";
import { keepSplash } from "./shared/splash";

installErrorReporting();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

// Lift the pre-JS loading screen once the shell, fonts and (where it is shown) the 3D Earth are ready:
// held for at least 5s (stories: no hold, readers want the text) so the splash scene plays out, and longer while the Earth is still loading;
// a 30s safety cap keeps a broken WebGL path from trapping the user.
const splash = document.getElementById("splash");
const parked = (window as { __splash?: HTMLElement }).__splash;
if (parked) keepSplash(parked);
else if (splash) keepSplash(splash);
if (splash) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const story = /^\/(@[^/]+|p|posts)\/[^/]+\/?$/.test(location.pathname);
  const earth = story ? Promise.resolve() : new Promise((r) => addEventListener("iwillbegoogler:earth-ready", r, { once: true }));
  Promise.race([Promise.all([document.fonts?.ready, earth, wait(story ? 0 : 5000)]), wait(30000)]).then(() => {
    requestAnimationFrame(() => {
      splash.classList.add("out");
      setTimeout(() => splash.remove(), 600);
    });
  });
}
