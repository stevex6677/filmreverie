import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateCatalog} from '../catalog.mjs';

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
