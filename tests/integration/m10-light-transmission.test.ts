import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createFilmShaderMaterial, createPanelEdgeMaterial, createPanelMaterial, createRebateMaterial, FILM_ORANGE_MASK } from "../../src/shaders/filmShader";
import { createLoupeShaderMaterial } from "../../src/shaders/loupeShader";
import { captureLoupeScene, createLoupeRenderTarget, DISPLAY_EXPOSURE, filmTransmittance, getTableIllumination, updateTableIllumination } from "../../src/shaders/tableIllumination";
import { createInitialViewerState, viewerReducer } from "../../src/state/viewerState";

describe("M10 shared linear table illumination", () => {
  it("propagates a continuous bounded output to panel, rebate, photos, fallback lens and local spill", () => {
    const texture = new THREE.Texture();
    const materials = [createPanelMaterial(), createPanelEdgeMaterial(3.4, 1.6), createRebateMaterial(texture),
      createFilmShaderMaterial(texture, false), createFilmShaderMaterial(texture, true),
      createLoupeShaderMaterial(texture, false, [0.5, 0.5])];
    let previous = 0;
    for (let i = 30; i <= 100; i++) {
      const state = viewerReducer(createInitialViewerState("inspect"), { type: "SET_TABLE_BRIGHTNESS", brightness: i / 100 });
      const light = getTableIllumination(state.tableBrightness);
      expect(light.output).toBeGreaterThan(previous);
      expect(light.output).toBeLessThanOrEqual(2.4);
      expect(light.output - previous).toBeLessThan(i === 30 ? 0.22 : 0.05);
      expect(light.spillIntensity / light.output).toBeCloseTo(1.8);
      for (const material of materials) {
        updateTableIllumination(material, state.tableBrightness);
        expect(material.uniforms.uTableOutput.value).toBe(light.output);
        expect(material.uniforms.uSurfaceReflection.value).toBe(0.008);
      }
      previous = light.output;
    }
    expect(getTableIllumination(-10)).toEqual(getTableIllumination(0.3));
    expect(getTableIllumination(20)).toEqual(getTableIllumination(1));
    expect(Number.isFinite(getTableIllumination(NaN).output)).toBe(true);
    materials.forEach(m => m.dispose());
  });

  it.each([false, true])("keeps film density fixed in positive=%s while every transmitted channel rises", positive => {
    const material = createFilmShaderMaterial(new THREE.Texture(), positive);
    const source = new THREE.Color(0.3, 0.5, 0.7);
    const transmission = filmTransmittance(source, positive, material.uniforms.uOrangeMask.value);
    let previous = new THREE.Color(0, 0, 0);
    for (const brightness of [0.3, 0.6, 1]) {
      updateTableIllumination(material, brightness);
      expect(material.uniforms.uExposure.value).toBe(1);
      expect(material.uniforms.uOrangeMask.value).toEqual(FILM_ORANGE_MASK);
      expect(filmTransmittance(source, positive, material.uniforms.uOrangeMask.value)).toEqual(transmission);
      const radiance = transmission.clone().multiplyScalar(material.uniforms.uTableOutput.value).addScalar(material.uniforms.uSurfaceReflection.value);
      for (const channel of ["r", "g", "b"] as const) expect(radiance[channel]).toBeGreaterThan(previous[channel]);
      previous = radiance;
    }
    const low = new THREE.Color(0.02, 0.02, 0.02);
    const high = new THREE.Color(0.95, 0.95, 0.95);
    const dense = filmTransmittance(positive ? low : high, positive, FILM_ORANGE_MASK);
    const clear = filmTransmittance(positive ? high : low, positive, FILM_ORANGE_MASK);
    for (const channel of ["r", "g", "b"] as const) expect(dense[channel]).toBeLessThan(clear[channel]);
    material.dispose();
  });

  it("accepts base transmission without a stock catalog and shares film/lens optical code", () => {
    const base = new THREE.Color(0.7, 0.4, 0.2);
    const film = createFilmShaderMaterial(new THREE.Texture(), false, 0.6, base);
    expect(film.uniforms.uOrangeMask.value).toEqual(base);
    expect(film.uniforms.uOrangeMask.value).not.toBe(base);
    const lens = createLoupeShaderMaterial(new THREE.Texture(), false, [0.5, 0.5], true, 10, 0.6);
    expect(lens.uniforms.uTableOutput.value).toBe(film.uniforms.uTableOutput.value);
    const target = createLoupeRenderTarget();
    expect(target.texture.type).toBe(THREE.HalfFloatType);
    expect(target.texture.colorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(target.width).toBe(768);
    expect(target.width).toBeGreaterThan(1536 * (0.28 / 1.5) / 0.55);
    expect(film.toneMapped).toBe(true);
    expect(lens.toneMapped).toBe(true);
    expect(DISPLAY_EXPOSURE).toBe(1);
    target.dispose(); film.dispose(); lens.dispose();
  });

  it("preserves dimmer state through reset and room navigation, and defaults to 100% on reload", () => {
    for (const brightness of [0.3, 0.6, 1]) {
      let state = viewerReducer(createInitialViewerState("inspect"), { type: "SET_TABLE_BRIGHTNESS", brightness });
      state = viewerReducer(state, { type: "SET_TABLE_ZOOM", zoom: 0.32 });
      state = viewerReducer(state, { type: "RESET_TABLE_VIEW" });
      state = viewerReducer(state, { type: "RETURN_TO_ROOM" });
      state = viewerReducer(state, { type: "SET_TRANSITIONING", isTransitioning: false });
      state = viewerReducer(state, { type: "APPROACH_TABLE" });
      expect(state.tableBrightness).toBe(brightness);
    }
    expect(createInitialViewerState("inspect").tableBrightness).toBe(1);
  });
});


describe("M10 scene capture state isolation", () => {
  it.each([false, true])("restores renderer and loupe after capture, including failure=%s", fail => {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera();
    const loupe = new THREE.Group();
    const target = createLoupeRenderTarget();
    let activeTarget: THREE.WebGLRenderTarget | null = null;
    const renderer = {
      toneMapping: THREE.ACESFilmicToneMapping as THREE.ToneMapping,
      getRenderTarget: () => activeTarget,
      setRenderTarget: (value: THREE.WebGLRenderTarget | null) => { activeTarget = value; },
      render: () => {
        expect(loupe.visible).toBe(false);
        expect(activeTarget).toBe(target);
        expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
        if (fail) throw new Error("capture failure");
      },
    };
    const capture = () => captureLoupeScene(renderer, scene, camera, target, loupe);
    if (fail) expect(capture).toThrow("capture failure"); else capture();
    expect(activeTarget).toBeNull();
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(loupe.visible).toBe(true);
    target.dispose();
  });
});
