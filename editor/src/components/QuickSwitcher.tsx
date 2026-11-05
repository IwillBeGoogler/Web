import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useWorkspace } from '../workspace/store';
import { activateTab } from '../workspace/actions';
import { pathOf } from '../workspace/tree';
import { FileKindIcon } from './explorer/FileIcon';
import { t } from '../i18n';

/** ⌘P "Go to file": type to filter the files of the open project (open tabs and recent files first), Enter opens. */
export function QuickSwitcher() {
  const open = useWorkspace((s) => s.quickOpen);
  const setOpen = useWorkspace((s) => s.setQuickOpen);
  const projectId = useWorkspace((s) => s.projectId);
  const tree = useWorkspace((s) => s.tree);
  const recent = useWorkspace((s) => s.recent);
  const tabs = useWorkspace((s) => s.tabs);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
        if (!useWorkspace.getState().projectId) return;
        e.preventDefault();
        useWorkspace.getState().setQuickOpen(!useWorkspace.getState().quickOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    queueMicrotask(() => input.current?.focus());
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = (id: string) => (tabs.open.includes(id) ? 0 : recent.includes(id) ? 1 : 2);
    return tree.files
      .map((f) => ({ f, path: pathOf(tree, { kind: 'file', id: f.id }) }))
      .filter((r) => !q || r.path.toLowerCase().includes(q))
      .sort((a, b) => rank(a.f.id) - rank(b.f.id) || a.path.localeCompare(b.path))
      .slice(0, 50);
  }, [tree, query, recent, tabs.open]);
  useEffect(() => setActive(0), [query]);
  if (!open || !projectId) return null;
  const go = (id: string | undefined) => {
    if (!id) return;
    setOpen(false);
    activateTab(id);
  };
  return (
    <div className="cmdk-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="cmdk" role="dialog" aria-label={t('Go to file')}>
        <div className="cmdk-input">
          <Search size={16} aria-hidden />
          <input
            ref={input}
            value={query}
            placeholder={t('Go to file…')}
            aria-label={t('Go to file')}
            role="combobox"
            aria-expanded="true"
            aria-controls="qs-list"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); go(results[active]?.f.id); }
              else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <ul id="qs-list" className="cmdk-list" role="listbox" aria-label={t('Files')}>
          {results.length === 0 && <li className="cmdk-empty">{t('No matching files')}</li>}
          {results.map((r, i) => (
            <li key={r.f.id} role="option" aria-selected={i === active} data-testid={`qs-${r.f.name}`} className={`cmdk-item${i === active ? ' active' : ''}`} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); go(r.f.id); }}>
              <FileKindIcon kind={r.f.kind} size={15} />
              <span className="cmdk-title">{r.path}</span>
              {tabs.active === r.f.id && <span className="cmdk-section">{t('open')}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
