import * as THREE from "three";
import { FilmStripLayout, getFilmCurlZ, getStripDimensions } from "./loupeMapping";

// Split the triangulated substrate at the photo mesh's Y rows before curling it.
// ShapeGeometry alone only samples the outline (and sprockets), so its large
// triangles otherwise cut through the curved photographs between those points.
export function curveFilmSubstrate(source: THREE.BufferGeometry, layout: FilmStripLayout) {
  const { width, height } = getStripDimensions(layout);
  const rows = [-height / 2, ...Array.from({ length: 17 }, (_, i) => -layout.frameHeight / 2 + layout.frameHeight * i / 16), height / 2];
  type Point = { x: number; y: number };
  const clip = (polygon: Point[], y: number, above: boolean): Point[] => {
    const result: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const insideA = above ? a.y >= y : a.y <= y;
      const insideB = above ? b.y >= y : b.y <= y;
      if (insideA) result.push(a);
      if (insideA !== insideB) result.push({ x: a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y), y });
    }
    return result;
  };
  const positions: number[] = [], uvs: number[] = [];
  const sourcePositions = source.getAttribute("position");
  const count = source.index?.count ?? sourcePositions.count;
  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map(offset => {
      const index = source.index ? source.index.getX(i + offset) : i + offset;
      return { x: sourcePositions.getX(index), y: sourcePositions.getY(index) };
    });
    for (let row = 0; row < rows.length - 1; row++) {
      const low = rows[row], high = rows[row + 1];
      const polygon = clip(clip(triangle, low, true), high, false);
      for (let j = 1; j < polygon.length - 1; j++) {
        for (const p of [polygon[0], polygon[j], polygon[j + 1]]) {
          const t = (p.y - low) / (high - low);
          // Interpolate on exactly the same segments as FilmFrame, including
          // vertices introduced by physical perforations between the rows.
          positions.push(p.x, p.y, THREE.MathUtils.lerp(getFilmCurlZ(low, height), getFilmCurlZ(high, height), t));
          uvs.push((p.x + width / 2) / width, (p.y + height / 2) / height);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}
