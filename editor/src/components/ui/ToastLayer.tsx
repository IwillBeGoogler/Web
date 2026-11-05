import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';
import { t as tr } from '../../i18n';

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };

export function ToastLayer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="toasts" role="region" aria-label={tr('Notifications')} aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <motion.div key={t.id} layout className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'} initial={{ opacity: 0, x: 40, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 40, scale: 0.96 }} transition={{ type: 'spring', stiffness: 500, damping: 36 }}>
              <Icon size={16} aria-hidden />
              <span>{t.message}</span>
              <button type="button" className="btn btn-icon btn-ghost" aria-label={tr('Dismiss notification')} onClick={() => dismiss(t.id)}>
                <X size={14} aria-hidden />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
