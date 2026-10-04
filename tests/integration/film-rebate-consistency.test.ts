import { expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { createFilmRebateCanvas, createFilmRebateAtlas } from '../../src/utils/filmRebateCanvas';
import { DEFAULT_LAYOUT, getStripDimensions } from '../../src/utils/loupeMapping';
import { FILM_MODEL_UNIT } from '../../src/data/physicalScale';
import { FILM_STOCKS, getFilmStock } from '../../src/data/filmStocks';
import { formatLayout } from '../../src/data/filmFormats';

const factory = () => createCanvas(1, 1) as unknown as HTMLCanvasElement;

it('keeps factory print spacing on half frames and preserves the gap between their image gates', () => {
  const canvas = factory(), context = canvas.getContext('2d')!;
  const print = vi.spyOn(context, 'fillText');
  const layout = { ...formatLayout('135-half'), frameCount: 13, frameNumberOffset: 12 };
  const size = getStripDimensions(layout), density = 1500;
  try {
    createFilmRebateCanvas(getFilmStock('gold-200'), layout, Math.round(size.width * density), Math.round(size.height * density), () => canvas);
    const labels = print.mock.calls.map(call => call[0]);
    const legends = print.mock.calls.filter(call => call[0] === getFilmStock('gold-200').rebate.label);
    expect(legends.length).toBeGreaterThan(2);
    const designPixelsPerMm = 468 * FILM_MODEL_UNIT / size.height;
    legends.slice(1).forEach((call, i) => expect((call[1] - legends[i][1]) / designPixelsPerMm).toBeCloseTo(50.8));
    expect(labels).toContain('7');
    expect(labels).toContain('7A');
    expect(labels).toContain('13');
    expect(labels).not.toContain('14');
    const alpha = (x: number) => context.getImageData(Math.round(x * density), Math.round(size.height * density / 2), 1, 1).data[3];
    expect(alpha(layout.marginX + layout.frameWidth / 2)).toBe(0);
    expect(alpha(layout.marginX + layout.frameWidth + layout.gap / 2)).toBe(255);
    expect(alpha(layout.marginX + layout.frameWidth * 1.5 + layout.gap)).toBe(0);
  } finally { print.mockRestore(); }
});

it('keeps 35mm lettering the same physical width on full and partial strips', () => {
  const widths: number[] = [];
  for (const frameCount of [6, 3, 1]) {
    const layout = { ...DEFAULT_LAYOUT, frameCount, // Compare the same label phase, not the same photo index: factory
      // labels no longer reset to the beginning of each cut strip.
      filmLengthOffset: frameCount === 6 ? 0 : 50.8 * 12 * FILM_MODEL_UNIT };
    const size = getStripDimensions(layout);
    // Equal pixels per physical unit, regardless of strip length.
    const canvas = createFilmRebateCanvas(getFilmStock('gold-200'), layout, Math.round(size.width * 1500), Math.round(size.height * 1500), factory);
    const left = Math.round(layout.marginX * 1500);
    const top = canvas.getContext('2d')!.getImageData(left + 150, 1, 450, 45).data;
    const xs: number[] = [];
    for (let y = 0; y < 45; y++) for (let x = 0; x < 450; x++) {
      if (top[(y * 450 + x) * 4] < 100) xs.push(x);
    }
    expect(xs.length).toBeGreaterThan(100);
    widths.push(Math.max(...xs) - Math.min(...xs));
  }
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
});

it('uses exact neutral coverage for unprinted rails across stock colors', () => {
  for (const stock of FILM_STOCKS) {
    const atlas = createFilmRebateAtlas(stock, DEFAULT_LAYOUT, 1024, factory);
    expect([...atlas.getContext('2d')!.getImageData(1, 120, 1, 1).data]).toEqual([255, 255, 255, 255]);
    const data = atlas.getContext('2d')!.getImageData(0, 0, atlas.width, atlas.height).data;
    let ink = 0, tinted = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) tinted++;
      if (data[i] < 64 && data[i + 3] > 200) ink++;
    }
    expect(tinted).toBe(0);
    expect(ink).toBeGreaterThan(50);
  }
});
