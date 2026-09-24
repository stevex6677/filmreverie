import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadCatalog,validateCatalog} from '../catalog.mjs';

test('multiple independent models expose URLs and preserve default materials',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'model-viewer-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'one.glb'),'fixture');fs.writeFileSync(path.join(root,'two.glb'),'fixture');
 const config={defaultModel:'camera',models:[{id:'camera',title:'Camera',asset:'one.glb',profile:'mamiya'},{id:'sculpture',title:'Sculpture',asset:'two.glb',rotation:[0,1,0],camera:{home:[1,1,1]}}]};
 const catalog=validateCatalog(config,root);
 assert.equal(catalog.models[1].public.profile,'default');
 assert.equal(catalog.models[1].public.url,'/assets/models/sculpture.glb');
 assert.equal(catalog.models[0].public.profile,'mamiya');
 assert(!JSON.stringify(catalog.models.map(m=>m.public)).includes(root));
 assert(!('asset' in catalog.models[0].public));
 for(const asset of ['../outside.glb','/tmp/outside.glb','one.txt','missing.glb'])assert.throws(()=>validateCatalog({...config,models:[{...config.models[0],asset}]},root));
 assert.throws(()=>validateCatalog({...config,defaultModel:'missing'},root));
 assert.throws(()=>validateCatalog({...config,models:[config.models[0],config.models[0]]},root));
 assert.throws(()=>validateCatalog({...config,models:[{...config.models[0],camera:{home:[0,0,0]}}]},root));
 const external=fs.mkdtempSync(path.join(os.tmpdir(),'model-external-'));t.after(()=>fs.rmSync(external,{recursive:true,force:true}));
 fs.writeFileSync(path.join(external,'private.glb'),'secret');fs.symlinkSync(path.join(external,'private.glb'),path.join(root,'escape.glb'));
 assert.throws(()=>validateCatalog({...config,models:[{...config.models[0],asset:'escape.glb'}]},root),/symlink/);
});

test('bundled cameras prepare and load from a checkout without authoring storage',async t=>{
 const source=fileURLToPath(new URL('../../../',import.meta.url));
 const checkout=fs.mkdtempSync(path.join(os.tmpdir(),'model-checkout-'));t.after(()=>fs.rmSync(checkout,{recursive:true,force:true}));
 const copy=relative=>{
  const target=path.join(checkout,relative);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(source,relative),target,fs.constants.COPYFILE_FICLONE);
 };
 fs.writeFileSync(path.join(checkout,'package.json'),JSON.stringify({type:'module'}));
 for(const file of ['standalone/model-viewer/catalog.mjs','standalone/model-viewer/models.json','scripts/prepare-camera.js'])copy(file);
 const raw=JSON.parse(fs.readFileSync(path.join(checkout,'standalone/model-viewer/models.json'),'utf8'));
 for(const model of raw.models)copy(`public/${model.asset}`);
 for(const dir of fs.readdirSync(path.join(source,'blender'),{withFileTypes:true})){
  if(dir.isDirectory()&&fs.existsSync(path.join(source,'blender',dir.name,'CURRENT.json')))copy(`blender/${dir.name}/CURRENT.json`);
 }
 for(const file of ['draco_decoder.js','draco_wasm_wrapper.js','draco_decoder.wasm'])copy(`node_modules/three/examples/jsm/libs/draco/gltf/${file}`);
 const {loadCatalog:loadCheckout}=await import(pathToFileURL(path.join(checkout,'standalone/model-viewer/catalog.mjs')));
 const {prepareCamera}=await import(pathToFileURL(path.join(checkout,'scripts/prepare-camera.js')));
 prepareCamera();
 const catalog=loadCheckout({FILM_PHOTO_SHARED_ROOT:path.join(checkout,'missing-authoring-store')});
 assert.deepEqual(catalog.models.map(model=>model.public.id),raw.models.map(model=>model.id));
 for(const [index,model] of catalog.models.entries()){
  assert.equal(createHash('sha256').update(fs.readFileSync(model.file)).digest('hex'),raw.models[index].sha256);
  assert.equal(model.public.url,`/assets/models/${raw.models[index].id}.glb`);
 }
 fs.writeFileSync(catalog.models[0].file,'corrupt GLB');
 assert.throws(()=>prepareCamera(),/checksum or size mismatch/);
});

test('custom catalogs resolve only within their explicit asset root',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'model-custom-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'sculpture.glb'),'custom fixture');
 const file=path.join(root,'catalog.json');
 fs.writeFileSync(file,JSON.stringify({defaultModel:'sculpture',models:[{id:'sculpture',title:'Sculpture',asset:'sculpture.glb'}]}));
 const catalog=loadCatalog({MODEL_CONFIG:file,MODEL_ASSET_ROOT:root,FILM_PHOTO_SHARED_ROOT:path.join(root,'missing')});
 assert.equal(fs.readFileSync(catalog.models[0].file,'utf8'),'custom fixture');
 assert.equal(catalog.models[0].public.url,'/assets/models/sculpture.glb');
 fs.rmSync(path.join(root,'sculpture.glb'));
 assert.throws(()=>loadCatalog({MODEL_CONFIG:file,MODEL_ASSET_ROOT:root}));
});
