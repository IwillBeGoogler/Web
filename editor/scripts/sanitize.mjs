// Pure SVG sanitiser used by the icon generator and tests.
// Strips scripts, handlers, foreign content and any external references.

/**
 * @param {string} svg full <svg> markup
 * @returns {{ viewBox: string, body: string }}
 */
export function sanitizeSvg(svg) {
  let s = String(svg)
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const m = s.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/i);
  if (!m) throw new Error('not an svg document');
  const attrs = m[1];
  let body = m[2];
  let viewBox = (attrs.match(/viewBox\s*=\s*"([^"]+)"/i) || [])[1];
  if (!viewBox) {
    const w = parseFloat((attrs.match(/\bwidth\s*=\s*"([\d.]+)/i) || [])[1]);
    const h = parseFloat((attrs.match(/\bheight\s*=\s*"([\d.]+)/i) || [])[1]);
    if (!w || !h) throw new Error('svg has no viewBox');
    viewBox = `0 0 ${w} ${h}`;
  }
  viewBox = viewBox.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  // inherit root fill (e.g. <svg fill="#e94600">) by wrapping
  const rootFill = (attrs.match(/\bfill\s*=\s*"([^"]+)"/i) || [])[1];
  body = inlineCssClasses(body);
  body = body
    .replace(/<(script|style|foreignObject|iframe|object|embed|audio|video|animate\w*|set)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|foreignObject|iframe|object|embed|animate\w*|set)\b[^>]*\/>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/\s+(?:xlink:)?href\s*=\s*("([^"]*)"|'([^']*)')/gi, (full, _q, a, b) => {
      const v = (a ?? b ?? '').trim();
      return v.startsWith('#') || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? full : '';
    })
    .replace(/url\(\s*["']?(?!#)[^)]*\)/gi, 'none')
    .replace(/\s+xmlns(:\w+)?\s*=\s*"[^"]*"/gi, '')
    .replace(/currentColor/gi, '#2d3340')
    .trim();
  body = stripWhiteBackground(body, viewBox);
  if (rootFill && !/\bfill\s*=/.test(body.slice(0, 200))) body = `<g fill="${rootFill}">${body}</g>`;
  return { viewBox, body };
}

/** True if markup contains anything we consider unsafe. */
export function isUnsafe(markup) {
  return /<\s*(script|foreignObject|iframe|style)\b|\son[a-z]+\s*=|javascript:|(?:xlink:)?href\s*=\s*["'](?!#|data:image\/)|url\(\s*["']?(?!#)/i.test(markup);
}

const WHITE = /^(#fff|#ffffff|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))$/i;

function attr(tag, name) {
  const m = tag.match(new RegExp('(?:^|\\s)' + name + '\\s*=\\s*"([^"]*)"', 'i'));
  return m ? m[1].trim() : undefined;
}
function fillOf(tag) {
  const f = attr(tag, 'fill');
  if (f) return f;
  const st = attr(tag, 'style');
  const m = st && st.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/i);
  return m ? m[1].trim() : undefined;
}
function covers(v, total) {
  if (v === undefined) return false;
  if (v.endsWith('%')) return parseFloat(v) >= 98;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= total * 0.98;
}

/** Remove a full-size white <rect>/<path> background; keep every other shape. */
export function stripWhiteBackground(body, viewBox) {
  const [, , vw, vh] = viewBox.split(/[\s,]+/).map(Number);
  return body.replace(/<(rect|path)\b[^>]*?\/?>(?:\s*<\/\1>)?/gi, (tag, kind) => {
    const fill = fillOf(tag);
    if (!fill || !WHITE.test(fill)) return tag;
    if (kind.toLowerCase() === 'rect') {
      const x = parseFloat(attr(tag, 'x') ?? '0');
      const y = parseFloat(attr(tag, 'y') ?? '0');
      if (Math.abs(x) > 1 || Math.abs(y) > 1) return tag;
      return covers(attr(tag, 'width'), vw) && covers(attr(tag, 'height'), vh) ? '' : tag;
    }
    const d = (attr(tag, 'd') ?? '').replace(/,/g, ' ').replace(/\s+/g, ' ');
    const m = d.match(/^M\s*0(?:\.0+)?\s*0(?:\.0+)?\s*(?:h|H)\s*([\d.]+)\s*(?:v|V)\s*([\d.]+)/);
    return m && covers(m[1], vw) && covers(m[2], vh) ? '' : tag;
  });
}

/** Apply simple `.class{decl}` rules from <style> blocks as inline style attributes, then drop class attrs. */
export function inlineCssClasses(body) {
  const rules = [];
  body.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_, css) => {
    css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/([^{}]+)\{([^{}]*)\}/g, (__, sel, decl) => {
      for (const one of sel.split(',')) {
        const m = one.trim().match(/^\.([\w-]+)$/);
        if (m) rules.push([m[1], decl.trim().replace(/;$/, '')]);
      }
      return '';
    });
    return '';
  });
  if (!rules.length) return body.replace(/\sclass="[^"]*"/g, '');
  return body.replace(/<([a-zA-Z][\w:-]*)([^>]*?)\sclass="([^"]*)"([^>]*?)(\/?)>/g, (_, tag, pre, cls, post, close) => {
    const names = cls.split(/\s+/).filter(Boolean);
    const decls = rules.filter(([n]) => names.includes(n)).map(([, d]) => d).join(';');
    let attrs = pre + post;
    if (decls) {
      const existing = attrs.match(/\sstyle="([^"]*)"/);
      if (existing) attrs = attrs.replace(existing[0], ` style="${existing[1].replace(/;?$/, ';')}${decls}"`);
      else attrs += ` style="${decls}"`;
    }
    return `<${tag}${attrs}${close}>`;
  });
}

/** Prefix every id and its references so several inlined SVGs on one page cannot collide. */
export function scopeIds(body, prefix) {
  const ids = new Set();
  body.replace(/\sid="([^"]+)"/g, (_, id) => (ids.add(id), ''));
  if (!ids.size) return body;
  let out = body.replace(/(\sid=")([^"]+)(")/g, (_, a, id, c) => `${a}${prefix}-${id}${c}`);
  out = out.replace(/url\(\s*(["']?)#([^)"'\s]+)\1\s*\)/g, (m, q, id) => (ids.has(id) ? `url(#${prefix}-${id})` : m));
  out = out.replace(/((?:xlink:)?href=")#([^"]+)(")/g, (m, a, id, c) => (ids.has(id) ? `${a}#${prefix}-${id}${c}` : m));
  return out;
}
