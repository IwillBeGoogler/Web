export interface Tok { k: 'str' | 'word' | 'sym'; v: string; col: number }
const SYMS = new Set(['{', '}', '[', ']', '(', ')', ',', '=', ':']);

/** strips a trailing `//` comment that is outside a string */
export function stripComment(line: string): string {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && q) i++;
    else if (c === '"') q = !q;
    else if (!q && c === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

export function tokenize(line: string): { toks: Tok[]; error?: { col: number; message: string } } {
  const toks: Tok[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < line.length && line[j] !== '"') {
        if (line[j] === '\\' && j + 1 < line.length) { s += line[j + 1] === 'n' ? '\n' : line[j + 1]; j += 2; } else s += line[j++];
      }
      if (j >= line.length) return { toks, error: { col: i + 1, message: 'unterminated string' } };
      toks.push({ k: 'str', v: s, col: i + 1 });
      i = j + 1;
      continue;
    }
    if (SYMS.has(c)) { toks.push({ k: 'sym', v: c, col: i + 1 }); i++; continue; }
    let j = i;
    while (j < line.length && !' \t"'.includes(line[j]) && !SYMS.has(line[j])) j++;
    toks.push({ k: 'word', v: line.slice(i, j), col: i + 1 });
    i = j;
  }
  return { toks };
}

export const quote = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
/** bare when it is a plain word, else quoted */
export const word = (s: string): string => (/^[A-Za-z0-9_.:@#/+-]+$/.test(s) && !/[:]/.test(s) ? s : quote(s));
