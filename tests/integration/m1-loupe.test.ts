import { describe, it, expect } from "vitest";
import {
  DEFAULT_LAYOUT,
  getFrameCenter,
  getFrameBounds,
  mapWorldPointToFrame,
  getLoupeSampleWindow,
  clampLoupeCenterUV,
  getStripDimensions,
  isPointOverStrip,
} from "../../src/utils/loupeMapping";

describe("M1 Integration — Loupe Coordinates & UV Clamping", () => {
  it("calculates accurate strip dimensions", () => {
    const { width, height } = getStripDimensions(DEFAULT_LAYOUT);
    expect(width).toBeGreaterThan(2.5);
    expect(height).toBeGreaterThan(0.4);
  });

  it("calculates sequential centers from left to right", () => {
    const centers = [0, 1, 2, 3, 4].map((i) => getFrameCenter(i, DEFAULT_LAYOUT));
    for (let i = 0; i < 4; i++) {
      expect(centers[i + 1].x).toBeGreaterThan(centers[i].x);
      expect(centers[i].y).toBe(0);
    }
    // Middle frame (index 2) should be centered at x = 0
    expect(centers[2].x).toBeCloseTo(0, 4);
  });

  it("maps point exactly at frame center to UV (0.5, 0.5)", () => {
    for (let i = 0; i < 5; i++) {
      const center = getFrameCenter(i, DEFAULT_LAYOUT);
      const mapped = mapWorldPointToFrame(center, DEFAULT_LAYOUT);
      expect(mapped.frameIndex).toBe(i);
      expect(mapped.localU).toBeCloseTo(0.5, 4);
      expect(mapped.localV).toBeCloseTo(0.5, 4);
      expect(mapped.clampedU).toBeCloseTo(0.5, 4);
      expect(mapped.clampedV).toBeCloseTo(0.5, 4);
      expect(mapped.isWithinFrame).toBe(true);
    }
  });

  it("clamps safely at frame boundaries and off-strip coordinates", () => {
    const frame0Bounds = getFrameBounds(0, DEFAULT_LAYOUT);

    // Left edge of frame 0
    const leftEdge = mapWorldPointToFrame({ x: frame0Bounds.minX, y: 0 }, DEFAULT_LAYOUT);
    expect(leftEdge.frameIndex).toBe(0);
    expect(leftEdge.clampedU).toBeCloseTo(0.0, 4);

    // Right edge of frame 0
    const rightEdge = mapWorldPointToFrame({ x: frame0Bounds.maxX, y: 0 }, DEFAULT_LAYOUT);
    expect(rightEdge.frameIndex).toBe(0);
    expect(rightEdge.clampedU).toBeCloseTo(1.0, 4);

    // Way out to the left (negative infinity direction)
    const farLeft = mapWorldPointToFrame({ x: -100, y: 0 }, DEFAULT_LAYOUT);
    expect(farLeft.frameIndex).toBe(0);
    expect(farLeft.clampedU).toBe(0);
    expect(farLeft.isWithinFrame).toBe(false);

    // Way out to the right (positive infinity direction)
    const farRight = mapWorldPointToFrame({ x: 100, y: 0 }, DEFAULT_LAYOUT);
    expect(farRight.frameIndex).toBe(4);
    expect(farRight.clampedU).toBe(1);
    expect(farRight.isWithinFrame).toBe(false);

    // Far above and below strip
    const farAbove = mapWorldPointToFrame({ x: 0, y: 50 }, DEFAULT_LAYOUT);
    expect(farAbove.clampedV).toBe(1);

    const farBelow = mapWorldPointToFrame({ x: 0, y: -50 }, DEFAULT_LAYOUT);
    expect(farBelow.clampedV).toBe(0);
  });

  it("calculates 2.5x magnification sampling window and clamps at edges", () => {
    // 2.5x magnification gives half-window of 0.5 / 2.5 = 0.2
    const centerWindow = getLoupeSampleWindow(0.5, 0.5, 2.5);
    expect(centerWindow.halfWindow).toBeCloseTo(0.2, 4);
    expect(centerWindow.minU).toBeCloseTo(0.3, 4);
    expect(centerWindow.maxU).toBeCloseTo(0.7, 4);
    expect(centerWindow.minV).toBeCloseTo(0.3, 4);
    expect(centerWindow.maxV).toBeCloseTo(0.7, 4);

    // At edge u = 0.05
    const edgeWindow = getLoupeSampleWindow(0.05, 0.95, 2.5);
    expect(edgeWindow.minU).toBe(0); // clamped at 0
    expect(edgeWindow.maxU).toBeCloseTo(0.25, 4);
    expect(edgeWindow.minV).toBeCloseTo(0.75, 4);
    expect(edgeWindow.maxV).toBe(1); // clamped at 1
  });

  it("clamps center UV so 2.5x magnified window stays within bounds", () => {
    const clampedCenter = clampLoupeCenterUV(0.05, 0.95, 2.5);
    expect(clampedCenter.u).toBeCloseTo(0.2, 4);
    expect(clampedCenter.v).toBeCloseTo(0.8, 4);
  });

  it("accurately detects whether loupe position is over the film strip", () => {
    // Resting position of loupe is (1.3, -0.42) on the light table
    const restingLoupePos = { x: 1.3, y: -0.42 };
    expect(isPointOverStrip(restingLoupePos, DEFAULT_LAYOUT)).toBe(false);

    // Light table background points off the film strip
    expect(isPointOverStrip({ x: 0, y: 0.5 }, DEFAULT_LAYOUT)).toBe(false);
    expect(isPointOverStrip({ x: 0, y: -0.5 }, DEFAULT_LAYOUT)).toBe(false);
    expect(isPointOverStrip({ x: 2.0, y: 0 }, DEFAULT_LAYOUT)).toBe(false);
    expect(isPointOverStrip({ x: -2.0, y: 0 }, DEFAULT_LAYOUT)).toBe(false);

    // Frame centers must all be over the film strip
    for (let i = 0; i < DEFAULT_LAYOUT.frameCount; i++) {
      const center = getFrameCenter(i, DEFAULT_LAYOUT);
      expect(isPointOverStrip(center, DEFAULT_LAYOUT)).toBe(true);
    }

    // Strip boundaries
    const { width, height } = getStripDimensions(DEFAULT_LAYOUT);
    expect(isPointOverStrip({ x: width / 2, y: height / 2 }, DEFAULT_LAYOUT)).toBe(true);
    expect(isPointOverStrip({ x: -width / 2, y: -height / 2 }, DEFAULT_LAYOUT)).toBe(true);
    expect(isPointOverStrip({ x: width / 2 + 0.01, y: 0 }, DEFAULT_LAYOUT)).toBe(false);
    expect(isPointOverStrip({ x: 0, y: height / 2 + 0.01 }, DEFAULT_LAYOUT)).toBe(false);
  });
});
