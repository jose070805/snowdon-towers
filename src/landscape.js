import * as THREE from 'three';
import { DrawnLines, meshGeometry, segmentsFrom } from './geometry.js';
import { createFinish } from './materials.js';
import gardenUrl from '../assets/landscape.sdl?url';

const smooth = THREE.MathUtils.smoothstep;
const solid = { value: 1 };
const plantSeed = (id) => ((id * 73) % 101) / 101;

function meshLayer(entry, scene, asSurface) {
  const group = new THREE.Group();
  scene.add(group);
  const pointData = Float32Array.from(entry.positions);
  const material = createFinish(entry.kind, solid);
  const mesh = new THREE.Mesh(meshGeometry(pointData), material);
  group.add(mesh);
  let xmin = Infinity, xmax = -Infinity, base = Infinity;
  for (let i = 0; i < pointData.length; i += 3) {
    const track = pointData[i] + .40 * pointData[i + 2];
    xmin = Math.min(xmin, track);
    xmax = Math.max(xmax, track);
    base = Math.min(base, pointData[i + 1]);
  }
  material.uniforms.spread.value.set(xmin, Math.max(.01, xmax - xmin), 1);
  if (asSurface) {
    const pencil = new DrawnLines(Float32Array.from(entry.outline), group, 5);
    return { ...entry, group, mesh, base, pencil };
  }
  const line = segmentsFrom(entry.outline);
  line.material.color.set('#eee0c6');
  line.material.opacity = .30;
  line.renderOrder = 5;
  group.add(line);
  return { ...entry, group, mesh, base };
}

function makePlants(plants, scene) {
  const pair = new THREE.IcosahedronGeometry(1, 2);
  const shell = pair.clone();
  shell.scale(1.047, 1.04, 1.047);
  const stem = new THREE.CylinderGeometry(.65, 1, 1, 6);
  const count = plants.reduce((sum, item) => sum + (item.kind === 'tree' ? 3 : 1), 0);
  const volumes = new THREE.InstancedMesh(pair, createFinish('foliage', solid), count);
  const outline = new THREE.InstancedMesh(shell, new THREE.MeshBasicMaterial({
    side: THREE.BackSide, color: '#efe8d7', transparent: true, opacity: .76, depthWrite: false,
  }), count);
  const stems = new THREE.InstancedMesh(stem, createFinish('stem', solid), plants.filter((p) => p.kind === 'tree').length);
  for (const instanced of [volumes, outline, stems]) {
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instanced.frustumCulled = false;
    scene.add(instanced);
  }
  const form = new THREE.Object3D();
  return (progress, offset) => {
    let volumeIndex = 0, stemIndex = 0;
    for (const item of plants) {
      const [x, base, z] = item.at;
      const [w, h, d] = item.size;
      const { x: dx, y: dy, z: dz } = offset(item.band);
      const random = plantSeed(item.id);
      const tree = item.kind === 'tree';
      const start = (tree ? .702 : .672) + random * .032;
      const growth = smooth(progress, start, start + (tree ? .044 : .038));
      if (!growth) continue;
      form.rotation.set(0, random * Math.PI, 0);
      const plantHeight = Math.min(tree ? h * .63 : h * .56, tree ? 9.9 : 3.4);
      if (tree) {
        form.position.set(x + dx, base + dy + plantHeight * growth * .30, z + dz);
        form.scale.set(.22 * growth, plantHeight * growth * .61, .22 * growth);
        form.updateMatrix();
        stems.setMatrixAt(stemIndex++, form.matrix);
      }
      const lobes = tree ? 3 : 1;
      for (let i = 0; i < lobes; i++) {
        const orbit = random * 6.3 + i * 2.094;
        const distance = tree ? w * .12 * growth : 0;
        const swayX = Math.cos(orbit) * distance;
        const swayZ = Math.sin(orbit) * distance;
        const volumeHeight = plantHeight * (tree ? .28 : .55) * growth;
        const radiusX = Math.min(w * (tree ? .25 : .29), tree ? 2.75 : 1.7) * growth;
        const radiusZ = Math.min(d * (tree ? .22 : .28), tree ? 2.5 : 1.6) * growth;
        form.position.set(x + dx + swayX, base + dy + plantHeight * growth * (tree ? .68 + i * .065 : .48), z + dz + swayZ);
        form.scale.set(radiusX, volumeHeight, radiusZ);
        form.updateMatrix();
        volumes.setMatrixAt(volumeIndex, form.matrix);
        outline.setMatrixAt(volumeIndex++, form.matrix);
      }
    }
    volumes.count = outline.count = volumeIndex;
    stems.count = stemIndex;
    for (const instanced of [volumes, outline, stems]) instanced.instanceMatrix.needsUpdate = true;
    return volumeIndex;
  };
}

export async function makeLandscape(scene) {
  const response = await fetch(gardenUrl);
  if (!response.ok) throw new Error(`Landscape request returned ${response.status}`);
  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  const garden = await new Response(stream).json();
  const surfaces = garden.surfaces.filter(({ kind }) => kind !== 'planter').map((entry) => meshLayer(entry, scene, true));
  const elevatedDetails = [
    ...garden.surfaces.filter(({ kind }) => kind === 'planter'),
    ...garden.details,
  ].map((entry) => meshLayer(entry, scene, false));
  const drawPlants = makePlants(garden.plants, scene);
  const ink = new THREE.Color('#e6b464');
  const surfaceEdge = new THREE.Color('#b0a79a');
  const sequenceOffset = { west: 0, center: .009, east: .017 };

  return {
    apply(progress, offset) {
      for (const { group, mesh, pencil, band, kind, region } of surfaces) {
        const shift = sequenceOffset[region];
        const draw = smooth(progress, .603 + shift, .644 + shift);
        const start = kind === 'soil' ? .666 : .638;
        const spread = smooth(progress, start + shift, start + shift + .060);
        const delta = offset(band);
        group.position.set(delta.x, delta.y, delta.z);
        group.visible = draw > 0 || spread > 0;
        mesh.visible = spread > 0;
        mesh.material.uniforms.spread.value.z = spread;
        pencil.lines.material.color.copy(ink).lerp(surfaceEdge, spread);
        pencil.apply(draw, THREE.MathUtils.lerp(.94, .48, spread));
      }
      for (const entry of elevatedDetails) {
        const start = entry.kind === 'planter' ? .664 + sequenceOffset[entry.region] : .736 + plantSeed(entry.ids[0]) * .024;
        const height = smooth(progress, start, start + .039);
        const delta = offset(entry.band);
        entry.group.visible = height > .0001;
        entry.group.scale.y = Math.max(.0001, height);
        entry.group.position.set(delta.x, delta.y + entry.base * (1 - height), delta.z);
      }
      return drawPlants(progress, offset);
    },
  };
}
