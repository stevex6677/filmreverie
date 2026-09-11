import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { FILM_FORMATS, FilmFormat, formatLayout } from "../../src/data/filmFormats";
import { curveFilmSubstrate } from "../../src/utils/filmSurfaceGeometry";
import { getFilmCurlZ, getStripDimensions } from "../../src/utils/loupeMapping";

describe("Film surface clearance", () => {
  for (const format of Object.keys(FILM_FORMATS) as FilmFormat[]) it(`${format} substrate stays below the photo across its full curved height`, () => {
    const layout = { ...formatLayout(format), frameCount: 2 };
    const { width, height } = getStripDimensions(layout);
    const flat = new THREE.PlaneGeometry(width, height);
    const substrate = curveFilmSubstrate(flat, layout);
    const photo = new THREE.PlaneGeometry(layout.frameWidth, layout.frameHeight, 1, 16);
    const positions = photo.getAttribute("position");
    for (let i = 0; i < positions.count; i++) positions.setZ(i, getFilmCurlZ(positions.getY(i), height));
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const baseMesh = new THREE.Mesh(substrate, material), photoMesh = new THREE.Mesh(photo, material);
    baseMesh.position.z = .0015;
    photoMesh.position.z = .002;
    baseMesh.updateMatrixWorld(); photoMesh.updateMatrixWorld();
    for (const x of [-.49, 0, .49]) for (let i = 0; i <= 100; i++) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x * layout.frameWidth, (i / 100 - .5) * layout.frameHeight * .999, 1), new THREE.Vector3(0, 0, -1));
      const baseHit = ray.intersectObject(baseMesh)[0], photoHit = ray.intersectObject(photoMesh)[0];
      expect(baseHit).toBeDefined(); expect(photoHit).toBeDefined();
      expect(photoHit.point.z - baseHit.point.z).toBeCloseTo(.0005, 7);
    }
    flat.dispose(); substrate.dispose(); photo.dispose(); material.dispose();
  });

  it("preserves holes when splitting substrate triangles", () => {
    const layout = { ...formatLayout("135"), frameCount: 2 };
    const { width, height } = getStripDimensions(layout);
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, -height / 2); shape.lineTo(width / 2, -height / 2);
    shape.lineTo(width / 2, height / 2); shape.lineTo(-width / 2, height / 2); shape.closePath();
    const hole = new THREE.Path(); hole.absellipse(0, height / 2 - .02, .01, .008, 0, 2 * Math.PI, false, 0); shape.holes.push(hole);
    const flat = new THREE.ShapeGeometry(shape), geometry = curveFilmSubstrate(flat, layout);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(geometry, material);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, height / 2 - .02, 1), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObject(mesh)).toHaveLength(0);
    flat.dispose(); geometry.dispose(); material.dispose();
  });
});
