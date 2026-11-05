import { useEffect } from 'react';
import { closeFileTab, cycleActiveTab, reopenLastClosed } from '../workspace/actions';
import { useWorkspace } from '../workspace/store';

/** Tab shortcuts. ⌘W / ⌘⇧T are reserved by most browsers; Alt+W / Alt+Shift+T work everywhere (and ⌘W works in an installed PWA). */
export function useWorkspaceShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const code = e.code;
      const closeKey = (mod && !e.shiftKey && !e.altKey && k === 'w') || (e.altKey && !mod && !e.shiftKey && code === 'KeyW');
      const reopenKey = (mod && e.shiftKey && !e.altKey && k === 't') || (e.altKey && e.shiftKey && !mod && code === 'KeyT');
      const cycleKey = e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'Tab';
      if (!closeKey && !reopenKey && !cycleKey) return;
      const ws = useWorkspace.getState();
      if (!ws.projectId) return;
      e.preventDefault();
      if (closeKey) {
        if (ws.tabs.active) closeFileTab(ws.tabs.active);
      } else if (reopenKey) reopenLastClosed();
      else cycleActiveTab(e.shiftKey ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
