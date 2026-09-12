import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { generatedPath } from './shared-assets.js';

// Run after the cumulative gate. Each invocation gets a fresh shared output;
// test artifacts stay untracked and no source photograph is modified.
const run = `${new Date().toISOString().replaceAll(':','-')}-${process.pid}`;
const [reviewDir='artifacts/m15-candidates',sourceBase='e5850e0',...resultRoots]=process.argv.slice(2);
if(!resultRoots.length)resultRoots.push('test-results');
const output = generatedPath(`m15-mobile/runs/${run}`);
await fs.mkdir(output,{recursive:true});
const copied=[];
for(const root of resultRoots)for(const entry of await fs.readdir(root,{withFileTypes:true})) {
  if(!entry.isDirectory()||!entry.name.startsWith('m15-'))continue;
  for(const file of await fs.readdir(path.join(root,entry.name))) {
    if(!/\.(png|webm|json)$/.test(file))continue;
    const relative=path.join(path.basename(root),entry.name,file),target=path.join(output,relative);
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.copyFile(path.join(root,entry.name,file),target);
    copied.push(relative);
  }
}
await fs.copyFile(path.join(reviewDir,'source-sha256.txt'),path.join(output,'source-sha256.txt'));
// Historical suites still write into their former candidate directories. Keep
// this run's outputs before restoring tracked candidates locally after testing.
const historical=await fs.readFile(path.join(reviewDir,'regression-output-paths.txt'),'utf8').catch(()=> '');
for(const relative of historical.trim().split('\n').filter(Boolean)) {
  if(!relative.startsWith('artifacts/')||relative.split('/').includes('..'))throw new Error('Unexpected regression artifact path');
  const target=path.join(output,'historical-suite-output',relative);
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(relative,target);copied.push(path.join('historical-suite-output',relative));
}
const files=[];
for(const relative of copied)files.push({path:relative,sha256:createHash('sha256').update(await fs.readFile(path.join(output,relative))).digest('hex')});
const validation=await fs.readFile(path.join(reviewDir,'validation-command.txt'),'utf8');
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({run,sourceBase,sourceChecksums:'source-sha256.txt',browsers:{chrome:'152.0.7977.82',linuxWebKit:'26.6'},validation,files,physicalDeviceEvidence:'Pending'},null,2));
console.log(JSON.stringify({output,files:copied.length}));
