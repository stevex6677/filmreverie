import fs from 'node:fs';
import {loadCatalog} from './catalog.mjs';
const catalog=loadCatalog();const id=process.argv[2]||catalog.defaultModel;
const model=catalog.models.find(m=>m.public.id===id);if(!model)throw new Error(`Unknown model: ${id}`);
const data=fs.readFileSync(model.file);
const doc=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
const meshes=doc.meshes.map(m=>({name:m.name,triangles:m.primitives.reduce((sum,p)=>sum+doc.accessors[p.indices].count/3,0)})).sort((a,b)=>b.triangles-a.triangles);
console.log(JSON.stringify({bytes:data.length,meshes:meshes.slice(0,18),textures:doc.images.length,materials:doc.materials.length,externalResources:[...doc.images,...doc.buffers].filter(x=>x.uri)},null,2));
