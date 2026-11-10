import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { applyUmlModel } from './apply';
import { newClassDef, type UmlModel } from './model';

const s = () => useDiagramStore.getState();
const model: UmlModel = { classes: [newClassDef('A'), newClassDef('B')], relations: [{ from: 'A', to: 'B', kind: 'inheritance' }] };

beforeEach(() => s().reset());

describe('applyUmlModel', () => {
  it('page target inserts into current diagram and returns class count', () => {
    expect(applyUmlModel(model, 'page')).toBe(2);
    expect(s().nodes.filter((n) => n.type === 'class')).toHaveLength(2);
    expect(s().edges).toHaveLength(1);
  });
  it('newfile target opens a new file and leaves current page untouched', () => {
    const before = s().nodes.length;
    expect(applyUmlModel(model, 'newfile', 'My classes')).toBe(2);
    expect(s().nodes.length).not.toBe(before + 2);
  });
  it('newfile uses default name', () => {
    expect(applyUmlModel({ classes: [newClassDef('Z')], relations: [] }, 'newfile')).toBe(1);
  });
});
