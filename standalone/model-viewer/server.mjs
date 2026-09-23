import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCatalog} from './catalog.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const host=process.env.PREVIEW_HOST;
const port=Number(process.env.PREVIEW_PORT||4180);
if(host !== '127.0.0.1' && (!host||!/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(host)))throw new Error('PREVIEW_HOST must be loopback or this server’s Tailscale IPv4 address');
const catalog=loadCatalog();
const fixed=new Map([['/',path.join(root,'index.html')],['/index.html',path.join(root,'index.html')],['/style.css',path.join(root,'style.css')],['/viewer.js',path.join(root,'viewer.js')]]);
fixed.set('/model-core.js', path.join(root, 'model-core.js'));
for(const model of catalog.models)fixed.set(model.public.url,model.file);
fixed.set('/assets/model.glb',catalog.models.find(m=>m.public.id===catalog.defaultModel).file);
for(const name of ['default','mamiya'])fixed.set(`/profiles/${name}.js`,path.join(root,'profiles',`${name}.js`));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const vendor=path.join(root,'node_modules/three');
const server=http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});return res.end();}
  let url;try{url=decodeURIComponent(new URL(req.url,'http://preview').pathname);}catch{res.writeHead(400);return res.end();}
  if(url==='/health'||url==='/api/catalog'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    const data=url==='/health'?{ok:catalog.models.every(m=>fs.existsSync(m.file)),defaultModel:catalog.defaultModel,models:catalog.models.length}:{defaultModel:catalog.defaultModel,models:catalog.models.map(m=>m.public)};
    return res.end(req.method==='HEAD'?undefined:JSON.stringify(data));
  }
  let file=fixed.get(url);
  if(!file&&url.startsWith('/vendor/three/')){const candidate=path.resolve(vendor,url.slice('/vendor/three/'.length));if(candidate.startsWith(vendor+path.sep)&&['.js','.wasm'].includes(path.extname(candidate)))file=candidate;}
  if(!file){res.writeHead(404);return res.end('Not found');}
  fs.stat(file,(error,stat)=>{
    if(error||!stat.isFile()){res.writeHead(404);return res.end('Not found');}
    const etag=`"${stat.size}-${Math.round(stat.mtimeMs)}"`;
    const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':url.startsWith('/vendor/')?'public, max-age=86400':'no-cache','ETag':etag,'Accept-Ranges':'bytes'};
    if(req.headers['if-none-match']===etag){res.writeHead(304,headers);return res.end();}
    let start=0,end=stat.size-1,status=200;
    if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});return res.end();}start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;if(start>end){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});return res.end();}status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;}
    headers['Content-Length']=end-start+1;res.writeHead(status,headers);if(req.method==='HEAD')return res.end();
    const stream=fs.createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  });
});
server.listen(port,host,()=>console.log(`Model viewer listening at http://${host}:${server.address().port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
