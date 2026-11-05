import { useState } from "react";
import { useT } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { inputBoxCls } from "@/shared/ui/form";
import { Modal } from "@/shared/ui/modal";

/** One-field rename dialog. */
export function RenameModal({
  open,
  title,
  initial,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={title}>
      {/* keyed so each open starts from the current name */}
      <RenameForm key={`${open}:${initial}`} initial={initial} pending={pending} onSubmit={onSubmit} onCancel={onClose} />
    </Modal>
  );
}

function RenameForm({ initial, pending, onSubmit, onCancel }: { initial: string; pending: boolean; onSubmit: (name: string) => void; onCancel: () => void }) {
  const t = useT();
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) onSubmit(trimmed);
      }}
    >
      <input className={inputBoxCls} value={name} onChange={(e) => setName(e.target.value)} aria-label={t("dg.form.name")} maxLength={200} autoFocus />
      {/* same order as ConfirmModal: action first, then the way out */}
      <div className="flex gap-2">
        <Button type="submit" variant="accent" loading={pending} disabled={!trimmed || trimmed === initial}>
          {t("dg.form.save")}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          {t("dg.form.cancel")}
        </Button>
      </div>
    </form>
  );
}

export function ConfirmModal({
  open,
  title,
  body,
  confirm,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirm: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={title} description={body}>
      <div className="flex gap-2">
        <Button variant="danger" loading={pending} onClick={onConfirm}>
          {confirm}
        </Button>
        <Button variant="outline" onClick={onClose}>
          {t("dg.form.cancel")}
        </Button>
      </div>
    </Modal>
  );
}
