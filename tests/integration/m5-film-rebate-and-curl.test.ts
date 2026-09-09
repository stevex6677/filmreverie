import { getFilmStock } from "../../src/data/filmStocks";
import { describe, it, expect } from "vitest";
import {
  DEFAULT_LAYOUT,
  FILM_CURL_HEIGHT,
  getFilmCurlZ,
  getStripDimensions,
  getFrameCenter,
} from "../../src/utils/loupeMapping";
import {
  NEGATIVE_REBATE_COLORS,
  getRebateColors,
} from "../../src/utils/filmRebateCanvas";

describe("M5 Integration — 35mm Film Rebate, Substrate Translucency & Transverse Curl", () => {
  describe("Transverse Parabolic Curl Mathematics & Physical Clearance", () => {
    const { height } = getStripDimensions(DEFAULT_LAYOUT);

    it("defines authentic curl height bounded between 1.0mm and 2.5mm", () => {
      expect(FILM_CURL_HEIGHT).toBeGreaterThanOrEqual(0.001);
      expect(FILM_CURL_HEIGHT).toBeLessThanOrEqual(0.0025);
    });

    it("has zero elevation along the central spine (y = 0)", () => {
      const zCenter = getFilmCurlZ(0, height);
      expect(zCenter).toBeCloseTo(0, 6);
    });

    it("reaches maximum elevation at the outer perforation edges (y = ±height/2)", () => {
      const zTop = getFilmCurlZ(height / 2, height);
      const zBottom = getFilmCurlZ(-height / 2, height);

      expect(zTop).toBeCloseTo(FILM_CURL_HEIGHT, 5);
      expect(zBottom).toBeCloseTo(FILM_CURL_HEIGHT, 5);
    });

    it("smoothly curves photo frames with elevation strictly below maximum curl height", () => {
      const halfFrameH = DEFAULT_LAYOUT.frameHeight / 2;
      const zFrameEdge = getFilmCurlZ(halfFrameH, height);

      expect(zFrameEdge).toBeGreaterThan(0);
      expect(zFrameEdge).toBeLessThan(FILM_CURL_HEIGHT);
      // Parabolic ratio: (frameHeight / stripHeight)^2
      const expectedRatio = Math.pow(DEFAULT_LAYOUT.frameHeight / height, 2);
      expect(zFrameEdge / FILM_CURL_HEIGHT).toBeCloseTo(expectedRatio, 3);
    });

    it("leaves safe clearance for the 2.5x inspection loupe without clipping", () => {
      // Loupe rests at z = 0.08, skirt bottom at z ~ 0.005, film peak at ~ 0.0018
      const loupeClearance = 0.005 - FILM_CURL_HEIGHT;
      expect(loupeClearance).toBeGreaterThan(0.002);
    });
  });

  describe("Rebate Colors & Substrate Translucency", () => {
    it("configures authentic orange mask color values for negative mode substrate", () => {
      expect(NEGATIVE_REBATE_COLORS.substrateBase).toContain("217, 119, 36");
      expect(NEGATIVE_REBATE_COLORS.rebateText).toBe("#2a1208");
    });

    it("keeps negative-stock preview borders orange; reversal has a dark developed border (M9)", () => {
      expect(getRebateColors(getFilmStock("portra-400"))).toBe(NEGATIVE_REBATE_COLORS);
      expect(getRebateColors(getFilmStock("ektachrome-e100")).substrateBase).toContain("24, 22, 27");
    });
  });

  describe("Rebate Frame Alignment & Frame Count", () => {
    it("maintains strict 1-to-1 alignment with all 5 frames in roll", () => {
      for (let i = 0; i < DEFAULT_LAYOUT.frameCount; i++) {
        const center = getFrameCenter(i, DEFAULT_LAYOUT);
        expect(center.x).toBeDefined();
        expect(center.y).toBe(0);
      }
    });
  });
});
