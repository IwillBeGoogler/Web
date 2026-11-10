import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Uml2Glyph } from './Uml2Glyph';

const IDS = ['uml-sequence', 'uml-lifeline', 'uml-state', 'uml-state-composite', 'uml-initial', 'uml-final', 'uml-choice', 'uml-fork', 'uml-join', 'uml-history', 'uml-deep-history', 'uml-entry-point', 'uml-exit-point', 'uml-actor', 'uml-act-initial', 'uml-act-final', 'uml-act-flow-final', 'uml-act-action', 'uml-act-decision', 'uml-act-fork', 'uml-act-object', 'uml-act-send', 'uml-act-accept', 'uml-act-note', 'uml-act-lane-v', 'uml-act-lane-h', 'uml-usecase', 'uml-system', 'uml-component', 'uml-node', 'uml-artifact', 'uml-provided', 'uml-required', 'uml-dep-node', 'uml-dep-device', 'uml-dep-env', 'uml-dep-artifact', 'uml-dep-component', 'uml-rel-communication', 'uml-rel-deploy', 'uml-rel-manifest', 'uml-rel-import', 'uml-rel-access', 'uml-rel-merge', 'uml-rel-link', 'uml-obj', 'uml-comm-object', 'uml-timing', 'uml-timing-lifeline', 'uml-rel-transition', 'uml-rel-include', 'uml-rel-extend', 'uml-rel-generalization', 'uml-rel-assembly'];

describe('Uml2Glyph', () => {
  it.each(IDS)('draws %s as a 32px svg', (id) => {
    const { container } = render(<Uml2Glyph id={id} />);
    const svg = container.querySelector('svg.palette-uml-glyph')!;
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.children.length).toBeGreaterThan(0);
  });
  it('returns null for unknown id', () => {
    const { container } = render(<Uml2Glyph id="nope" />);
    expect(container.innerHTML).toBe('');
  });
  it('history vs deep history label, fork vs join paths, device extra line, env rounding', () => {
    expect(render(<Uml2Glyph id="uml-history" />).container.querySelector('text')!.textContent).toBe('H');
    expect(render(<Uml2Glyph id="uml-deep-history" />).container.querySelector('text')!.textContent).toBe('H*');
    const fork = render(<Uml2Glyph id="uml-fork" />).container.innerHTML;
    const join = render(<Uml2Glyph id="uml-join" />).container.innerHTML;
    expect(fork).not.toBe(join);
    const dev = render(<Uml2Glyph id="uml-dep-device" />).container.querySelectorAll('path').length;
    const node = render(<Uml2Glyph id="uml-dep-node" />).container.querySelectorAll('path').length;
    expect(dev).toBe(node + 1);
    expect(render(<Uml2Glyph id="uml-dep-env" />).container.querySelector('rect')!.getAttribute('rx')).toBe('4');
  });
});
