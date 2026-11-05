import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FileUp } from 'lucide-react';
import { useSddActions } from '../hooks/useSdd';
import { toast } from '../store/toastStore';
import { t } from '../i18n';

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/** Full-screen drop target for .sdd files, active over the canvas and the home screen. */
export function DropOverlay() {
  const [over, setOver] = useState(false);
  const { openBytes } = useSddActions();
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const overFn = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const file = Array.from(e.dataTransfer?.files ?? []).find((f) => /\.(sdd|sddproj|sddt)$/i.test(f.name));
      if (!file) return toast.error(t('Drop a .sdd file to open it'));
      await openBytes(new Uint8Array(await file.arrayBuffer()), file.name);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', overFn);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  });
  return (
    <AnimatePresence>
      {over && (
        <motion.div className="drop-overlay" data-testid="drop-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <motion.div className="drop-card" initial={{ scale: 0.92, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }} transition={{ type: 'spring', stiffness: 420, damping: 30 }}>
            <FileUp className="drop-icon" size={32} aria-hidden />
            <div>{t('Drop to open')}</div>
            <div className="muted" style={{ fontSize: 'var(--fs-sm)', fontWeight: 400 }}>{t('.sdd file (diagram, project or text)')}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
