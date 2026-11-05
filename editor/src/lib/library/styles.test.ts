import { describe, expect, it } from 'vitest';
import type { DiagramNode } from '../../types';
import { emptyLibraryDoc, type LibraryDoc } from './types';
import { addColorStyle, addEffectStyle, addTextStyle, addToken, applyStyle, detachStyle, propagateStyles, removeStyle, resolveColor, stylesInUse, updateColorStyle } from './styles';

const n = (id: string, data: Record<string, unknown> = {}): DiagramNode => ({ id, type: 'card', position: { x: 0, y: 0 }, data: { label: id, ...data } }) as DiagramNode;
const lib = (): LibraryDoc => {
  let l = emptyLibraryDoc();
  l = addColorStyle(l, { id: 'brand', name: 'Brand', value: '#2f6fdb', dark: '#7aa2ff' });
  l = addTextStyle(l, { id: 'h1', name: 'Heading', fontSize: 20, bold: true, align: 'center', color: '#111111' });
  l = addEffectStyle(l, { id: 'soft', name: 'Soft shadow', shadow: { x: 0, y: 4, blur: 12, color: 'rgba(0,0,0,.25)' } });
  return l;
};

describe('applying styles', () => {
  it('a colour style writes fill / stroke and remembers the reference', () => {
    const out = applyStyle([n('a')], ['a'], 'fill', 'brand', lib(), 'light');
    expect(out[0].data).toMatchObject({ fill: '#2f6fdb', styles: { fill: 'brand' } });
    expect(applyStyle([n('a')], ['a'], 'stroke', 'brand', lib(), 'light')[0].data).toMatchObject({ stroke: '#2f6fdb', styles: { stroke: 'brand' } });
  });
  it('a text style sets size, weight, alignment and colour', () => {
    expect(applyStyle([n('a')], ['a'], 'text', 'h1', lib(), 'light')[0].data).toMatchObject({ fontSize: 20, bold: true, align: 'center', textColor: '#111111', styles: { text: 'h1' } });
  });
  it('an effect style sets the shadow flag and the shadow spec', () => {
    expect(applyStyle([n('a')], ['a'], 'effect', 'soft', lib(), 'light')[0].data).toMatchObject({ shadow: true, shadowSpec: { y: 4, blur: 12 }, styles: { effect: 'soft' } });
  });
  it('an unknown style id changes nothing; only the listed nodes change', () => {
    const nodes = [n('a'), n('b')];
    expect(applyStyle(nodes, ['a'], 'fill', 'nope', lib(), 'light')).toBe(nodes);
    const out = applyStyle(nodes, ['a'], 'fill', 'brand', lib(), 'light');
    expect(out[1]).toBe(nodes[1]);
  });
  it('detachStyle drops the reference but keeps the current look', () => {
    const out = detachStyle(applyStyle([n('a')], ['a'], 'fill', 'brand', lib(), 'light'), ['a'], 'fill');
    expect(out[0].data.fill).toBe('#2f6fdb');
    expect(out[0].data.styles).toBeUndefined();
  });
});

describe('propagation', () => {
  it('editing a style updates every node that uses it, and nobody else', () => {
    const l0 = lib();
    const nodes = applyStyle([n('a'), n('b'), n('c', { fill: '#ff0000' })], ['a', 'b'], 'fill', 'brand', l0, 'light');
    const l1 = updateColorStyle(l0, 'brand', { value: '#00aa00' });
    const out = propagateStyles(nodes, l1, 'light');
    expect(out.map((x) => x.data.fill)).toEqual(['#00aa00', '#00aa00', '#ff0000']);
    expect(out[2]).toBe(nodes[2]);
  });
  it('returns the same array when nothing differs', () => {
    const nodes = applyStyle([n('a')], ['a'], 'fill', 'brand', lib(), 'light');
    expect(propagateStyles(nodes, lib(), 'light')).toBe(nodes);
  });
  it('deleting a style detaches its users but keeps their look', () => {
    const l0 = lib();
    const nodes = applyStyle([n('a')], ['a'], 'fill', 'brand', l0, 'light');
    const l1 = removeStyle(l0, 'color', 'brand');
    const out = propagateStyles(nodes, l1, 'light');
    expect(out[0].data.fill).toBe('#2f6fdb');
    expect(out[0].data.styles).toBeUndefined();
  });
  it('stylesInUse counts users per style', () => {
    const nodes = applyStyle(applyStyle([n('a'), n('b')], ['a', 'b'], 'fill', 'brand', lib(), 'light'), ['a'], 'text', 'h1', lib(), 'light');
    expect(stylesInUse(nodes)).toEqual({ brand: 2, h1: 1 });
  });
});

describe('theme variables', () => {
  it('a colour style resolves per theme; a token reference resolves through the token', () => {
    const l = addToken(lib(), { id: 'surface', name: 'Surface', light: '#ffffff', dark: '#10141c' });
    const withTok = addColorStyle(l, { id: 'card', name: 'Card', value: 'token:surface' });
    expect(resolveColor(withTok.styles.colors.brand, withTok, 'dark')).toBe('#7aa2ff');
    expect(resolveColor(withTok.styles.colors.brand, withTok, 'light')).toBe('#2f6fdb');
    expect(resolveColor(withTok.styles.colors.card, withTok, 'dark')).toBe('#10141c');
    expect(resolveColor(withTok.styles.colors.card, withTok, 'light')).toBe('#ffffff');
  });
  it('switching theme re-resolves styled nodes', () => {
    const nodes = applyStyle([n('a')], ['a'], 'fill', 'brand', lib(), 'light');
    expect(propagateStyles(nodes, lib(), 'dark')[0].data.fill).toBe('#7aa2ff');
  });
  it('a missing token falls back to the literal text', () => {
    const l = addColorStyle(lib(), { id: 'x', name: 'x', value: 'token:missing' });
    expect(resolveColor(l.styles.colors.x, l, 'light')).toBe('token:missing');
  });
});
