import { describe, expect, it } from 'vitest';
import { layoutUseCase } from './layout';
import { emptyUseCaseModel, type UseCaseModel } from './types';

describe('layoutUseCase edge cases', () => {
  it('empty model yields empty layout', () => {
    const l = layoutUseCase(emptyUseCaseModel());
    expect(l.boxes.size).toBe(0);
    expect(l.boundaries.size).toBe(0);
  });

  it('single actor stays left; actors only (no cases) get placed', () => {
    const l = layoutUseCase({ ...emptyUseCaseModel(), actors: [{ id: 'a', name: 'A' }] });
    expect(l.side.get('a')).toBe('left');
    expect(l.boxes.get('a')!.x).toBe(0);
  });

  it('only right-side actor boxes when no left; loose cases have no frame', () => {
    const m: UseCaseModel = {
      actors: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
      cases: [{ id: 'u1', name: 'One' }, { id: 'u2', name: 'Two' }],
      boundaries: [],
      relations: [
        { from: 'a', to: 'u1', kind: 'association' },
        { from: 'u1', to: 'b', kind: 'association' },
        { from: 'c', to: 'u2', kind: 'association' },
        { from: 'ghost', to: 'u2', kind: 'association' },
      ],
    };
    const l = layoutUseCase(m);
    expect(l.boundaries.size).toBe(0);
    expect(l.side.get('a')).toBe('left');
    expect(l.side.get('b')).toBe('left');
    expect(l.side.get('c')).toBe('right');
    const rx = l.boxes.get('c')!.x;
    expect(rx).toBeGreaterThan(l.boxes.get('u1')!.x + l.boxes.get('u1')!.w);
    // two left actors with same pull are pushed apart
    const A = l.boxes.get('a')!, B = l.boxes.get('b')!;
    expect(A.y + A.h <= B.y || B.y + B.h <= A.y).toBe(true);
  });

  it('multiple boundaries stack; empty boundary is skipped; include/extend chains give columns; cycles terminate', () => {
    const m: UseCaseModel = {
      actors: [{ id: 'a', name: 'A' }],
      boundaries: [{ id: 'b1', name: 'B1' }, { id: 'b2', name: 'B2' }, { id: 'empty', name: 'E' }],
      cases: [
        { id: 'x', name: 'X', boundary: 'b1' },
        { id: 'y', name: 'Y', boundary: 'b1' },
        { id: 'z', name: 'Z', boundary: 'b1' },
        { id: 'w', name: 'W', boundary: 'b1' },
        { id: 'p', name: 'P', boundary: 'b2' },
        { id: 'q', name: 'Q', boundary: 'ghost' },
      ],
      relations: [
        { from: 'x', to: 'y', kind: 'include' },
        { from: 'z', to: 'x', kind: 'extend' },
        { from: 'w', to: 'y', kind: 'include' },
        { from: 'a', to: 'w', kind: 'association' },
        { from: 'p', to: 'a', kind: 'association' },
      ],
    };
    const l = layoutUseCase(m);
    expect(l.boundaries.has('empty')).toBe(false);
    const b1 = l.boundaries.get('b1')!, b2 = l.boundaries.get('b2')!;
    expect(b2.y).toBeGreaterThanOrEqual(b1.y + b1.h);
    const bx = (id: string) => l.boxes.get(id)!;
    expect(bx('y').x).toBeGreaterThan(bx('x').x);
    expect(bx('z').x).toBeGreaterThan(bx('x').x);
    expect(l.boxes.has('q')).toBe(true);

    const cyc = layoutUseCase({
      actors: [], boundaries: [],
      cases: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      relations: [{ from: 'a', to: 'b', kind: 'include' }, { from: 'b', to: 'a', kind: 'include' }],
    });
    expect(cyc.boxes.size).toBe(2);
  });

  it('actor pulled above zero shifts everything down so nothing is negative', () => {
    const m: UseCaseModel = {
      actors: [{ id: 'a', name: 'A' }],
      boundaries: [],
      cases: [{ id: 'u', name: 'U' }],
      relations: [{ from: 'a', to: 'u', kind: 'association' }],
    };
    const l = layoutUseCase(m);
    for (const b of l.boxes.values()) expect(b.y).toBeGreaterThanOrEqual(0);
  });
});
