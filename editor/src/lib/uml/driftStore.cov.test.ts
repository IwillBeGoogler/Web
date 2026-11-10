import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { applyUmlModel } from './apply';
import { useDriftStore } from './driftStore';
import { newClassDef, type MemberDef } from './model';

const s = () => useDiagramStore.getState();
const st = () => useDriftStore.getState();
const byLabel = (l: string) => s().nodes.find((n) => n.data.label === l)!;

beforeEach(() => {
  s().reset();
  st().clear();
});

describe('driftStore ghost text', () => {
  it('formats members with and without visibility / type, attributes and operations', () => {
    applyUmlModel({ classes: [newClassDef('A')], relations: [] }, 'page');
    const bare = { name: 'lit' } as unknown as MemberDef;
    st().start({
      classes: [newClassDef('A', { attributes: [bare, { visibility: '#', name: 'p', type: 'int' }], operations: [{ visibility: '+', name: 'go' }, { visibility: '', name: 'run', type: 'bool' }] })],
      relations: [],
    }, 'src');
    const ghosts = st().marksFor(byLabel('A').id).ghosts;
    expect(ghosts).toEqual([
      { comp: 'attributes', text: 'lit' },
      { comp: 'attributes', text: '# p: int' },
      { comp: 'operations', text: '+ go()' },
      { comp: 'operations', text: 'run(): bool' },
    ]);
  });
});

describe('driftStore subscription', () => {
  it('recomputes only when nodes or edges change, not for other state', () => {
    applyUmlModel({ classes: [newClassDef('A')], relations: [] }, 'page');
    st().start({ classes: [newClassDef('A'), newClassDef('B')], relations: [] }, 'src');
    const d = st().drift;
    useDiagramStore.setState({ activePageId: s().activePageId }); // new state object, same nodes / edges
    expect(st().drift).toBe(d);
    useDiagramStore.setState({ edges: [...s().edges] });
    expect(st().drift).not.toBe(d);
    const d2 = st().drift;
    useDiagramStore.setState({ nodes: [...s().nodes] });
    expect(st().drift).not.toBe(d2);
  });
  it('after clear the subscription is gone', () => {
    applyUmlModel({ classes: [newClassDef('A')], relations: [] }, 'page');
    st().start({ classes: [newClassDef('A')], relations: [] }, 'src');
    st().clear();
    useDiagramStore.setState({ nodes: [...s().nodes] });
    expect(st().drift).toBeNull();
  });
});

describe('driftStore marks and acceptAll edge cases', () => {
  it('marksFor an added class (no canvas node) has no marks', () => {
    applyUmlModel({ classes: [newClassDef('A')], relations: [] }, 'page');
    st().start({ classes: [newClassDef('A'), newClassDef('N')], relations: [] }, 'src');
    expect(st().marksFor('missing')).toMatchObject({ count: 0, ghosts: [] });
    expect(st().marksFor('missing').classStatus).toBeUndefined();
  });
  it('acceptAll applies relation-only differences and then stops', () => {
    applyUmlModel({ classes: [newClassDef('A'), newClassDef('B')], relations: [] }, 'page');
    st().start({ classes: [newClassDef('A'), newClassDef('B')], relations: [{ from: 'A', to: 'B', kind: 'dependency' }] }, 'src');
    st().acceptAll();
    expect(s().edges).toHaveLength(1);
    expect(st().drift!.isEmpty).toBe(true);
  });
  it('acceptAll with only header changes on a class', () => {
    applyUmlModel({ classes: [newClassDef('A')], relations: [] }, 'page');
    st().start({ classes: [newClassDef('A', { kind: 'interface' })], relations: [] }, 'src');
    st().acceptAll();
    expect((byLabel('A').data as { kind: string }).kind).toBe('interface');
  });
  it('acceptAll without a review does nothing', () => {
    st().acceptAll();
    expect(st().drift).toBeNull();
  });
});

describe('driftStore marksFor defensive paths (hand-built drift)', () => {
  it('a class of unexpected status gets no class mark; a member without a canvas row has no id mark', () => {
    st().clear();
    useDriftStore.setState({
      code: { classes: [], relations: [] },
      drift: {
        isEmpty: false, relations: [],
        classes: [
          { name: 'X', nodeId: 'n1', status: 'added', header: {}, members: [{ comp: 'attributes', key: 'a:q', name: 'q', status: 'changed', fields: [] }] },
        ],
      } as never,
    });
    const m = st().marksFor('n1');
    expect(m.classStatus).toBeUndefined();
    expect(m.count).toBe(1);
    expect(m.members.get('a:q')).toBe('changed');
    expect(m.byMemberId.size).toBe(0);
    expect(m.ghosts).toEqual([]);
  });
});
