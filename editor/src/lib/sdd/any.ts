import type { Project } from '../../types';
import { readSdd, type ReadResult, type SddLimits } from './sdd';
import { readSddProj, type ReadProjResult } from './sddproj';
import { sniffSdd, decodeText, type Sniffed } from './sniff';

export type OpenedSdd =
  | ({ kind: 'file'; sniffed: Sniffed } & ReadResult)
  | ({ kind: 'project'; sniffed: Sniffed } & ReadProjResult)
  | { kind: 'text'; sniffed: Sniffed; project: Project; warnings: string[] };

/** Open anything a `.sdd` can be (file container, project container, text, legacy `.sddproj` / `.sddt`) with the same safety limits. */
export async function readAnySdd(bytes: Uint8Array, name = '', limits: SddLimits = {}): Promise<OpenedSdd> {
  const sniffed = sniffSdd(bytes, name, limits);
  if (sniffed.kind === 'file') return { kind: 'file', sniffed, ...readSdd(bytes, limits) };
  if (sniffed.kind === 'project') return { kind: 'project', sniffed, ...readSddProj(bytes, limits) };
  const { textToProject } = await import('./text'); // the parser + catalog load only when text is opened
  const r = textToProject(decodeText(bytes) ?? '', name.replace(/\.[^.]+$/, '') || 'Imported text');
  return { kind: 'text', sniffed, ...r };
}
