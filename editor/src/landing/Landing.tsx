import { useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import './landing.css';
import { HomeLink } from '../components/ui/HomeLink';
import { ThemeToggle } from '../components/ThemeToggle';
import { HeroCanvas, HeroVisual, type SceneMode } from './HeroScene';
import { linkClick, navigate } from '../lib/router';
import { listWsProjects } from '../workspace/storage';
import { sortProjects } from '../lib/home';
import { Marquee } from './Marquee';
import { FeatureGrid } from './FeatureGrid';
import { TemplatesShowcase } from './TemplatesShowcase';
import { MiniDemo } from './MiniDemo';
import { Footer } from './Footer';
import { Reveal } from './Reveal';
import { REPO_URL } from './config';

function lastProject(): { id: string; name: string } | null {
  try {
    const p = sortProjects(listWsProjects(localStorage), 'updated')[0];
    return p ? { id: p.id, name: p.name } : null;
  } catch {
    return null;
  }
}

/** in-page anchor: smooth-scroll (the document scrolls; sections carry scroll-margin for the sticky nav) and keep the hash */
const jump = (id: string) => (e: React.MouseEvent) => {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try { window.history.replaceState(window.history.state, '', `#${id}`); } catch { /* ignore */ }
};

export default function Landing() {
  const last = useMemo(lastProject, []);
  const go = linkClick('/projects');
  const heroRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<SceneMode>('loading');
  return (
    <MotionConfig reducedMotion="user">
      <div className="landing" data-testid="landing">
        <div className="landing-dots" aria-hidden data-testid="landing-dots" />
        <HeroCanvas boxRef={heroRef} copyRef={copyRef} onMode={setMode} />
        <nav className="l-nav glass" aria-label="Main">
          <span className="l-brand"><HomeLink size={24} wordmark /></span>
          <div className="l-links">
            <a href="#features" onClick={jump('features')}>Features</a>
            <a href="#templates" onClick={jump('templates')}>Templates</a>
            <a href="#clusters" onClick={jump('clusters')}>Clusters</a>
            <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">Docs</a>
          </div>
          <span className="spacer" />
          <a className="btn l-gh" href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
          <ThemeToggle />
          <a className="btn btn-primary primary l-cta" href="/projects" onClick={go}>Start drawing</a>
        </nav>

        <header className="l-hero">
          <HeroVisual mode={mode} boxRef={heroRef} />
          <div className="l-hero-copy" ref={copyRef}>
            <p className="l-eyebrow">Open source · self-hosted · saves to .sdd</p>
            <h1>Design systems, <span className="l-grad">beautifully.</span></h1>
            <p className="l-sub">Open-source system design diagrams — 2,000+ real logos, clusters, smart routing. Saves to .sdd.</p>
            <div className="l-actions">
              <a className="btn btn-primary primary l-big" href="/projects" onClick={go}>Start drawing <ArrowRight size={16} aria-hidden /></a>
              <a className="btn l-big" href="#templates" onClick={jump('templates')}>Browse templates</a>
            </div>
            {last && (
              <a className="l-continue" href={`/p/${encodeURIComponent(last.id)}`} onClick={linkClick(`/p/${encodeURIComponent(last.id)}`)}>
                Continue where you left off <span aria-hidden>→</span> <em>{last.name}</em>
              </a>
            )}
          </div>
        </header>

        <Marquee />
        <Reveal><FeatureGrid /></Reveal>
        <Reveal><TemplatesShowcase /></Reveal>
        <Reveal><MiniDemo /></Reveal>
        <Reveal>
          <section className="l-final" aria-label="Get started">
            <h2>Start with a blank canvas — or a template.</h2>
            <a className="btn btn-primary primary l-big" href="/projects" onClick={(e) => { e.preventDefault(); navigate('/projects'); }}>Open app <ArrowRight size={16} aria-hidden /></a>
          </section>
        </Reveal>
        <Footer />
      </div>
    </MotionConfig>
  );
}
