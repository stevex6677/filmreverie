import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createCanvas } from "@napi-rs/canvas";
import * as THREE from "three";
import { FILM_STOCKS, DEFAULT_FILM_STOCK_ID, getFilmStock, FilmStockId } from "../../src/data/filmStocks";
import { createInitialViewerState, viewerReducer } from "../../src/state/viewerState";
import { TableControls } from "../../src/components/TableControls";
import { createFilmRebateCanvas } from "../../src/utils/filmRebateCanvas";
import { createFilmShaderMaterial } from "../../src/shaders/filmShader";
import { DEFAULT_LAYOUT, getFrameCenter, getStripDimensions } from "../../src/utils/loupeMapping";

function raster(id: FilmStockId) {
  return createFilmRebateCanvas(getFilmStock(id), DEFAULT_LAYOUT, 3072, 468,
    () => createCanvas(3072, 468) as unknown as HTMLCanvasElement);
}
function pixel(canvas: HTMLCanvasElement, x: number, y: number) {
  return Array.from(canvas.getContext("2d")!.getImageData(Math.round(x), Math.round(y), 1, 1).data);
}

describe("M9 — whole-strip stock profiles, state, material and real rebate raster", () => {
  it("resolves all eight unique local profiles and their provenance without bundled reference photographs", () => {
    expect(new Set(FILM_STOCKS.map((s) => s.id)).size).toBe(8);
    const provenance = JSON.parse(fs.readFileSync("public/assets/provenance.json", "utf8"));
    for (const stock of FILM_STOCKS) {
      const entry = provenance.filmStocks.find((item: {id: string}) => item.id === stock.id);
      const profile = JSON.parse(fs.readFileSync(path.join("public", entry.runtimeUrl), "utf8"));
      expect(profile).toEqual(stock);
      expect(stock.reference.edition).toContain("135");
      expect(stock.reference.url).toMatch(/^https:/);
      expect(stock.reference.limitations).toContain("omitted");
      expect(stock.rebate.codePattern).toBeNull();
      expect(stock.base.negativeMask).toHaveLength(3);
      expect(stock.base.negativeMask.every((v) => v >= 0 && v <= 1)).toBe(true);
    }
    expect(fs.readdirSync("public/assets/film-stocks").filter((name) => /\.(jpg|png|webp)$/.test(name))).toEqual([]);
  });

  it("defaults to Portra 400 in positive view and shows the current stock without a selector", () => {
    const state = createInitialViewerState();
    expect(state.filmStockId).toBe(DEFAULT_FILM_STOCK_ID);
    expect(state.filmMode).toBe("positive");
    const html = renderToStaticMarkup(React.createElement(TableControls, {state, dispatch: () => {}, onOpenLibrary: () => {}, onOpenRoom: () => {}, onOpenTable: () => {}, onOpenCameras: () => {}, sheet: 'tools', setSheet: () => {}}));
    expect(html).toContain('Kodak Portra 400');
    expect(html).not.toContain('<select');
  });

  it("handles every stock pair in both source views and enforces reversal restrictions", () => {
    for (const from of FILM_STOCKS) for (const to of FILM_STOCKS) for (const mode of from.allowedViews) {
      let state = viewerReducer(createInitialViewerState(), {type: "SET_FILM_STOCK", stockId: from.id});
      state = viewerReducer(state, {type: "SET_FILM_MODE", mode});
      state = viewerReducer(state, {type: "SET_FILM_STOCK", stockId: to.id});
      const expected = to.type === "reversal" ? "positive" : from.type === "reversal" ? "positive" : mode;
      expect(state.filmMode, `${from.id}/${mode} -> ${to.id}`).toBe(expected);
      if (to.type === "reversal") {
        expect(viewerReducer(state, {type: "TOGGLE_FILM_MODE"})).toBe(state);
        expect(viewerReducer(state, {type: "SET_FILM_MODE", mode: "negative"})).toBe(state);
        const html = renderToStaticMarkup(React.createElement(TableControls, {state, dispatch: () => {}, onOpenLibrary: () => {}, onOpenRoom: () => {}, onOpenTable: () => {}, onOpenCameras: () => {}, sheet: 'tools', setSheet: () => {}}));
        expect(html).not.toContain('id="mode-toggle"');
        expect(html).toContain('POSITIVE · E-6');
        expect(html).not.toMatch(/NEGATIVE|Switch to Negative/);
      }
    }
  });

  it("keeps navigation, selected frame, loupe and brightness unchanged during rapid stock changes", () => {
    let state = createInitialViewerState("room");
    state = viewerReducer(state, {type: "UPDATE_ROOM_POSE", pose: {yaw: 0.35}});
    state = viewerReducer(state, {type: "APPROACH_TABLE"});
    state = viewerReducer(state, {type: "SET_TRANSITIONING", isTransitioning: false});
    state = viewerReducer(state, {type: "SELECT_FRAME", frameIndex: 3});
    state = viewerReducer(state, {type: "SET_LOUPE_POSITION", x: 0.25, y: 0.1});
    state = viewerReducer(state, {type: "SET_LOUPE_ACTIVE", active: true});
    state = viewerReducer(state, {type: "SET_LOUPE_MAGNIFICATION", magnification: 8});
    state = viewerReducer(state, {type: "SET_TABLE_BRIGHTNESS", brightness: 0.43});
    state = viewerReducer(state, {type: "SET_TABLE_ZOOM", zoom: 0.7});
    state = viewerReducer(state, {type: "SET_TABLE_PAN", x: 0.3, z: -0.2});
    const {filmStockId: _stock, filmMode: _mode, ...before} = state;
    for (let i = 0; i < 3; i++) for (const stock of FILM_STOCKS) {
      state = viewerReducer(state, {type: "SET_FILM_STOCK", stockId: stock.id});
      const {filmStockId: _nextStock, filmMode: _nextMode, ...after} = state;
      expect(after).toEqual(before);
    }
    expect(state.filmStockId).toBe("velvia-100");
    expect(viewerReducer(state, {type: "RESET"}).filmStockId).toBe(DEFAULT_FILM_STOCK_ID);
  });

  it("renders distinct stock identities with clear photo apertures and contrasting ink on all five frames", () => {
    const signatures = new Set<string>();
    const {width} = getStripDimensions(DEFAULT_LAYOUT);
    for (const stock of FILM_STOCKS) {
      const canvas = raster(stock.id);
      const ctx = canvas.getContext("2d")!;
      signatures.add(Buffer.from(ctx.getImageData(0, 0, 3072, 468).data).toString("base64"));
      for (let i = 0; i < 5; i++) {
        const x = (getFrameCenter(i, DEFAULT_LAYOUT).x + width / 2) / width * 3072;
        expect(pixel(canvas, x, 234)[3]).toBe(0);
        const left = x - DEFAULT_LAYOUT.frameWidth / width * 3072 / 2;
        const rail = ctx.getImageData(Math.round(left + 95), 3, 240, 20).data;
        const base = pixel(canvas, x, 25);
        let inkPixels = 0;
        for (let p = 0; p < rail.length; p += 4) {
          if (Math.abs(rail[p] - base[0]) > 30) inkPixels++;
        }
        expect(inkPixels, `${stock.id} frame ${i + 1} ink`).toBeGreaterThan(200);
        if (stock.type === "negative") expect(base[0]).toBeGreaterThan(base[2] + 70);
        else expect(Math.max(...base.slice(0, 3))).toBeLessThan(40);
      }
    }
    expect(signatures.size).toBe(8);
  });

  it("propagates the physical mask to photo materials at zero strength without grading positive images; base artwork remains reusable for whole-strip inversion", () => {
    const texture = new THREE.Texture();
    for (const stock of FILM_STOCKS) {
      const state = viewerReducer(createInitialViewerState(), {type: "SET_FILM_STOCK", stockId: stock.id});
      const negative = createFilmShaderMaterial(texture, state.filmMode === "positive", 1, new THREE.Color(...stock.base.negativeMask as [number, number, number]));
      const positive = createFilmShaderMaterial(texture, true, 1, new THREE.Color(...stock.base.negativeMask as [number, number, number]));
      expect(negative.uniforms.uOrangeMask.value.toArray()).toEqual(stock.base.negativeMask);
      expect(positive.uniforms.uFilmStrength.value).toBe(0);
      expect(positive.uniforms.uTexture.value).toBe(texture);
      expect(positive.uniforms.uModeTransition.value).toBe(1);
      const before = raster(state.filmStockId);
      const next = viewerReducer(state, {type: "SET_FILM_MODE", mode: "positive"});
      expect(pixel(raster(next.filmStockId), 640, 25)).toEqual(pixel(before, 640, 25));
      negative.dispose(); positive.dispose();
    }
    texture.dispose();
  });
});

it("combines every stock/view with fixed density and retained state at 30%, 60%, and 100%", () => {
  for (const stock of FILM_STOCKS) for (const mode of stock.allowedViews) {
    const mask = new THREE.Color(...stock.base.negativeMask as [number, number, number]);
    const texture = new THREE.Texture();
    let previous = 0;
    for (const brightness of [0.3, 0.6, 1]) {
      let state = viewerReducer(createInitialViewerState("inspect"), {type: "SET_TABLE_BRIGHTNESS", brightness});
      state = viewerReducer(state, {type: "SET_FILM_STOCK", stockId: stock.id});
      state = viewerReducer(state, {type: "SET_FILM_MODE", mode});
      const material = createFilmShaderMaterial(texture, state.filmMode === "positive", state.tableBrightness, mask);
      expect(state.tableBrightness).toBe(brightness);
      expect(state.filmStockId).toBe(stock.id);
      expect(material.uniforms.uExposure.value).toBe(1);
      expect(material.uniforms.uOrangeMask.value).toEqual(mask);
      expect(material.uniforms.uTableOutput.value).toBeGreaterThan(previous);
      previous = material.uniforms.uTableOutput.value;
      material.dispose();
    }
    texture.dispose();
  }
});
