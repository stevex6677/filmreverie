import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  DEFAULT_LAYOUT,
  PERFORATIONS_PER_FRAME,
  SPROCKET_WIDTH,
  SPROCKET_HEIGHT,
  getStripDimensions,
  getPerforationPositions,
} from "../../src/utils/loupeMapping";
import {
  FILM_EXPOSURE,
  FILM_ORANGE_MASK,
  createFilmShaderMaterial,
} from "../../src/shaders/filmShader";
import { createLoupeShaderMaterial } from "../../src/shaders/loupeShader";

describe("M3 Integration — Film Realism, Perforation Geometry & Shader Synchronization", () => {
  describe("35mm Film Geometry & Proportions", () => {
    it("conforms to standard 35mm 3:2 frame aspect ratio", () => {
      const ratio = DEFAULT_LAYOUT.frameWidth / DEFAULT_LAYOUT.frameHeight;
      expect(ratio).toBeCloseTo(1.5, 4); // 3:2 ratio
      expect(DEFAULT_LAYOUT.frameCount).toBe(5);
    });

    it("defines authentic dimensions for the 5-frame film strip", () => {
      const { width, height } = getStripDimensions(DEFAULT_LAYOUT);
      expect(width).toBeGreaterThan(2.5);
      expect(width).toBeLessThan(3.5);
      expect(height).toBeGreaterThan(0.4);
      expect(height).toBeLessThan(0.6);
    });
  });

  describe("Sprocket Perforation Geometry (8 per frame along each edge)", () => {
    it("has exactly 8 perforations per frame along each edge", () => {
      expect(PERFORATIONS_PER_FRAME).toBe(8);
    });

    it("perforates the whole strip, including margins, at 4.75 mm pitch", () => {
      const { top, bottom } = getPerforationPositions(DEFAULT_LAYOUT);
      expect(top).toHaveLength(42);
      expect(bottom).toHaveLength(top.length);
      for (let i = 1; i < top.length; i++) {
        expect((top[i].x - top[i - 1].x) / (.55 / 36)).toBeCloseTo(4.75, 10);
        expect(bottom[i].x).toBe(top[i].x);
      }
    });

    it("does not stretch perforations to fit a panoramic image gate", () => {
      const layout = { ...DEFAULT_LAYOUT, frameCount: 1, frameWidth: 65 * (.55 / 36) };
      const { top } = getPerforationPositions(layout);
      expect(top.filter(p => p.frameIndex === 0).length).toBeGreaterThan(8);
      for (let i = 1; i < top.length; i++) {
        expect((top[i].x - top[i - 1].x) / (.55 / 36)).toBeCloseTo(4.75, 10);
      }
    });

    it("places all perforations within film strip bounds and along outer margins", () => {
      const { width, height } = getStripDimensions(DEFAULT_LAYOUT);
      const { top, bottom } = getPerforationPositions(DEFAULT_LAYOUT);

      const halfW = width / 2;
      const halfH = height / 2;

      for (const p of [...top, ...bottom]) {
        expect(p.x).toBeGreaterThan(-halfW);
        expect(p.x).toBeLessThan(halfW);
      }

      // Top perforations lie in upper margin
      for (const p of top) {
        expect(p.y).toBeGreaterThan(DEFAULT_LAYOUT.frameHeight / 2);
        expect(p.y).toBeLessThan(halfH);
      }

      // Bottom perforations lie in lower margin
      for (const p of bottom) {
        expect(p.y).toBeLessThan(-DEFAULT_LAYOUT.frameHeight / 2);
        expect(p.y).toBeGreaterThan(-halfH);
      }
    });

    it("maintains realistic rectangular sprocket proportions (KS-1870 / ISO 1007)", () => {
      expect(SPROCKET_WIDTH).toBeGreaterThan(0.025);
      expect(SPROCKET_WIDTH).toBeLessThan(0.035);
      expect(SPROCKET_HEIGHT).toBeGreaterThan(0.035);
      expect(SPROCKET_HEIGHT).toBeLessThan(0.05);
      // Authentic 35mm perforations are taller (transverse 2.794mm) than they are wide (longitudinal 1.981mm)
      expect(SPROCKET_HEIGHT).toBeGreaterThan(SPROCKET_WIDTH);
    });
  });

  describe("Shader Material & Parameter Synchronization", () => {
    // Create dummy texture for testing
    const dummyTexture = new THREE.Texture();

    it("synchronizes negative mode orange mask and exposure between film strip and loupe", () => {
      const filmMat = createFilmShaderMaterial(dummyTexture, false);
      const loupeMat = createLoupeShaderMaterial(dummyTexture, false, [0.5, 0.5]);

      expect(filmMat.uniforms.uOrangeMask.value).toEqual(FILM_ORANGE_MASK);
      expect(loupeMat.uniforms.uOrangeMask.value).toEqual(FILM_ORANGE_MASK);

      expect(filmMat.uniforms.uExposure.value).toBe(FILM_EXPOSURE);
      expect(loupeMat.uniforms.uExposure.value).toBe(FILM_EXPOSURE);

      // Mode transition: 0.0 in negative mode
      expect(filmMat.uniforms.uModeTransition.value).toBe(0.0);
      expect(loupeMat.uniforms.uModeTransition.value).toBe(0.0);
    });

    it("synchronizes positive mode transition across film strip and loupe", () => {
      const filmMat = createFilmShaderMaterial(dummyTexture, true);
      const loupeMat = createLoupeShaderMaterial(dummyTexture, true, [0.5, 0.5]);

      expect(filmMat.uniforms.uModeTransition.value).toBe(1.0);
      expect(loupeMat.uniforms.uModeTransition.value).toBe(1.0);
    });

    it("initializes loupe center UV and magnification correctly", () => {
      const loupeMat = createLoupeShaderMaterial(dummyTexture, true, [0.42, 0.75]);
      expect(loupeMat.uniforms.uCenterUv.value.x).toBeCloseTo(0.42, 5);
      expect(loupeMat.uniforms.uCenterUv.value.y).toBeCloseTo(0.75, 5);
      expect(loupeMat.uniforms.uMagnification.value).toBeCloseTo(2.5, 5);
    });

    it("verifies orange base mask tone has strong R > B separation for authentic negative response", () => {
      expect(FILM_ORANGE_MASK.r).toBeGreaterThan(FILM_ORANGE_MASK.b + 0.5);
      expect(FILM_ORANGE_MASK.r).toBeGreaterThan(FILM_ORANGE_MASK.g);
    });

    it("initializes uActive to 0.0 when resting and 1.0 when active", () => {
      const restingMat = createLoupeShaderMaterial(dummyTexture, false, [0.5, 0.5], false);
      expect(restingMat.uniforms.uActive.value).toBe(0.0);

      const activeMat = createLoupeShaderMaterial(dummyTexture, false, [0.5, 0.5], true);
      expect(activeMat.uniforms.uActive.value).toBe(1.0);
    });
  });
});
