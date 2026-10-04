import { describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { FILM_STOCKS, getFilmStock, type FilmStockProfile } from '../../src/data/filmStocks';
import { FILM_MODEL_UNIT as unit } from '../../src/data/physicalScale';
import { formatLayout } from '../../src/data/filmFormats';
import { createFilmRebateCanvas } from '../../src/utils/filmRebateCanvas';
import { film120Marks } from '../../src/utils/film120Rebate';
import { type FilmStripLayout, getFilmLengthOffset, getPerforationPositions, getStripDimensions } from '../../src/utils/loupeMapping';
import { BASELINE_ROLL, createRollLayout } from '../../src/utils/rollLayout';

function lettering(stock: FilmStockProfile, layout: FilmStripLayout) {
  const { width, height } = getStripDimensions(layout);
  const canvas = createCanvas(Math.round(width / unit * 20), Math.round(height / unit * 20));
  const ctx = canvas.getContext('2d');
  const marks: { text: string; x: number; y: number }[] = [];
  const draw = ctx.fillText.bind(ctx);
  vi.spyOn(ctx, 'fillText').mockImplementation((text, x, y) => {
    const transform = ctx.getTransform();
    // Convert actual canvas drawing back to millimetres from the cut edge.
    marks.push({ text, x: (x * transform.a + transform.e) / canvas.width * width / unit,
      y: (y * transform.d + transform.f) / canvas.height * height / unit });
    draw(text, x, y);
  });
  createFilmRebateCanvas(stock, layout, canvas.width, canvas.height, () => canvas as unknown as HTMLCanvasElement);
  return marks;
}

function expectPitch(positions: number[], pitch: number) {
  expect(positions.length).toBeGreaterThan(2);
  positions.slice(1).forEach((x, i) => expect(x - positions[i]).toBeCloseTo(pitch, 5));
}

const widths = [65, 18, 36, 65, 24, 90, 18];
function roll(format: '135' | '66', framesPerStrip: number) {
  return { ...BASELINE_ROLL, layout: formatLayout(format), framesPerStrip,
    frames: widths.map((_, i) => ({ ...BASELINE_ROLL.frames[0], id: `edge-${i}`, order: i + 1 })),
    frameWidths: widths.map(width => width * unit) };
}

describe('factory markings follow film length, independently of photographs', () => {
  it('draws every stock at 38 mm numbered / 19 mm half-numbered pitch for mixed image widths', () => {
    const layout = createRollLayout(roll('135', widths.length))[0].layout;
    for (const stock of FILM_STOCKS) {
      const numbers = lettering(stock, layout).filter(m => m.y > 30 && /^\d+A?$/.test(m.text));
      expectPitch(numbers.filter(m => /^\d+$/.test(m.text)).map(m => m.x), 38);
      if (stock.rebate.halfFrameNumbers) expectPitch(numbers.map(m => m.x), 19);
      expect(numbers.map(m => m.text)).toEqual(expect.arrayContaining(['1', '1A', '2', '2A']));
      // A 65mm panorama crosses the number 2 before its right edge.
      const second = numbers.find(m => m.text === '2')!;
      expect(second.x).toBeLessThan(layout.marginX / unit + 65);
    }
  });

  it('preserves printed positions and perforation phase when the same roll is cut differently', () => {
    for (const format of ['135', '66'] as const) for (const stock of [getFilmStock('ektachrome-e100'), getFilmStock('velvia-50')]) {
      const whole = createRollLayout(roll(format, widths.length))[0].layout;
      const completeMarks = lettering(stock, whole);
      let cutEnd = 0;
      for (const { layout } of createRollLayout(roll(format, 2))) {
        const offset = (getFilmLengthOffset(layout) + whole.marginX - layout.marginX) / unit;
        const length = getStripDimensions(layout).width / unit;
        // Adjacent pieces must meet at one cut: duplicated end margins repeat
        // letters (and barcodes) across rows even if each mark has the right pitch.
        expect(offset).toBeCloseTo(cutEnd, 8);
        cutEnd = offset + length;
        // The renderer must retain a preceding partially clipped inscription.
        const actual = lettering(stock, layout).filter(m => m.x > -1 && m.x < length - 1);
        const expected = completeMarks.filter(m => m.x - offset > -1 && m.x - offset < length - 1);
        expect(actual.map(m => m.text)).toEqual(expected.map(m => m.text));
        actual.forEach((m, i) => expect(m.x + offset).toBeCloseTo(expected[i].x, 4));
        if (format === '135') for (const hole of getPerforationPositions(layout).top) {
          const rollX = (hole.x + getStripDimensions(layout).width / 2 - layout.marginX + getFilmLengthOffset(layout)) / unit;
          expect((rollX - 2.375) / 4.75).toBeCloseTo(Math.round((rollX - 2.375) / 4.75), 8);
        }
      }
      expect(cutEnd).toBeCloseTo(getStripDimensions(whole).width / unit, 8);
    }
  });

  it('uses independent nominal Kodak 120 tracks for every medium-format gate', () => {
    for (const format of ['645', '66', '67', '69'] as const) {
      const marks = film120Marks({ ...formatLayout(format), frameCount: 6 }, getFilmStock('ektar-100'));
      expectPitch(marks.filter(m => m.rail === 'top' && /^\d+$/.test(m.text ?? '')).map(m => m.x), 45.5);
      expectPitch(marks.filter(m => m.rail === 'bottom' && m.text).map(m => m.x), 728 / 12);
    }
  });

  it('uses Fujichrome single-edge indices instead of Kodak dual numbering', () => {
    for (const id of ['provia-100', 'velvia-50', 'velvia-100'] as const) {
      const marks = film120Marks({ ...formatLayout('69'), frameCount: 3 }, getFilmStock(id));
      expect(marks.every(m => m.rail === 'top')).toBe(true);
      const numbers = marks.filter(m => /^\d+$/.test(m.text ?? ''));
      expect(numbers[0].text).toBe('1');
      expectPitch(numbers.map(m => m.x), 43);
    }
  });

  it('never wraps 120 indices back to the beginning on extended simulated rolls', () => {
    const layout = { ...formatLayout('66'), frameCount: 3, filmLengthOffset: 740 * unit };
    const marks = film120Marks(layout, getFilmStock('portra-400')).filter(m => m.x >= 0);
    expect(marks.some(m => m.text === '41' || m.text === '1')).toBe(false);
    expect(marks.some(m => m.text === '58')).toBe(true);
  });
});
