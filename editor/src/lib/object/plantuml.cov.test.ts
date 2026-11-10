import { describe, expect, it } from 'vitest';
import { looksLikeObjectPlantuml, parseObjectPlantuml, renderObjectPlantuml } from './plantuml';
import type { ObjectModel } from './types';

describe('renderObjectPlantuml', () => {
  it('objects, slots, labels, messages, dangling', () => {
    const model: ObjectModel = {
      objects: [
        { id: 'a', name: 'a"x', className: 'K', slots: [{ name: 's', value: '1' }, { name: 't', value: '' }] },
        { id: 'b', name: 'b', slots: [] },
      ],
      links: [
        { from: 'a', to: 'b', label: 'ow"n\ns' },
        { from: 'a', to: 'b' },
        { from: 'a', to: 'zz' },
        { from: 'b', to: 'a', messages: [
          { id: '1', seq: '1', text: 'go', dir: 'fwd' }, { id: '2', seq: '2', text: 'back', dir: 'back' },
          { id: '3', seq: '3', text: 'af', dir: 'fwd', async: true }, { id: '4', seq: '4', text: 'ab', dir: 'back', async: true },
        ] },
      ],
    };
    const t = renderObjectPlantuml(model);
    expect(t).toContain(`object "a'x : K" as O1 {\n  s = 1\n  t\n}`);
    expect(t).toContain('object "b" as O2\n');
    expect(t).toContain("O1 -- O2 : ow'n s");
    expect(t).toContain('O1 -- O2\n');
    expect(t).not.toContain('zz');
    expect(t).toContain('O2 -- O1 : 1: go >\\n2: back <\\n3: af >>\\n4: ab <<');
  });
});

describe('looksLikeObjectPlantuml', () => {
  it('object decl and not other kinds', () => {
    expect(looksLikeObjectPlantuml('@startuml\nobject a\n@enduml')).toBe(true);
    expect(looksLikeObjectPlantuml('object a')).toBe(false);
    expect(looksLikeObjectPlantuml('@startuml\nclass a\n@enduml')).toBe(false);
    expect(looksLikeObjectPlantuml('@startuml\nobject a\nnode n\n@enduml')).toBe(false);
  });
});

describe('parseObjectPlantuml', () => {
  it('declarations, slots, aliases, skipped', () => {
    const { model, warnings } = parseObjectPlantuml([
      '@startuml', "/' c\nc '/", "' x", 'skinparam z', 'title t', 'note left : n',
      'object "order : Order" as O1 {', '  id = 5', '  "my slot" => v', '  flag', '}',
      'object Plain', 'object "other" as O2 {', '}', 'object O1', 'bogus line here', '@enduml',
    ].join('\n'));
    expect(model.objects).toHaveLength(3);
    expect(model.objects[0]).toMatchObject({ name: 'order', className: 'Order', slots: [{ name: 'id', value: '5' }, { name: 'my slot', value: 'v' }, { name: 'flag', value: '' }] });
    expect(model.objects[1]).toMatchObject({ name: 'Plain' });
    expect(model.objects[1].className).toBeUndefined();
    expect(warnings).toEqual(['Skipped: bogus line here']);
  });
  it('slot warning when body line unparseable', () => {
    const { warnings } = parseObjectPlantuml('object A {\n  = x\n}');
    expect(warnings).toEqual(['Skipped: = x']);
  });
  it('links: direction, labels, messages, unknown, quoted refs', () => {
    const { model, warnings } = parseObjectPlantuml([
      'object a', 'object b', 'object "c d" as c',
      'a -- b : knows', 'b <-- a', 'a "1" -- "*" b', 'a --> b',
      'a -- b : 1: go() >\\n2: back <<', 'a -- b : 1: go() > \\n x', '"c d" -- a', 'a -- q', 'a -- b',
    ].join('\n'));
    const ls = model.links;
    expect(ls[0]).toEqual({ from: 'o1', to: 'o2', label: 'knows' });
    expect(ls[1]).toEqual({ from: 'o1', to: 'o2' }); // `b <-- a` flips
    expect(ls[2]).toEqual({ from: 'o1', to: 'o2' });
    expect(ls[3]).toEqual({ from: 'o1', to: 'o2' });
    expect(ls[4].messages).toEqual([{ id: 'm5_1', seq: '1', text: 'go()', dir: 'fwd' }, { id: 'm5_2', seq: '2', text: 'back', dir: 'back', async: true }]);
    expect(ls[5]).toEqual({ from: 'o1', to: 'o2', label: '1: go() > \\n x' });
    expect(ls[6]).toEqual({ from: 'o3', to: 'o1' });
    expect(ls).toHaveLength(8);
    expect(warnings).toEqual(['Skipped link to an unknown object: a -- q']);
  });
});
