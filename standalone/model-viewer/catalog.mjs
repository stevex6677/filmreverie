import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
export const root=path.dirname(fileURLToPath(import.meta.url));
export function assetRoot(env=process.env){
  if(env.MODEL_ASSET_ROOT)return path.resolve(env.MODEL_ASSET_ROOT);
  const file=path.resolve(root,'../../shared-assets.json');
  if(!fs.existsSync(file))throw new Error('Set MODEL_ASSET_ROOT to your GLB asset directory');
  const config=JSON.parse(fs.readFileSync(file,'utf8'));
  const shared=env.FILM_PHOTO_SHARED_ROOT||config.main_checkout[os.type()];
  if(!shared)throw new Error('No shared asset root for this platform; set MODEL_ASSET_ROOT');
  return path.resolve(shared,config.generated_directory);
}
export function validateCatalog(raw,assets){
  if(!raw||!Array.isArray(raw.models)||!raw.models.length)throw new Error('models must be a nonempty array');
  const ids=new Set();
  const models=raw.models.map(model=>{
    const {id,asset}=model;
    if(typeof id!=='string'||!/^[a-z0-9][a-z0-9-]*$/.test(id)||ids.has(id))throw new Error(`Invalid or duplicate model id: ${id}`);
    ids.add(id);
    if(typeof model.title!=='string'||!model.title.trim())throw new Error(`Missing title: ${id}`);
    if(typeof asset!=='string'||path.isAbsolute(asset)||asset.includes('\\')||asset.split('/').some(p=>p==='..'||p==='.')||!asset.endsWith('.glb'))throw new Error(`Invalid GLB asset path: ${id}`);
    const file=path.resolve(assets,asset);
    if(!file.startsWith(path.resolve(assets)+path.sep))throw new Error(`Asset outside root: ${id}`);
    const realRoot=fs.realpathSync(assets);const realFile=fs.realpathSync(file);
    if(!realFile.startsWith(realRoot+path.sep))throw new Error(`Asset symlink outside root: ${id}`);
    if(!fs.statSync(realFile).isFile())throw new Error(`Asset is not a file: ${id}`);
    const profile=model.profile||'default';
    if(!['default','mamiya'].includes(profile))throw new Error(`Unknown profile: ${profile}`);
    const vector=(v,label)=>{if(!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isFinite(n)))throw new Error(`Invalid ${label}: ${id}`);};
    if(model.rotation)vector(model.rotation,'rotation');
    const camera=model.camera||{};
    for(const key of ['home','front','rear','side'])if(camera[key]){vector(camera[key],key);if(Math.hypot(...camera[key])===0)throw new Error(`Zero camera direction: ${id}`);}
    for(const key of ['distance','portraitDistance'])if(camera[key]!==undefined&&(!Number.isFinite(camera[key])||camera[key]<1.15||camera[key]>9))throw new Error(`Invalid camera distance: ${id}`);
    if(model.exposure!==undefined&&(!Number.isFinite(model.exposure)||model.exposure<=0||model.exposure>5))throw new Error(`Invalid exposure: ${id}`);
    const publicModel={id,title:model.title,profile,camera,rotation:model.rotation||[0,0,0],exposure:model.exposure??1.15,url:`/assets/models/${id}.glb`};
    for(const key of ['titleAccent','subtitle','eyebrow','edition','caption','captionDetail'])publicModel[key]=typeof model[key]==='string'?model[key]:'';
    return {file:realFile,public:publicModel};
  });
  if(!ids.has(raw.defaultModel))throw new Error('defaultModel must name a configured model');
  return {defaultModel:raw.defaultModel,models};
}
export function loadCatalog(env=process.env){
  return validateCatalog(JSON.parse(fs.readFileSync(env.MODEL_CONFIG||path.join(root,'models.json'),'utf8')),assetRoot(env));
}
