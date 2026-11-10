import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const vp = vi.hoisted(() => ({ transform: [10, 20, 2] as number[], width: 400, height: 300 }));
vi.mock('@xyflow/react', async (orig) => ({ ...(await orig<typeof import('@xyflow/react')>()), useStore: (sel: (s: typeof vp) => unknown) => sel(vp) }));
import { useDiagramStore } from '../../store/diagramStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useUiStore } from '../../store/uiStore';
import { GuideLines, MeasureLines, Rulers, useAltKey, useRulersOn, RULER } from './PrecisionLayer';
import { WSBAR_INSET } from '../../lib/viewport';
import { renderHook } from '@testing-library/react';

const guides = () => useDiagramStore.getState().guides[useDiagramStore.getState().activePageId] ?? [];
const setG = (g: unknown[]) => act(() => useDiagramStore.getState().setGuides(useDiagramStore.getState().activePageId, g as never));

beforeEach(() => {
  vp.transform = [10, 20, 2];
  useDiagramStore.getState().reset();
  useLayoutStore.getState().reset();
  (Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = vi.fn();
});
afterEach(() => { delete (Element.prototype as unknown as Record<string, unknown>).setPointerCapture; });

describe('useAltKey / useRulersOn', () => {
  it('tracks Alt down / up, ignores other keys, resets on blur', () => {
    const { result } = renderHook(() => useAltKey());
    expect(result.current).toBe(false);
    act(() => void fireEvent.keyDown(window, { key: 'Shift' }));
    expect(result.current).toBe(false);
    act(() => void fireEvent.keyDown(window, { key: 'Alt' }));
    expect(result.current).toBe(true);
    act(() => void fireEvent.keyUp(window, { key: 'Alt' }));
    expect(result.current).toBe(false);
    act(() => void fireEvent.keyDown(window, { key: 'Alt' }));
    act(() => void fireEvent.blur(window));
    expect(result.current).toBe(false);
  });
  it('reads the rulers toggle', () => {
    const { result } = renderHook(() => useRulersOn());
    const before = result.current;
    act(() => useUiStore.setState({ rulers: !before } as never));
    expect(result.current).toBe(!before);
  });
});

describe('MeasureLines', () => {
  const m = (axis: 'x' | 'y', value: number) => ({ axis, from: { x: 0, y: 0 }, to: axis === 'x' ? { x: value, y: 0 } : { x: 0, y: value }, value });
  it('draws a line, two ticks, a label box and rounded text per measure; counter-scales by zoom', () => {
    const { container } = render(<svg><MeasureLines measures={[m('x', 40.4), m('y', 100)]} zoom={2} /></svg>);
    const groups = container.querySelectorAll('g.measure');
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelector('text')!.textContent).toBe('40');
    expect(groups[1].querySelector('text')!.textContent).toBe('100');
    const lines = groups[0].querySelectorAll('line');
    expect(lines).toHaveLength(3);
    expect(lines[0].getAttribute('stroke-width')).toBe('0.6');
    // x-axis ticks are vertical, y-axis ticks horizontal
    expect(lines[1].getAttribute('x1')).toBe(lines[1].getAttribute('x2'));
    const ylines = groups[1].querySelectorAll('line');
    expect(ylines[1].getAttribute('y1')).toBe(ylines[1].getAttribute('y2'));
    expect(ylines[2].getAttribute('y1')).toBe(ylines[2].getAttribute('y2'));
    expect(lines[2].getAttribute('x1')).toBe(lines[2].getAttribute('x2'));
  });
  it('very small zoom is floored at 0.1', () => {
    const { container } = render(<svg><MeasureLines measures={[m('x', 10)]} zoom={0.01} /></svg>);
    expect(container.querySelector('line')!.getAttribute('stroke-width')).toBe('12');
  });
  it('empty list renders an empty layer', () => {
    const { getByTestId } = render(<svg><MeasureLines measures={[]} zoom={1} /></svg>);
    expect(getByTestId('measure-layer').children).toHaveLength(0);
  });
});

