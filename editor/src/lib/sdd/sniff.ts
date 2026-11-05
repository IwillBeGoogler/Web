import { strFromU8, unzipSync } from 'fflate';
import { DEFAULT_LIMITS, SddError, type SddLimits } from './sdd';

/** what a `.sdd` byte string is: a ZIP holding one file, a ZIP holding a project, or the text format */
export type SddKind = 'file' | 'project' | 'text';
export interface Sniffed {
  kind: SddKind;
  /** an older spelling that is still opened but never written */
  legacy?: 'sddproj' | 'sddt' | 'no-type';
}

const TEXT_HEADER = /^#!sdd(?:[ \t]+\d+)?[ \t]*$/;

/** UTF-8 text of `bytes` without a BOM, or null when it is not text (NUL bytes / invalid UTF-8) */
export function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return null;
  }
}

/**
 * Content sniffing: `PK` starts a ZIP (manifest `type` says file or project; archives without one are files, `format: "sddproj"` is
 * the legacy project), a first line `#!sdd` (optionally `#!sdd 1`) is the text format. A legacy `.sddt` file is text even without
 * the header. Anything else is rejected before it is parsed.
 */
export function sniffSdd(bytes: Uint8Array, name = '', limits: SddLimits = {}): Sniffed {
  const lim = { ...DEFAULT_LIMITS, ...limits };
  if (bytes.length > lim.maxFileBytes) throw new SddError('too-large', `File is too large (limit ${Math.round(lim.maxFileBytes / 1024 / 1024)} MB)`);
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    type Mf = { format?: unknown; type?: unknown };
    let manifest: Mf | null = null as Mf | null;
    try {
      const small = unzipSync(bytes, { filter: (f) => f.name === 'manifest.json' && f.originalSize <= 5 * 1024 * 1024 });
      manifest = small['manifest.json'] ? (JSON.parse(strFromU8(small['manifest.json'])) as typeof manifest) : null;
    } catch {
      throw new SddError('corrupt-zip', 'File is not a valid .sdd archive (corrupt or truncated)');
    }
    if (!manifest || typeof manifest !== 'object') return { kind: 'file' }; // no readable manifest: the file reader reports exactly what is wrong (path, mimetype, missing entry)
    if (manifest.format === 'sddproj') return { kind: 'project', legacy: 'sddproj' };
    if (manifest.type === 'project') return { kind: 'project' };
    if (manifest.type === undefined) return { kind: 'file', legacy: 'no-type' };
    return { kind: 'file' };
  }
  const text = decodeText(bytes);
  if (text !== null) {
    const first = text.split(/\r?\n/).find((l) => l.trim() !== '');
    if (first !== undefined && TEXT_HEADER.test(first.trim())) return { kind: 'text' };
    if (/\.sddt$/i.test(name) && text.trim()) return { kind: 'text', legacy: 'sddt' };
  }
  throw new SddError('unsupported', 'Not a .sdd file: expected a ZIP archive or text starting with "#!sdd"');
}
