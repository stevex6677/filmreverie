import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const stage=document.querySelector('#stage');
const loading=document.querySelector('#loading');
const state=document.querySelector('#state');
const progress=document.querySelector('#progress');
let renderer,controls,model,ready=false;
function fail(error){console.error(error);document.querySelector('#load-title').textContent='模型暂时未能打开';document.querySelector('#load-detail').textContent='请检查网络连接，然后重新加载';document.querySelector('#retry').hidden=false;document.querySelector('.loading-mark').style.animation='none';progress.hidden=true;loading.classList.remove('done');state.textContent='加载未完成';}
document.querySelector('#retry').onclick=()=>location.reload();
let selected,profile;
try{
  const response=await fetch('/api/catalog');if(!response.ok)throw new Error('Unable to load model catalog');
  const catalog=await response.json();const id=new URL(location.href).searchParams.get('model')||catalog.defaultModel;
  selected=catalog.models.find(m=>m.id===id);if(!selected)throw new Error(`Unknown model: ${id}`);
  profile=await import(`/profiles/${selected.profile}.js`);
  document.title=`${selected.title} ${selected.titleAccent} · 模型预览`;
  for(const [selector,value] of [['#model-title',selected.title],['#title-accent',selected.titleAccent],['.subtitle',selected.subtitle],['#eyebrow',selected.eyebrow||'MODEL STUDY'],['#edition',selected.edition],['#caption',selected.caption],['#caption-detail',selected.captionDetail]])document.querySelector(selector).textContent=value;
  stage.setAttribute('aria-label',`${selected.title} 三维模型，可拖动旋转，双指或滚轮缩放`);
  const picker=document.querySelector('#model-select');
  for(const m of catalog.models)picker.add(new Option([m.title,m.titleAccent].filter(Boolean).join(' '),m.id));
  picker.value=id;document.querySelector('#model-picker').hidden=catalog.models.length<2;
  picker.onchange=()=>{const url=new URL(location.href);url.searchParams.set('model',picker.value);location.assign(url);};
}catch(error){fail(error);throw error;}
try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch(error){fail(error);throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(pointer:coarse)').matches?1.25:1.6));
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=selected.exposure;
renderer.shadowMap.enabled=false;
stage.append(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(34,1,.01,100);
controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;
controls.minDistance=1.15;controls.maxDistance=9;controls.maxPolarAngle=Math.PI;
controls.autoRotateSpeed=.7;controls.screenSpacePanning=true;
controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;

// Continuous, feathered studio illumination instead of four hard rectangular cards.
const w=512,h=256,data=new Float32Array(w*h*4);
const lobes=[{d:new THREE.Vector3(-.7,.65,1).normalize(),width:.40,power:5},
             {d:new THREE.Vector3(1,.4,-.5).normalize(),width:.4,power:3},
             {d:new THREE.Vector3(.1,1,.1).normalize(),width:.55,power:1.7}];
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const phi=(x/w)*Math.PI*2,theta=(y/h)*Math.PI;
  const v=new THREE.Vector3(-Math.sin(theta)*Math.cos(phi),Math.cos(theta),Math.sin(theta)*Math.sin(phi));
  let value=.14+.18*Math.max(0,v.y);
  for(const l of lobes)value+=l.power*Math.exp(-(1-v.dot(l.d))/l.width**2);
  const i=(y*w+x)*4;data[i]=value;data[i+1]=value;data[i+2]=value*1.015;data[i+3]=1;
}
const env=new THREE.DataTexture(data,w,h,THREE.RGBAFormat,THREE.FloatType);
env.mapping=THREE.EquirectangularReflectionMapping;env.needsUpdate=true;
const pmrem=new THREE.PMREMGenerator(renderer);const envTarget=pmrem.fromEquirectangular(env);
scene.environment=envTarget.texture;env.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xffffff,0x74746f,1));
const key=new THREE.DirectionalLight(0xfffaf2,.7);key.position.set(-3,6,4);key.castShadow=true;
key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=key.shadow.camera.bottom=-2;
key.shadow.camera.right=key.shadow.camera.top=2;key.shadow.normalBias=.025;key.shadow.bias=-.00015;key.shadow.radius=4;scene.add(key);
const fill=new THREE.DirectionalLight(0xeaf1ff,.6);fill.position.set(3,1,-2);scene.add(fill);
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
const shadowContext=shadowCanvas.getContext('2d');const gradient=shadowContext.createRadialGradient(64,64,2,64,64,62);
gradient.addColorStop(0,'rgba(43,46,39,.28)');gradient.addColorStop(.5,'rgba(43,46,39,.13)');gradient.addColorStop(1,'rgba(43,46,39,0)');shadowContext.fillStyle=gradient;shadowContext.fillRect(0,0,128,128);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(3,2.4),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);

