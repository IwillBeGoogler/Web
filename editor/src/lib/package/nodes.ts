import type { DiagramNode } from '../../types';
import { PACKAGE_STYLE } from './types';

/** a package is the `group` node of variant `package` (the same node the class diagram uses) */
export const isPackageNode = (n: DiagramNode | undefined): boolean => n?.type === 'group' && n.data.variant === 'package';

export const packageNode = (id: string, position: { x: number; y: number }, label = 'package', w = 420, h = 280): DiagramNode => ({
  id, type: 'group', position, width: w, height: h, style: { width: w, height: h },
  data: { label, variant: 'package', ...PACKAGE_STYLE },
} as DiagramNode);
