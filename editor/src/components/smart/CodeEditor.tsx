import { useEffect, useRef } from 'react';
import { closeBrackets, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { EditorState, type ChangeSpec } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers, placeholder } from '@codemirror/view';
import type { Diagnostic } from '@core/dsl';
import { DslSession } from '../../lib/dsl/session';
import { sddCompletion, sddHighlight, sddLanguage } from '../../lib/dsl/language';
import { useEditorSession } from '../../sync/status';
import { t } from '../../i18n';

/** the smallest single change turning `a` into `b` (keeps the cursor and scroll position stable when the canvas rewrites the text) */
export function minimalChange(a: string, b: string): ChangeSpec | null {
  if (a === b) return null;
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  return { from: s, to: ea, insert: b.slice(s, eb) };
}

export function toCmDiagnostics(doc: EditorState['doc'], ds: Diagnostic[]): CmDiagnostic[] {
  return ds.map((d) => {
    const line = doc.line(Math.min(Math.max(1, d.line), doc.lines));
    const from = Math.min(line.to, line.from + Math.max(0, d.col - 1));
    const rest = doc.sliceString(from, line.to);
    const len = /^\S+/.exec(rest)?.[0].length ?? 0;
    return { from, to: len ? from + len : line.to > from ? line.to : Math.min(doc.length, from + 1), severity: d.severity, message: d.message };
  });
}

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px', background: 'transparent', color: 'var(--text)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
  '.cm-content': { padding: '8px 0', caretColor: 'var(--accent)' },
  '.cm-gutters': { background: 'transparent', color: 'var(--faint)', border: 'none' },
  '.cm-activeLine': { background: 'var(--hover)' },
  '.cm-activeLineGutter': { background: 'transparent', color: 'var(--text-2)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { background: 'var(--accent-subtle)' },
  '.cm-tooltip': { background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', color: 'var(--text)' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { background: 'var(--accent-subtle)', color: 'var(--text)' },
  '.cm-completionDetail': { color: 'var(--muted)', marginLeft: '8px' },
});

/** The `.sdd` text editor (CodeMirror 6). Loaded as its own chunk the first time the split view opens. */
export default function CodeEditor({ onDiagnostics }: { onDiagnostics?: (d: Diagnostic[]) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef(onDiagnostics);
  cb.current = onDiagnostics;
  useEffect(() => {
    if (!host.current) return;
    let external = false;
    let view: EditorView;
    const session = new DslSession({
      onExternalText: (text) => {
        const change = minimalChange(view.state.doc.toString(), text);
        if (!change) return;
        external = true;
        view.dispatch({ changes: change });
        external = false;
      },
      onDiagnostics: (ds) => {
        view.dispatch(setDiagnostics(view.state, toCmDiagnostics(view.state.doc, ds)));
        cb.current?.(ds);
      },
      readOnly: () => useEditorSession.getState().readOnly,
    });
    const initial = session.start();
    view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial,
        extensions: [
          lineNumbers(), lintGutter(), history(), drawSelection(), highlightActiveLine(), indentOnInput(), bracketMatching(), closeBrackets(),
          sddLanguage, sddHighlight, sddCompletion, theme, EditorView.lineWrapping,
          placeholder('node api "API" icon=service\napi -> db "SQL"'),
          keymap.of([...completionKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
          EditorState.readOnly.of(false),
          EditorView.contentAttributes.of({ 'aria-label': t('Diagram text (.sdd)'), spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !external) session.edit(u.state.doc.toString());
          }),
        ],
      }),
    });
    return () => {
      session.stop();
      view.destroy();
    };
  }, []);
  return <div ref={host} className="code-host" data-testid="code-editor" />;
}
