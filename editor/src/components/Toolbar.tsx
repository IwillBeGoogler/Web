import { useSmart } from '../store/smartStore';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useReactFlow, useStore } from '@xyflow/react';
import { ArrowLeft, ChevronDown, Ellipsis, File as FileIcon, FolderTree, Grid3x3, LayoutDashboard, LayoutTemplate, Maximize2, Minus, PanelLeft, PanelRight, Plus, Redo2, Settings as SettingsIcon, Spline, Undo2 } from 'lucide-react';
import { useDiagramStore } from '../store/diagramStore';
import { useSession } from '../api/session';
import { useCollabStore } from '../collab/store';
import { canEdit } from '../lib/roles';
import { lineStyleOverrides } from '../lib/settings';
import { useUiStore } from '../store/uiStore';
import { useFileStore } from '../store/fileStore';
import { useSddActions } from '../hooks/useSdd';
import { useAppActions } from '../AppContext';
import { exportDialog, newProjectDialog, renameProjectDialog } from '../lib/dialogActions';
import { createWsProject } from '../workspace/storage';
import { createFileIn, importOpenedFile, newFileDialog, renameCurrentProject, renameItem } from '../workspace/actions';
import { useWorkspace } from '../workspace/store';
import { OPEN_ACCEPT } from '../lib/sdd/fileAccess';
import { exportProjectBytes } from '../workspace/projectFile';
import { SddError } from '../lib/sdd/sdd';
import { downloadBlob } from '../lib/export';
import { requestLeave } from '../lib/router';
import { useLayoutStore } from '../store/layoutStore';
import { useResolvedSettings, useSettingsStore } from '../store/settingsStore';
import type { LineType } from '../types';
import { ALL_TEMPLATES } from '../templates';
import { parseProject, serializeProject } from '../lib/project';
import { downloadText, exportFileName } from '../lib/export';
import { useExport } from '../hooks/useExport';
import { openErExport, openErImport } from './er/erDialogs';
import { toast } from '../store/toastStore';
import { BufferedInput } from './BufferedInput';
import { nextTheme, type ThemePref } from '../lib/theme';
import { ServerControls } from './sync/ServerControls';
import { FileTabs } from './FileTabs';
import { FilesPopover } from './FilesPopover';
import { useFit } from '../hooks/useFit';
import { HomeLink } from './ui/HomeLink';
import { flushProject } from '../hooks/useProjectPersistence';
import { IconButton } from './ui/IconButton';
import { Kbd } from './ui/Kbd';
import { executeAction } from '../lib/actions';
import { ArrangeMenu } from './ArrangeMenu';
import { t } from '../i18n';

type MenuId = 'templates' | 'app' | 'file' | 'project' | 'line' | 'view' | 'zoom';
const LINE_STYLES: [LineType, string][] = [['straight', 'Straight'], ['orthogonal', 'Orthogonal'], ['curved', 'Curved'], ['step-rounded', 'Rounded orthogonal']];

/** reactive media query (false where matchMedia is missing, e.g. jsdom) */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const f = () => setOn(mq.matches);
    f();
    mq.addEventListener?.('change', f);
    return () => mq.removeEventListener?.('change', f);
  }, [query]);
  return on;
}

function Pop({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={`menu-pop ${className}`} role="menu" initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -4 }} transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}

