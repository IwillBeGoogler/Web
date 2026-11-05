export function sanitizeSvg(svg: string): { viewBox: string; body: string };
export function isUnsafe(markup: string): boolean;
export function stripWhiteBackground(body: string, viewBox: string): string;
export function scopeIds(body: string, prefix: string): string;
