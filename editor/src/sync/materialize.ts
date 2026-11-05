import { ApiError } from '../api/client';
import type { Project } from '../types';

/**
 * While a file is edited live (Yjs), the server keeps the CRDT updates but does NOT write the document into the file row
 * (`dg_files.data`): lists, thumbnails, exports and the REST readers see the last MATERIALIZED version. So an editor who made
 * changes saves the plain document through `PUT /files/:id` (If-Match = last known version, X-Client-Id = this socket, so the
 * save is not echoed back to it), debounced. The write is idempotent for the CRDT: whoever saves last stores the merged state
 * they hold, which is the same state everybody converges to.
 */
export interface MaterializeDeps {
  /** save `data` at `version`; resolves with the new version. Rejects with ApiError (412 = somebody else saved first) */
  save(data: unknown, version: number): Promise<number>;
  /** the version the server holds now (after a 412, or before the first save when `hello` has not said) */
  current(): Promise<number>;
  /** the document as the server may see it (private stickies removed); null = nothing to save */
  getProject(): Project | null;
  /** the file as the server holds it (version + data); lets a REMOTE change skip a save when the REST copy already matches */
  peek?(): Promise<{ version: number; data: unknown }>;
  debounceMs?: number;
  /** a change that came from a peer is checked after `debounceMs` plus a random delay up to this, so one of many clients saves and the rest see the result */
  jitterMs?: number;
  random?: () => number;
  retryMs?: number;
  /** wait after a 412 before saving again, so a restore's `restored` event can arrive and `reset()` drop the stale copy */
  conflictMs?: number;
}

const MAX_CONFLICT_ROUNDS = 3;

/** the document without what differs per reader or per save (id, name, updatedAt), in a key order that does not matter */
function canon(v: unknown, top = true): string {
  if (Array.isArray(v)) return `[${v.map((x) => canon(x, false)).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined && !(top && (k === 'id' || k === 'name' || k === 'updatedAt')))
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(o[k], false)}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export class Materializer {
  private version: number | null = null;
  private dirty = false;
  /** a peer changed the document and nobody is known to have stored it yet */
  private remote = false;
  /** the canonical form of the last document known to be in the REST copy */
  private stored: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private again = false;
  private stopped = false;
  /** bumped by `reset()`: a save that started before it must not retry */
  private gen = 0;

  constructor(private d: MaterializeDeps) {}

  /** the version learnt from `hello`, `file.updated` or an ETag. Only moves forward, unless `force` (a restore may lower nothing, but a reset is explicit) */
  setVersion(v: number, force = false): void {
    if (force || this.version === null || v > this.version) this.version = v;
  }
  get knownVersion(): number | null {
    return this.version;
  }
  get pending(): boolean {
    return this.dirty;
  }

  /** this editor changed the document: save it soon */
  touch(): void {
    if (this.stopped) return;
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.d.debounceMs ?? 1500);
  }

  /**
   * a peer's change reached this editor (or an offline merge landed): the REST copy may lack it, e.g. when our own earlier save ran before
   * the merge. After a jittered wait the server's copy is compared and written only when it differs, so N connected clients cause about
   * one PUT per burst, not N. Throttled (an existing timer is kept) so a peer who keeps drawing cannot postpone it forever.
   */
  touchRemote(): void {
    if (this.stopped) return;
    this.remote = true;
    if (this.timer) return;
    const jitter = (this.d.random ?? Math.random)() * (this.d.jitterMs ?? 3000);
    this.timer = setTimeout(() => void this.flush(), (this.d.debounceMs ?? 1500) + jitter);
  }

  /** save now when there are local changes */
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.inflight) {
      this.again = true;
      return this.inflight;
    }
    if ((!this.dirty && !this.remote) || this.stopped) return Promise.resolve();
    this.inflight = this.run().finally(() => {
      this.inflight = null;
      if (this.again && !this.stopped) {
        this.again = false;
        if (this.dirty || this.remote) void this.flush();
      }
    });
    return this.inflight;
  }

  /** the document was replaced on the server (restore): what this editor held is stale, never save it */
  reset(version?: number): void {
    this.gen++;
    this.dirty = false;
    this.remote = false;
    this.stored = null;
    this.again = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (version !== undefined) this.version = version;
  }

  private async run(): Promise<void> {
    const gen = this.gen;
    for (let round = 0; round <= MAX_CONFLICT_ROUNDS; round++) {
      if (gen !== this.gen) return;
      const project = this.d.getProject();
      if (!project) return;
      const form = canon(project);
      const wasDirty = this.dirty;
      this.dirty = false; // edits made while the request flies set it again
      this.remote = false;
      try {
        if (!wasDirty) {
          // only a peer changed it: write when the server's copy lacks it
          if (form === this.stored) return;
          if (this.d.peek) {
            const s = await this.d.peek();
            if (gen !== this.gen) return;
            this.setVersion(s.version);
            if (canon(s.data) === form) {
              this.stored = form;
              return;
            }
          }
        }
        if (this.version === null) this.version = await this.d.current();
        this.version = await this.d.save(project, this.version);
        this.stored = form;
        return;
      } catch (e) {
        if (gen !== this.gen) return; // reset while the request flew
        this.dirty = true; // also for a remote-only check that failed: the next round saves
        if (e instanceof ApiError && e.isConflict) {
          // somebody materialized first: learn the version and save again (the doc is the merged truth, no merge of JSON needed).
          // Not at once: the newer version may be a restore, whose event resets us and must win over this copy.
          try {
            this.version = e.currentVersion ?? (await this.d.current());
          } catch {
            break;
          }
          if (e.currentRestored) {
            // the head is a restore: this copy is stale, never overwrite it
            this.reset(this.version);
            return;
          }
          await new Promise((r) => setTimeout(r, this.d.conflictMs ?? 1000));
          if (gen !== this.gen || this.stopped) return;
          continue;
        }
        break;
      }
    }
    // failed (offline, 5xx, still conflicting): try again later while we are open
    if (!this.stopped && this.dirty) this.timer = setTimeout(() => void this.flush(), this.d.retryMs ?? 5000);
  }

  stop(): void {
    // one last attempt for what is unsaved, then silence
    const last = this.dirty && !this.stopped ? this.flush() : Promise.resolve();
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void last;
  }
}
