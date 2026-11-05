/**
 * Puts `line` on its own paragraph in `text`: at the caret (replacing a selection) when one is known, else at the end.
 * Returns the new text; blank lines are added only where the neighbours need them.
 */
export function insertBlock(text: string, line: string, sel: { start: number; end: number } | null): string {
  if (!sel) return `${text}${text && !text.endsWith("\n") ? "\n\n" : text ? "\n" : ""}${line}\n`;
  const start = Math.min(sel.start, text.length);
  const end = Math.min(Math.max(sel.end, start), text.length);
  const before = text.slice(0, start);
  const after = text.slice(end);
  const pre = !before ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const post = !after ? "\n" : after.startsWith("\n\n") ? "\n" : after.startsWith("\n") ? "\n\n" : "\n\n";
  return `${before}${pre}${line}${post}${after}`;
}

/** A live HTML block to start from: a CSS animation and a little script, run in a sandboxed frame. */
export const LIVE_STARTER = [
  "```html-live height=240",
  "<style>",
  "  body { margin: 0; height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; }",
  "  .dot { width: 48px; height: 48px; border-radius: 50%; background: #e4572e; animation: hop 1.1s ease-in-out infinite alternate; }",
  "  @keyframes hop { to { transform: translateY(-80px) scale(0.8); } }",
  "</style>",
  '<div class="dot" title="Click me"></div>',
  "<script>",
  '  const dot = document.querySelector(".dot");',
  '  dot.onclick = () => { dot.style.animationPlayState = dot.style.animationPlayState === "paused" ? "running" : "paused"; };',
  "</script>",
  "```",
].join("\n");
