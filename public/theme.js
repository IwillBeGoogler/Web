// Pre-paint: applies saved reading palette + type settings so nothing flashes.
// Palette tokens mirror src/contexts/preferences/domain/reading.ts (dark ones listed).
try {
  var root = document.documentElement;
  var p = JSON.parse(localStorage.getItem("iblog.reading") || "null");
  var dark = ["galaxy", "ink", "gruvbox", "nord", "dracula", "carbon", "solarized-dark", "one-dark", "midnight", "mocha"];
  // Galaxy is the default; a saved pick sticks once the one-time Galaxy move has run (store.ts, iblog.galaxy.v2).
  var id = p && p.palette && localStorage.getItem("iblog.galaxy.v2") ? p.palette : "galaxy";
  if (dark.indexOf(id) > -1) root.classList.add("dark");
  root.setAttribute("data-palette", id);
  if (p) {
    if (p.bold) root.classList.add("bold-text");
    if (p.focus) root.classList.add("focus-mode");
    if (p.typeStep) root.style.setProperty("--article-size", 20 + Math.max(-2, Math.min(4, p.typeStep)) + "px");
    if (p.measureStep) root.style.setProperty("--article-measure", 80 + Math.max(-5, Math.min(5, p.measureStep)) * 4 + "ch");
  }
} catch (e) {}
