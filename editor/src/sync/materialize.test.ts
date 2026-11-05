import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { Materializer } from './materialize';

const conflict = (current?: number, restored?: boolean) =>
  new ApiError(412, 'VERSION_CONFLICT', 'stale', current === undefined ? undefined : { currentVersion: current, ...(restored ? { restored: true } : {}) });
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const make = (over: Partial<ConstructorParameters<typeof Materializer>[0]> = {}) => {
  const save = vi.fn(async (_d: unknown, v: number) => v + 1);
  const current = vi.fn(async () => 9);
  const m = new Materializer({ save, current, getProject: () => ({ id: 'f1' }) as never, ...over });
  return { m, save, current };
};

describe('Materializer (debounced PUT of the live document)', () => {
  it('saves nothing without a local change', async () => {
    const { m, save } = make();
    m.setVersion(3);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
  });

  it('debounces ~1.5s, saves with If-Match = the last known version and remembers the new one', async () => {
    const { m, save } = make();
    m.setVersion(3);
    m.touch();
    await vi.advanceTimersByTimeAsync(1000);
    m.touch(); // typing goes on: the timer restarts
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ id: 'f1' }, 3);
    expect(m.knownVersion).toBe(4);
    expect(m.pending).toBe(false);
  });

  it('versions only move forward (file.updated of other editors), unless forced (restore)', () => {
    const { m } = make();
    m.setVersion(5);
    m.setVersion(4);
    expect(m.knownVersion).toBe(5);
    m.setVersion(7);
    expect(m.knownVersion).toBe(7);
    m.setVersion(2, true);
    expect(m.knownVersion).toBe(2);
  });

  it('asks the server for the version when none is known yet', async () => {
    const { m, save, current } = make();
    m.touch();
    await vi.advanceTimersByTimeAsync(1600);
    expect(current).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ id: 'f1' }, 9);
  });

  it('412: takes the current version (from the error, else a refetch) and retries', async () => {
    const { m, save, current } = make();
    save.mockRejectedValueOnce(conflict(12)).mockRejectedValueOnce(conflict()).mockResolvedValueOnce(15);
    current.mockResolvedValue(14);
    m.setVersion(3);
    m.touch();
    await vi.advanceTimersByTimeAsync(1600 + 2 * 1000); // each retry waits conflictMs
    expect(save.mock.calls.map((c) => c[1])).toEqual([3, 12, 14]);
    expect(m.knownVersion).toBe(15);
    expect(m.pending).toBe(false);
  });

  it('412 on a restored head: resets at once, never retries or overwrites the restore', async () => {
    const { m, save } = make();
    save.mockRejectedValueOnce(conflict(12, true));
    m.setVersion(3);
    m.touch();
    await vi.advanceTimersByTimeAsync(1600);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(m.knownVersion).toBe(12);
    expect(m.pending).toBe(false);
  });

  it('reset (a restore) drops the stale copy: no save, and a 412 in flight is not retried', async () => {
    const { m, save } = make();
    save.mockRejectedValueOnce(conflict(12));
    m.setVersion(3);
    m.touch();
    await vi.advanceTimersByTimeAsync(1600);
    expect(save).toHaveBeenCalledTimes(1);
    m.reset(13);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(m.pending).toBe(false);
    expect(m.knownVersion).toBe(13);
    m.touch(); // new edits on the restored doc save at its version
    await vi.advanceTimersByTimeAsync(1600);
    expect(save.mock.calls[1]?.[1]).toBe(13);
  });

  it('a network failure keeps the change pending and tries again later', async () => {
    const { m, save } = make({ retryMs: 2000 });
    save.mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'offline'));
    m.setVersion(1);
    m.touch();
    await vi.advanceTimersByTimeAsync(1600);
    expect(m.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(2100);
    expect(save).toHaveBeenCalledTimes(2);
    expect(m.pending).toBe(false);
  });

  it('edits during a save are saved right after', async () => {
    const { m, save } = make();
    let release!: () => void;
    save.mockImplementationOnce((_d, v) => new Promise<number>((res) => (release = () => res(v + 1))));
    m.setVersion(1);
    m.touch();
    await vi.advanceTimersByTimeAsync(1600);
    m.touch();
    const p = m.flush();
    release();
    await p;
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![1]).toBe(2);
  });

  it('stop() makes a last attempt for unsaved changes, then stays silent', async () => {
    const { m, save } = make();
    m.setVersion(1);
    m.touch();
    m.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    m.touch();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  describe('remote changes', () => {
    it('skips the PUT when the REST copy already equals the document (ignoring id / name / updatedAt)', async () => {
      const peek = vi.fn(async () => ({ version: 8, data: { b: 2, a: [1], name: 'x', updatedAt: 'z' } }));
      const { m, save } = make({ peek, getProject: () => ({ a: [1], b: 2, id: 'f1', name: 'y' }) as never, random: () => 0 });
      m.touchRemote();
      await vi.advanceTimersByTimeAsync(1600);
      expect(peek).toHaveBeenCalledTimes(1);
      expect(save).not.toHaveBeenCalled();
      expect(m.knownVersion).toBe(8);
    });

    it('PUTs, at the version peek saw, when the REST copy lacks the peer change; waits a jitter first', async () => {
      const peek = vi.fn(async () => ({ version: 8, data: { a: [] } }));
      const { m, save } = make({ peek, getProject: () => ({ a: [1] }) as never, random: () => 0.5, jitterMs: 2000 });
      m.touchRemote();
      await vi.advanceTimersByTimeAsync(2000);
      expect(peek).not.toHaveBeenCalled(); // 1500 + 1000
      await vi.advanceTimersByTimeAsync(600);
      expect(save).toHaveBeenCalledWith({ a: [1] }, 8);
    });

    it('does not check the same document twice after saving it, and a burst of peer changes causes one check', async () => {
      const peek = vi.fn(async () => ({ version: 8, data: {} }));
      const { m, save } = make({ peek, getProject: () => ({ a: 1 }) as never, random: () => 0 });
      for (let i = 0; i < 20; i++) {
        m.touchRemote();
        await vi.advanceTimersByTimeAsync(50);
      }
      await vi.advanceTimersByTimeAsync(2000);
      expect(save).toHaveBeenCalledTimes(1);
      m.touchRemote();
      await vi.advanceTimersByTimeAsync(2000);
      expect(save).toHaveBeenCalledTimes(1);
      expect(peek).toHaveBeenCalledTimes(1);
    });
  });
});
