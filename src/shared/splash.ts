// Replays the pre-JS loading screen (index.html #splash) on demand, e.g. when the logo takes you home.
// Each replay mounts a fresh copy and re-runs public/splash.js, so the full WebGL scene plays again;
// splash.js stops its worker once the copy leaves the DOM.

type SplashWindow = Window & { __splashReplay?: boolean };

let template: HTMLElement | null = null;

/** Snapshot the splash markup before src/main.tsx removes it. */
export function keepSplash(splash: HTMLElement) {
  const copy = splash.cloneNode(true) as HTMLElement;
  copy.classList.remove("gl", "out");
  template = copy;
}

/** Shows the splash for at least `ms` once the scene is drawing (capped at 4s), then fades it out. No-op under reduced motion. */
export function playSplash(ms = 1600) {
  if (!template || document.getElementById("splash") || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const el = template.cloneNode(true) as HTMLElement;
  const app = document.getElementById("root");
  document.body.append(el);
  // Keep keyboard focus off the covered page while the overlay is up.
  app?.setAttribute("inert", "");
  // splash.js parks the splash on inner pages; this flag tells it the replay is wanted.
  (window as SplashWindow).__splashReplay = true;
  const run = document.createElement("script");
  run.src = "/splash.js";
  run.onload = run.onerror = () => {
    run.remove();
    delete (window as SplashWindow).__splashReplay;
  };
  document.body.append(run);

  let done = false;
  const hide = () => {
    if (done) return;
    done = true;
    ready.disconnect();
    clearTimeout(cap);
    removeEventListener("popstate", hide);
    app?.removeAttribute("inert");
    el.classList.add("out");
    setTimeout(() => el.remove(), 600);
  };
  // Hold until the scene reports ready (splash.js adds .gl), then `ms` more.
  const ready = new MutationObserver(() => {
    if (!el.classList.contains("gl")) return;
    ready.disconnect();
    setTimeout(hide, ms);
  });
  ready.observe(el, { attributes: true, attributeFilter: ["class"] });
  const cap = setTimeout(hide, 4000);
  // Back/forward cancels the replay.
  addEventListener("popstate", hide, { once: true });
}
