/**
 * Types of the diagram editor (`editor/src/embed.tsx`), which Vite aliases to `@diagram-editor`.
 * Declared by hand on purpose: pointing `paths` at the editor's source would make this project's stricter
 * compiler settings check ~78k lines of the editor. Keep in step with `DiagramEditorProps` in editor/src/embed.tsx.
 */
declare module "@diagram-starter" {
  /** the document (a file's `data`) a new file of this kind starts with; null = start empty */
  export function starterProject(kind: "sdd" | "erd" | "uml" | "board", name: string): unknown;
}

declare module "@diagram-editor" {
  import type { CSSProperties, ReactElement, ReactNode } from "react";

  export interface EmbedUser {
    id: string | number;
    name: string;
    email?: string;
  }
  export type EmbedTarget = { to: "home" } | { to: "project"; projectId: string } | { to: "file"; projectId: string; fileId: string } | { to: "login" };
  export interface Features {
    realtime: boolean;
    collab: boolean;
    rtc: boolean;
    comments: boolean;
    sharing: boolean;
    privateNotes: boolean;
    library: boolean;
    thumbnails: boolean;
    accounts: boolean;
    schemaTools: boolean;
  }
  /** the open file and the person's role on it, when the editor asks the host for toolbar buttons */
  export interface HostActionContext {
    fileId: string;
    projectId: string | null;
    role: string;
  }
  export interface DiagramEditorProps {
    fileId?: string;
    /** open this comment thread once the file has loaded */
    commentId?: string;
    shareToken?: string;
    /** a published diagram (`/public/:slug`): read-only, no sign-in, no sync */
    slug?: string;
    apiBase?: string;
    theme?: "light" | "dark" | "system";
    /** UI language of the editor chrome (`en` default) */
    lang?: "en" | "uz" | "ru";
    user?: EmbedUser | null;
    getAuthHeaders?: () => Record<string, string | undefined>;
    /** mint a single-use broker ticket (POST /me/stream-ticket); called before every MQTT connect and reconnect */
    getTicket?: () => Promise<string>;
    /** MQTT-over-WebSocket broker URL; default same origin `/mqtt` (from GET {apiBase}/realtime/config) */
    mqttUrl?: string;
    onUnauthorized?: () => void;
    onNavigate?: (target: EmbedTarget, opts: { replace: boolean }) => void;
    shareUrl?: (token: string) => string;
    features?: Partial<Features>;
    /** the host's buttons in the toolbar of an open file (next to Share) */
    hostActions?: (ctx: HostActionContext) => ReactNode;
    className?: string;
    style?: CSSProperties;
  }
  export const DEFAULT_API_BASE: string;
  /** is there anything the editor would ask about before leaving (unsaved changes)? */
  export function hasUnsavedChanges(): boolean;
  /** ask with the editor's own dialog (Save / Leave without saving / Stay); true = go ahead */
  export function confirmLeave(): Promise<boolean>;
  /** write pending edits now (local storage + a keepalive upload): call as navigation proceeds */
  export function flushPendingSaves(): void;
  export const EMBED_FEATURES: Features;
  export function DiagramEditor(props: DiagramEditorProps): ReactElement;
}
