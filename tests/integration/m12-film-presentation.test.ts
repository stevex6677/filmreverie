import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import * as THREE from 'three';
import { photoCropScale } from '../../src/utils/photoFraming';
import { film120Marks } from '../../src/utils/film120Rebate';
import { createFilmRebateCanvas } from '../../src/utils/filmRebateCanvas';
import { createRebateMaterial } from '../../src/shaders/filmShader';
import { FILM_STOCKS, getFilmStock } from '../../src/data/filmStocks';
import { FILM_FORMATS, formatLayout } from '../../src/data/filmFormats';
import { getStripDimensions } from '../../src/utils/loupeMapping';

describe('M12 review: crop and complete strip presentation', () => {
  it('covers every gate at every quarter rotation without padding or stretching', () => {
    for (const aspect of [.3, .67, 1, 1.5, 3]) for (const format of Object.values(FILM_FORMATS)) for (const rotation of [0,90,180,270]) {
      const gate = format.width / format.height, scale = photoCropScale(aspect, gate, rotation);
      const oriented = rotation % 180 ? 1 / aspect : aspect;
      expect(Math.max(scale.x, scale.y)).toBe(1);
      expect(oriented * scale.x / scale.y).toBeCloseTo(gate, 8);
      for (const x of [-.5,.5]) for (const y of [-.5,.5]) {
        const a = rotation * Math.PI / 180;
        const u = Math.cos(a)*x*scale.x-Math.sin(a)*y*scale.y+.5;
        const v = Math.sin(a)*x*scale.x+Math.cos(a)*y*scale.y+.5;
        expect(u).toBeGreaterThanOrEqual(-1e-10); expect(u).toBeLessThanOrEqual(1+1e-10);
        expect(v).toBeGreaterThanOrEqual(-1e-10); expect(v).toBeLessThanOrEqual(1+1e-10);
      }
    }
  });
  it('switches the complete negative rebate and leaves E100 positive', () => {
    for (const stock of FILM_STOCKS) {
      const texture = new THREE.Texture();
      const negative = createRebateMaterial(texture, 1, false, stock.type === 'negative');
      const positive = createRebateMaterial(texture, 1, true, stock.type === 'negative');
      expect(negative.uniforms.uModeTransition.value).toBe(0);
      expect(positive.uniforms.uModeTransition.value).toBe(stock.type === 'negative' ? 1 : 0);
      negative.dispose(); positive.dispose(); texture.dispose();
    }
  });
  it('continues independent 120 factory tracks across cuts and keeps ink out of gates', () => {
    const stock = getFilmStock('ektar-100');
    const first = {...formatLayout('66'), frameCount:3, frameNumberOffset:0};
    const next = {...first, frameNumberOffset:3};
    const a = film120Marks(first,stock), b = film120Marks(next,stock);
    expect(a.filter(m=>m.rail==='top' && /^\d+$/.test(m.text??'')).map(m=>m.text)).toContain('41');
    expect(b.filter(m=>m.rail==='top' && /^\d+$/.test(m.text??'')).map(m=>m.text)).not.toContain('41');
    expect(a.some(m=>m.arrow)).toBe(true); expect(a.some(m=>m.text==='1')).toBe(true);
    for (const id of ['645','66','67','69'] as const) {
      const layout = {...formatLayout(id), frameCount:3};
      const canvas = createFilmRebateCanvas(stock,layout,3072,936,()=>createCanvas(3072,936) as unknown as HTMLCanvasElement);
      const ctx=canvas.getContext('2d')!, dimensions=getStripDimensions(layout);
      const x=Math.ceil(layout.marginX/dimensions.width*3072)+3;
      const y=Math.ceil(layout.marginY/dimensions.height*936)+3;
      expect(ctx.getImageData(x,y,1,1).data[3]).toBe(0);
      const rail=ctx.getImageData(0,0,3072,y-3).data;
      let dark=0;for(let i=0;i<rail.length;i+=4)if(rail[i]<80&&rail[i+3]>200)dark++;
      expect(dark).toBeGreaterThan(300);
    }
  });
});
