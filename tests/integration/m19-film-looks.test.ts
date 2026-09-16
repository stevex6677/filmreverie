import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import * as THREE from 'three';
import { FILM_STOCKS } from '../../src/data/filmStocks';
import { clampFilmStrength, filmGrainSeed } from '../../src/data/filmLooks';
import { FILM_FORMATS, FILM_UNIT } from '../../src/data/filmFormats';
import { createInitialViewerState, viewerReducer } from '../../src/state/viewerState';
import { createFilmShaderMaterial } from '../../src/shaders/filmShader';
import { updateFilmLook } from '../../src/shaders/filmLook';
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
});
