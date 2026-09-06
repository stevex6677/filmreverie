import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ROLL_MANIFEST, ROLL_FRAMES } from "../../src/data/rollManifest";

describe("M1 Integration — Roll Manifest & Derivatives", () => {
  it("contains exactly five unique frames in ascending order", () => {
    expect(ROLL_MANIFEST.framesCount).toBe(5);
    expect(ROLL_FRAMES).toHaveLength(5);

    const orders = ROLL_FRAMES.map((f) => f.order);
    expect(orders).toEqual([1, 2, 3, 4, 5]);

    const ids = ROLL_FRAMES.map((f) => f.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(5);
  });

  it("has the expected photo sequence", () => {
    expect(ROLL_FRAMES[0].id).toBe("frame-01-harbor");
    expect(ROLL_FRAMES[1].id).toBe("frame-02-diner");
    expect(ROLL_FRAMES[2].id).toBe("frame-03-bicycle");
    expect(ROLL_FRAMES[3].id).toBe("frame-04-laundromat");
    expect(ROLL_FRAMES[4].id).toBe("frame-05-road");
  });

  it("verifies all derived local asset files exist and are non-empty", () => {
    for (const frame of ROLL_FRAMES) {
      // Relative to public folder
      const relativePath = frame.src.replace(/^\//, "");
      const fullPath = path.resolve(process.cwd(), "public", relativePath);
      expect(fs.existsSync(fullPath), `Derived file should exist: ${fullPath}`).toBe(true);

      const stats = fs.statSync(fullPath);
      expect(stats.size).toBeGreaterThan(100 * 1024); // at least 100KB
    }
  });

  it("verifies original PNG masters exist and are preserved", () => {
    const masterFiles = [
      "frame-01-harbor.png",
      "frame-02-diner.png",
      "frame-03-bicycle.png",
      "frame-04-laundromat.png",
      "frame-05-road.png",
    ];

    for (const filename of masterFiles) {
      const fullPath = path.resolve(process.cwd(), "photos", "roll-01", filename);
      expect(fs.existsSync(fullPath), `Master file should exist: ${fullPath}`).toBe(true);
      const stats = fs.statSync(fullPath);
      expect(stats.size).toBeGreaterThan(1024 * 1024); // master PNGs are > 2MB
    }
  });

  it("verifies metadata on each frame", () => {
    for (const frame of ROLL_FRAMES) {
      expect(frame.title).toBeTruthy();
      expect(frame.alt).toBeTruthy();
      expect(frame.aspectRatio).toBeCloseTo(1.5, 2);
    }
  });
});
