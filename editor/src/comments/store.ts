import { create } from 'zustand';
import { api as realApi, type Api } from '../api/api';
import type { ApiComment, ApiNotification, CommentAnchor, CommentThread, Member } from '../api/types';
import { applyCommentEvent, type CommentEvent, type CommentFilter } from './logic';

export type CommentsApi = Pick<Api, 'listComments' | 'addComment' | 'editComment' | 'resolveComment' | 'deleteComment' | 'markCommentsRead' | 'listMembers' | 'listNotifications' | 'markNotificationsRead'>;

export interface Draft {
  anchor: CommentAnchor;
  /** screen position of the composer */
  at?: { x: number; y: number };
}
interface CommentsState {
  fileId: string | null;
  meId: string | null;
  threads: CommentThread[];
  unread: number;
  members: Member[];
  panelOpen: boolean;
  filter: CommentFilter;
  activeId: string | null;
  /** a thread (opened from a link) the canvas should pan / zoom to once its anchor is on the canvas; CommentPins consumes it */
  reveal: string | null;
  draft: Draft | null;
  load: (fileId: string, projectId: string | null, meId: string | null, api?: CommentsApi) => Promise<void>;
  reset: () => void;
  /** re-fetch the threads (polling / focus until live comment events arrive); a no-op without a loaded file */
  refresh: (api?: CommentsApi) => Promise<void>;
  handleMessage: (m: { type: string } & Record<string, unknown>) => void;
  add: (input: { body: string; anchor: CommentAnchor }, api?: CommentsApi) => Promise<ApiComment>;
  reply: (rootId: string, body: string, api?: CommentsApi) => Promise<ApiComment>;
  edit: (id: string, body: string, api?: CommentsApi) => Promise<void>;
  resolve: (id: string, resolved: boolean, api?: CommentsApi) => Promise<void>;
  remove: (id: string, api?: CommentsApi) => Promise<void>;
  setPanel: (open: boolean, api?: CommentsApi) => Promise<void>;
  setFilter: (f: CommentFilter) => void;
  setActive: (id: string | null) => void;
  setDraft: (d: Draft | null) => void;
}

let activeApi: CommentsApi = realApi;
/** a comment to reveal as soon as its file is loaded (a click on a notification navigates first) */
let pendingOpen: { fileId: string; commentId: string } | null = null;
export function openComment(fileId: string, commentId: string): void {
  const s = useCommentsStore.getState();
  if (s.fileId === fileId && s.threads.length) {
    useCommentsStore.setState({ activeId: commentId, panelOpen: true, filter: 'all', reveal: commentId });
    return;
  }
  pendingOpen = { fileId, commentId };
}
/** bumped by every `load` and `reset`: a load that finds it changed is stale (an overlapping load of the same file, or a reset) and drops its result */
let loadSeq = 0;
const initial = { fileId: null as string | null, meId: null as string | null, threads: [] as CommentThread[], unread: 0, members: [] as Member[], panelOpen: false, filter: 'open' as CommentFilter, activeId: null as string | null, reveal: null as string | null, draft: null as Draft | null };

