import type { SyncEngine } from './engine';

/** The engine of the project open in the editor (toolbar buttons: retry, restore a version, upload). */
let active: SyncEngine | null = null;
export const getActiveEngine = (): SyncEngine | null => active;
export const setActiveEngine = (e: SyncEngine | null): void => {
  active = e;
};
