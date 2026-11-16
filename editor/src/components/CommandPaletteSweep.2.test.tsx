import { describe, vi } from 'vitest';
import { sweepPalette } from '../test/paletteSweep';

vi.mock('html-to-image', () => ({ toPng: vi.fn().mockResolvedValue('data:png'), toSvg: vi.fn().mockResolvedValue('data:svg') }));

describe('command palette: every reachable command runs without throwing (part 2/4)', () => {
  sweepPalette(1, 4, 10);
});
