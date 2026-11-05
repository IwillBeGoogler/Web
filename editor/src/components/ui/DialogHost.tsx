import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { Modal } from './Modal';
import { useDialogStore, type DialogReq } from '../../lib/dialogs';
import { t } from '../../i18n';

function ConfirmBody({ r }: { r: Extract<DialogReq, { kind: 'confirm' }> }) {
  const close = useDialogStore((s) => s.close);
  const [typed, setTyped] = useState('');
  const id = useId();
  const need = r.opts.typeToConfirm;
  const ok = need === undefined || typed === need;
  return (
    <form
      className="dialog-body"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) close(r.id, true);
      }}
    >
      {r.opts.message ? <div className="dialog-msg">{r.opts.message}</div> : null}
      {need !== undefined && (
        <label className="dialog-field" htmlFor={id}>
          <span>{t('Type “{need}” to confirm', { need })}</span>
          <input id={id} data-autofocus type="text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
      )}
      <div className="modal-foot dialog-actions">
        <button type="button" data-autofocus={r.opts.danger && need === undefined ? true : undefined} onClick={() => close(r.id, false)}>{r.opts.cancelLabel ?? t('Cancel')}</button>
        <button type="submit" className={r.opts.danger ? 'danger' : 'primary'} disabled={!ok} data-autofocus={!r.opts.danger ? true : undefined}>{r.opts.confirmLabel ?? t('Confirm')}</button>
      </div>
    </form>
  );
}

function PromptBody({ r }: { r: Extract<DialogReq, { kind: 'prompt' }> }) {
  const close = useDialogStore((s) => s.close);
  const [value, setValue] = useState(r.opts.initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const submit = () => {
    const v = value.trim();
    const err = r.opts.validate ? r.opts.validate(v) : null;
    if (err) return setError(err);
    close(r.id, v);
  };
  return (
    <form
      className="dialog-body"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {r.opts.message ? <div className="dialog-msg">{r.opts.message}</div> : null}
      <label className="dialog-field" htmlFor={id}>
        <span>{r.opts.label ?? t('Name')}</span>
        <input
          id={id}
          data-autofocus
          type="text"
          autoComplete="off"
          value={value}
          placeholder={r.opts.placeholder}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      {error ? <p className="dialog-error" role="alert">{error}</p> : null}
      <div className="modal-foot dialog-actions">
        <button type="button" onClick={() => close(r.id, null)}>{t('Cancel')}</button>
        <button type="submit" className="primary">{r.opts.confirmLabel ?? t('OK')}</button>
      </div>
    </form>
  );
}

/**
 * A choice dialog: the message first (full width), then the options as selectable rows (icon, title, one-line explanation),
 * then a footer OUTSIDE the scrolling area: a ghost "cancel" on the left, the primary action on the right.
 * The recommended (`primary`) option is preselected; Enter confirms, Esc / the ghost button resolve null.
 */
function ChoiceBody({ r }: { r: Extract<DialogReq, { kind: 'choice' }> }) {
  const close = useDialogStore((s) => s.close);
  const id = useId();
  const choices = r.opts.choices;
  const [sel, setSel] = useState(() => Math.max(0, choices.findIndex((c) => c.variant === 'primary')));
  const chosen = choices[sel] ?? choices[0];
  return (
    <form
      className="dialog-body choice-body"
      onSubmit={(e) => {
        e.preventDefault();
        if (chosen) close(r.id, chosen.value);
      }}
    >
      <div className="choice-scroll">
        {r.opts.message ? <div className="dialog-msg">{r.opts.message}</div> : null}
        <div className="choice-rows" role="group" aria-label={t('Options')}>
          {choices.map((c, i) => (
            <button
              key={i}
              type="button"
              className={`choice-row${i === sel ? ' selected' : ''}${c.variant === 'danger' ? ' danger' : ''}`}
              aria-pressed={i === sel}
              aria-labelledby={`${id}-t${i}`}
              aria-describedby={c.description ? `${id}-d${i}` : undefined}
              onClick={() => setSel(i)}
              onDoubleClick={() => close(r.id, c.value)}
            >
              {c.icon ? <span className="choice-icon" aria-hidden>{c.icon}</span> : null}
              <span className="choice-text">
                <span id={`${id}-t${i}`} className="choice-title">{c.label}</span>
                {c.description ? <span id={`${id}-d${i}`} className="choice-desc">{c.description}</span> : null}
              </span>
              <span className="choice-radio" aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <div className="modal-foot dialog-actions choice-foot">
        <button type="button" className="ghost" data-autofocus onClick={() => close(r.id, null)}>{r.opts.cancelLabel ?? t('Cancel')}</button>
        <span className="spacer" />
        <button type="submit" className={chosen?.variant === 'danger' ? 'danger' : 'primary'}>{r.opts.confirmLabel ?? t('Continue')}</button>
      </div>
    </form>
  );
}

function Item({ r }: { r: DialogReq }) {
  const close = useDialogStore((s) => s.close);
  const dismiss = () => close(r.id, r.kind === 'confirm' ? false : null);
  return (
    <Modal open={!r.closing} title={r.opts.title} role={r.kind === 'confirm' ? 'alertdialog' : 'dialog'} onClose={dismiss} className={`dialog dialog-${r.kind}${r.kind === 'custom' && r.opts.className ? ` ${r.opts.className}` : ''}`}>
      {r.kind === 'confirm' ? <ConfirmBody r={r} /> : r.kind === 'prompt' ? <PromptBody r={r} /> : r.kind === 'choice' ? <ChoiceBody r={r} /> : r.opts.render({ done: (v) => close(r.id, v), cancel: dismiss })}
    </Modal>
  );
}

// several hosts may be mounted (App shell + Editor in tests): only the first one renders
const hosts: symbol[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const firstHost = () => hosts[0];

/** Renders every pending dialog (mount once, near the app root; extra instances stay silent). */
export function DialogHost() {
  const [me] = useState(() => Symbol('dialog-host'));
  useEffect(() => {
    hosts.push(me);
    emit();
    return () => {
      hosts.splice(hosts.indexOf(me), 1);
      emit();
    };
  }, [me]);
  const active = useSyncExternalStore(subscribe, firstHost, firstHost) === me;
  const stack = useDialogStore((s) => s.stack);
  if (!active) return null;
  return (
    <>
      {stack.map((r) => (
        <Item key={r.id} r={r} />
      ))}
    </>
  );
}
