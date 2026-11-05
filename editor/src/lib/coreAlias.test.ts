import { describe, expect, it } from 'vitest';
import { resolveIcon } from '@core/catalog';
import { applyDsl } from '@core/dsl';

describe('@core alias', () => {
  it('the client imports the shared core', () => {
    expect(resolveIcon('redis')?.id).toBe('redis');
    expect(applyDsl(undefined, 'node a "A"').page.nodes).toHaveLength(1);
  });
});
