import { useEffect, type CSSProperties } from 'react';
import '../styles/design.css';
import '../styles/smart.css';
import { SplitView } from './smart/SplitView';
import { ProblemsPanel } from './smart/ProblemsPanel';
import { ReviewPanel } from './smart/ReviewPanel';
import { CapacityPanel } from './smart/CapacityPanel';
import { DriftPanel } from './smart/DriftPanel';
import { useSmart } from '../store/smartStore';
import { DialogHost } from './ui/DialogHost';
import { requestLeave, setLeaveGuard } from '../lib/router';
import { leaveDialog } from '../lib/dialogActions';
import { useFileStore } from '../store/fileStore';
import { useSddActions } from '../hooks/useSdd';
import { ReactFlowProvider } from '@xyflow/react';
import { MotionConfig } from 'motion/react';
import { ToolPalette } from './ToolPalette';
import { BoardLayer } from './board/BoardPopovers';
import { Presentation } from './board/Presentation';
import { FloatingPanel } from './FloatingPanel';
import { ToastLayer } from './ui/ToastLayer';
import { useLayoutStore } from '../store/layoutStore';
import { LeftRail } from './LeftRail';
import { PaletteRail } from './PaletteRail';
import { LayersPanel } from './design/LayersPanel';
import { OutlinePanel } from './a11y/OutlinePanel';
import { ConnectHint } from './ConnectHint';
import { PluginPanel } from './design/PluginPanel';
import { CommentsPanel } from './collab/CommentsPanel';
import { QuickSwitcher } from './QuickSwitcher';
import { useWorkspaceShortcuts } from '../hooks/useWorkspaceShortcuts';
import { useCrossLinkJump } from '../lib/crosslink/jump';
import { VersionTimeline } from './versions/VersionTimeline';
import { usePreviewing } from '../versions/timelineStore';
import { Canvas } from './Canvas';
import { PropertiesPanel } from './PropertiesPanel';
import { Toolbar } from './Toolbar';
import { ContextMenu } from './ContextMenu';
import { IconPicker } from './IconPicker';
import { SettingsModal } from './SettingsModal';
import { TooltipLayer } from './Tooltip';
import { ClusterWizard } from './ClusterWizard';
import { EmptyCanvas } from './EmptyCanvas';
import { CommandPalette } from './CommandPalette';
import { flushProject, useProjectAutosave } from '../hooks/useProjectPersistence';
import { useDiagramStore } from '../store/diagramStore';
import { inspectorShouldOpen } from '../lib/board/mindmapOps';
import { useDirtyTracking } from '../hooks/useSdd';
import { useShortcuts } from '../hooks/useShortcuts';
import { useContextMenuGuard } from '../hooks/useContextMenuGuard';
import { useResolvedSettings } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { useDesignPass } from '../hooks/useDesignPass';
import { useProjectLibrary } from '../hooks/useProjectLibrary';
import { useProjectSync, type SyncSource } from '../sync/useProjectSync';
import { useEditorSession } from '../sync/status';
import { t } from '../i18n';

function Shortcuts() {
  useCrossLinkJump();
  useShortcuts();
  useContextMenuGuard();
  return null;
}

/** Keep UI toggles in sync with the resolved canvas defaults. */
function SettingsSync() {
  const s = useResolvedSettings();
  const setGridSnap = useUiStore((st) => st.setGridSnap);
  useEffect(() => setGridSnap(s.canvas.grid, s.canvas.snap), [s.canvas.grid, s.canvas.snap, setGridSnap]);
  return null;
}

/** Unsaved .sdd changes: ask before leaving the editor (Save / Leave without saving / Stay); the browser asks on tab close. */
function useLeaveGuard() {
  const { save } = useSddActions();
  useEffect(() => {
    const unguard = setLeaveGuard({
      needed: () => { const f = useFileStore.getState(); return f.dirty && f.fileName !== null; },
      ask: async () => {
        const c = await leaveDialog();
        if (c === null) return false;
        if (c === 'save') return (await save()) === 'saved';
        return true;
      },
    });
    const onUnload = (e: BeforeUnloadEvent) => {
      const f = useFileStore.getState();
      if (!f.dirty || f.fileName === null) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      unguard();
      window.removeEventListener('beforeunload', onUnload);
    };
  });
}

