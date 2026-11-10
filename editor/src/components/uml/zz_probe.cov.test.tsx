import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { SECTIONS } from '../../data/catalog';
import { createNodesFromPaletteItem } from '../../data/palette';
import { registerUmlSection } from '../../data/uml';
import { isStateLike } from '../../lib/state/convert';
import { isUseCaseLike } from '../../lib/usecase/convert';
import { isCompNode } from '../../lib/component/convert';
import { isActivityLike } from '../../lib/activity/convert';
import { isDeploymentNode } from '../../lib/deployment/convert';
import { isPackageNode } from '../../lib/package/convert';
import { isObjectNode } from '../../lib/object/convert';
import { isTimingNode } from '../../lib/timing/node';
registerUmlSection();
it('probe', () => {
  const out: string[] = [];
  for (const item of SECTIONS.filter((x) => x.id === 'uml').flatMap((x) => x.subs.flatMap((b) => b.items))) {
    try {
      const ns = createNodesFromPaletteItem(item, { x: 0, y: 0 }, (p) => p + 'x');
      out.push(`${item.id}: ${ns.map((n) => n.type + ':' + [isStateLike(n) && 'st', isUseCaseLike(n) && 'uc', isCompNode(n) && 'comp', isActivityLike(n) && 'act', isDeploymentNode(n) && 'dep', isPackageNode(n) && 'pkg', isObjectNode(n) && 'obj', isTimingNode(n) && 'tim'].filter(Boolean).join('+')).join(',')}`);
    } catch (e) { out.push(item.id + ' ERR'); }
  }
  writeFileSync('/private/tmp/claude-501/-Users-mrb-Desktop-Open-Source-System-Design/0142395c-a96b-4a93-9c4d-6b844928eb1d/scratchpad/umlA/probe.txt', out.join('\n'));
});
