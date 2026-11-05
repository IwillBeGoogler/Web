// Loading-screen scene driver (the three.js bundle isn't loaded yet). Renders public/splash-worker.js on an
// OffscreenCanvas in a Worker so the animation stays smooth while the main thread boots the app; falls back
// to rendering on the main thread, and to the CSS orbit spinner without WebGL. Stops once src/main.tsx
// removes the splash.
(function () {
  var box = document.getElementById("splash"), cv = document.getElementById("splash-gl");
  if (!box || !cv) return;
  var root = document.documentElement;
  // Automated browsers (e2e) skip the scene: headless WebGL is slow and the overlay blocks clicks.
  if (navigator.webdriver) { box.remove(); return; }
  // Inner pages open straight away: the scene is only for the home page. Parked (detached) on first load so the logo can replay it.
  if (location.pathname !== "/" && !window.__splashReplay) {
    window.__splash = box; box.remove();
    var f = document.fonts;
    if (f && f.load) {
      root.classList.add("fonts-wait");
      var show = function () { root.classList.remove("fonts-wait"); };
      Promise.all(["400 1em Geist", "700 1em \"Inter Tight\"", "400 1em \"Source Serif 4\"", "700 1em \"Source Serif 4\"", "400 1em \"Geist Mono\""].map(function (s) { return f.load(s); })).then(show, show);
      setTimeout(show, 1200);
    }
    return;
  }
  var st = {
    m: innerWidth < 600,
    calm: matchMedia("(prefers-reduced-motion: reduce)").matches,
    d: root.hasAttribute("data-palette") && !root.classList.contains("dark") ? 0 : 1,
  };
  function dims() { var r = Math.min(devicePixelRatio || 1, 1); st.w = cv.clientWidth * r; st.h = cv.clientHeight * r; }
  dims();
  function ready() { box.classList.add("gl"); }
  var wk = null;
  if (cv.transferControlToOffscreen && window.Worker) {
    try {
      wk = new Worker("/splash-worker.js");
      var off = cv.transferControlToOffscreen();
      wk.onmessage = ready;
      wk.postMessage({ cv: off, st: st }, [off]);
    } catch (e) { if (wk) wk.terminate(); wk = null; }
  }
  if (!wk && window.splashScene) window.splashScene(cv, st, ready);
  else if (!wk) {
    var s = document.createElement("script");
    s.src = "/splash-worker.js";
    s.onload = function () { if (window.splashScene) window.splashScene(cv, st, ready); };
    document.head.appendChild(s);
  }
  var onResize = function () { dims(); if (wk) wk.postMessage({ w: st.w, h: st.h }); };
  addEventListener("resize", onResize);
  var mo = new MutationObserver(function () {
    if (document.body.contains(box)) return;
    st.stop = 1; if (wk) wk.terminate(); mo.disconnect(); removeEventListener("resize", onResize);
  });
  mo.observe(document.body, { childList: true });
})();
