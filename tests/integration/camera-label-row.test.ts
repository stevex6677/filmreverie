import { expect, it } from 'vitest';
import { cameraLabelRow } from '../../src/utils/cameraLabelRow';

it('keeps five unevenly spaced nameplates in one non-overlapping tablet row', () => {
  const widths = [167, 167, 167, 167, 167];
  const row = cameraLabelRow([150, 338, 478, 645, 833], widths, 1024)!;
  expect(row).toHaveLength(5);
  expect(row[0] - widths[0] / 2).toBeGreaterThanOrEqual(16);
  expect(row[4] + widths[4] / 2).toBeLessThanOrEqual(1008);
  for (let i = 1; i < row.length; i++) expect(row[i] - row[i - 1]).toBeGreaterThanOrEqual(175);
});

it('hides the entire row when its measured widths cannot fit', () => {
  expect(cameraLabelRow([100, 200, 300, 400, 500], Array(5).fill(167), 768)).toBeNull();
  expect(cameraLabelRow([100, 300], [0, 0], 1024)).toBeNull();
  expect(cameraLabelRow([100, 300], [167], 1024)).toBeNull();
  expect(cameraLabelRow([100, 300], [600, 600], 1024)).toBeNull();
});
