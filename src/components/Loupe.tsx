import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { createLoupeShaderMaterial } from "../shaders/loupeShader";
import { TABLE_SURFACE_Y } from "../utils/cameraBounds";

interface LoupeProps {
  isActive: boolean;
  targetX: number;
  targetY: number;
  frameIndex: number;
  u: number;
  v: number;
  texture: THREE.Texture;
  isPositive: boolean;
  magnification?: number;
  brightness?: number;
  isDeterministic?: boolean;
  onClick?: () => void;
}

export const Loupe: React.FC<LoupeProps> = ({
  isActive,
  targetX,
  targetY,
  u,
  v,
  texture,
  isPositive,
  magnification = 2.5,
  brightness = 1.0,
  isDeterministic = false,
  onClick,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const worldPos = useRef(new THREE.Vector3());

  // Resting position (bottom-right on the light table off the film strip)
  const restingPos = useMemo(() => new THREE.Vector3(1.3, -0.42, 0.08), []);
  const activePos = useMemo(() => new THREE.Vector3(targetX, targetY, 0.08), [targetX, targetY]);

  const targetPos = isActive ? activePos : restingPos;

  // Offscreen render target and virtual orthographic camera for full-scene optical magnification
  const renderTarget = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1024, 1024, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    return target;
  }, []);

  const virtualCamera = useMemo(() => {
    return new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1.0);
  }, []);

  // Shader material for the magnified optical lens
  const lensMaterial = useMemo(() => {
    return createLoupeShaderMaterial(texture, isPositive, [u, v], false, magnification);
  }, [texture]);

  useEffect(() => {
    return () => {
      renderTarget.dispose();
      lensMaterial.dispose();
    };
  }, [renderTarget, lensMaterial]);

  // Update uniforms, smooth positioning, and full-scene capture
  useFrame(({ gl, scene }, delta) => {
    if (!groupRef.current) return;

    // Position interpolation
    if (isDeterministic) {
      groupRef.current.position.copy(targetPos);
    } else {
      groupRef.current.position.lerp(targetPos, Math.min(1.0, delta * 14));
    }

    // Physical Scene Capture: Capture the exact 3D scene underneath the loupe
    // 1. Temporarily hide loupe group so it doesn't render its own barrel/shadow into the lens
    groupRef.current.visible = false;

    // 2. Position virtual camera in world space directly above the current loupe lens position
    groupRef.current.getWorldPosition(worldPos.current);

    const safeMag = Math.max(1.0, magnification);
    const halfSize = 0.14 / safeMag;
    virtualCamera.left = -halfSize;
    virtualCamera.right = halfSize;
    virtualCamera.top = halfSize;
    virtualCamera.bottom = -halfSize;
    virtualCamera.near = 0.01;
    virtualCamera.far = 0.60;

    // Table surface normal is world +Y; table vertical axis (film top) is world -Z
    virtualCamera.position.set(worldPos.current.x, TABLE_SURFACE_Y + 0.25, worldPos.current.z);
    virtualCamera.up.set(0, 0, -1);
    virtualCamera.lookAt(worldPos.current.x, TABLE_SURFACE_Y, worldPos.current.z);
    virtualCamera.updateProjectionMatrix();

    // 3. Render offscreen into render target
    const prevRenderTarget = gl.getRenderTarget();
    gl.setRenderTarget(renderTarget);
    gl.render(scene, virtualCamera);
    gl.setRenderTarget(prevRenderTarget);

    // 4. Restore loupe visibility for the main scene render pass
    groupRef.current.visible = true;

    // 5. Update shader uniforms
    if (lensMaterial.uniforms) {
      lensMaterial.uniforms.uTexture.value = renderTarget.texture;
      if (lensMaterial.uniforms.uUseSceneCapture) {
        lensMaterial.uniforms.uUseSceneCapture.value = 1.0;
      }
      lensMaterial.uniforms.uCenterUv.value.set(u, v);

      if (lensMaterial.uniforms.uMagnification) {
        if (isDeterministic) {
          lensMaterial.uniforms.uMagnification.value = magnification;
        } else {
          lensMaterial.uniforms.uMagnification.value = THREE.MathUtils.damp(
            lensMaterial.uniforms.uMagnification.value,
            magnification,
            16,
            delta
          );
        }
      }

      lensMaterial.uniforms.uActive.value = isActive ? 1.0 : 0.0;

      const targetMode = isPositive ? 1.0 : 0.0;
      lensMaterial.uniforms.uModeTransition.value = targetMode;

      if (lensMaterial.uniforms.uExposure) {
        const targetExp = 1.0 * Math.pow(brightness, 0.5);
        lensMaterial.uniforms.uExposure.value = targetExp;
      }
    }
  });

  const lensRadius = 0.14;
  const barrelRadius = 0.17;
  const barrelHeight = 0.07;

  return (
    <group
      ref={groupRef}
      position={[targetPos.x, targetPos.y, targetPos.z]}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {/* Soft radial contact shadow */}
      <mesh position={[0, -0.005, -0.06]}>
        <ringGeometry args={[0.06, barrelRadius + 0.05, 36]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.38} />
      </mesh>

      {/* Clear optical acrylic skirt at base letting table illumination in */}
      <mesh position={[0, 0, -0.022]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[barrelRadius * 0.96, barrelRadius * 1.02, 0.042, 36, 1, false]}
        />
        <meshStandardMaterial
          color="#f8fafc"
          roughness={0.12}
          metalness={0.08}
          transparent={true}
          opacity={0.36}
        />
      </mesh>

      {/* Lower retaining collar between skirt and metal barrel */}
      <mesh position={[0, 0, 0.002]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[barrelRadius * 0.97, barrelRadius * 0.97, 0.008, 36]}
        />
        <meshStandardMaterial
          color="#18191d"
          roughness={0.35}
          metalness={0.85}
        />
      </mesh>

      {/* Anodized matte black aluminum body / upper barrel */}
      <mesh position={[0, 0, 0.038]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[barrelRadius * 0.93, barrelRadius * 0.97, barrelHeight, 36, 1, true]}
        />
        <meshStandardMaterial
          color="#1c1d22"
          roughness={0.38}
          metalness={0.8}
        />
      </mesh>

      {/* Knurled focusing grip ring with tactile ribbed profile */}
      <mesh position={[0, 0, 0.038]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[barrelRadius * 1.03, barrelRadius * 1.03, 0.035, 48, 1, false]}
        />
        <meshStandardMaterial
          color="#25272e"
          roughness={0.65}
          metalness={0.7}
        />
      </mesh>

      {/* Precision polished brass retaining bezel */}
      <mesh position={[0, 0, 0.074]}>
        <ringGeometry args={[lensRadius - 0.008, lensRadius, 48]} />
        <meshStandardMaterial
          color="#d4af37"
          roughness={0.22}
          metalness={0.92}
        />
      </mesh>

      {/* Outer top barrel rim */}
      <mesh position={[0, 0, 0.073]}>
        <ringGeometry args={[lensRadius, barrelRadius * 0.95, 48]} />
        <meshStandardMaterial
          color="#16171a"
          roughness={0.35}
          metalness={0.85}
        />
      </mesh>

      {/* Optical Magnifying Lens Disc with subtle curvature and AR reflection */}
      <mesh position={[0, 0, 0.068]} material={lensMaterial}>
        <circleGeometry args={[lensRadius, 48]} />
      </mesh>
    </group>
  );
};