describe('GuideLines', () => {
  const mount = () => {
    const r = render(<div className="react-flow"><svg><GuideLines zoom={1} /></svg></div>);
    const root = r.container.querySelector('.react-flow') as HTMLElement;
    root.getBoundingClientRect = () => ({ left: 5, top: 7, width: 400, height: 300 }) as DOMRect;
    return r;
  };
  const hit = (c: HTMLElement, i: number) => c.querySelectorAll('.guide-hit')[i];
  it('draws vertical and horizontal guides with matching cursors', () => {
    setG([{ id: 'v', axis: 'x', pos: 50 }, { id: 'h', axis: 'y', pos: 70 }]);
    const { container } = mount();
    expect(container.querySelectorAll('g.guide')).toHaveLength(2);
    expect((hit(container, 0) as SVGElement).style.cursor).toBe('col-resize');
    expect((hit(container, 1) as SVGElement).style.cursor).toBe('row-resize');
    expect(hit(container, 0).getAttribute('x1')).toBe('50');
    expect(hit(container, 1).getAttribute('y1')).toBe('70');
  });
  it('no guides: empty layer', () => {
    const { getByTestId } = mount();
    expect(getByTestId('guides').children).toHaveLength(0);
  });
  it('double click deletes a guide', () => {
    setG([{ id: 'v', axis: 'x', pos: 50 }]);
    const { container } = mount();
    fireEvent.doubleClick(hit(container, 0));
    expect(guides()).toEqual([]);
  });
  it('dragging a vertical guide moves it in flow coordinates; moves of others or before pressing do nothing', () => {
    setG([{ id: 'v', axis: 'x', pos: 50 }, { id: 'h', axis: 'y', pos: 70 }]);
    const { container } = mount();
    fireEvent.pointerMove(hit(container, 0), { clientX: 300 });
    expect(guides()[0].pos).toBe(50);
    fireEvent.pointerDown(hit(container, 0), { pointerId: 1 });
    fireEvent.pointerMove(hit(container, 1), { clientX: 300, clientY: 300 }); // another guide: ignored
    expect(guides()[1].pos).toBe(70);
    fireEvent.pointerMove(hit(container, 0), { clientX: 305, clientY: 0 }); // (305 - 5 - 10) / 2 = 145
    expect(guides()[0].pos).toBe(145);
    fireEvent.pointerUp(hit(container, 0), { clientX: 305, clientY: 100 });
    expect(guides()).toHaveLength(2);
    // released drag is over
    fireEvent.pointerMove(hit(container, 0), { clientX: 105 });
    expect(guides()[0].pos).toBe(145);
    fireEvent.pointerUp(hit(container, 0), { clientX: 0 });
    expect(guides()).toHaveLength(2);
  });
  it('dragging a horizontal guide uses y; dropping it on the ruler deletes it', () => {
    setG([{ id: 'h', axis: 'y', pos: 70 }]);
    const { container } = mount();
    fireEvent.pointerDown(hit(container, 0), { pointerId: 1 });
    fireEvent.pointerMove(hit(container, 0), { clientX: 100, clientY: 127 }); // (127 - 7 - 20) / 2 = 50
    expect(guides()[0].pos).toBe(50);
    fireEvent.pointerUp(hit(container, 0), { clientX: 100, clientY: 7 + 60 + RULER - 1 });
    expect(guides()).toEqual([]);
  });
  it('dropping a vertical guide on the left ruler deletes it', () => {
    setG([{ id: 'v', axis: 'x', pos: 50 }]);
    const { container } = mount();
    fireEvent.pointerDown(hit(container, 0), { pointerId: 1 });
    fireEvent.pointerUp(hit(container, 0), { clientX: 5 + RULER - 1, clientY: 100 });
    expect(guides()).toEqual([]);
  });
  it('rulers shift down by the file tabs row', () => {
    setG([{ id: 'h', axis: 'y', pos: 70 }]);
    act(() => useLayoutStore.getState().setWsbar(true));
    const { container } = mount();
    fireEvent.pointerDown(hit(container, 0), { pointerId: 1 });
    fireEvent.pointerUp(hit(container, 0), { clientX: 100, clientY: 7 + 60 + WSBAR_INSET + RULER + 5 });
    expect(guides()).toHaveLength(1); // below the (lowered) ruler edge
  });
});