const viewDirections={home:selected.camera.home||[1.7,1.5,3.2],front:selected.camera.front||[0,.15,3.8],rear:selected.camera.rear||[1.5,.8,-3.4],side:selected.camera.side||[3.7,.4,.15]};
let homeDistance=selected.camera.distance||5.6;
function setView(name){const v=new THREE.Vector3(...viewDirections[name]);camera.position.copy(v.normalize().multiplyScalar(homeDistance));controls.target.set(0,0,0);controls.update();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===name));requestRender();}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.querySelector('#reset').onclick=()=>{controls.autoRotate=false;document.querySelector('#auto').setAttribute('aria-pressed','false');setView('home');};
document.querySelector('#auto').onclick=()=>{controls.autoRotate=!controls.autoRotate;document.querySelector('#auto').setAttribute('aria-pressed',String(controls.autoRotate));requestRender();};
function zoom(factor){const delta=camera.position.clone().sub(controls.target);delta.setLength(THREE.MathUtils.clamp(delta.length()*factor,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(delta);controls.update();requestRender();}
document.querySelector('#zoom-in').onclick=()=>zoom(.8);document.querySelector('#zoom-out').onclick=()=>zoom(1.25);
stage.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){zoom(.8);e.preventDefault();}if(e.key==='-'){zoom(1.25);e.preventDefault();}if(e.key==='0')setView('home');});
if(document.documentElement.requestFullscreen){const b=document.querySelector('#fullscreen');b.hidden=false;b.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){console.warn(e);}};}
let raf=0,remaining=0;
function requestRender(){remaining=30;if(!raf&&!document.hidden)raf=requestAnimationFrame(frame);}
function frame(){raf=0;controls.update();renderer.render(scene,camera);if((controls.autoRotate||--remaining>0)&&!raf)raf=requestAnimationFrame(frame);}
controls.addEventListener('change',requestRender);
controls.addEventListener('start',()=>document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('selected')));
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else requestRender();});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;fail(new Error('Graphics context lost'));});
function resize(){const {width,height}=stage.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();homeDistance=camera.aspect<.8?(selected.camera.portraitDistance||6.4):(selected.camera.distance||5.6);requestRender();}
new ResizeObserver(resize).observe(stage);resize();setView('home');

new GLTFLoader().load(selected.url,gltf=>{
  model=gltf.scene;const oriented=new THREE.Group();oriented.add(model);oriented.rotation.fromArray(selected.rotation);
  const box=new THREE.Box3().setFromObject(oriented);const size=box.getSize(new THREE.Vector3());
  if(!Number.isFinite(size.length())||size.length()===0){fail(new Error('Model has no visible geometry'));return;}
  const scale=2.05/Math.max(size.x,size.y,size.z);const center=box.getCenter(new THREE.Vector3());
  const mount=new THREE.Group();mount.add(oriented);mount.scale.setScalar(scale);oriented.position.sub(center);scene.add(mount);
  floor.position.y=-size.y*scale/2-.015;
  let triangles=0;
  model.traverse(o=>{if(!o.isMesh)return;triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;
    o.castShadow=true;o.receiveShadow=true;
    profile.prepareMesh(o);
    for(const m of (Array.isArray(o.material)?o.material:[o.material])){
      if(m.map)m.map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
      m.needsUpdate=true;
    }
  });
  ready=true;document.querySelectorAll('button:disabled').forEach(b=>b.disabled=false);
  progress.value=100;state.textContent='模型已就绪 · 自由旋转';setView('home');loading.classList.add('done');
  document.documentElement.dataset.modelReady='true';
  window.previewDiagnostics=()=>({ready,modelId:selected.id,profile:selected.profile,triangles,camera:camera.position.toArray(),target:controls.target.toArray(),autoRotate:controls.autoRotate,renderCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries});
  requestRender();
},xhr=>{if(xhr.total){const percent=Math.round(xhr.loaded/xhr.total*100);progress.value=percent;document.querySelector('#load-detail').textContent=`正在加载模型 ${percent}%`; }},fail);
