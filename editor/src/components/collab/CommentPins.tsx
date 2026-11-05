import { ViewportPortal, useReactFlow, useStore } from '@xyflow/react';
import { MessageSquarePlus } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useSession } from '../../api/session';
import { anchorPoint } from '../../comments/logic';
import { useCommentsStore } from '../../comments/store';
import { colorForUser } from '../../collab/presenceMath';
import { absolutePosition, nodeSize } from '../../lib/graph';
import { canComment } from '../../lib/roles';
import { useDiagramStore } from '../../store/diagramStore';
import { toast } from '../../store/toastStore';
import { useUiStore } from '../../store/uiStore';
import { useEditorSession } from '../../sync/status';
import { Composer } from './CommentParts';
import { t as tr } from '../../i18n';

/** pins of every comment thread (they move with their node), the thread being written, and the click catcher of the comment tool */
export function CommentPins() {
  const threads = useCommentsStore((s) => s.threads);
  const activeId = useCommentsStore((s) => s.activeId);
  const draft = useCommentsStore((s) => s.draft);
  const members = useCommentsStore((s) => s.members);
  const fileId = useCommentsStore((s) => s.fileId);
  const meId = useSession((s) => s.user?.id ?? null);
  const nodes = useDiagramStore((s) => s.nodes);
  const zoom = useStore((s) => s.transform[2]);
  const pins = useMemo(
    () =>
      threads
        .filter((t) => t.root.anchor)
        .map((t, i) => ({ t, i, p: anchorPoint(t.root.anchor!, nodes) }))
        .filter((x): x is typeof x & { p: { x: number; y: number } } => !!x.p),
    [threads, nodes],
  );
  const reveal = useCommentsStore((s) => s.reveal);
  const { setCenter, getZoom } = useReactFlow();
  // a thread opened from a link: bring its anchor into view (waits until the node it hangs on exists)
  useEffect(() => {
    if (!reveal) return;
    const hit = pins.find((x) => x.t.root.id === reveal);
    if (!hit) return;
    useCommentsStore.setState({ reveal: null });
    void setCenter(hit.p.x, hit.p.y, { zoom: Math.max(getZoom(), 0.8), duration: 250 });
  }, [reveal, pins, setCenter, getZoom]);
  if (!fileId) return null;
  const sc = `scale(${1 / Math.max(zoom, 0.01)})`;
  return (
    <ViewportPortal>
      <div className="comment-layer" data-testid="comment-layer">
        {pins.map(({ t, p }) => (
          <button
            key={t.root.id}
            type="button"
            className={`comment-pin${t.root.resolved ? ' resolved' : ''}${activeId === t.root.id ? ' active' : ''}${t.root.author.id === meId ? ' mine' : ''}`}
            data-testid="comment-pin"
            aria-label={`${tr('Comment by {name}', { name: t.root.author.name })}${t.root.resolved ? tr(' (resolved)') : ''}: ${t.root.body.slice(0, 60)}`}
            style={{ transform: `translate(${p.x}px, ${p.y}px) ${sc}`, ['--pin' as string]: colorForUser(t.root.author.id) }}
            onClick={(e) => {
              e.stopPropagation();
              const st = useCommentsStore.getState();
              st.setActive(t.root.id);
              void st.setPanel(true);
            }}
          >
            <span className="comment-pin-shape" aria-hidden />
            {t.replies.length > 0 && <span className="comment-pin-count">{Math.min(t.replies.length + 1, 99)}</span>}
          </button>
        ))}
        {draft && (
          <div className="comment-draft" style={{ transform: `translate(${anchorXY(draft.anchor, nodes).x}px, ${anchorXY(draft.anchor, nodes).y}px) ${sc}` }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <span className="comment-pin active draft-pin" style={{ ['--pin' as string]: colorForUser(meId ?? 'me') }}><span className="comment-pin-shape" aria-hidden /></span>
            <div className="comment-draft-card glass">
              <Composer
                placeholder={tr('Add a comment…')}
                submitLabel={tr('Comment')}
                members={members}
                meId={meId}
                autoFocus
                onSubmit={async (body) => {
                  try {
                    await useCommentsStore.getState().add({ body, anchor: draft.anchor });
                    void useCommentsStore.getState().setPanel(true);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : tr('Could not add the comment'));
                    throw e;
                  }
                }}
                onCancel={() => useCommentsStore.getState().setDraft(null)}
              />
            </div>
          </div>
        )}
      </div>
    </ViewportPortal>
  );
}

function anchorXY(a: NonNullable<ReturnType<typeof useCommentsStore.getState>['draft']>['anchor'], nodes: ReturnType<typeof useDiagramStore.getState>['nodes']) {
  return anchorPoint(a, nodes) ?? { x: 0, y: 0 };
}

/** While the comment tool is on, a click on the canvas starts a comment: on the node under the pointer (pin follows it) or on the free point */
export function CommentCapture() {
  const tool = useUiStore((s) => s.tool);
  const role = useEditorSession((s) => s.role);
  const fileId = useCommentsStore((s) => s.fileId);
  const { screenToFlowPosition } = useReactFlow();
  if (tool !== 'comment' || !fileId || !canComment(role)) return null;
  return (
    <div
      className="comment-capture"
      data-testid="comment-capture"
      title={tr('Click to place a comment · Esc to cancel')}
      onClick={(e) => {
        const stack = document.elementsFromPoint(e.clientX, e.clientY);
        const nodeEl = stack.map((el) => el.closest?.('.react-flow__node[data-id]')).find(Boolean) as HTMLElement | undefined;
        const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const nodes = useDiagramStore.getState().nodes;
        const node = nodeEl ? nodes.find((n) => n.id === nodeEl.getAttribute('data-id')) : undefined;
        if (node) {
          const abs = absolutePosition(nodes, node);
          const sz = nodeSize(node);
          useCommentsStore.getState().setDraft({ anchor: { type: 'node', nodeId: node.id, dx: Math.round(Math.min(Math.max(flow.x - abs.x, 0), sz.width)), dy: Math.round(Math.min(Math.max(flow.y - abs.y, 0), sz.height)) } });
        } else useCommentsStore.getState().setDraft({ anchor: { type: 'point', x: Math.round(flow.x), y: Math.round(flow.y) } });
        useUiStore.getState().setTool('select');
      }}
    />
  );
}

export const CommentToolIcon = MessageSquarePlus;