describe('guides removed from the store mid-gesture', () => {
  it('guide drag: move and release tolerate the page having no guides any more', () => {
    setG([{ id: 'v', axis: 'x', pos: 50 }]);
    const r = render(<div className="react-flow"><svg><GuideLines zoom={1} /></svg></div>);
    (r.container.querySelector('.react-flow') as HTMLElement).getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
    const h = r.container.querySelector('.guide-hit')!;
    fireEvent.pointerDown(h, { pointerId: 1 });
    act(() => useDiagramStore.setState({ guides: {} } as never));
    fireEvent.pointerMove(h, { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(h, { clientX: 0, clientY: 0 });
    expect(guides()).toEqual([]);
  });
  it('ruler pull: move and release tolerate it too', () => {
    const r = render(<Rulers />);
    const root = r.getByTestId('rulers') as HTMLElement;
    root.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
    const top = r.container.querySelector('.ruler-top')!;
    fireEvent.pointerDown(top, { pointerId: 1, clientX: 50, clientY: 100 });
    act(() => useDiagramStore.setState({ guides: {} } as never));
    fireEvent.pointerMove(top, { clientY: 150 });
    fireEvent.pointerUp(top, { clientY: 0 });
    expect(guides()).toEqual([]);
  });
});

describe('Rulers pulling guides', () => {
  const mount = () => {
    const r = render(<Rulers />);
    const root = r.getByTestId('rulers') as HTMLElement;
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 }) as DOMRect;
    return r;
  };
  it('renders ticks with labels along both rulers', () => {
    const { container } = mount();
    expect(container.querySelectorAll('.ruler-top text').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.ruler-left text').length).toBeGreaterThan(0);
    expect(container.querySelector('.ruler-top svg')!.getAttribute('width')).toBe('400');
  });
  it('pulling from the top ruler creates a horizontal guide that follows the pointer and stays when released away from the ruler', () => {
    const { container } = mount();
    const top = container.querySelector('.ruler-top')!;
    fireEvent.pointerMove(top, { clientY: 200 }); // not pulling: nothing
    expect(guides()).toEqual([]);
    fireEvent.pointerDown(top, { pointerId: 1, clientX: 50, clientY: 100 });
    expect(guides()).toHaveLength(1);
    expect(guides()[0]).toMatchObject({ axis: 'y', pos: 40 }); // (100 - 0 - 20) / 2
    fireEvent.pointerMove(top, { clientY: 220 });
    expect(guides()[0].pos).toBe(100);
    fireEvent.pointerUp(top, { clientX: 50, clientY: 220 });
    expect(guides()).toHaveLength(1);
    fireEvent.pointerUp(top, { clientY: 0 }); // nothing being pulled
    expect(guides()).toHaveLength(1);
  });
  it('releasing a pulled guide back on the ruler removes it', () => {
    const { container } = mount();
    const top = container.querySelector('.ruler-top')!;
    fireEvent.pointerDown(top, { pointerId: 1, clientX: 50, clientY: 100 });
    fireEvent.pointerUp(top, { clientX: 50, clientY: 10 });
    expect(guides()).toEqual([]);
  });
  it('the left ruler creates vertical guides and deletes them when released on it', () => {
    const { container } = mount();
    const left = container.querySelector('.ruler-left')!;
    fireEvent.pointerDown(left, { pointerId: 1, clientX: 110, clientY: 50 });
    expect(guides()[0]).toMatchObject({ axis: 'x', pos: 50 }); // (110 - 0 - 10) / 2
    fireEvent.pointerMove(left, { clientX: 210 });
    expect(guides()[0].pos).toBe(100);
    fireEvent.pointerUp(left, { clientX: 210, clientY: 50 });
    expect(guides()).toHaveLength(1);
    fireEvent.pointerDown(left, { pointerId: 1, clientX: 110, clientY: 50 });
    fireEvent.pointerUp(left, { clientX: 5, clientY: 50 });
    expect(guides()).toHaveLength(1);
  });
});
