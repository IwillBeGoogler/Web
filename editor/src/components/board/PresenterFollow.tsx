import { useEffect, useRef } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import { followTransform, type Rect as PRect } from '../../collab/presenceMath';
import { useCollabStore } from '../../collab/store';
import { detectSummon, findPresenter } from '../../lib/board/presence';
import { usePresenterFollow } from '../../lib/board/followStore';
import { useBoardStore } from '../../store/boardStore';
import { toast } from '../../store/toastStore';
import { t } from '../../i18n';

/** Follow the presenter and obey "bring everyone to me". Shows a small pill only while somebody presents. */
export function PresenterFollow() {
  const people = useCollabStore((s) => s.people);
  const { setViewport, getViewport } = useReactFlow();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const follow = usePresenterFollow((s) => s.state);
  const dispatch = usePresenterFollow((s) => s.dispatch);
  const presentingMe = useBoardStore((s) => !!s.presenting);
  const seen = useRef<Record<number, number>>({});
  const size = useRef({ width, height });
  size.current = { width, height };

  const moveTo = (r: PRect, duration = 350) => void setViewport(followTransform(r, size.current), { duration });

  useEffect(() => {
    if (presentingMe) return;
    const presenter = findPresenter(people);
    const effect = dispatch({ type: 'presenter', presenter });
    if (effect?.type === 'move') moveTo(effect.rect);
    else if (effect?.type === 'ended') toast.info(t('The presentation ended.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, presentingMe]);

  useEffect(() => {
    const r = detectSummon(seen.current, people, Date.now());
    seen.current = r.seen;
    if (r.effect) {
      moveTo(r.effect.rect);
      toast.info(t('{name} brought everyone here.', { name: r.effect.from }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people]);

  const presenter = findPresenter(people);
  if (!presenter || presentingMe) return null;
  const name = presenter.user.name;
  return (
    <div className="follow-pill glass" role="status" data-testid="follow-presenter">
      <span className="follow-dot" style={{ background: presenter.user.color }} aria-hidden />
      {follow.broken ? (
        <>
          <span>{t('{name} is presenting', { name })}</span>
          <button type="button" onClick={() => { const eff = dispatch({ type: 'rejoin', presenter }); if (eff?.type === 'move') moveTo(eff.rect); }}>{t('Rejoin')}</button>
        </>
      ) : (
        <>
          <span>{t('Following {name}', { name })}</span>
          <button type="button" onClick={() => { dispatch({ type: 'userInteraction' }); void getViewport(); }}>{t('Break away')}</button>
        </>
      )}
    </div>
  );
}
