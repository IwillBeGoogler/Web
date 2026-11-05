import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, ArrowRight, LayoutDashboard, Wand2 } from 'lucide-react';
import { useDiagramStore } from '../store/diagramStore';
import { useEditorSession } from '../sync/status';
import { IconButton } from './ui/IconButton';
import { Kbd } from './ui/Kbd';
import { useFit } from '../hooks/useFit';
import { executeAction } from '../lib/actions';
import { detectAlgo, naturalDirection, type ArrangeAlgo, type ArrangeDirection, type ArrangeSpacing } from '../lib/autoarrange/engine';
import { loadPrefs, savePrefs, type ArrangePrefs } from '../lib/autoarrange/prefs';
import { describeScope } from '../lib/autoarrange/apply';
import { t } from '../i18n';

const ALGOS: { id: ArrangeAlgo; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Picks the best fit for this diagram' },
  { id: 'layered', label: 'Layered', hint: 'Flows and system design: edges point one way' },
  { id: 'erd', label: 'ERD', hint: 'Tables by foreign key, fewest crossings' },
  { id: 'uml', label: 'UML / OOD', hint: 'Inheritance top-down, associations beside' },
  { id: 'tree', label: 'Tree', hint: 'Parents centred over their children' },
  { id: 'grid', label: 'Grid', hint: 'Compact rows, ignores edges' },
];
const SPACINGS: ArrangeSpacing[] = ['compact', 'normal', 'roomy'];

/** Toolbar button + options popover for Auto layout. Options are remembered per file. */
export function ArrangeMenu() {
  const [open, setOpen] = useState(false);
  const projectId = useDiagramStore((s) => s.projectId);
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const readOnly = useEditorSession((s) => s.readOnly);
  const fit = useFit();
  const [prefs, setPrefs] = useState<ArrangePrefs>(() => loadPrefs(projectId));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setPrefs(loadPrefs(projectId)), [projectId]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key); };
  }, [open]);

  const update = (p: Partial<ArrangePrefs>) => { const next = { ...prefs, ...p }; setPrefs(next); savePrefs(projectId, next); };
  const detected = useMemo(() => detectAlgo(nodes, edges), [nodes, edges]);
  const kind = prefs.algo === 'auto' ? detected : prefs.algo;
  const dir: ArrangeDirection = prefs.direction ?? naturalDirection(kind);
  const scope = describeScope();
  const picked = nodes.filter((n) => n.selected).length;
  const scopeLabel = scope === 'group' ? t('Arrange inside group') : scope === 'selection' ? t('Arrange {n} selected', { n: picked }) : t('Arrange page');
  const run = () => { executeAction('auto-arrange', { fitView: () => fit(300) }); setOpen(false); };

  return (
    <div className="menu arrange-menu" ref={box}>
      <IconButton label={t('Auto layout')} shortcut="⇧L" active={open} aria-haspopup="dialog" aria-expanded={open} disabled={readOnly} onClick={() => setOpen((o) => !o)}>
        <LayoutDashboard size={16} aria-hidden />
      </IconButton>
      <AnimatePresence>
        {open && (
          <motion.div className="menu-pop right arrange-pop" role="dialog" aria-label={t('Auto layout options')} initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -4 }} transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}>
            <div className="arr-title"><Wand2 size={14} aria-hidden /> {t('Auto layout')}</div>
            <div className="arr-label" id="arr-algo">{t('Layout')}</div>
            <div className="arr-algos" role="radiogroup" aria-labelledby="arr-algo">
              {ALGOS.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={prefs.algo === a.id} className={`arr-algo${prefs.algo === a.id ? ' on' : ''}`} onClick={() => update({ algo: a.id })}>
                  <span className="arr-algo-name">{t(a.label)}{a.id === 'auto' && <span className="arr-detected"> · {t(ALGOS.find((x) => x.id === detected)?.label ?? 'Grid')}</span>}</span>
                  <span className="arr-algo-hint">{t(a.hint)}</span>
                </button>
              ))}
            </div>
            <div className="arr-row">
              <div>
                <div className="arr-label" id="arr-dir">{t('Direction')}</div>
                <div className="arr-seg" role="radiogroup" aria-labelledby="arr-dir">
                  <button type="button" role="radio" aria-checked={dir === 'TB'} className={dir === 'TB' ? 'on' : ''} onClick={() => update({ direction: 'TB' })}><ArrowDown size={13} aria-hidden /> {t('Top-down')}</button>
                  <button type="button" role="radio" aria-checked={dir === 'LR'} className={dir === 'LR' ? 'on' : ''} onClick={() => update({ direction: 'LR' })}><ArrowRight size={13} aria-hidden /> {t('Left-right')}</button>
                </div>
              </div>
            </div>
            <div className="arr-label" id="arr-space">{t('Spacing')}</div>
            <div className="arr-seg" role="radiogroup" aria-labelledby="arr-space">
              {SPACINGS.map((s) => <button key={s} type="button" role="radio" aria-checked={prefs.spacing === s} className={prefs.spacing === s ? 'on' : ''} onClick={() => update({ spacing: s })}>{t(s[0].toUpperCase() + s.slice(1))}</button>)}
            </div>
            <button type="button" className="btn btn-primary arr-run" onClick={run}>{scopeLabel} <Kbd>⇧L</Kbd></button>
            <div className="arr-note">{t('Locked items stay put. One undo step.')}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
