import { lapSeconds, packetCount, packetDistances, pointAt, SPEED_PX } from './geometry';
import type { FlowPath } from './paths';

const d = (p: FlowPath) => p.points.map((q, i) => `${i ? 'L' : 'M'}${+q.x.toFixed(2)} ${+q.y.toFixed(2)}`).join(' ');

/**
 * SVG overlay (flow coordinates) for image export: with `animated` every packet is a SMIL <animateMotion> along the routed path
 * (so an exported .svg keeps moving when opened in a browser); otherwise one static frame (PNG).
 */
export function flowExportMarkup(paths: FlowPath[], animated: boolean): string {
  const body = paths.map((p) => {
    const n = packetCount(p.m.total, p.look.density);
    const speed = SPEED_PX[p.look.speed];
    const lap = lapSeconds(p.m.total, speed);
    const ds = packetDistances(p.m.total, n, 0, speed, 0);
    return ds.map((dist) => {
      const shape = p.look.style === 'dash'
        ? `<rect x="-6" y="-1.6" width="12" height="3.2" rx="1.6" fill="${p.color}"/>`
        : p.look.style === 'pulse'
          ? `<circle r="4" fill="${p.color}" fill-opacity=".85">${animated ? `<animate attributeName="r" values="2.5;5;2.5" dur="1.2s" repeatCount="indefinite"/>` : ''}</circle>`
          : `<circle r="3.4" fill="${p.color}"/>`;
      if (!animated) {
        const at = pointAt(p.m, dist);
        return `<g transform="translate(${at.x.toFixed(2)} ${at.y.toFixed(2)}) rotate(${((at.angle * 180) / Math.PI).toFixed(1)})" data-flow="${p.id}">${shape}</g>`;
      }
      const begin = -(dist / speed);
      return `<g data-flow="${p.id}">${shape}<animateMotion dur="${lap.toFixed(2)}s" begin="${begin.toFixed(2)}s" repeatCount="indefinite" rotate="auto" path="${d(p)}"/></g>`;
    }).join('');
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="flow-export" width="1" height="1" style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none">${body}</svg>`;
}
