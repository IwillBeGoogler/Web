import type { FlowPath } from './paths';

/** the flow lines currently drawn on the active page (set by the canvas, read by image export) */
export const flowRegistry: { paths: FlowPath[] } = { paths: [] };
