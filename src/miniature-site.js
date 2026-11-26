import * as THREE from 'three';
import { segmentsFrom } from './geometry.js';
import treeLocations from '../assets/site-planting.json';
import siteSurfaces from '../assets/site-surfaces.json';

const { lerp, smoothstep: smooth } = THREE.MathUtils;
const top = -2.18;
const swatches = {
  asphalt: '#42474a',
  parking: '#393d41',
  walk: '#b8b9b0',
  ramp: '#90978f',
  green: '#6b8849',
  rear: '#7c934f',
};

function shapeFor(outline) {
  return new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
}

export function makeMiniatureSite(scene) {
  const root = new THREE.Group();
  root.name = 'miniature-site';
  scene.add(root);

  const study = new THREE.Group();
  root.add(study);
  const materials = new Map();
  const anchors = {};
  function track(material, opacity) {
    const base = material.color.clone();
    const grey = base.clone().lerp(new THREE.Color('#8e9189'), .6);
    materials.set(material, {opacity, base, grey});
  }
  function finish(color, opacity = 1) {
    const material = new THREE.MeshLambertMaterial({color, transparent: true, depthWrite: false});
    track(material, opacity);
    return material;
  }
  const plaster = finish('#e5e4dc');
  const wall = finish('#d5d8d3');
  const ground = finish('#728248');
  const soil = finish('#4c3727');
  const surfaceFinishes = Object.fromEntries(Object.entries(swatches).map(([kind, color]) => [kind, finish(color)]));
  const [xmin, zmin, xmax, zmax] = siteSurfaces.plate;
  const thickness = 35;
  const stand = new THREE.Mesh(new THREE.BoxGeometry(xmax - xmin, thickness, zmax - zmin),
    [soil, soil, ground, soil, soil, soil]);
  stand.name = 'Site section base';
  stand.position.set((xmin + xmax) / 2, top - thickness / 2, (zmin + zmax) / 2);
  study.add(stand);

  const surfaces = new THREE.Group();
  surfaces.name = 'C101 street and landscape surfaces';
  for (const [index, {points, kind, name}] of siteSurfaces.surfaces.entries()) {
    const geometry = new THREE.ShapeGeometry(shapeFor(points));
    geometry.rotateX(-Math.PI / 2);
    const patch = new THREE.Mesh(geometry, surfaceFinishes[kind]);
    patch.name = kind;
    patch.userData.siteSurface = name;
    patch.position.y = top + .05 + .012 * index;
    surfaces.add(patch);
  }
  study.add(surfaces);
  const parkingInk = segmentsFrom(siteSurfaces.markings.flatMap(([x, z, endX, endZ]) =>
    [x, top + .48, z, endX, top + .48, endZ]));
  parkingInk.name = 'Original linked parking stripes';
  parkingInk.material.color.set('#e0dfc9');
  track(parkingInk.material, .9);
  const stripe = siteSurfaces.markings.reduce((best, line) =>
    Math.hypot(line[0] + 157, line[1] - 105) < Math.hypot(best[0] + 157, best[1] - 105) ? line : best);
  anchors.parking = new THREE.Vector3((stripe[0] + stripe[2]) / 2, top + .48, (stripe[1] + stripe[3]) / 2);
  study.add(parkingInk);

  const edgeInk = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false });
  track(edgeInk, .53);
  const massing = new THREE.Group();
  massing.name = 'C101 context massing';
  for (const {points, height, name} of siteSurfaces.footprints) {
    const geometry = new THREE.ExtrudeGeometry(shapeFor(points), {depth: height, bevelEnabled: false});
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    const block = new THREE.Mesh(geometry, [plaster, wall]);
    block.name = name;
    block.position.y = top + .52;
    if (name === 'West street block 3') {
      const [x, z] = points[2];
      anchors.massing = new THREE.Vector3(x, block.position.y + height, z);
    }
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edgeInk);
    edges.renderOrder = 1;
    block.add(edges);
    massing.add(block);
  }
  study.add(massing);
  const bark = finish('#948d68');
  const foliage = finish('#90a667');
  const trunkGeometry = new THREE.CylinderGeometry(.4, .65, 8.6, 6);
  const crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  const crownOutline = new THREE.EdgesGeometry(crownGeometry, 39);
  for (const [index, [x, z]] of treeLocations.entries()) {
    const trunk = new THREE.Mesh(trunkGeometry, bark);
    trunk.position.set(x, top + 4.3, z);
    study.add(trunk);
    for (let branch = 0; branch < 3; branch++) {
      const angle = 2.094 * branch + index * .41;
      const radius = 3.55 + ((index * 3 + branch) % 4) * .36;
      const canopy = new THREE.Mesh(crownGeometry, foliage);
      canopy.scale.set(radius, radius * 1.24, radius * .95);
      canopy.position.set(x + Math.cos(angle) * 2.35, top + 7.3 + branch * 1.28, z + Math.sin(angle) * 2.35);
      canopy.add(new THREE.LineSegments(crownOutline, edgeInk));
      if (index === 6 && branch === 2) anchors.landscape = canopy.position.clone();
      study.add(canopy);
    }
  }

  const fill = new THREE.HemisphereLight('#e4edff', '#8b7b5c', 1.55);
  const sun = new THREE.DirectionalLight('#fff2d0', 1.9);
  sun.position.set(-242, 380, 145);
  study.add(fill, sun, sun.target);

  return {
    anchor(key) { return study.localToWorld(anchors[key].clone()); },
    apply(story, context, progress) {
      root.visible = (progress === null ? story > -.041 : progress > .20) && context > .001;
      if (!root.visible) return;
      const lift = progress === null ? smooth(story, -.041, .082) : smooth(progress, .20, .45);
      const intro = progress === null ? smooth(story, -.041, .034) : smooth(progress, .20, .44);
      const desaturate = progress === null ? 0
        : .56 * smooth(progress, .45, .58) * (1 - smooth(progress, .89, 1));
      const fade = 1 - .36 * smooth(story, .212, .555) *
        (progress === null ? 1 : smooth(progress, .74, .95));
      const strength = intro * fade * context;
      study.visible = strength > .001;
      study.position.y = -8 * (1 - lift);
      // Keep the architectural ground glow but tone down the site beneath the
      // later exploded view so the amber structural edges still lead.
      for (const [material, {opacity, base, grey}] of materials) {
        material.color.copy(base).lerp(grey, desaturate);
        material.opacity = strength * opacity;
        if (!material.isLineBasicMaterial) {
          const opaque = material.opacity >= .995;
          if (material.transparent === opaque) {
            material.transparent = !opaque;
            material.depthWrite = opaque;
            material.needsUpdate = true;
          }
        }
      }
    },
  };
}
