import { create } from 'zustand';

/**
 * Backend capabilities the editor may use. The standalone app has them all; an embedding host switches off what its
 * backend does not serve (yet), so the editor never calls a missing endpoint or reconnects to a missing socket.
 */
export interface Features {
  /** per-file / per-project MQTT connections (presence, "updated by", tree events) */
  realtime: boolean;
  /** live co-editing (Yjs over MQTT); needs `realtime` */
  collab: boolean;
  /** audio rooms (WebRTC, signaling over MQTT); needs `realtime` */
  rtc: boolean;
  /** comment threads, notifications */
  comments: boolean;
  /** share links + members dialogs */
  sharing: boolean;
  /** my private stickies (`/files/:id/private`) */
  privateNotes: boolean;
  /** project library: components, styles, tokens (`/projects/:id/library`) */
  library: boolean;
  /** card previews (`PUT /files/:id/thumbnail`) */
  thumbnails: boolean;
  /** the host owns sign-in: no account menu / login screens inside the editor */
  accounts: boolean;
  /** schema tools that call the server (live database introspection) */
  schemaTools: boolean;
}
export const ALL_FEATURES: Features = { realtime: true, collab: true, rtc: true, comments: true, sharing: true, privateNotes: true, library: true, thumbnails: true, accounts: true, schemaTools: true };

export const useFeatures = create<Features>(() => ({ ...ALL_FEATURES }));
export const features = (): Features => useFeatures.getState();
export const setFeatures = (f: Partial<Features>): void => useFeatures.setState(f);
export const resetFeatures = (): void => useFeatures.setState({ ...ALL_FEATURES });
