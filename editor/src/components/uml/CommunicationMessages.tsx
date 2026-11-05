import type { DiagramEdge } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { addMessage, messagesOfLink, moveMessage, removeMessage, renumber, shiftMessage, updateMessage } from '../../lib/communication/messages';
import { BufferedInput } from '../BufferedInput';
import { t } from '../../i18n';

/** Inspector rows for the numbered messages of an object link (UML communication diagram). Numbering is page wide: order and nesting (1, 1.1, 2) are kept consistent after every change. */
export function CommunicationMessages({ edge }: { edge: DiagramEdge }) {
  const edges = useDiagramStore((s) => s.edges);
  const nodes = useDiagramStore((s) => s.nodes);
  const editEdges = useDiagramStore((s) => s.editEdges);
  const msgs = messagesOfLink(edges, edge.id);
  const name = (id: string) => String(nodes.find((n) => n.id === id)?.data.label ?? id);
  const a = name(edge.source), b = name(edge.target);
  const run = (fn: (es: DiagramEdge[]) => DiagramEdge[]) => editEdges(fn);
  const small = (label: string, text: string, fn: () => void, disabled = false) => (
    <button type="button" className="comm-btn" aria-label={t(label)} title={t(label)} disabled={disabled} onClick={fn}>{text}</button>
  );
  return (
    <div className="comm-msgs" data-testid="comm-messages">
      <div className="prop-label">{t('Numbered messages')}</div>
      {msgs.length === 0 && <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('No messages yet. Each one is drawn on the link as “1: name() →”.')}</p>}
      {msgs.map((m) => (
        <div className="prop-row comm-row" key={m.id} data-testid={`comm-row-${m.id}`}>
          <strong className="comm-seq">{m.seq}</strong>
          <BufferedInput value={m.text} placeholder="login()" aria-label={t('Message {seq} text', { seq: m.seq })} onCommit={(text) => run((es) => updateMessage(es, m.id, { text: text.trim() }))} />
          {small('Flip direction', m.dir === 'fwd' ? `${a} → ${b}` : `${b} → ${a}`, () => run((es) => updateMessage(es, m.id, { dir: m.dir === 'fwd' ? 'back' : 'fwd' })))}
          <label className="comm-async" title={t('Asynchronous message')}>
            <input type="checkbox" checked={!!m.async} aria-label={t('Asynchronous message {seq}', { seq: m.seq })} onChange={(e) => run((es) => updateMessage(es, m.id, { async: e.target.checked }))} /> {t('async')}
          </label>
          {small('Move up', '↑', () => run((es) => moveMessage(es, m.id, -1)))}
          {small('Move down', '↓', () => run((es) => moveMessage(es, m.id, 1)))}
          {small('Nest under the previous message (1 → 1.1)', '→', () => run((es) => shiftMessage(es, m.id, 1)))}
          {small('Move out one level (1.1 → 2)', '←', () => run((es) => shiftMessage(es, m.id, -1)))}
          {small('Remove message', '×', () => run((es) => removeMessage(es, m.id)))}
        </div>
      ))}
      <div className="btn-row">
        <button type="button" onClick={() => run((es) => addMessage(es, edge.id, { after: msgs[msgs.length - 1]?.id }).edges)}>{t('Add message')}</button>
        <button type="button" onClick={() => run((es) => renumber(es))}>{t('Renumber all')}</button>
      </div>
    </div>
  );
}
