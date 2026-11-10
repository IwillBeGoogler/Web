import { describe, expect, it } from 'vitest';
import { chunks, matching, splitTypeName, stripCLike, stripNested } from './clike';

describe('stripCLike', () => {
  it('blanks line comments but keeps length and newlines', () => {
    const src = 'a // hi\nb';
    const out = stripCLike(src);
    expect(out).toHaveLength(src.length);
    expect(out).toBe('a      \nb');
  });
  it('blanks block comments across lines, preserving newlines', () => {
    const src = 'x/* a\nb */y';
    const out = stripCLike(src);
    expect(out).toHaveLength(src.length);
    expect(out.split('\n')).toHaveLength(2);
    expect(out.startsWith('x')).toBe(true);
    expect(out.endsWith('y')).toBe(true);
    expect(out).not.toMatch(/[ab]/);
  });
  it('blanks string and char contents but keeps quotes; handles escapes', () => {
    const out = stripCLike(String.raw`s = "a\"b" + 'c' + "x`);
    expect(out).toContain('"    "');
    expect(out).not.toMatch(/[abc]/);
    expect(out.includes('//')).toBe(false);
  });
  it('keeps newlines inside strings', () => {
    expect(stripCLike('"a\nb"')).toBe('" \n "');
  });
  it('treats comment markers in strings as text, not comments', () => {
    expect(stripCLike('"// no" x')).toBe('"     " x');
  });
  it('only treats backticks as strings when asked', () => {
    expect(stripCLike('`a//b`')).toBe('`a    ');
    expect(stripCLike('`ab\\` x', { backtick: true })).toBe('`   ` x');
  });
  it('raw strings with backtick do not process backslash escapes', () => {
    expect(stripCLike('`a\\` b', { backtick: true })).toBe('`  ` b');
  });
  it('unterminated block comment consumes the rest', () => {
    const out = stripCLike('a /* b');
    expect(out.trim()).toBe('a');
  });
});

describe('matching', () => {
  it('finds nested closers', () => {
    expect(matching('{a{b}c}d', 0)).toBe(6);
    expect(matching('(a(b))', 0, '(', ')')).toBe(5);
  });
  it('returns length when unbalanced', () => {
    expect(matching('{a{b}', 0)).toBe(5);
  });
});

describe('chunks', () => {
  it('splits at ; and brace blocks', () => {
    const r = chunks('int a; void f() { x; } int b', /\=\s*$/);
    expect(r).toEqual([{ head: 'int a' }, { head: 'void f()', block: ' x; ' }, { head: 'int b' }]);
  });
  it('merges an initialiser block into the current chunk when cont matches', () => {
    const r = chunks('int[] a = { 1, 2 }; void g() {}', /=\s*$/);
    expect(r).toHaveLength(2);
    expect(r[0].head).toBe('int[] a = { 1, 2 }');
    expect(r[0].block).toBeUndefined();
    expect(r[1]).toEqual({ head: 'void g()', block: '' });
  });
  it('ignores ; and { inside parentheses', () => {
    const r = chunks('for (a; b) x; int c(Foo { })', /^$/);
    expect(r[0].head).toBe('for (a; b) x');
    expect(r[1].head).toBe('int c(Foo { })');
  });
  it('drops empty heads', () => {
    expect(chunks(';;  ;', /^$/)).toEqual([]);
  });
});

describe('stripNested', () => {
  it('removes nested type bodies and keeps surrounding members', () => {
    const body = 'int a; class In { int z; } int b;';
    const out = stripNested(body, /class\s+\w+\s*\{/);
    expect(out).toContain('int a;');
    expect(out).toContain('int b;');
    expect(out).not.toContain('int z');
    expect(out).not.toContain('class');
  });
  it('returns the body unchanged when nothing nested', () => {
    expect(stripNested('int a;', /class\s+\w+\s*\{/)).toBe('int a;');
  });
});

describe('splitTypeName', () => {
  it('splits at last whitespace outside generics', () => {
    expect(splitTypeName('Map<String, int> m')).toEqual({ name: 'm', type: 'Map<String, int>' });
    expect(splitTypeName('int[] xs')).toEqual({ name: 'xs', type: 'int[]' });
    expect(splitTypeName('final List<A> b')).toEqual({ name: 'b', type: 'final List<A>' });
  });
  it('returns just a name without whitespace', () => {
    expect(splitTypeName('  solo ')).toEqual({ name: 'solo' });
    expect(splitTypeName('Map<A, B>')).toEqual({ name: 'Map<A, B>' });
  });
});
