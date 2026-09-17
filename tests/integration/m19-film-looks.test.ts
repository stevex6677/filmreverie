import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import * as THREE from 'three';
import { FILM_STOCKS } from '../../src/data/filmStocks';
import { FILM_LOOKS, clampFilmStrength, filmGrainSeed } from '../../src/data/filmLooks';
import { FILM_FORMATS, FILM_UNIT } from '../../src/data/filmFormats';
import { createInitialViewerState, viewerReducer } from '../../src/state/viewerState';
import { createFilmShaderMaterial } from '../../src/shaders/filmShader';
import { applyFilmLookPerceptualPixel, applyFilmLookToBuffer, updateFilmLook } from '../../src/shaders/filmLook';
import { RollRepository, RollBundle } from '../../src/storage/rollRepository';
import { createRuntimeRoll } from '../../src/storage/rollRuntime';
import { BASELINE_ROLL, createRollLayout } from '../../src/utils/rollLayout';

function bundle(id: string, strength?: number): RollBundle {
  return { roll: { id, name: id, filmStrength: strength, stockId: 'ektar-100', format: '135', frameIds: [id], coverId: id, createdAt: 1, updatedAt: 1, trashedAt: null },
    frames: [{ id, rollId: id, filename: 'photo.png', mime: 'image/png', width: 600, height: 400, rotation: 0, hash: id, originalKey: id+':original', viewingKey: id+':view', thumbnailKey: id+':thumb' }],
    blobs: ['original','view','thumb'].map(key => ({ key: id+':'+key, blob: new Blob([id+key]) })) };
}

