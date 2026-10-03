import * as THREE from 'three';
import { DEFAULT_TABLE_BRIGHTNESS } from '../utils/cameraBounds';

export const PHOTO_REFERENCE_OUTPUT = 2.4 * DEFAULT_TABLE_BRIGHTNESS ** 2;

// Invert Three's ACES input/output matrices in column-major GLSL order.
function inverseMatrix(values: number[]) {
  return new THREE.Matrix3().fromArray(values).invert().elements.map(v => v.toFixed(10)).join(', ');
}

// Photographs are already display-referred. Encode their desired linear-sRGB
// appearance into the scene's ACES radiance space so direct viewing, HDR loupe
// capture and screening post-processing all apply the same final transform.
// Simply disabling toneMapped on the photo would fix the table but grade the
// photograph again when it is viewed through a loupe or screening capture.
export const PHOTO_RADIANCE_GLSL = `
  vec3 photoRadiance(vec3 source, float tableOutput) {
    vec3 display = clamp(source * (tableOutput / ${PHOTO_REFERENCE_OUTPUT.toFixed(10)}), 0.0, 1.0);
    const mat3 inverseOutput = mat3(${inverseMatrix([
      1.60475, -.10208, -.00327, -.53108, 1.10813, -.07276, -.07367, -.00605, 1.07602,
    ])});
    const mat3 inverseInput = mat3(${inverseMatrix([
      .59719, .07600, .02840, .35458, .90834, .13383, .04823, .01566, .83777,
    ])});
    vec3 fitted = inverseOutput * display;
    // Positive root of the inverse RRTAndODTFit rational quadratic.
    vec3 a = 0.983729 * fitted - 1.0;
    vec3 b = 0.4329510 * fitted - 0.0245786;
    vec3 c = 0.238081 * fitted + 0.000090537;
    vec3 linear = (-b - sqrt(b * b - 4.0 * a * c)) / (2.0 * a);
    return (inverseInput * linear) * 0.6;
  }
`;
