import * as THREE from 'three';
import type { PanelCorners } from '../data/filmPackaging';

// Homography from a unit panel (top-left origin) into its four photographed
// corners. Unlike a bounding-box crop, this removes the photo's perspective
// before the actual 3D box supplies the scene's perspective.
export function panelProjection(corners: PanelCorners) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = corners;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const denominator = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(denominator) < 1e-10 ? 0 : (dx3 * dy2 - dx2 * dy3) / denominator;
  const h = Math.abs(denominator) < 1e-10 ? 0 : (dx1 * dy3 - dx3 * dy1) / denominator;
  return new THREE.Matrix3().set(x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1);
}
export function packagingMaterial(texture: THREE.Texture | undefined, corners: PanelCorners | undefined, owned: boolean, color = '#d5a328') {
  const material = new THREE.MeshStandardMaterial({ map: texture, color: texture ? '#ffffff' : color, roughness: .68, metalness: .02, emissive: '#ffffff', emissiveIntensity: texture ? .10 : .015, emissiveMap: texture });
  material.onBeforeCompile = shader => {
    shader.uniforms.shelfOwned = { value: owned ? 1 : 0 };
    shader.fragmentShader = `uniform float shelfOwned;\n${shader.fragmentShader}`;
    if (texture && corners) {
      shader.uniforms.panelProjection = { value: panelProjection(corners) };
      shader.fragmentShader = `uniform mat3 panelProjection;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        vec3 panelPoint = panelProjection * vec3(vMapUv.x, 1.0 - vMapUv.y, 1.0);
        vec2 panelUV = vec2(panelPoint.x / panelPoint.z, 1.0 - panelPoint.y / panelPoint.z);
        vec4 panelColor = texture2D(map, panelUV);
        diffuseColor *= panelColor;
      `).replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= panelColor.rgb;');
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float shelfGray = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
      outgoingLight = mix(vec3(shelfGray * 0.38 + 0.035), outgoingLight, shelfOwned);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => `shelf-panel-v1-${!!texture}-${!!corners}`;
  return material;
}
