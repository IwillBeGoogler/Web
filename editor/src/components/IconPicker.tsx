import { useMemo, useState } from 'react';
import { ALL_ITEMS, scoreItem } from '../data/catalog';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { IconGlyph } from './IconGlyph';
import { Modal } from './ui/Modal';
import { allowedIconMimes, storeImage } from '../lib/sdd/assets';
import { toast } from '../store/toastStore';
import { t } from '../i18n';

/** Modal palette picker for "Change icon…". */
export function IconPicker() {
  const target = useUiStore((s) => s.iconPickerFor);
  const close = useUiStore((s) => s.setIconPicker);
  const update = useDiagramStore((s) => s.updateNodeData);
  // a group shows its logo in the title row (groupIcon); every other node draws iconId
  const isGroup = useDiagramStore((s) => s.nodes.find((n) => n.id === target)?.type === 'group');
  const setIcon = (id: string, iconId: string | undefined) => update(id, isGroup ? { groupIcon: iconId } : { iconId });
  const [q, setQ] = useState('');
  const addAsset = useDiagramStore((s) => s.addAsset);
  const upload = async (file: File) => {
    try {
      const { hash, asset } = await storeImage(new Uint8Array(await file.arrayBuffer()), file.type);
      addAsset(hash, asset);
      if (target) setIcon(target, `asset:${hash}`);
      close(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const items = useMemo(() => {
    const icons = ALL_ITEMS.filter((i) => i.kind === 'icon');
    if (!q.trim()) return icons.slice(0, 120);
    return icons.map((i) => ({ i, s: scoreItem(i, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 120).map((x) => x.i);
  }, [q]);
  return (
    <Modal open={!!target} title={t('Change icon')} onClose={() => close(null)}>
      <input autoFocus className="search" type="search" placeholder={t('Search icons...')} aria-label={t('Search icons')} value={q} onChange={(e) => setQ(e.target.value)} />
      <label className="btn upload-btn">
        {t('Upload image…')}
        <input type="file" accept={allowedIconMimes().join(",")} hidden aria-label={t('Upload icon image')} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
      </label>
      <div className="picker-grid">
        {items.map((i) => (
          <button key={i.id} type="button" title={i.label} aria-label={i.label} className="palette-item" onClick={() => { if (target) setIcon(target, i.iconId); close(null); }}>
            <IconGlyph iconId={i.iconId} size={32} />
            <span className="palette-label">{i.label}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
