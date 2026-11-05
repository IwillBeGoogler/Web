import { IconGlyph } from '../components/IconGlyph';
import { MARQUEE_ICONS } from './config';

/** Endless strip of provider / tool logos (two copies side by side, translated by half its width). */
export function Marquee() {
  return (
    <section className="l-marquee" aria-label="Works with the tools you use">
      <p className="l-marquee-title">2,000+ real logos from the tools you already run</p>
      <div className="l-marquee-track" data-testid="marquee">
        {[0, 1].map((copy) => (
          <ul key={copy} aria-hidden={copy === 1} className="l-marquee-set">
            {MARQUEE_ICONS.map((id) => (
              <li key={id}><IconGlyph iconId={id} size={34} /></li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}
