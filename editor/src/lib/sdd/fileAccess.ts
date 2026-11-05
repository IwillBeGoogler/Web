import { downloadBlob } from '../export';

export interface FileHandleLike {
  name: string;
  createWritable(): Promise<{ write(d: BufferSource | Blob): Promise<void>; close(): Promise<void> }>;
  getFile(): Promise<File>;
}
export interface FileEnv {
  showSaveFilePicker?: (o: unknown) => Promise<FileHandleLike>;
  showOpenFilePicker?: (o: unknown) => Promise<FileHandleLike[]>;
  /** fallback when the File System Access API is missing */
  download: (bytes: Uint8Array, name: string) => void;
  chooseFile: () => Promise<File | null>;
}

/** what the file pickers offer: .sdd (container or text); the old .sddproj / .sddt still open */
export const OPEN_ACCEPT = '.sdd,.sddproj,.sddt,application/vnd.sdd+zip,text/vnd.sdd';
const PICKER_TYPES = [{ description: 'System Design Diagram', accept: { 'application/vnd.sdd+zip': ['.sdd'] } }];
const OPEN_TYPES = [{ description: 'System Design Diagram (.sdd, .sddproj, .sddt)', accept: { 'application/vnd.sdd+zip': ['.sdd', '.sddproj'], 'text/vnd.sdd': ['.sdd', '.sddt'] } }];
const isAbort = (e: unknown) => (e as { name?: string })?.name === 'AbortError';

/** Default environment: real browser APIs. */
export function browserEnv(): FileEnv {
  const w = window as unknown as Partial<FileEnv>;
  return {
    showSaveFilePicker: w.showSaveFilePicker?.bind(window),
    showOpenFilePicker: w.showOpenFilePicker?.bind(window),
    download: (bytes, name) => downloadBlob(bytes, name, 'application/vnd.sdd+zip'),
    chooseFile: () =>
      new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = OPEN_ACCEPT;
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.addEventListener('cancel', () => resolve(null));
        input.click();
      }),
  };
}

export interface SaveResult {
  method: 'handle' | 'picker' | 'download';
  name: string;
  handle: FileHandleLike | null;
}

async function write(h: FileHandleLike, bytes: Uint8Array) {
  const w = await h.createWritable();
  await w.write(bytes as unknown as BufferSource);
  await w.close();
}

/** Save: same file handle when we have one (Cmd+S), else picker (Save as / first save), else download. null = cancelled. */
export async function saveSddFile(bytes: Uint8Array, suggestedName: string, opts: { handle?: FileHandleLike | null; saveAs?: boolean } = {}, envIn: Partial<FileEnv> = browserEnv()): Promise<SaveResult | null> {
  const env = { download: browserEnv().download, ...envIn };
  try {
    if (opts.handle && !opts.saveAs) {
      await write(opts.handle, bytes);
      return { method: 'handle', name: opts.handle.name, handle: opts.handle };
    }
    if (env.showSaveFilePicker) {
      const h = await env.showSaveFilePicker({ suggestedName, types: PICKER_TYPES });
      await write(h, bytes);
      return { method: 'picker', name: h.name, handle: h };
    }
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
  env.download(bytes, suggestedName);
  return { method: 'download', name: suggestedName, handle: null };
}

export interface PickedFile {
  bytes: Uint8Array;
  name: string;
  handle: FileHandleLike | null;
}

export async function pickSddFile(envIn: Partial<FileEnv> = browserEnv()): Promise<PickedFile | null> {
  const env = { chooseFile: browserEnv().chooseFile, ...envIn };
  try {
    if (env.showOpenFilePicker) {
      const [h] = await env.showOpenFilePicker({ types: OPEN_TYPES, multiple: false });
      if (!h) return null;
      const f = await h.getFile();
      return { bytes: new Uint8Array(await f.arrayBuffer()), name: f.name, handle: h };
    }
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
  const f = await env.chooseFile();
  return f ? { bytes: new Uint8Array(await f.arrayBuffer()), name: f.name, handle: null } : null;
}
