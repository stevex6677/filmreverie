import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

// Explicitly opt-in adjustments for the Mamiya derivative, never other assets.
export function prepareMesh(mesh){
  if(mesh.name.startsWith('V22')||mesh.name.startsWith('V2.2')){
    const old=mesh.geometry;const smooth=old.clone();
    smooth.deleteAttribute('normal');smooth.deleteAttribute('uv');smooth.deleteAttribute('tangent');
    mesh.geometry=mergeVertices(smooth,1e-5);mesh.geometry.computeVertexNormals();old.dispose();smooth.dispose();
  }
  for(const material of(Array.isArray(mesh.material)?mesh.material:[mesh.material])){
    if(!material.name.includes('clear coated glass'))continue;
    material.transmission=1;material.roughness=.025;material.thickness=.012;material.ior=1.52;
    material.iridescence=.28;material.iridescenceIOR=1.38;material.iridescenceThicknessRange=[120,340];material.envMapIntensity=.75;
    material.color.setRGB(.98,.99,1);mesh.castShadow=false;mesh.receiveShadow=false;material.needsUpdate=true;
  }
}
