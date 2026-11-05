import { ChevronLeft, ChevronRight, Pause, Play, Star, X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { canEdit } from '../../lib/roles';
import { formatRelative } from '../../lib/home';
import { authorLabel, groupByDay } from '../../lib/versionTimeline';
import { useDiagramStore } from '../../store/diagramStore';
import { restoreShownVersion } from '../../versions/timelineActions';
import { closeTimeline, pause, select, step, togglePlay, useTimeline } from '../../versions/timelineStore';
import { localeTag, t } from '../../i18n';

const dayText = (d: Date): string => d.toLocaleDateString(localeTag(), { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * Timeline bar at the bottom of the canvas: one point per version (named versions are larger stars), ← → move between them,
 * the canvas shows the selected version read-only with its changes against the version before it. "Live" is the end of the line.
 */
export function VersionTimeline() {
  const s = useTimeline();
  const activePage = useDiagramStore((st) => st.activePageId);
  const fileId = useDiagramStore((st) => st.projectId);
  const trackRef = useRef<HTMLDivElement>(null);
  const open = s.open;
  const mounted = useRef<{ fileId: string; page: string } | null>(null);

  // another file / page than the one the versions belong to: close (the preview is drawn on one page)
  useEffect(() => {
    if (!open) { mounted.current = null; return; }
    if (!mounted.current) { mounted.current = { fileId, page: activePage }; return; }
    if (mounted.current.fileId !== fileId || mounted.current.page !== activePage) closeTimeline();
  }, [open, fileId, activePage]);
  // Esc leaves (and with it the preview); a text field keeps its own Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      closeTimeline();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  // keep the selected point in view in a long history
  useEffect(() => {
    const el = trackRef.current?.querySelector<HTMLElement>('[data-sel="true"]');
    el?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [s.selected, s.items.length]);
  useEffect(() => () => pause(), []);
  if (!open) return null;

  const count = s.items.length;
  const meta = s.selected === null ? null : s.items[s.selected];
  const groups = groupByDay(s.items);
  const author = (id: string) => authorLabel(id, s.authors) ?? t('Unknown author');
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      pause();
      void step(e.key === 'ArrowLeft' ? -1 : 1).then(() => trackRef.current?.querySelector<HTMLElement>('[data-sel="true"]')?.focus());
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      pause();
      void select(e.key === 'Home' ? 0 : null).then(() => trackRef.current?.querySelector<HTMLElement>('[data-sel="true"]')?.focus());
    }
  };
  const pointLabel = (i: number): string => {
    const v = s.items[i];
    const bits = [t('Version {n}', { n: v.version }), v.named ? t('named version') : '', v.label ?? '', t('by {who}', { who: author(v.createdBy) }), formatRelative(v.createdAt), s.summaries[v.version] ?? ''];
    return bits.filter(Boolean).join(', ');
  };
  const canRestore = canEdit(s.role);

  return (
    <section className="version-timeline glass" aria-label={t('Version timeline')} data-testid="version-timeline">
      <div className="vt-head">
        <div className="vt-info" aria-live="polite">
          {s.loading && <span className="muted">{t('Loading history…')}</span>}
          {!s.loading && count === 0 && !s.error && <span className="muted">{t('No earlier versions yet.')}</span>}
          {!s.loading && count > 0 && !meta && <span className="muted">{t('Showing the live document. Pick a version to look at it.')}</span>}
          {meta && (
            <>
              <strong>{t('Version {n}', { n: meta.version })}{meta.label ? ` · ${meta.label}` : ''}</strong>
              {meta.named && <span className="vt-named-tag"><Star size={11} aria-hidden /> {t('named')}</span>}
              {meta.version === s.currentVersion && <span className="badge-inline">{t('current')}</span>}
              <span className="muted" data-testid="vt-meta">{t('by {who}', { who: author(meta.createdBy) })} · <time dateTime={new Date(meta.createdAt).toISOString()} title={new Date(meta.createdAt).toLocaleString(localeTag())}>{formatRelative(meta.createdAt)}</time></span>
              <span data-testid="vt-summary">{s.previewLoading ? t('Loading…') : s.note ? t(s.note.summary) : ''}</span>
              <span className="diff-legend vt-legend" aria-label={t('Legend')}>
                <i className="diff-dot added" aria-hidden /> + {t('added')} <i className="diff-dot changed" aria-hidden /> ~ {t('changed')} <i className="diff-dot removed" aria-hidden /> − {t('removed')}
              </span>
            </>
          )}
          {s.error && <span className="error" role="alert">{s.error}</span>}
        </div>
        <div className="vt-actions">
          <button type="button" className="btn btn-ghost btn-icon" aria-label={t('Previous version')} disabled={count === 0 || s.selected === 0} onClick={() => { pause(); void step(-1); }}><ChevronLeft size={16} aria-hidden /></button>
          <button type="button" className="btn btn-ghost btn-icon" aria-label={s.playing ? t('Pause') : t('Play')} aria-pressed={s.playing} disabled={count === 0} onClick={() => void togglePlay()}>{s.playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}</button>
          <button type="button" className="btn btn-ghost btn-icon" aria-label={t('Next version')} disabled={count === 0 || s.selected === null} onClick={() => { pause(); void step(1); }}><ChevronRight size={16} aria-hidden /></button>
          {meta && canRestore && meta.version !== s.currentVersion && (
            <button type="button" className="btn btn-primary" disabled={s.preview === null || s.previewLoading} onClick={() => void restoreShownVersion()}>{t('Restore this version')}</button>
          )}
          {meta && !canRestore && <span className="muted" data-testid="vt-viewonly">{t('View only: cannot restore')}</span>}
          <button type="button" className="btn btn-ghost btn-icon" aria-label={t('Close timeline')} onClick={closeTimeline}><X size={16} aria-hidden /></button>
        </div>
      </div>
      {meta && s.note && s.note.details.length > 0 && !s.previewLoading && (
        <ul className="vt-details" aria-label={t('Changes in this version')}>
          {s.note.details.slice(0, 8).map((d, i) => <li key={i}>{d}</li>)}
          {s.note.details.length > 8 && <li className="muted">{t('and {n} more', { n: s.note.details.length - 8 })}</li>}
        </ul>
      )}
      <div className="vt-track" ref={trackRef} role="group" aria-label={t('Versions')} onKeyDown={onKeyDown}>
        {groups.map((g) => (
          <div className="vt-group" key={g.key}>
            <span className="vt-day">{dayText(g.label)} · {g.count}</span>
            <div className="vt-points">
              {s.items.slice(g.from, g.from + g.count).map((v, k) => {
                const i = g.from + k;
                const sel = s.selected === i;
                return (
                  <button
                    key={v.version}
                    type="button"
                    className={`vt-point${v.named ? ' named' : ''}${sel ? ' selected' : ''}${v.version === s.currentVersion ? ' current' : ''}`}
                    data-sel={sel}
                    data-testid={`vt-point-${v.version}`}
                    aria-label={pointLabel(i)}
                    aria-pressed={sel}
                    title={pointLabel(i)}
                    tabIndex={sel || (s.selected === null && i === count - 1) ? 0 : -1}
                    onClick={() => { pause(); void select(i); }}
                  >
                    {v.named ? <Star size={13} aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {count > 0 && (
          <button type="button" className={`vt-live${s.selected === null ? ' selected' : ''}`} data-sel={s.selected === null} aria-pressed={s.selected === null} onClick={() => { pause(); void select(null); }}>{t('Live')}</button>
        )}
      </div>
    </section>
  );
}
