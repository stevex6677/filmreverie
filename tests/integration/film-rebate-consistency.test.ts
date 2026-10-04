import { expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { createFilmRebateCanvas, createFilmRebateAtlas } from '../../src/utils/filmRebateCanvas';
import { DEFAULT_LAYOUT, getStripDimensions } from '../../src/utils/loupeMapping';
import { FILM_MODEL_UNIT } from '../../src/data/physicalScale';
import { FILM_STOCKS, getFilmStock } from '../../src/data/filmStocks';

const factory = () => createCanvas(1, 1) as unknown as HTMLCanvasElement;

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