describe('M19 live stock look and persistence', () => {
  it('defaults to midpoint, preserves zero, rejects nonfinite values and clamps bounds', () => {
    expect(createInitialViewerState().filmStrength).toBe(50);
    for (const [input, expected] of [[undefined,50],[NaN,50],[Infinity,50],[-2,0],[0,0],[1000,100],['0',50]] as const) expect(clampFilmStrength(input)).toBe(expected);
    let state = viewerReducer(createInitialViewerState('inspect'), {type:'SET_FILM_STRENGTH',strength:0});
    for (const stock of [...FILM_STOCKS,...FILM_STOCKS]) {
      state = viewerReducer(state,{type:'SET_FILM_STOCK',stockId:stock.id});
      state = viewerReducer(state,{type:'SET_FILM_MODE',mode:'positive'});
      expect(state.filmStrength).toBe(0);
    }
    for (const type of ['FIT_VIEW','RESET_TABLE_VIEW','SHOW_OVERVIEW'] as const) expect(viewerReducer(state,{type}).filmStrength).toBe(0);
    expect(viewerReducer(state,{type:'RESET'}).filmStrength).toBe(50);
  });

  it('updates the existing material without replacing the texture, mask, lighting or shader', () => {
    const texture = new THREE.Texture(), material = createFilmShaderMaterial(texture,true,.6);
    const shader = material.fragmentShader, mask = material.uniforms.uOrangeMask.value.clone(), light = material.uniforms.uTableOutput.value;
    for (const stock of FILM_STOCKS) for (const strength of [0,50,100]) {
      const state = viewerReducer(viewerReducer(createInitialViewerState(),{type:'SET_FILM_STOCK',stockId:stock.id}),{type:'SET_FILM_STRENGTH',strength});
      updateFilmLook(material,state.filmStockId,state.filmStrength);
      expect(material.uniforms.uFilmStrength.value).toBe(strength/50);
      expect(material.uniforms.uFilmTone.value.toArray().every(Number.isFinite)).toBe(true);
      expect(material.uniforms.uTexture.value).toBe(texture);
      expect(material.uniforms.uOrangeMask.value).toEqual(mask);
      expect(material.uniforms.uTableOutput.value).toBe(light);
      expect(material.fragmentShader).toBe(shader);
      expect(material.version).toBe(0);
    }
    material.dispose(); texture.dispose();
  });

  it('round trips zero and stock through IndexedDB, runtime loading, edits and another roll without changing original bytes', async () => {
    const repo = new RollRepository(new IDBFactory());
    await repo.save(bundle('zero',0)); await repo.save(bundle('strong',100)); await repo.save(bundle('legacy'));
    let state = createInitialViewerState();
    for (const [id, expected] of [['zero',0],['strong',100],['legacy',50],['zero',0]] as const) {
      const data = await repo.read(id), runtime = createRuntimeRoll(data);
      try {
        state = viewerReducer(state,{type:'LOAD_ROLL',roll:runtime.definition,stockId:data.roll.stockId,filmStrength:data.roll.filmStrength});
        expect(state.filmStrength).toBe(expected); expect(state.filmStockId).toBe('ektar-100');
      } finally { runtime.dispose(); }
    }
    const edited = await repo.read('zero');
    await repo.save({...edited, roll:{...edited.roll,name:'Edited',format:'66'},blobs:[]});
    expect((await repo.read('zero')).roll.filmStrength).toBe(0);
    expect(await (await repo.original('zero')).text()).toBe('zerooriginal');
    expect(viewerReducer(state,{type:'LOAD_ROLL',roll:BASELINE_ROLL,filmStrength:NaN}).filmStrength).toBe(50);
  });

  it('uses film millimeters across every format and a stable frame seed independent of detail resolution', () => {
    for (const format of Object.keys(FILM_FORMATS) as (keyof typeof FILM_FORMATS)[]) {
      const data = bundle(format); data.roll.format = format;
      const runtime = createRuntimeRoll(data), texture = new THREE.Texture(), material = createFilmShaderMaterial(texture,true);
      try {
        const layout = createRollLayout(runtime.definition)[0].layout;
        updateFilmLook(material,'portra-800',100,layout.frameWidth/FILM_UNIT,layout.frameHeight/FILM_UNIT,filmGrainSeed(data.frames[0].id));
        expect(material.uniforms.uFilmSizeMm.value.x).toBeCloseTo(FILM_FORMATS[format].width);
        expect(material.uniforms.uFilmSizeMm.value.y).toBeCloseTo(FILM_FORMATS[format].height);
        expect(material.uniforms.uFilmSeed.value).toBe(filmGrainSeed(data.frames[0].id));
      } finally { runtime.dispose(); material.dispose(); texture.dispose(); }
    }
    expect(filmGrainSeed('frame-1')).not.toBe(filmGrainSeed('frame-2'));
  });

  it('CPU counterpart applyFilmLookPerceptualPixel matches profile parameters and preserves exact identity at 0 strength', () => {
    for (const stock of FILM_STOCKS) {
      const look = FILM_LOOKS[stock.id];
      // At strength 0, exact bypass
      const original = [0.3, 0.5, 0.7] as const;
      const zeroResult = applyFilmLookPerceptualPixel(original[0], original[1], original[2], 0.5, 0.5, look, 0);
      expect(zeroResult).toEqual([original[0], original[1], original[2]]);

      // Bounded output at strength 50 and 100
      for (const strength of [50, 100]) {
        for (const [r, g, b] of [[0, 0, 0], [0.1, 0.1, 0.1], [0.5, 0.5, 0.5], [0.9, 0.9, 0.9], [1, 1, 1], [0.8, 0.2, 0.1], [0.1, 0.7, 0.3]]) {
          const res = applyFilmLookPerceptualPixel(r, g, b, 0.5, 0.5, look, strength, 36, 24, 42);
          expect(res.every(v => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
        }
      }
    }

    // Relative stock differentiation: Ektar 100 has higher saturation boost than Ektachrome E100
    const vividBlue = [0.2, 0.4, 0.8] as const;
    const ektarBlue = applyFilmLookPerceptualPixel(vividBlue[0], vividBlue[1], vividBlue[2], 0.5, 0.5, FILM_LOOKS['ektar-100'], 50, 36, 24, 0, 0);
    const ektachromeBlue = applyFilmLookPerceptualPixel(vividBlue[0], vividBlue[1], vividBlue[2], 0.5, 0.5, FILM_LOOKS['ektachrome-e100'], 50, 36, 24, 0, 0);
    // Chroma spread (max - min) reflects saturation
    const ektarSpread = Math.max(...ektarBlue) - Math.min(...ektarBlue);
    const ektachromeSpread = Math.max(...ektachromeBlue) - Math.min(...ektachromeBlue);
    expect(ektarSpread).toBeGreaterThan(ektachromeSpread);

    // Portra 160 vs Portra 400 tonal softness
    const midTone = 0.5;
    const p160 = applyFilmLookPerceptualPixel(midTone, midTone, midTone, 0.5, 0.5, FILM_LOOKS['portra-160'], 50, 36, 24, 0, 0);
    const p400 = applyFilmLookPerceptualPixel(midTone, midTone, midTone, 0.5, 0.5, FILM_LOOKS['portra-400'], 50, 36, 24, 0, 0);
    expect(Math.abs(p160[0] - p400[0])).toBeLessThan(0.05); // Close tone relationship as requested
  });

  it('applyFilmLookToBuffer processes whole buffers and clamps to valid Uint8 values', () => {
    const buffer = new Uint8ClampedArray([
      100, 150, 200, 255,
      10, 20, 30, 255,
      240, 245, 250, 255,
      128, 128, 128, 255,
    ]);
    const originalCopy = new Uint8ClampedArray(buffer);
    const imgData = { data: buffer };

    // Strength 0 does not mutate buffer
    applyFilmLookToBuffer(imgData, 2, 2, FILM_LOOKS['portra-400'], 0);
    expect(Array.from(imgData.data)).toEqual(Array.from(originalCopy));

    // Strength 50 applies filter and clamps within [0, 255]
    applyFilmLookToBuffer(imgData, 2, 2, FILM_LOOKS['portra-400'], 50);
    for (let i = 0; i < imgData.data.length; i++) {
      expect(imgData.data[i]).toBeGreaterThanOrEqual(0);
      expect(imgData.data[i]).toBeLessThanOrEqual(255);
      expect(Number.isInteger(imgData.data[i])).toBe(true);
    }
  });
});

