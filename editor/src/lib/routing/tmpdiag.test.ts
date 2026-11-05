import { describe, expect, it } from 'vitest';
import { computeRoutes, DEFAULT_ROUTING } from './index';
import { monitoringStack } from '../../templates/monitoringStack';
import { resolveSettings } from '../settings';
import { bestMs } from '../../test/timing';

describe('routing the monitoring template', () => {
  it('stays within the per-edge time budget for the whole diagram (17 edges)', () => {
    const t = monitoringStack();
    const opts = { ...DEFAULT_ROUTING, edgeDefaults: resolveSettings(undefined, undefined).edge };
    expect(bestMs(() => void computeRoutes(t.nodes, t.edges, opts)) / t.edges.length).toBeLessThan(8);
  });
});
