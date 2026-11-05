import { applyDoc, type BuildResult } from './build';
import { parseDsl } from './parse';
import { printPage } from './print';
import type { CPage } from '../types';
import type { Diagnostic } from './types';

export { parseDsl } from './parse';
export { printPage } from './print';
export { applyDoc } from './build';
export type { Diagnostic, DslDoc } from './types';
export { DSL_VERSION } from './types';

/** parse `text` and merge it into `page` (undefined = a new page). Errors never throw: they come back as diagnostics. */
export function applyDsl(page: CPage | undefined, text: string, opts: { layout?: boolean } = {}): BuildResult & { parseDiagnostics: Diagnostic[] } {
  const { doc, diagnostics } = parseDsl(text);
  const built = applyDoc(page, doc, opts);
  return { ...built, diagnostics: [...diagnostics, ...built.diagnostics], parseDiagnostics: diagnostics };
}

/** the text of a page; if it round trips through `applyDsl` unchanged the sync is stable */
export const pageToDsl = printPage;
