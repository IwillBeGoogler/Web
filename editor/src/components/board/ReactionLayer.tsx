import { useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCollabStore } from '../../collab/store';
import { cursor, emitRemoteReaction, onReaction } from '../../lib/board/live';
import { detectReactions } from '../../lib/board/presence';

interface Floating { id: number; emoji: string; x: number; y: number; dx: number }
const LIFE_MS = 2400;

/** Emoji reactions floating up from where the sender's cursor is. Ephemeral: nothing is stored in the document. */
export function ReactionLayer() {
  const { flowToScreenPosition, screenToFlowPosition } = useReactFlow();
  const people = useCollabStore((s) => s.people);
  const [items, setItems] = useState<Floating[]>([]);
  const seen = useRef<Record<number, number>>({});
  const counter = useRef(0);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const root = document.querySelector('.canvas');
    const onMove = (e: Event) => {
      const pe = e as PointerEvent;
      pointer.current = { x: pe.clientX, y: pe.clientY };
      cursor.at = screenToFlowPosition({ x: pe.clientX, y: pe.clientY });
    };
    root?.addEventListener('pointermove', onMove);
    return () => root?.removeEventListener('pointermove', onMove);
  }, [screenToFlowPosition]);

  useEffect(() => {
    const spawn = (emoji: string, screen: { x: number; y: number }) => {
      const id = ++counter.current;
      const root = document.querySelector('.canvas')?.getBoundingClientRect();
      const item = { id, emoji, x: screen.x - (root?.left ?? 0), y: screen.y - (root?.top ?? 0), dx: Math.round((Math.random() - 0.5) * 60) };
      setItems((l) => [...l.slice(-30), item]);
      setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), LIFE_MS + 100);
    };
    return onReaction((r) => {
      if (r.mine) {
        const root = document.querySelector('.canvas')?.getBoundingClientRect();
        spawn(r.emoji, pointer.current ?? { x: (root?.left ?? 0) + (root?.width ?? 800) / 2, y: (root?.top ?? 0) + (root?.height ?? 600) - 120 });
      } else if (r.at) spawn(r.emoji, flowToScreenPosition(r.at));
    });
  }, [flowToScreenPosition]);

  useEffect(() => {
    const r = detectReactions(seen.current, people, Date.now());
    seen.current = r.seen;
    for (const f of r.fresh) emitRemoteReaction(f.emoji, f.at);
  }, [people]);

  if (!items.length) return null;
  return (
    <div className="reaction-layer" aria-hidden>
      {items.map((i) => (
        <span key={i.id} className="reaction" style={{ left: i.x, top: i.y, ['--dx' as string]: `${i.dx}px` }}>{i.emoji}</span>
      ))}
    </div>
  );
}
