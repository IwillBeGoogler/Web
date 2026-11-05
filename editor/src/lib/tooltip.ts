export interface Rect { x: number; y: number; width: number; height: number }
export interface TipPosition {
  x: number;
  y: number;
  placement: 'top' | 'bottom';
  /** x offset of the arrow inside the tooltip */
  arrowX: number;
}

/**
 * Position a tooltip centred above its anchor; flip below when there is no room above,
 * and clamp horizontally so it is never clipped by the viewport.
 */
export function computeTooltipPosition(anchor: Rect, tip: { width: number; height: number }, viewport: { width: number; height: number }, gap = 8, margin = 6): TipPosition {
  const spaceAbove = anchor.y - gap - margin;
  const placement: 'top' | 'bottom' = spaceAbove >= tip.height || anchor.y + anchor.height + gap + tip.height + margin > viewport.height ? 'top' : 'bottom';
  const flipped = placement === 'top' && spaceAbove < tip.height && anchor.y + anchor.height + gap + tip.height + margin <= viewport.height;
  const finalPlacement: 'top' | 'bottom' = flipped ? 'bottom' : placement;
  const y = finalPlacement === 'top' ? anchor.y - gap - tip.height : anchor.y + anchor.height + gap;
  const center = anchor.x + anchor.width / 2;
  const x = Math.max(margin, Math.min(center - tip.width / 2, viewport.width - tip.width - margin));
  return { x, y: Math.max(margin, y), placement: finalPlacement, arrowX: Math.max(10, Math.min(center - x, tip.width - 10)) };
}

export interface TipContent {
  title: string;
  /** e.g. "AWS › Compute" */
  path?: string;
  /** e.g. ["k8s"] shown as "aka: k8s" */
  aliases?: string[];
  /** provider / category / trait tags */
  tags?: string[];
  /** bullet list (e.g. cluster warnings) */
  lines?: string[];
}

export const isTruncated = (el: { scrollWidth: number; clientWidth: number; scrollHeight?: number; clientHeight?: number }): boolean =>
  el.scrollWidth > el.clientWidth + 1 || (el.scrollHeight ?? 0) > (el.clientHeight ?? 0) + 1;
