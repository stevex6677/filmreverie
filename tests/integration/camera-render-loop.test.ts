import { describe, expect, it } from 'vitest';
import { createRenderLoop } from '../../standalone/model-viewer/render-loop.js';

describe('camera render scheduling', () => {
  it('coalesces invalidation during drawing and becomes idle after damping', () => {
    const queue = new Map<number, (time: number) => void>();
    let id = 0, draws = 0;
    const loop = createRenderLoop(() => { if (++draws < 100) loop.invalidate(); }, () => false, {
      request: callback => { queue.set(++id, callback); return id; }, cancel: value => { queue.delete(value); },
    });
    loop.invalidate(); loop.invalidate();
    for (let i = 0; i < 150; i++) {
      expect(queue.size).toBeLessThanOrEqual(1);
      const pending = [...queue.values()]; queue.clear(); pending.forEach(callback => callback(i * 16));
    }
    expect(draws).toBe(123); expect(queue.size).toBe(0);
    loop.invalidate(); expect(queue.size).toBe(1);
    loop.dispose(); expect(queue.size).toBe(0);
    loop.invalidate(); expect(queue.size).toBe(0);
  });
});
