import * as THREE from "three";

// Procedural shapes shared by the darkroom's furniture and props.

export type V3 = [number, number, number];

export function roundedRect(w: number, d: number, r: number, segments = 4) {
  const hw = w / 2 - r, hd = d / 2 - r, points: [number, number][] = [];
  for (const [cx, cz, start] of [[hw, hd, 0], [-hw, hd, .5], [-hw, -hd, 1], [hw, -hd, 1.5]])
    for (let i = 0; i <= segments; i++) { const a = (start + i / segments / 2) * Math.PI; points.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return points;
}

/** Sweeps an (inset, height) profile around a rounded rectangle: trays, sink tubs, jugs. */
export function sweptRect(w: number, d: number, r: number, profile: [number, number][], caps: { start?: boolean; end?: boolean } = {}) {
  const positions: number[] = [], indices: number[] = [];
  const ring = ([inset, y]: [number, number]) => roundedRect(w - 2 * inset, d - 2 * inset, Math.max(r - inset, .002)).map(([x, z]) => [x, y, z]);
  const n = ring(profile[0]).length;
  for (let s = 0; s < profile.length - 1; s++) {
    const base = positions.length / 3;
    for (const p of [...ring(profile[s]), ...ring(profile[s + 1])]) positions.push(...p);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; indices.push(base + i, base + n + i, base + j, base + j, base + n + i, base + n + j); }
  }
  const cap = (point: [number, number]) => {
    const base = positions.length / 3;
    positions.push(0, point[1], 0);
    for (const p of ring(point)) positions.push(...p);
    for (let i = 0; i < n; i++) indices.push(base, base + 1 + (i + 1) % n, base + 1 + i);
  };
  if (caps.start) cap(profile[0]);
  if (caps.end) cap(profile[profile.length - 1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export const lathe = (points: [number, number][], segments = 28) => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
export const tube = (points: V3[], radius: number, segments = 48) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, 8);
export const roundedPlane = (w: number, d: number, r: number) => {
  const shape = new THREE.Shape(roundedRect(w, d, r).map(([x, z]) => new THREE.Vector2(x, z)));
  return new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
};
