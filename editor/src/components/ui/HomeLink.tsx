import { LogoMark } from './LogoMark';
import { navigate, requestLeave } from '../../lib/router';
import { t } from '../../i18n';

/** The app logo as a real link to the landing page (`/`): SPA navigation, cmd / ctrl / shift / middle click keep the browser default. */
export function HomeLink({ size = 24, wordmark = false, beforeNavigate, className = '' }: { size?: number; wordmark?: boolean; beforeNavigate?: () => void; className?: string }) {
  return (
    <a
      className={`home-link ${className}`.trim()}
      href="/"
      aria-label={wordmark ? t('System Design Diagram, home') : t('Home')}
      title={t('Home')}
      onClick={(e) => {
        if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab / window: not intercepted
        e.preventDefault();
        const go = () => {
          beforeNavigate?.();
          if (window.location.pathname === '/') document.querySelector('.landing')?.scrollTo({ top: 0, behavior: 'smooth' });
          else navigate('/');
        };
        const r = requestLeave(); // unsaved changes: ask first
        if (r === true) go();
        else void r.then((ok) => ok && go());
      }}
    >
      <LogoMark size={size} />
      {wordmark && <span className="wordmark">System Design Diagram</span>}
    </a>
  );
}