export function Toolbar({ onBack }: { onBack?: () => void }) {
  const [menu, setMenu] = useState<MenuId | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const projRef = useRef<HTMLInputElement>(null);
  const settings = useResolvedSettings();
  const setLineStyle = useSettingsStore((st) => st.setLineStyle);
  const doExport = useExport();
  const flowOn = useDiagramStore((s) => !!s.pageFlow[s.activePageId]);
  const insertContent = useDiagramStore((s) => s.insertContent);
  const undo = useDiagramStore((s) => s.undo);
  const redo = useDiagramStore((s) => s.redo);
  const canUndo = useDiagramStore((s) => s.past.length > 0);
  const canRedo = useDiagramStore((s) => s.future.length > 0);
  const projectName = useDiagramStore((s) => s.projectName);
  const setProjectName = useDiagramStore((s) => s.setProjectName);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const inspectorOpen = useLayoutStore((s) => s.inspectorOpen);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const compact = useMedia('(max-width: 1199px)'); // View and Line style move into the "⋯" menu
  const tight = useMedia('(max-width: 1099px)'); // Auto layout joins View and Line style in the "⋯" menu
  const phone = useMedia('(max-width: 639px)'); // logo, file switcher, Share and "⋯" only
  const { zoomIn, zoomOut, zoomTo } = useReactFlow();
  const fit = useFit();
  const zoom = useStore((st) => st.transform[2]);
  const showGrid = useUiStore((st) => st.showGrid);
  const snap = useUiStore((st) => st.snap);
  const toggleGrid = useUiStore((st) => st.toggleGrid);
  const toggleSnap = useUiStore((st) => st.toggleSnap);
  const showMinimap = useUiStore((st) => st.showMinimap);
  const toggleMinimap = useUiStore((st) => st.toggleMinimap);
  const theme = (useSettingsStore((st) => st.global.theme) ?? 'system') as ThemePref;
  const patchSettings = useSettingsStore((st) => st.patch);
  const topbar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest('.menu')) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);
  const toggleInspector = useLayoutStore((s) => s.toggleInspector);

  const serverMode = useSession((s) => s.mode === 'server');
  const live = useCollabStore((s) => !!s.session);
  const dirty = useFileStore((s) => s.dirty);
  const fileName = useFileStore((s) => s.fileName);
  const sdd = useSddActions();
  const app = useAppActions();
  const startNewProject = async () => {
    setMenu(null);
    const ok = await Promise.resolve(requestLeave()); // unsaved .sdd changes: ask before leaving this project
    if (!ok) return;
    const r = await newProjectDialog(ALL_TEMPLATES.map((t) => ({ id: t.id, name: t.name })));
    if (!r) return;
    const tpl = r.templateId ? ALL_TEMPLATES.find((t) => t.id === r.templateId) : undefined;
    const { project } = createWsProject(localStorage, r.name, tpl ? { content: tpl.build(), pageName: tpl.name } : {});
    app.openProject(project.id);
  };
  const workspaceProject = useWorkspace((s) => s.project);
  const openTabs = useWorkspace((s) => s.tabs.open.length);
  const canEditTree = useWorkspace((s) => canEdit(s.role));
  const activeFile = useDiagramStore((s) => s.projectId);
  /** rename the open file: the explorer entry, the tab and the document name move together */
  const commitFileName = (name: string) => {
    const n = name.trim();
    if (!n) return;
    if (workspaceProject) renameItem({ kind: 'file', id: activeFile }, n);
    else setProjectName(n);
  };
  const renameProjectViaDialog = async () => {
    const name = await renameProjectDialog(useWorkspace.getState().project?.name ?? '');
    if (name !== null) renameCurrentProject(name);
  };
  const exportProject = () => {
    setMenu(null);
    const pid = useWorkspace.getState().projectId;
    if (!pid) return;
    try {
      flushProject();
      downloadBlob(exportProjectBytes(localStorage, pid), exportFileName(workspaceProject?.name ?? 'project', 'sdd'), 'application/vnd.sdd+zip');
      toast.success(t('Project exported as .sdd'));
    } catch (e) {
      toast.error(t('Export failed: {error}', { error: e instanceof Error ? e.message : String(e) }));
    }
  };
  const importProject = async (file: File) => {
    try {
      await sdd.openBytes(new Uint8Array(await file.arrayBuffer()), file.name); // sniffs: project container, file container or text
    } catch (e) {
      toast.error(e instanceof SddError ? t('Could not import {file}: {error}', { file: file.name, error: e.message }) : t('Import failed: {error}', { error: e instanceof Error ? e.message : String(e) }));
    }
  };
  const closeAnd = (fn: () => void) => () => { setMenu(null); fn(); };
  const toggle = (m: MenuId) => setMenu((cur) => (cur === m ? null : m));

  const exportJson = () => {
    downloadText(serializeProject(useDiagramStore.getState().toProject()), exportFileName(projectName, 'json'));
    toast.success(t('Project JSON exported'));
    setMenu(null);
  };
  const importJson = async (file: File) => {
    const r = parseProject(await file.text());
    if (!r.ok) return toast.error(t('Import failed: {error}', { error: r.error }));
    const res = importOpenedFile(r.project);
    toast.success(res.fileIds.length > 1 ? t('Imported {n} files', { n: res.fileIds.length }) : t('Imported as a new file'));
  };
  const runExport = async (kind: 'png' | 'svg', override?: { transparent: boolean; scale: 1 | 2 | 3 }) => {
    setMenu(null);
    try {
      await doExport(kind, override ?? { transparent: false, background: 'white', scale: settings.export.scale });
      toast.success(t('{kind} exported', { kind: kind.toUpperCase() }));
    } catch (e) {
      toast.error(t('Export failed: {error}', { error: e instanceof Error ? e.message : String(e) }));
    }
  };
  /** Export dialog: format / scale / transparent / pages (current or every page, one file each) */
  const openExportDialog = async () => {
    setMenu(null);
    const st = useDiagramStore.getState();
    const c = await exportDialog({ format: 'png', scale: settings.export.scale, transparent: false, background: 'white', pages: 'current' }, st.pages.length);
    if (!c) return;
    const original = st.activePageId;
    const ids = c.pages === 'all' ? st.pages.map((p) => p.id) : [original];
    try {
      for (const id of ids) {
        if (id !== useDiagramStore.getState().activePageId) {
          useDiagramStore.getState().switchPage(id);
          await new Promise((r) => setTimeout(r, 450)); // let the canvas render the page
        }
        await doExport(c.format, { transparent: c.transparent, background: c.background, scale: c.scale });
      }
      toast.success(ids.length === 1 ? t('Page exported as {format}', { format: c.format.toUpperCase() }) : t('{n} pages exported as {format}', { n: ids.length, format: c.format.toUpperCase() }));
    } catch (e) {
      toast.error(t('Export failed: {error}', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      if (useDiagramStore.getState().activePageId !== original) useDiagramStore.getState().switchPage(original);
    }
  };

  const fileEntries = (
    <>
      <button type="button" role="menuitem" onClick={() => void startNewProject()}>{t('New project…')}</button>
      {workspaceProject && canEditTree && <button type="button" role="menuitem" onClick={closeAnd(() => void newFileDialog(null))}>{t('New file…')}</button>}
      <button type="button" role="menuitem" onClick={closeAnd(() => void sdd.open())}>{t('Open .sdd…')} <Kbd>⌘O</Kbd></button>
      <button type="button" role="menuitem" onClick={closeAnd(() => void sdd.save())}>{t('Save')} <Kbd>⌘S</Kbd></button>
      <button type="button" role="menuitem" onClick={closeAnd(() => executeAction('export-text'))}>{t('Export as text (.sdd)')}</button>
      <button type="button" role="menuitem" onClick={closeAnd(() => executeAction('import-infra'))}>{t('Import infrastructure…')}</button>
      <button type="button" role="menuitem" onClick={closeAnd(() => void sdd.saveAs())}>{t('Save as…')} <Kbd>⇧⌘S</Kbd></button>
      <button type="button" role="menuitem" onClick={closeAnd(() => fileRef.current?.click())}>{t('Import JSON (legacy)')}</button>
      <button type="button" role="menuitem" onClick={closeAnd(() => projRef.current?.click())}>{t('Import project (.sdd)…')}</button>
      <button type="button" role="menuitem" onClick={closeAnd(() => void openErImport())}>{t('Import database schema…')}</button>
      <div className="menu-sep" role="separator" />
      <button type="button" role="menuitem" onClick={() => void openExportDialog()}>{t('Export image…')}</button>
      <button type="button" role="menuitem" onClick={() => void runExport('png')}>{t('Export page as PNG')}</button>
      <button type="button" role="menuitem" onClick={() => void runExport('svg')}>{t('Export page as SVG')}</button>
      <button type="button" role="menuitem" onClick={exportJson}>{t('Export project JSON')}</button>
      {workspaceProject && <button type="button" role="menuitem" onClick={exportProject}>{t('Export project (.sdd)')}</button>}
      <button type="button" role="menuitem" onClick={closeAnd(() => void openErExport())}>{t('Export database schema…')}</button>
      <div className="menu-sep" role="separator" />
      <button type="button" role="menuitem" aria-haspopup="menu" onClick={() => setMenu('templates')}><LayoutTemplate size={14} aria-hidden /> {t('Templates…')}</button>
    </>
  );
  const lineItems = LINE_STYLES.map(([k, label]) => (
    <button key={k} type="button" role="menuitemradio" aria-checked={settings.edge.lineType === k} onClick={() => { setLineStyle(k); setMenu(null); const o = lineStyleOverrides(useDiagramStore.getState().edges, k); if (o.total) toast.info(t(o.total === 1 ? '{n} edge uses a custom style. Settings > Edges > Apply to all edges changes every line.' : '{n} edges use a custom style. Settings > Edges > Apply to all edges changes every line.', { n: o.total })); }}>
      {settings.edge.lineType === k ? '✓ ' : ''}{t(label)}
    </button>
  ));
  const trail = useUiStore((st) => st.linkTrail);
  const layersOn = useUiStore((st) => st.layersOpen);
  const outlineOn = useUiStore((st) => st.outlineOpen);
  const rulersOn = useUiStore((st) => st.rulers);
  const devOn = useUiStore((st) => st.devMode);
  const codeOn = useSmart((st) => st.code);
  const viewItems = (
    <>
      <button type="button" role="menuitemcheckbox" aria-checked={showGrid} onClick={toggleGrid}>{showGrid ? '✓ ' : ''}{t('Grid')}</button>
      <button type="button" role="menuitemcheckbox" aria-checked={snap} onClick={toggleSnap}>{snap ? '✓ ' : ''}{t('Snap to grid')}</button>
      <button type="button" role="menuitemcheckbox" aria-checked={showMinimap} onClick={toggleMinimap}>{showMinimap ? '✓ ' : ''}{t('Minimap')}</button>
      <button type="button" role="menuitemcheckbox" aria-checked={flowOn} onClick={() => executeAction('toggle-flow')}>{flowOn ? '✓ ' : ''}{t('Data flow')} <Kbd>⇧F</Kbd></button>
      <button type="button" role="menuitemcheckbox" aria-checked={codeOn} onClick={() => executeAction('toggle-code')}>{codeOn ? '✓ ' : ''}{t('Text view (.sdd)')} <Kbd>⇧⌘E</Kbd></button>
      <button type="button" role="menuitemcheckbox" aria-checked={layersOn} onClick={() => executeAction('layers-toggle')}>{layersOn ? '✓ ' : ''}{t('Layers')}</button>
      <button type="button" role="menuitemcheckbox" aria-checked={outlineOn} onClick={() => executeAction('outline-toggle')}>{outlineOn ? '✓ ' : ''}{t('Outline (screen reader)')} <Kbd>⇧O</Kbd></button>
      <button type="button" role="menuitemcheckbox" aria-checked={rulersOn} onClick={() => executeAction('rulers-toggle')}>{rulersOn ? '✓ ' : ''}{t('Rulers and guides')} <Kbd>⇧R</Kbd></button>
      <button type="button" role="menuitemcheckbox" aria-checked={devOn} onClick={() => executeAction('dev-toggle')}>{devOn ? '✓ ' : ''}{t('Dev mode')} <Kbd>⇧D</Kbd></button>
      <button type="button" role="menuitem" onClick={() => { setMenu(null); executeAction('plugins-open'); }}>{t('Plugins…')}</button>
    </>
  );
  const zoomItems = (
    <>
      <button type="button" role="menuitem" onClick={() => zoomIn({ duration: 160 })}><Plus size={14} aria-hidden /> {t('Zoom in')} <Kbd>⌘+</Kbd></button>
      <button type="button" role="menuitem" onClick={() => zoomOut({ duration: 160 })}><Minus size={14} aria-hidden /> {t('Zoom out')} <Kbd>⌘-</Kbd></button>
      <button type="button" role="menuitem" onClick={() => fit(240)}><Maximize2 size={14} aria-hidden /> {t('Fit view')} <Kbd>⇧1</Kbd></button>
      <button type="button" role="menuitem" onClick={() => zoomTo(1, { duration: 160 })}>{t('Reset zoom to 100%')} <Kbd>⌘0</Kbd></button>
    </>
  );
  const undoRedo = (
    <>
      <IconButton label={t('Undo')} shortcut="⌘Z" onClick={undo} disabled={!canUndo}><Undo2 size={16} aria-hidden /></IconButton>
      <IconButton label={t('Redo')} shortcut="⇧⌘Z" onClick={redo} disabled={!canRedo}><Redo2 size={16} aria-hidden /></IconButton>
    </>
  );
  const projectCaret = (
    <div className="menu">
      <button type="button" className="crumb-caret" aria-label={t('Project menu')} aria-haspopup="menu" aria-expanded={menu === 'project'} onClick={() => toggle('project')}>
        <ChevronDown size={14} aria-hidden />
      </button>
      <AnimatePresence>
        {menu === 'project' && (
          <Pop>
            {workspaceProject && canEditTree && <button type="button" role="menuitem" onClick={() => { setMenu(null); void renameProjectViaDialog(); }}>{t('Rename project')}</button>}
            {workspaceProject && canEditTree && <button type="button" role="menuitem" onClick={() => { setMenu(null); void newFileDialog(null); }}>{t('New file…')}</button>}
            <button type="button" role="menuitem" onClick={() => void startNewProject()}>{t('New project…')}</button>
            {onBack && <button type="button" role="menuitem" onClick={() => { setMenu(null); onBack(); }}>{t('All projects')}</button>}
          </Pop>
        )}
      </AnimatePresence>
    </div>
  );
  const bar = (m: MenuId) => (menu === m ? 'is-open' : '');

  return (
    <header className="topbar glass" ref={topbar} data-testid="topbar">
      <nav className="crumbs" aria-label={t('Breadcrumb')}>
        <HomeLink size={22} beforeNavigate={flushProject} />
        {trail.length > 0 && (
          <button type="button" className="crumb-home link-back" aria-label={t('Back to where the link started')} title={t('Back (link breadcrumb)')} onClick={() => executeAction('link-back')}>
            <ArrowLeft size={13} aria-hidden /> <span>{t('Back')}</span>
          </button>
        )}
        {onBack && !phone && (
          <button type="button" className="crumb-home" aria-label={t('Back to projects')} title={t('Back to projects')} onClick={onBack}>
            <ArrowLeft size={13} aria-hidden /> <span>{t('Projects')}</span>
          </button>
        )}
        {!phone && <span className="crumb-sep" aria-hidden>/</span>}
        {workspaceProject && !phone && (
          <BufferedInput value={workspaceProject.name} onCommit={renameCurrentProject} className="project-name workspace-name" aria-label={t('Project name')} disabled={!canEditTree} />
        )}
        {workspaceProject && !phone && projectCaret}
        {(!workspaceProject || openTabs < 2) && !phone && (
          <>
            {workspaceProject && <span className="crumb-sep ws-sep" aria-hidden>/</span>}
            <BufferedInput value={projectName} onCommit={commitFileName} className="project-name file-name" aria-label={t('File name')} />
          </>
        )}
        {!workspaceProject && !phone && projectCaret}
        {workspaceProject && <FilesPopover />}
        {workspaceProject && phone && <span className="phone-file" title={projectName}>{projectName}</span>}
      </nav>
      {dirty && !live && <span className="dirty-dot" role="status" aria-label={t('Unsaved changes')} title={fileName ? t('Unsaved changes since {file}', { file: fileName }) : t('Unsaved changes')} />}
      {workspaceProject && !phone && openTabs >= 2 && (
        <div className="topbar-files">
          <FileTabs />
        </div>
      )}
      <span className="spacer" />
      {!phone && (
        <>
          {undoRedo}
          <div className="menu">
            <button type="button" className="btn btn-ghost zoom-btn" aria-label={t('Zoom {n}%', { n: Math.round(zoom * 100) })} title={t('Zoom')} aria-haspopup="menu" aria-expanded={menu === 'zoom'} onClick={() => toggle('zoom')}>
              <span className="zoom-pct-text">{Math.round(zoom * 100)}%</span> <ChevronDown size={12} aria-hidden />
            </button>
            <AnimatePresence>{menu === 'zoom' && <Pop className="right">{zoomItems}</Pop>}</AnimatePresence>
          </div>
        </>
      )}
      {!phone && !compact && (
        <>
          <div className="menu">
            <button type="button" className="btn btn-ghost" aria-label={t('View')} title={t('View: grid, snap, data flow')} aria-haspopup="menu" aria-expanded={menu === 'view'} onClick={() => toggle('view')}>
              <Grid3x3 size={15} aria-hidden /> <span className="btn-label">{t('View')}</span> <ChevronDown size={12} aria-hidden />
            </button>
            <AnimatePresence>{menu === 'view' && <Pop className="right">{viewItems}</Pop>}</AnimatePresence>
          </div>
          {!tight && <ArrangeMenu />}
          <div className="menu">
            <button type="button" className="btn btn-icon btn-ghost" aria-label={t('Line style')} aria-haspopup="menu" aria-expanded={menu === 'line'} onClick={() => toggle('line')} title={t('Line style: {style}', { style: t(LINE_STYLES.find(([k]) => k === settings.edge.lineType)?.[1] ?? '') })}>
              <Spline size={16} aria-hidden />
            </button>
            <AnimatePresence>{menu === 'line' && <Pop className="right">{lineItems}</Pop>}</AnimatePresence>
          </div>
        </>
      )}
      {!phone && (
        <div className="menu">
          <button type="button" className={`btn btn-ghost ${bar('file')}`} onClick={() => toggle('file')} aria-haspopup="menu" aria-expanded={menu === 'file' || menu === 'templates'}>
            <FileIcon size={15} aria-hidden /> <span className="btn-label">{t('File')}</span> <ChevronDown size={12} aria-hidden />
          </button>
          <AnimatePresence>
            {menu === 'file' && <Pop className="right">{fileEntries}</Pop>}
            {menu === 'templates' && (
              <Pop className="right templates-pop">
                <button type="button" role="menuitem" onClick={() => setMenu('file')}>{t('← Back to File')}</button>
                <div className="menu-sep" role="separator" />
                <div className="menu-label">{t('Insert into this file')}</div>
                {ALL_TEMPLATES.map((tp) => (
                  <button key={`ins-${tp.id}`} type="button" role="menuitem" onClick={() => { insertContent(tp.build(), { select: false }); setMenu(null); toast.success(t('Inserted “{name}” into this file', { name: t(tp.name) })); }}>{t('Insert: {name}', { name: t(tp.name) })}</button>
                ))}
                {workspaceProject && canEditTree && (
                  <>
                    <div className="menu-sep" role="separator" />
                    <div className="menu-label">{t('Open as new file')}</div>
                    {ALL_TEMPLATES.map((tp) => (
                      <button key={`new-${tp.id}`} type="button" role="menuitem" onClick={() => { setMenu(null); createFileIn(null, tp.name, { content: tp.build() }); toast.success(t('Created file “{name}”', { name: tp.name })); }}>{t('New file: {name}', { name: t(tp.name) })}</button>
                    ))}
                  </>
                )}
              </Pop>
            )}
          </AnimatePresence>
        </div>
      )}
      <input ref={fileRef} type="file" accept="application/json,.json" hidden data-testid="import-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ''; }} />
      <input ref={projRef} type="file" accept={OPEN_ACCEPT} hidden data-testid="import-project-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importProject(f); e.target.value = ''; }} />
      {serverMode && <span className="vsep" />}
      <ServerControls phone={phone} />
      <div className="menu">
        <IconButton label={t('More')} aria-haspopup="menu" aria-expanded={menu === 'app'} onClick={() => toggle('app')}><Ellipsis size={16} aria-hidden /></IconButton>
        <AnimatePresence>
          {menu === 'app' && (
            <Pop className="right more-pop">
              {phone && (
                <>
                  <button type="button" role="menuitem" disabled={!canUndo} onClick={undo}>{t('Undo')} <Kbd>⌘Z</Kbd></button>
                  <button type="button" role="menuitem" disabled={!canRedo} onClick={redo}>{t('Redo')} <Kbd>⇧⌘Z</Kbd></button>
                  {zoomItems}
                  <div className="menu-sep" role="separator" />
                </>
              )}
              {(phone || compact) && (
                <>
                  {(phone || tight) && <button type="button" role="menuitem" onClick={() => { setMenu(null); executeAction('auto-arrange', { fitView: () => fit(300) }); }}><LayoutDashboard size={14} aria-hidden /> {t('Auto layout')} <Kbd>⇧L</Kbd></button>}
                  {viewItems}
                  <div className="menu-sep" role="separator" />
                  <div className="menu-label">{t('Line style')}</div>
                  {lineItems}
                  <div className="menu-sep" role="separator" />
                </>
              )}
              {phone && (
                <>
                  {fileEntries}
                  <div className="menu-sep" role="separator" />
                </>
              )}
              <button type="button" role="menuitemcheckbox" aria-checked={sidebarOpen} onClick={toggleSidebar}><PanelLeft size={14} aria-hidden /> {sidebarOpen ? '✓ ' : ''}{t('Palette')} <Kbd>⌘\</Kbd></button>
              <button type="button" role="menuitemcheckbox" aria-checked={inspectorOpen} onClick={toggleInspector}><PanelRight size={14} aria-hidden /> {inspectorOpen ? '✓ ' : ''}{t('Inspector')} <Kbd>⌘.</Kbd></button>
              <button type="button" role="menuitem" onClick={() => patchSettings({ theme: nextTheme(theme) })}>{t('Theme: {theme}', { theme: t(theme) })}</button>
              <button type="button" role="menuitem" onClick={() => { setSettingsOpen(true); setMenu(null); }}><SettingsIcon size={14} aria-hidden /> {t('Settings')}</button>
              {onBack && <button type="button" role="menuitem" onClick={onBack}>{t('All projects')}</button>}
              {workspaceProject && (
                <button type="button" role="menuitem" onClick={closeAnd(() => useWorkspace.getState().setQuickOpen(true))}><FolderTree size={14} aria-hidden /> {t('Go to file…')} <Kbd>⌘P</Kbd></button>
              )}
            </Pop>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
