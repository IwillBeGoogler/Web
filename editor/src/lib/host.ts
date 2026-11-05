/**
 * Where the editor lives in the page. Standalone it owns `<html>`; embedded in a host app it owns one element
 * (`.sdd-root`), so theme attributes and portals stay inside it and never touch the host's page.
 */
let root: HTMLElement | null = null;
export const setHostRoot = (el: HTMLElement | null): void => {
  root = el;
};
/** the element carrying `data-theme` */
export const themeRoot = (): HTMLElement => root ?? document.documentElement;
/** the element portals (tooltips, popovers) render into: inside the embed root so the scoped CSS applies */
export const portalRoot = (): HTMLElement => root ?? document.body;
export const isEmbedded = (): boolean => root !== null;

/** the host's address of a share link (`/s/:token` standalone; a host app serves it under its own prefix) */
let shareLink: ((token: string) => string) | null = null;
export const setShareLinkBuilder = (fn: ((token: string) => string) | null): void => {
  shareLink = fn;
};
export const buildShareLink = (token: string): string | null => (shareLink ? shareLink(token) : null);

/** what the host is told about the open file when it is asked for toolbar actions */
export interface HostActionContext {
  fileId: string;
  projectId: string | null;
  /** the person's role on the file (`owner`, `editor`, ...) */
  role: string;
}
export type HostActions = (ctx: HostActionContext) => import('react').ReactNode;
let hostActions: HostActions | null = null;
const hostActionSubs = new Set<() => void>();
/** the host's own buttons in the editor's toolbar (the iBlog "Publish" button). They render inside the editor's React tree, so the host's providers apply. */
export const setHostActions = (fn: HostActions | null): void => {
  hostActions = fn;
  hostActionSubs.forEach((f) => f());
};
export const subscribeHostActions = (f: () => void): (() => void) => {
  hostActionSubs.add(f);
  return () => void hostActionSubs.delete(f);
};
export const getHostActions = (): HostActions | null => hostActions;

/**
 * Single-use broker tickets. A signed-in host mints a ticket (`POST /api/me/stream-ticket`) before EVERY MQTT connect and
 * reconnect; the editor sends it as the MQTT password (username `ticket`).
 */
let ticketFn: (() => Promise<string>) | null = null;
export const setTicketProvider = (fn: (() => Promise<string>) | null): void => {
  ticketFn = fn;
};
export const getTicketProvider = (): (() => Promise<string>) | null => ticketFn;
