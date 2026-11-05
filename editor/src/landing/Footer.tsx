import { LogoMark } from '../components/ui/LogoMark';
import { linkClick } from '../lib/router';
import { REPO_URL, VERSION } from './config';

export function Footer() {
  return (
    <footer className="l-footer">
      <div className="l-footer-grid">
        <div>
          <span className="l-brand"><LogoMark size={22} /><span>System Design Diagram</span></span>
          <p className="muted">Open source and self-hosted. Your diagrams stay in your browser and in .sdd files you own.</p>
        </div>
        <nav aria-label="Product">
          <h4>Product</h4>
          <a href="#features">Features</a>
          <a href="#templates">Templates</a>
          <a href="/projects" onClick={linkClick('/projects')}>Open app</a>
        </nav>
        <nav aria-label="Project">
          <h4>Project</h4>
          <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
          <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">Documentation</a>
          <a href={`${REPO_URL}issues`} target="_blank" rel="noreferrer">Report an issue</a>
        </nav>
      </div>
      <p className="l-footer-note muted">Open source · logos are trademarks of their owners · v<span data-testid="app-version">{VERSION}</span></p>
    </footer>
  );
}
