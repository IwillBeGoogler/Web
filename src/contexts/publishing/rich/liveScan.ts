/**
 * Mirror of the server's html-live scan (Backend/internal/domain/post/live.go: scanLive + LiveBlocks): the top-level fenced blocks with
 * language `html-live` and an optional `height=N`. Used to check that the rich editor sees exactly the blocks the server runs.
 */
export const LIVE_LANG = "html-live";
export const MAX_LIVE_BYTES = 64 << 10;
export const MAX_LIVE_BLOCKS = 10;

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
export const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const HEIGHT = /^height=(\d{1,5})$/;

export type LiveFence = { start: number; end: number; code: string; height: number | null; fence: string };

/** The info string of a fence line as a live block's options, or null when the fence is not a (valid) live block. */
export function liveInfo(info: string): { height: number | null } | null {
  const f = info.trim().split(/\s+/).filter(Boolean);
  if (f[0] !== LIVE_LANG) return null;
  if (f.length === 1) return { height: null };
  const m = f.length === 2 ? HEIGHT.exec(f[1] ?? "") : null;
  return m ? { height: Number(m[1]) } : null;
}

/** Live blocks of a body, as lines [start, end). Blocks over the server's limits are left out, as the server runs only the rest. */
export function scanLive(body: string): LiveFence[] {
  if (!body.includes(LIVE_LANG)) return [];
  const lines = body.split("\n");
  const out: LiveFence[] = [];
  let open: { ch: string; n: number; live: boolean; start: number; height: number | null; fence: string; code: string[] } | null = null;
  const finish = (end: number) => {
    if (open?.live) out.push({ start: open.start, end, code: open.code.join("\n"), height: open.height, fence: open.fence });
    open = null;
  };
  lines.forEach((raw, i) => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (!open) {
      const m = FENCE_OPEN.exec(line);
      if (!m) return;
      const fence = m[1] as string;
      const info = (m[2] as string).trim();
      if (fence[0] === "`" && info.includes("`")) return;
      const live = liveInfo(info);
      open = { ch: fence[0] as string, n: fence.length, live: !!live, start: i, height: live?.height ?? null, fence, code: [] };
      return;
    }
    const c = FENCE_CLOSE.exec(line);
    if (c && (c[1] as string)[0] === open.ch && (c[1] as string).length >= open.n) finish(i + 1);
    else if (open.live) open.code.push(line);
  });
  if (open) finish(lines.length);
  const ok: LiveFence[] = [];
  for (const b of out) if (b.code.length <= MAX_LIVE_BYTES && ok.length < MAX_LIVE_BLOCKS) ok.push(b);
  return ok;
}
