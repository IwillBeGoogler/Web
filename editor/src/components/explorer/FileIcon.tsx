import { Database, Folder, FolderOpen, Network, Shapes, StickyNote } from 'lucide-react';
import type { FileKind } from '../../workspace/types';

export const KIND_LABEL: Record<FileKind, string> = { sdd: 'Architecture', erd: 'Data model', uml: 'UML', board: 'Whiteboard' };

/** icon of a file by its dominant content kind (architecture / ERD / UML / whiteboard) */
export function FileKindIcon({ kind, size = 15 }: { kind: FileKind; size?: number }) {
  const props = { size, 'aria-hidden': true, className: `kind-icon kind-${kind}`, 'data-kind': kind } as const;
  switch (kind) {
    case 'erd':
      return <Database {...props} />;
    case 'uml':
      return <Shapes {...props} />;
    case 'board':
      return <StickyNote {...props} />;
    default:
      return <Network {...props} />;
  }
}
export function FolderIcon({ open, size = 15 }: { open: boolean; size?: number }) {
  return open ? <FolderOpen size={size} aria-hidden className="kind-icon kind-folder" /> : <Folder size={size} aria-hidden className="kind-icon kind-folder" />;
}
