import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ALL_TEMPLATES, type Template } from '../templates';
import { buildThumbnail } from '../lib/thumbnail';
import { createWsProject } from '../workspace/storage';
import { useAppActions } from '../AppContext';
import { SHOWCASE } from './config';

export function showcaseTemplates(all: Template[] = ALL_TEMPLATES): Template[] {
  const pick = SHOWCASE.map((id) => all.find((t) => t.id === id)).filter((t): t is Template => !!t);
  return pick.length ? pick : all.slice(0, 6);
}

/** Carousel of real template thumbnails; clicking one creates a project from it and opens it. */
export function TemplatesShowcase() {
  const { openProject } = useAppActions();
  const items = useRef(showcaseTemplates()).current;
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const row = useRef<HTMLUListElement>(null);
  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    items.forEach((t, i) => timers.push(setTimeout(() => {
      if (cancelled) return;
      const d = t.build();
      setThumbs((cur) => ({ ...cur, [t.id]: buildThumbnail(d.nodes, d.edges, { width: 360, height: 225 }, 10, d.settings?.canvas?.background) }));
    }, i * 30)));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [items]);
  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * 340, behavior: 'smooth' });
  return (
    <section id="templates" className="l-section" aria-labelledby="tpl-hl">
      <div className="l-section-head">
        <div>
          <h2 id="tpl-hl">Start from a template</h2>
          <p className="l-section-sub">Real architectures you can open, edit and make your own.</p>
        </div>
        <span className="spacer" />
        <div className="l-carousel-nav">
          <button type="button" className="btn-icon" aria-label="Previous templates" onClick={() => scroll(-1)}><ChevronLeft size={18} aria-hidden /></button>
          <button type="button" className="btn-icon" aria-label="Next templates" onClick={() => scroll(1)}><ChevronRight size={18} aria-hidden /></button>
        </div>
      </div>
      <ul className="l-carousel" ref={row} aria-label="Template gallery">
        {items.map((t) => (
          <li key={t.id}>
            <button type="button" className="l-tpl" aria-label={`Open template ${t.name}`} onClick={() => openProject(createWsProject(localStorage, t.name, { content: t.build(), pageName: t.name }).project.id)}>
              {thumbs[t.id] ? <div className="l-tpl-thumb" dangerouslySetInnerHTML={{ __html: thumbs[t.id] }} /> : <div className="l-tpl-thumb skeleton" aria-hidden />}
              <span className="l-tpl-body">
                <span className="l-tpl-name" title={t.name}>{t.name}</span>
                {t.description && <span className="l-tpl-desc">{t.description}</span>}
                <span className="l-tpl-cta" aria-hidden>Use template <ChevronRight size={14} /></span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
