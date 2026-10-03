import * as THREE from 'three';
import {createFilmShaderMaterial,createRebateMaterial} from '../../src/shaders/filmShader';
import {createFilmRebateTexture} from '../../src/utils/filmRebateCanvas';
import {getFilmStock} from '../../src/data/filmStocks';
import {DEFAULT_LAYOUT} from '../../src/utils/loupeMapping';
import {captureLoupeScene,createLinearRenderTarget,updateTableIllumination} from '../../src/shaders/tableIllumination';
import {createLoupeShaderMaterial} from '../../src/shaders/loupeShader';

// Actual GPU pixels, including the shared HDR capture path.
export function run() {
const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(256,256);renderer.toneMapping=THREE.ACESFilmicToneMapping;
const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;
const scene=new THREE.Scene();const geometry=new THREE.PlaneGeometry(2,2);
const raw=new Uint8Array(256*256*4);
for(let i=0;i<65536;i++){raw[i*4]=i%256;raw[i*4+1]=Math.floor(i/256);raw[i*4+2]=(i*73)%256;raw[i*4+3]=255;}
const texture=new THREE.DataTexture(raw,256,256);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
const film=createFilmShaderMaterial(texture,true,.8);const mesh=new THREE.Mesh(geometry,film);scene.add(mesh);
const pixels=()=>{const data=new Uint8Array(raw.length);const gl=renderer.getContext();gl.readPixels(0,0,256,256,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
renderer.render(scene,camera);const direct=pixels();
const difference=(a: Uint8Array,b: Uint8Array,center=false)=>{let max=0,sum=0,n=0;for(let y=0;y<256;y++)for(let x=0;x<256;x++){if(center&&Math.hypot(x-127.5,y-127.5)>100)continue;const i=(y*256+x)*4;for(let c=0;c<3;c++){const d=Math.abs(a[i+c]-b[i+c]);max=Math.max(max,d);sum+=d;n++;}}return {max,mean:sum/n};};
const target=createLinearRenderTarget(256,256);captureLoupeScene(renderer,scene,camera,target,new THREE.Group());
const lens=createLoupeShaderMaterial(target.texture,true,[.5,.5],true,1,.8);lens.uniforms.uUseSceneCapture.value=1;lens.uniforms.uOpticalEffects.value=0;
mesh.material=lens;renderer.render(scene,camera);const captured=pixels();
mesh.material=film;const dimmer=[];for(const brightness of [.3,.6,.8,1]){updateTableIllumination(film,brightness);renderer.render(scene,camera);const p=pixels();dimmer.push({brightness,sample:[...p.slice((128*256+128)*4,(128*256+128)*4+3)]});}
const rebates=[];for(const id of ['gold-200','portra-400','ektachrome-e100'] as const)for(const positive of [false,true]){
const stock=getFilmStock(id);const channels=stock.base.substrateBase.match(/[\d.]+/g)!.slice(0,3);const base=new THREE.Color(`rgb(${channels.join(',')})`);
const material=createRebateMaterial(createFilmRebateTexture(stock,DEFAULT_LAYOUT),.8,positive,stock.type==='negative',base,DEFAULT_LAYOUT,new THREE.Color(stock.base.rebateText));
mesh.material=material;renderer.render(scene,camera);const p=pixels();const rail=[...p.slice((220*256+1)*4,(220*256+1)*4+3)],gap=[...p.slice((128*256+1)*4,(128*256+1)*4+3)];rebates.push({id,positive,rail,gap});}
renderer.dispose();
return {direct:difference(raw,direct),capture:difference(raw,captured,true),dimmer,rebates};
}
