import { useDiagramStore } from '../../store/diagramStore';
import { modelToDiagram } from './convert';
import type { ClassChange, MemberChange, RelChange } from './drift';
import { nextMemberId } from './geometry';
import type { ClassMember, UmlRelationData } from './types';

export interface DriftItem { class?: ClassChange; member?: MemberChange; relation?: RelChange }

const st = () => useDiagramStore.getState();
const nodeByName = (name: string) => st().nodes.find((n) => n.type === 'class' && n.data.label === name);
/** the canvas node of a reviewed class: by id first (a renamed class is still found under its old name), then by name */
const nodeOf = (c: ClassChange) => (c.nodeId && st().nodes.find((n) => n.id === c.nodeId && n.type === 'class')) || nodeByName(c.name);

/**
 * Take the code's version of one reviewed item into the diagram (one undo step). Existing classes keep their position and size policy,
 * their members keep their ids; new classes land in free space.
 */
export function acceptChange(item: DriftItem): boolean {
  if (item.relation) {
    const r = item.relation;
    if (r.status === 'removed') {
      if (!r.edgeId) return false;
      st().deleteEdges([r.edgeId]);
      return true;
    }
    const a = nodeByName(r.rel.from), b = nodeByName(r.rel.to);
    if (!a || !b) return false; // accept the new class first
    const uml: UmlRelationData = { kind: r.rel.kind, ...(r.rel.directed ? { directed: true } : {}), ...(r.rel.fromMult ? { sourceMult: r.rel.fromMult } : {}), ...(r.rel.toMult ? { targetMult: r.rel.toMult } : {}), ...(r.rel.fromRole ? { sourceRole: r.rel.fromRole } : {}), ...(r.rel.toRole ? { targetRole: r.rel.toRole } : {}) };
    return st().addUmlEdge(a.id, b.id, uml) !== null;
  }
  const c = item.class!;
  if (!item.member) {
    if (c.status === 'added' && c.after) {
      const g = modelToDiagram({ classes: [c.after], relations: [] }, { prefix: `sync_${c.name.replace(/\W+/g, '_')}_` });
      st().insertContent(g);
      return true;
    }
    if (c.status === 'removed') {
      const n = nodeOf(c);
      if (!n) return false;
      st().deleteNodes([n.id]);
      return true;
    }
    const n = nodeOf(c);
    if (!n || !c.after) return false;
    // header fields only: id, position, modelId, archRef and every member id stay (a shared class renames on all its copies)
    st().updateClass(n.id, (d) => ({ ...d, label: c.after!.name, kind: c.after!.kind, generics: c.after!.generics, stereotype: c.after!.stereotype }));
    return true;
  }
  const n = nodeOf(c);
  const m = item.member;
  if (!n) return false;
  st().updateClass(n.id, (d) => {
    const list = d[m.comp];
    if (m.status === 'added' && m.after) {
      const add = { ...m.after, id: nextMemberId(d, m.comp === 'attributes' ? 'a' : 'o'), ...(m.comp === 'operations' && !m.after.params ? { params: [] } : {}) } as ClassMember;
      return { ...d, [m.comp]: [...list, add] };
    }
    if (m.status === 'removed' && m.before) return { ...d, [m.comp]: list.filter((x) => x.id !== m.before!.id) };
    if (m.status === 'changed' && m.before && m.after) return { ...d, [m.comp]: list.map((x) => (x.id === m.before!.id ? ({ ...m.after, id: x.id } as ClassMember) : x)) };
    return d;
  });
  return true;
}
