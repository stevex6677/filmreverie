import React, { useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { createLoupeShaderMaterial } from '../shaders/loupeShader';
import { captureLoupeScene, createLoupeRenderTarget, updateTableIllumination } from '../shaders/tableIllumination';
import { TABLE_SURFACE_Y, TABLE_CENTER_Z } from '../utils/cameraBounds';
import { LOUPE_LENS_HEIGHT, LOUPE_LENS_RADIUS, LOUPE_REST, loupeGeometry, type LoupeType } from '../utils/loupeView';

interface LoupeProps {
  type?: LoupeType;
  touchInput?: boolean; physicalScale?: number; suspended?: boolean; opticalEffects?: boolean;
  isActive: boolean; targetX: number; targetY: number; frameIndex: number; u: number; v: number;
  texture: THREE.Texture; isPositive: boolean; magnification?: number; brightness?: number;
  isDeterministic?: boolean; onClick?: () => void;
}

export const Loupe: React.FC<LoupeProps> = ({ type = 'classic', physicalScale = 1, suspended = false, opticalEffects = true,
  isActive, targetX, targetY, u, v, texture, isPositive, magnification = 4, brightness = 1, isDeterministic = false, onClick }) => {
  const group = useRef<THREE.Group>(null), ribs = useRef<THREE.InstancedMesh>(null);
  const geometry = loupeGeometry(type);
  const dome = useMemo(() => {
    const radius = loupeGeometry('glass').radius;
    const mesh = new THREE.SphereGeometry(radius, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2);
    mesh.rotateX(Math.PI / 2);
    // Planar UVs retain the film's orientation across the curved surface.
    const positions = mesh.attributes.position, uv = mesh.attributes.uv;
    for (let i = 0; i < positions.count; i++) uv.setXY(i, positions.getX(i) / (radius * 2) + .5, positions.getY(i) / (radius * 2) + .5);
    return mesh;
  }, []);
  const renderTarget = useMemo(createLoupeRenderTarget, []);
  const domeContext = useMemo(() => type === 'glass' ? createLoupeRenderTarget() : null, [type]);
  useEffect(() => () => domeContext?.dispose(), [domeContext]);
  const capture = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 1), []);
  const lens = useMemo(() => createLoupeShaderMaterial(texture, isPositive, [u,v], false, magnification), [texture]);
  const barrel = useMemo(() => new THREE.LatheGeometry([
    [.177,.046],[.18,.055],[.176,.082],[.166,.145],[.166,.205],
  ].map(([r,h])=>new THREE.Vector2(r,h)), 96), []);
  const bevel = useMemo(() => new THREE.LatheGeometry([
    [.137,.19],[.137,.197],[.145,.212],[.151,.222],
  ].map(([r,h])=>new THREE.Vector2(r,h)), 96), []);
  const skirt = useMemo(() => new THREE.LatheGeometry([
    [.174,.004],[.184,.009],[.184,.047],[.177,.06],[.166,.06],[.171,.045],[.171,.012],[.174,.004],
  ].map(([r,h])=>new THREE.Vector2(r,h)), 96), []);
  const shadow = useMemo(() => new THREE.ShaderMaterial({ transparent:true, depthWrite:false,
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 vUv; void main(){float r=length(vUv-.5)*2.;float a=(1.-smoothstep(.69,1.,r))*smoothstep(.42,.7,r);gl_FragColor=vec4(0.,0.,0.,a*.28);}',
  }), []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    for(let i=0;i<96;i++) {
      const a=i/96*Math.PI*2;
      o.position.set(Math.cos(a)*.17,Math.sin(a)*.17,.17);o.rotation.set(0,0,a);o.updateMatrix();
      ribs.current?.setMatrixAt(i,o.matrix);
    }
    if(ribs.current)ribs.current.instanceMatrix.needsUpdate=true;
  }, [type]);
  useEffect(()=>()=>{renderTarget.dispose();barrel.dispose();bevel.dispose();skirt.dispose();shadow.dispose();dome.dispose();},[renderTarget,barrel,bevel,skirt,shadow,dome]);
  useEffect(()=>()=>lens.dispose(),[lens]);

  useFrame(({ gl, scene, camera, size },delta) => {
    if(!group.current)return;
    const pos=new THREE.Vector3(isActive?targetX:LOUPE_REST.x,isActive?targetY:LOUPE_REST.y,.008);
    if(isDeterministic)group.current.position.copy(pos);
    else group.current.position.lerp(pos,1-Math.exp(-delta*28));
    group.current.scale.setScalar(physicalScale);group.current.visible=!suspended;
    group.current.updateWorldMatrix(true,true);
    const sample=group.current.getWorldPosition(new THREE.Vector3());
    const half=geometry.lensRadius*physicalScale/Math.max(1,magnification);
    capture.left=-half;capture.right=half;capture.top=half;capture.bottom=-half;
    capture.position.set(sample.x,TABLE_SURFACE_Y+.3,sample.z);capture.up.set(0,0,-1);
    capture.lookAt(sample.x,TABLE_SURFACE_Y,sample.z);capture.updateProjectionMatrix();
    if(!suspended)captureLoupeScene(gl,scene,capture,renderTarget,group.current);
    // Keep central detail at full resolution even at 8x. A separate wide
    // capture supplies only the curved periphery, without edge smearing.
    if (!suspended && domeContext && opticalEffects) {
      const wide = geometry.lensRadius * physicalScale;
      capture.left=-wide;capture.right=wide;capture.top=wide;capture.bottom=-wide;capture.updateProjectionMatrix();
      captureLoupeScene(gl,scene,capture,domeContext,group.current);
    }
    lens.uniforms.uDomeContext.value=domeContext?.texture ?? renderTarget.texture;
    lens.uniforms.uTexture.value=renderTarget.texture;lens.uniforms.uUseSceneCapture.value=1;
    lens.uniforms.uCenterUv.value.set(u,v);lens.uniforms.uMagnification.value=magnification;
    lens.uniforms.uActive.value=isActive?1:0;lens.uniforms.uModeTransition.value=isPositive?1:0;
    lens.uniforms.uOpticalEffects.value=opticalEffects?1:0;updateTableIllumination(lens,brightness);
    lens.uniforms.uGlassDome.value=type==='glass'?1:0;
    const center=new THREE.Vector3(sample.x,TABLE_SURFACE_Y+.008+geometry.lensHeight*physicalScale,sample.z).project(camera);
    const edge=new THREE.Vector3(sample.x+geometry.radius*physicalScale,TABLE_SURFACE_Y+.008+geometry.lensHeight*physicalScale,sample.z).project(camera);
    const radius=Math.abs(edge.x-center.x)*size.width/2;
    gl.domElement.dataset.loupeSample=`${sample.x},${TABLE_CENTER_Z-sample.z}`;
    gl.domElement.dataset.loupeDisplay=`${(center.x+1)*size.width/2},${(1-center.y)*size.height/2},${radius}`;
    gl.domElement.dataset.loupeVisible=String(!suspended);
    gl.domElement.dataset.loupeMagnification=String(magnification);
    gl.domElement.dataset.loupeScale=String(physicalScale);
    gl.domElement.dataset.loupeType=type;
  }, -1);

  return <group ref={group} position={[isActive?targetX:LOUPE_REST.x,isActive?targetY:LOUPE_REST.y,.008]} scale={physicalScale} visible={!suspended}
    onClick={e=>{e.stopPropagation();onClick?.();}}>
    <mesh position={[.005,-.008,.001]} material={shadow}><planeGeometry args={[geometry.radius*2.6,geometry.radius*2.6]}/></mesh>
    {type==='glass'?<>
      <mesh geometry={dome} material={lens}/>
      <mesh position={[0,0,.003]}>
        <torusGeometry args={[geometry.radius-.0008,.0008,12,96]}/>
        <meshBasicMaterial color="#99aaa6" transparent opacity={.14}/>
      </mesh>
    </>:<>
    <mesh geometry={skirt} rotation={[Math.PI/2,0,0]}>
      <meshPhysicalMaterial color="#bbc1bd" roughness={.3} metalness={0} transparent opacity={.48} clearcoat={.25} side={THREE.DoubleSide}/>
    </mesh>
    <mesh geometry={barrel} rotation={[Math.PI/2,0,0]} castShadow>
      <meshStandardMaterial color="#111210" roughness={.86} metalness={.85}/>
    </mesh>
    <mesh position={[0,0,.221]}>
      <ringGeometry args={[.149,.173,96]}/><meshStandardMaterial color="#10110f" roughness={.88} metalness={.9}/>
    </mesh>
    <mesh geometry={bevel} rotation={[Math.PI/2,0,0]}>
      <meshStandardMaterial color="#090a08" roughness={.82} metalness={.9} side={THREE.DoubleSide}/>
    </mesh>
    <instancedMesh ref={ribs} args={[undefined,undefined,96]} castShadow>
      <boxGeometry args={[.008,.004,.065]}/><meshStandardMaterial color="#151612" roughness={.88} metalness={.85}/>
    </instancedMesh>
    {[.12,.205,.217].map((z,i)=><mesh key={z} position={[0,0,z]}>
      <torusGeometry args={[i===2?.171:.169,.0012,8,96]}/>
      <meshStandardMaterial color={i===2?'#252822':'#111310'} roughness={.75} metalness={.9}/>
    </mesh>)}
    <mesh position={[0,0,LOUPE_LENS_HEIGHT]} material={lens}><circleGeometry args={[LOUPE_LENS_RADIUS,96]}/></mesh>
    <mesh position={[0,0,LOUPE_LENS_HEIGHT+.002]}>
      <torusGeometry args={[LOUPE_LENS_RADIUS+.001,.001,8,96]}/><meshStandardMaterial color="#252822" roughness={.65} metalness={.9}/>
    </mesh>
    {/* Small focus index, inset into the upper collar. */}
    <mesh position={[0,.159,.222]}><boxGeometry args={[.009,.012,.0008]}/><meshBasicMaterial color="#b9b6a3"/></mesh>
    </>}
  </group>;
};
