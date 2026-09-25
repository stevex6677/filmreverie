// Keep labels near their projected cameras, resolving horizontal collisions in
// one row. If their actual text widths cannot fit, hide the whole row.
export function cameraLabelRow(centers: number[], widths: number[], viewport: number): number[] | null {
  const margin = 16, gap = 8;
  if (widths.length !== centers.length || widths.some(width => width <= 0)
    || widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1) > viewport - margin * 2) return null;
  const left: number[] = [];
  for (let i = 0; i < centers.length; i++) {
    left[i] = Math.max(centers[i] - widths[i] / 2, i ? left[i - 1] + widths[i - 1] + gap : margin);
  }
  left[left.length - 1] = Math.min(left.at(-1)!, viewport - margin - widths.at(-1)!);
  for (let i = left.length - 2; i >= 0; i--) left[i] = Math.min(left[i], left[i + 1] - gap - widths[i]);
  return left.map((x, i) => x + widths[i] / 2);
}