/**
 * The editor for ONE file. `fileId` is the file (the document in the editor store); `projectId` is the workspace project it
 * belongs to (absent for shared links: no explorer / file tabs there). The file is loaded into the store by the caller first.
 */
export function Editor({ fileId, projectId, onBack, sync }: { fileId: string; projectId?: string; onBack?: () => void; sync?: SyncSource }) {
  const found = useDiagramStore((s) => s.projectId === fileId);
  useProjectAutosave();
  useDirtyTracking(fileId);
  useLeaveGuard();
  useProjectSync(fileId, sync, projectId);
  const ro = useEditorSession((st) => st.readOnly);
  useProjectLibrary(projectId, ro);
  useDesignPass(!ro);
  useWorkspaceShortcuts();
  const readOnly = useEditorSession((s) => s.readOnly);
  const previewing = usePreviewing(); // a past version is on the canvas: no editing shortcuts or menus meanwhile
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const hasSelection = useDiagramStore((s) => inspectorShouldOpen(s.nodes, s.edges)); // a mind map selection alone keeps the inspector closed
  const inspectorOpen = hasSelection; // empty panels are never shown: it slides in on select, out on deselect (even when pinned)
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const codeOpen = useSmart((s) => s.code);
  const codeWidth = useSmart((s) => s.codeWidth);
  const setCodeWidth = useSmart((s) => s.setCodeWidth);
  const hydrateLayout = useLayoutStore((s) => s.hydrate);
  useEffect(() => hydrateLayout(), [hydrateLayout]);
  if (!found) {
    return (
      <div className="empty-state">
        <p>{t('File not found.')}</p>
        {onBack && <button type="button" onClick={onBack}>{t('Back to projects')}</button>}
      </div>
    );
  }
  return (
    <MotionConfig reducedMotion="user">
      <ReactFlowProvider>
        <div className={`app${readOnly ? ' readonly' : ''}${previewing ? ' previewing' : ''}${codeOpen ? ' split-open' : ''}`} style={{ ...(codeOpen ? { '--split-w': `${codeWidth}px` } : {}), '--inset-l': `${codeOpen ? codeWidth + 24 : sidebarOpen ? sidebarWidth + 24 : 72}px`, '--inset-r': `${inspectorOpen ? 312 : 12}px` } as CSSProperties}>
          {readOnly && <div className="readonly-banner" role="status">{t('View only: you can look around but not edit this project.')}</div>}
          <div className="canvas-wrap">
            <Canvas />
            <EmptyCanvas />
          </div>
          <Toolbar onBack={() => { const go = () => { flushProject(); onBack?.(); }; const r = requestLeave(); if (r === true) go(); else void r.then((ok) => ok && go()); }} />
          {!sidebarOpen && <PaletteRail />}
          <FloatingPanel side="left" open={codeOpen} width={codeWidth} onResize={setCodeWidth} className="split-panel">
            <SplitView />
          </FloatingPanel>
          <FloatingPanel side="left" open={sidebarOpen && !codeOpen} width={sidebarWidth} onResize={setSidebarWidth}>
            <LeftRail />
          </FloatingPanel>
          <FloatingPanel side="right" open={inspectorOpen} width={288}>
            <PropertiesPanel />
          </FloatingPanel>
          <LayersPanel />
          <OutlinePanel />
          <ConnectHint />
          <ProblemsPanel />
          <ReviewPanel />
          <CapacityPanel />
          <DriftPanel />
          <PluginPanel />
          <CommentsPanel />
          <ToolPalette />
          <BoardLayer />
          <Presentation />
          {!readOnly && !previewing && <ContextMenu />}
          <IconPicker />
          <SettingsModal />
          <ClusterWizard />
          <CommandPalette />
          {projectId && <QuickSwitcher />}
          {!readOnly && !previewing && <Shortcuts />}
          <VersionTimeline />
          <SettingsSync />
          <TooltipLayer />
          <ToastLayer />
          <DialogHost />
        </div>
      </ReactFlowProvider>
    </MotionConfig>
  );
}