export const useCommentsStore = create<CommentsState>((set, get) => ({
  ...initial,
  load: async (fileId, projectId, meId, api = realApi) => {
    activeApi = api;
    const seq = ++loadSeq;
    set({ ...initial, fileId, meId });
    const [list, members] = await Promise.all([api.listComments(fileId), projectId ? api.listMembers(projectId).catch(() => [] as Member[]) : Promise.resolve([] as Member[])]);
    // another file was opened meanwhile, or a newer load of this file is under way (a reconnect, a re-run effect): the newest one
    // applies and consumes the pending "open this thread"; a stale one landing last would put `unread` back after it was cleared
    if (seq !== loadSeq || get().fileId !== fileId) return;
    set({ threads: list.threads, unread: list.unread, members });
    if (pendingOpen?.fileId === fileId) {
      set({ activeId: pendingOpen.commentId, panelOpen: true, filter: 'all', unread: 0, reveal: pendingOpen.commentId });
      pendingOpen = null;
      void api.markCommentsRead(fileId).catch(() => undefined);
    }
  },
  reset: () => {
    loadSeq++;
    set({ ...initial });
  },
  refresh: async (api = activeApi) => {
    const { fileId } = get();
    if (!fileId) return;
    const list = await api.listComments(fileId);
    const s = get();
    if (s.fileId !== fileId) return; // another file was opened meanwhile
    if (s.panelOpen) {
      set({ threads: list.threads, unread: 0 });
      if (list.unread > 0) void api.markCommentsRead(fileId).catch(() => undefined); // I am reading: it is read
    } else set({ threads: list.threads, unread: list.unread });
  },
  handleMessage: (m) => {
    if (m.type !== 'comment.created' && m.type !== 'comment.updated' && m.type !== 'comment.deleted') return;
    const s = get();
    const c = (m as { comment?: ApiComment }).comment;
    if (c && c.fileId !== s.fileId) return;
    if (m.type === 'comment.deleted' && (m as { fileId?: string }).fileId !== s.fileId) return;
    const before = s.threads;
    const threads = applyCommentEvent(before, m as unknown as CommentEvent);
    let unread = s.unread;
    if (m.type === 'comment.created' && threads !== before && c && c.author.id !== s.meId) {
      if (s.panelOpen) void activeApi.markCommentsRead(c.fileId).catch(() => undefined); // somebody comments while I read: it is read
      else unread += 1;
    }
    set({ threads, unread });
  },
  add: async (input, api = realApi) => {
    const { fileId } = get();
    if (!fileId) throw new Error('no file');
    const comment = await api.addComment(fileId, { body: input.body, anchor: input.anchor });
    set((s) => ({ threads: applyCommentEvent(s.threads, { type: 'comment.created', comment }), draft: null, activeId: comment.id }));
    return comment;
  },
  reply: async (rootId, body, api = realApi) => {
    const { fileId } = get();
    if (!fileId) throw new Error('no file');
    const comment = await api.addComment(fileId, { body, parentId: rootId });
    set((s) => ({ threads: applyCommentEvent(s.threads, { type: 'comment.created', comment }) }));
    return comment;
  },
  edit: async (id, body, api = realApi) => {
    const comment = await api.editComment(id, { body });
    set((s) => ({ threads: applyCommentEvent(s.threads, { type: 'comment.updated', comment }) }));
  },
  resolve: async (id, resolved, api = realApi) => {
    const comment = await api.resolveComment(id, resolved);
    set((s) => ({ threads: applyCommentEvent(s.threads, { type: 'comment.updated', comment }) }));
  },
  remove: async (id, api = realApi) => {
    await api.deleteComment(id);
    set((s) => ({ threads: applyCommentEvent(s.threads, { type: 'comment.deleted', commentId: id }), activeId: s.activeId === id ? null : s.activeId }));
  },
  setPanel: async (open, api = realApi) => {
    set({ panelOpen: open });
    const { fileId, unread } = get();
    if (open && fileId && unread > 0) {
      set({ unread: 0 });
      await api.markCommentsRead(fileId).catch(() => undefined);
    } else if (open && fileId) await api.markCommentsRead(fileId).catch(() => undefined);
  },
  setFilter: (filter) => set({ filter }),
  setActive: (activeId) => set({ activeId }),
  setDraft: (draft) => set({ draft }),
}));

interface NotificationsState {
  items: ApiNotification[];
  unread: number;
  load: (api?: CommentsApi) => Promise<void>;
  push: (n: ApiNotification) => void;
  markRead: (ids: string[], api?: CommentsApi) => Promise<void>;
  markAllRead: (api?: CommentsApi) => Promise<void>;
  reset: () => void;
}
export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  unread: 0,
  load: async (api = realApi) => {
    const r = await api.listNotifications({ limit: 30 });
    set({ items: r.items, unread: r.unread });
  },
  push: (n) => {
    if (get().items.some((x) => x.id === n.id)) return;
    set((s) => ({ items: [n, ...s.items].slice(0, 50), unread: s.unread + (n.read ? 0 : 1) }));
  },
  markRead: async (ids, api = realApi) => {
    const hit = get().items.filter((n) => ids.includes(n.id) && !n.read).length;
    set((s) => ({ items: s.items.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)), unread: Math.max(0, s.unread - hit) }));
    await api.markNotificationsRead({ ids }).catch(() => undefined);
  },
  markAllRead: async (api = realApi) => {
    set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })), unread: 0 }));
    await api.markNotificationsRead({ all: true }).catch(() => undefined);
  },
  reset: () => set({ items: [], unread: 0 }),
}));
