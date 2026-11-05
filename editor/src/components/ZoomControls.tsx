import { useFit } from '../hooks/useFit';
import { Grid3x3, Magnet, Maximize2, Minus, Plus } from 'lucide-react';
import { useReactFlow, useStore } from '@xyflow/react';
import { useUiStore } from '../store/uiStore';
import { IconButton } from './ui/IconButton';
import { t } from '../i18n';

/** Zoom % + grid/snap toggles for the top bar. */
export function ZoomControls() {
  const { zoomIn, zoomOut, zoomTo } = useReactFlow();
  const fit = useFit();
  const zoom = useStore((s) => s.transform[2]);
  const showGrid = useUiStore((s) => s.showGrid);
  const snap = useUiStore((s) => s.snap);
  const toggleGrid = useUiStore((s) => s.toggleGrid);
  const toggleSnap = useUiStore((s) => s.toggleSnap);
  return (
    <div className="zoom-ctl" role="group" aria-label={t('View')}>
      <IconButton label={t('Zoom out')} shortcut="⌘-" onClick={() => zoomOut({ duration: 160 })}><Minus size={15} aria-hidden /></IconButton>
      <button type="button" className="zoom-pct" aria-label={t('Reset zoom')} title={`${t('Reset zoom')} (⌘0)`} onClick={() => zoomTo(1, { duration: 160 })}>{Math.round(zoom * 100)}%</button>
      <IconButton label={t('Zoom in')} shortcut="⌘+" onClick={() => zoomIn({ duration: 160 })}><Plus size={15} aria-hidden /></IconButton>
      <IconButton label={t('Fit view')} shortcut="⇧1" onClick={() => fit(240)}><Maximize2 size={14} aria-hidden /></IconButton>
      <IconButton label={t('Toggle grid')} active={showGrid} onClick={toggleGrid}><Grid3x3 size={15} aria-hidden /></IconButton>
      <IconButton label={t('Toggle snap to grid')} active={snap} onClick={toggleSnap}><Magnet size={15} aria-hidden /></IconButton>
    </div>
  );
}
