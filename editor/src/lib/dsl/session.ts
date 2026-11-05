import type { Diagnostic } from '@core/dsl';
import { useDiagramStore } from '../../store/diagramStore';
import { applyText, storeText } from './bridge';

export interface SessionHooks {
  /** the canvas changed from elsewhere: the editor should show this text */
  onExternalText: (text: string) => void;
  onDiagnostics: (d: Diagnostic[]) => void;
  /** read-only editors never write to the canvas */
  readOnly?: () => boolean;
}

/**
 * Two-way sync between the text editor and the canvas. Text edits are debounced and applied only when they have no syntax errors;
 * canvas edits re-print the page and replace the editor text only when the printed text actually changed (moving a node, selecting
 * or panning never touches the text, and what the user just typed is never rewritten by its own echo).
 */
export class DslSession {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: string | null = null;
  private lastPrinted = '';
  private unsub: (() => void) | null = null;
  private applying = false;

  constructor(private hooks: SessionHooks, private debounceMs = 250) {}

  /** the text the editor should start with */
  start(): string {
    this.lastPrinted = storeText();
    this.unsub = useDiagramStore.subscribe((s, prev) => {
      if (s.nodes === prev.nodes && s.edges === prev.edges && s.activePageId === prev.activePageId) return;
      this.onCanvas();
    });
    return this.lastPrinted;
  }

  private onCanvas(): void {
    if (this.applying) return;
    const text = storeText();
    if (text === this.lastPrinted) return;
    this.lastPrinted = text;
    this.pending = null; // a canvas edit wins over text that has not been applied yet
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.hooks.onExternalText(text);
    this.hooks.onDiagnostics([]);
  }

  /** the user typed */
  edit(text: string): void {
    this.pending = text;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const text = this.pending;
    this.pending = null;
    if (text === null) return;
    if (this.hooks.readOnly?.()) return void this.hooks.onDiagnostics(applyTextDry(text));
    this.applying = true;
    let report;
    try {
      report = applyText(text);
    } finally {
      this.applying = false;
    }
    this.hooks.onDiagnostics(report.diagnostics);
    if (report.applied) this.lastPrinted = storeText(); // our own echo: do not rewrite the editor
  }

  stop(): void {
    this.flush();
    this.unsub?.();
    this.unsub = null;
  }
}

function applyTextDry(text: string): Diagnostic[] {
  // diagnostics only (viewers get squiggles but cannot change the canvas)
  return applyText(text, { dryRun: true }).diagnostics;
}
