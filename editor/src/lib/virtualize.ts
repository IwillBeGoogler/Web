/**
 * Above this many nodes React Flow renders only the nodes and edges inside the viewport (`onlyRenderVisibleElements`).
 * Below it everything stays in the DOM: culling costs a visibility test per element on every pan, and a full DOM keeps
 * off-screen nodes reachable for find-in-page and screen readers on normal diagrams.
 */
export const VIRTUALIZE_AT = 1000;
export const shouldVirtualize = (nodeCount: number): boolean => nodeCount > VIRTUALIZE_AT;
