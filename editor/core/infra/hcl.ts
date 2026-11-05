import { InfraError } from './types';

export interface HclBlock {
  type: string;
  labels: string[];
  /** attribute -> raw expression text (strings keep their quotes) */
  attrs: Record<string, string>;
  blocks: HclBlock[];
  line: number;
}
export interface HclFile { blocks: HclBlock[] }

/**
 * A reader for the structure of HCL2 files: blocks, labels, attributes (as raw expression text), nested blocks, comments,
 * quoted templates with `${}` interpolation and heredocs. Expressions are not evaluated; Terraform imports only need the
 * names that appear in them.
 */
export function parseHcl(src: string): HclFile {
  const s = src.replace(/\r\n?/g, '\n');
  let i = 0;
  let line = 1;
  const peek = (o = 0) => s[i + o];
  const adv = (n = 1) => { for (let k = 0; k < n; k++) if (s[i++] === '\n') line++; };

  function skipTrivia(newlines: boolean): void {
    for (;;) {
      const c = peek();
      if (c === ' ' || c === '\t' || c === '\r' || (newlines && c === '\n')) adv();
      else if (c === '#' || (c === '/' && peek(1) === '/')) { while (i < s.length && peek() !== '\n') adv(); }
      else if (c === '/' && peek(1) === '*') {
        const start = line;
        adv(2);
        while (i < s.length && !(peek() === '*' && peek(1) === '/')) adv();
        if (i >= s.length) throw new InfraError(`HCL: unterminated comment starting at line ${start}`);
        adv(2);
      } else return;
    }
  }
  const isIdent = (c: string | undefined) => !!c && /[A-Za-z0-9_-]/.test(c);

  function readString(): string {
    const start = i;
    const startLine = line;
    adv(); // opening quote
    for (;;) {
      if (i >= s.length) throw new InfraError(`HCL: unterminated string starting at line ${startLine}`);
      const c = peek();
      if (c === '\\') adv(2);
      else if (c === '$' && peek(1) === '{') { adv(2); readNested('}'); }
      else if (c === '"') { adv(); return s.slice(start, i); }
      else if (c === '\n') throw new InfraError(`HCL: unterminated string starting at line ${startLine}`);
      else adv();
    }
  }
  /** skip to the matching close of an interpolation / bracket, honouring strings */
  function readNested(close: string): void {
    const open = line;
    for (;;) {
      if (i >= s.length) throw new InfraError(`HCL: unclosed interpolation or bracket opened at line ${open}`);
      const c = peek();
      if (c === '"') readString();
      else if (c === '{' || c === '(' || c === '[') { adv(); readNested(c === '{' ? '}' : c === '(' ? ')' : ']'); }
      else if (c === close) { adv(); return; }
      else adv();
    }
  }
  function readHeredoc(): void {
    const m = /^<<-?([A-Za-z_][A-Za-z0-9_]*)\n/.exec(s.slice(i));
    if (!m) { adv(); return; }
    const tag = m[1];
    const startLine = line;
    adv(m[0].length);
    for (;;) {
      if (i >= s.length) throw new InfraError(`HCL: unterminated heredoc <<${tag} starting at line ${startLine}`);
      const eol = s.indexOf('\n', i);
      const text = s.slice(i, eol < 0 ? s.length : eol);
      adv(text.length);
      if (text.trim() === tag) return;
      if (eol >= 0) adv();
    }
  }
  /** one expression: up to the end of the line at bracket depth 0 */
  function readExpr(): string {
    const start = i;
    let end = i;
    for (;;) {
      if (i >= s.length) break;
      const c = peek();
      if (c === '\n' || c === '}') {
        if (c === '}') break;
        break;
      }
      if (c === '"') { readString(); end = i; }
      else if (c === '<' && peek(1) === '<') { readHeredoc(); end = i; }
      else if (c === '{' || c === '(' || c === '[') { adv(); readNested(c === '{' ? '}' : c === '(' ? ')' : ']'); end = i; }
      else if (c === '#' || (c === '/' && peek(1) === '/')) { while (i < s.length && peek() !== '\n') adv(); }
      else if (c === '/' && peek(1) === '*') { skipTrivia(false); }
      else { adv(); if (c !== ' ' && c !== '\t' && c !== '\r') end = i; }
    }
    return s.slice(start, end).trim();
  }

  function readBody(opened: number): { attrs: Record<string, string>; blocks: HclBlock[] } {
    const attrs: Record<string, string> = {};
    const blocks: HclBlock[] = [];
    for (;;) {
      skipTrivia(true);
      if (i >= s.length) {
        if (opened > 0) throw new InfraError(`HCL: unclosed "{" opened at line ${opened} (missing "}")`);
        return { attrs, blocks };
      }
      if (peek() === '}') {
        if (opened === 0) throw new InfraError(`HCL: unexpected "}" at line ${line}`);
        adv();
        return { attrs, blocks };
      }
      const startLine = line;
      let name = '';
      if (peek() === '"') name = readString().slice(1, -1);
      else {
        const st = i;
        while (isIdent(peek())) adv();
        name = s.slice(st, i);
      }
      if (!name) throw new InfraError(`HCL: unexpected "${peek()}" at line ${line}`);
      skipTrivia(false);
      if (peek() === '=' && peek(1) !== '=') {
        adv();
        skipTrivia(false);
        attrs[name] = readExpr();
        continue;
      }
      const labels: string[] = [];
      for (;;) {
        skipTrivia(false);
        if (peek() === '"') labels.push(readString().slice(1, -1));
        else if (isIdent(peek())) { const st = i; while (isIdent(peek())) adv(); labels.push(s.slice(st, i)); }
        else break;
      }
      if (peek() !== '{') throw new InfraError(`HCL: expected "=" or "{" after "${name}" at line ${startLine}`);
      const open = line;
      adv();
      const body = readBody(open);
      blocks.push({ type: name, labels, attrs: body.attrs, blocks: body.blocks, line: startLine });
    }
  }
  const top = readBody(0);
  return { blocks: top.blocks };
}
