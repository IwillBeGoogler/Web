import { useReactFlow, useStore } from '@xyflow/react';
import { useFit } from '../hooks/useFit';
import { useUiStore } from '../store/uiStore';
import { t } from '../i18n';

export function ZoomBar() {
  const { zoomIn, zoomOut, zoomTo } = useReactFlow();
  const fit = useFit();
  const zoom = useStore((s) => s.transform[2]);
  const showGrid = useUiStore((s) => s.showGrid);
  const snap = useUiStore((s) => s.snap);
  const toggleGrid = useUiStore((s) => s.toggleGrid);
  const showMinimap = useUiStore((s) => s.showMinimap);
  const toggleMinimap = useUiStore((s) => s.toggleMinimap);
  const toggleSnap = useUiStore((s) => s.toggleSnap);
  return (
    <div className="zoom-bar" role="group" aria-label={t('View')}>
      <button type="button" aria-label={t('Zoom out')} title={`${t('Zoom out')} (⌘-)`} onClick={() => zoomOut({ duration: 120 })}>−</button>
      <button type="button" className="zoom-pct" aria-label={t('Reset zoom')} title={`${t('Reset zoom')} (⌘0)`} onClick={() => zoomTo(1, { duration: 120 })}>{Math.round(zoom * 100)}%</button>
      <button type="button" aria-label={t('Zoom in')} title={`${t('Zoom in')} (⌘+)`} onClick={() => zoomIn({ duration: 120 })}>+</button>
      <button type="button" aria-label={t('Fit view')} title={`${t('Fit view')} (⇧1)`} onClick={() => fit(200)}>⤢</button>
      <span className="sep" />
      <button type="button" className={showGrid ? 'active' : ''} aria-pressed={showGrid} title={t('Toggle grid')} onClick={toggleGrid}>{t('Grid')}</button>
      <button type="button" className={snap ? 'active' : ''} aria-pressed={snap} title={t('Toggle snap to grid')} onClick={toggleSnap}>{t('Snap')}</button>
      <button type="button" className={showMinimap ? 'active' : ''} aria-pressed={showMinimap} title={t('Toggle minimap')} onClick={toggleMinimap}>{t('Map')}</button>
    </div>
  );
}
