import { z } from 'zod';
import { NODE_KINDS } from '../../types';

const num = z.number().finite();
const settingsLike = z.looseObject({});

export const ManifestSchema = z.object({
  format: z.literal('sdd'),
  formatVersion: z.number().int().min(1),
  /** 'file' = one canvas (the default for archives written before the unified format), 'project' = many files */
  type: z.enum(['file', 'project']).optional(),
  appVersion: z.string(),
  createdAt: num,
  updatedAt: num,
  projectId: z.string().min(1),
  name: z.string(),
  pages: z.array(z.object({ id: z.string().min(1), name: z.string(), file: z.string().min(1) })).min(1),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
});

export const ProjectFileSchema = z.object({
  schemaVersion: z.number().int(),
  id: z.string().min(1),
  name: z.string(),
  createdAt: num,
  updatedAt: num,
  activePageId: z.string().min(1),
  pageOrder: z.array(z.string().min(1)).min(1),
  settings: settingsLike.optional(),
});

const Node = z.looseObject({
  id: z.string().min(1),
  type: z.enum(NODE_KINDS as [string, ...string[]]),
  position: z.object({ x: num, y: num }),
  data: z.looseObject({ label: z.string() }),
});
const Edge = z.looseObject({ id: z.string().min(1), source: z.string().min(1), target: z.string().min(1) });

export const PageFileSchema = z.object({
  schemaVersion: z.number().int(),
  id: z.string().min(1),
  name: z.string(),
  nodes: z.array(Node),
  edges: z.array(Edge),
  viewport: z.object({ x: num, y: num, zoom: num.positive() }).optional(),
  settings: settingsLike.optional(),
  flow: z.boolean().optional(),
  guides: z.array(z.object({ id: z.string().min(1), axis: z.enum(['x', 'y']), pos: num })).max(200).optional(),
});
