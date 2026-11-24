import * as THREE from 'three';
import { segmentsFrom } from './geometry.js';
import treeLocations from '../assets/site-planting.json';

const { smoothstep: smooth } = THREE.MathUtils;

export function makeMiniatureSite(scene, site) {
  const root = new THREE.Group();
  root.name = 'miniature-site';
  scene.add(root);

  // C101 is a flattened DXF. The plinth and tree silhouettes are a diagrammatic
  // model of that survey, with source locations rather than assumed building heights.
  const study = new THREE.Group();
  const plaster = new THREE.MeshBasicMaterial({color: '#bfc5be', transparent: true, depthWrite: false});
  const edge = new THREE.MeshBasicMaterial({color: '#797f7d', transparent: true, depthWrite: false});
  const stand = new THREE.Mesh(new THREE.BoxGeometry(488, 6, 462),
    [edge, edge, plaster, edge, edge, edge]);
  stand.position.set(13, -5.2, 35);
  stand.renderOrder = -2;
  study.add(stand);
  // Closed context outlines from the linked C101 drawing. Their coordinates
  // stay in project feet; the uniform heights are study-model extrusions.
  const west = [[-209.62,-186.62], [-182.62,-156.62], [-152.62,-126.62]];
  const footprints = [
    ...west.map(([left,right]) => [[left,-37.83], [right,-37.83], [right,33.17], [left,33.17]]),
    [[124.5,157], [131.4,130.4], [115.4,126.2], [121.9,87.6], [197.4,107.3], [184.3,144.2], [166.3,139.5], [158.7,168.9]],
  ];
  const massing = new THREE.Group();
  massing.name = 'C101 context massing';
  for (const footprint of footprints) {
    const shape = new THREE.Shape(footprint.map(([x,z]) => new THREE.Vector2(x, -z)));
    const geometry = new THREE.ExtrudeGeometry(shape, {depth: 13, bevelEnabled: false});
    geometry.rotateX(-Math.PI / 2);
    const block = new THREE.Mesh(geometry, [plaster, edge]);
    block.position.y = -2.14;
    massing.add(block);
  }
  study.add(massing);
  const stripes = [['roads', 0x55616a, .68], ['context', 0x69777a, .44], ['contours', 0x8d9893, .33]].map(
    ([layer, color, ink]) => {
      const values = site.layers[layer].flatMap(([x, z, endX, endZ]) => [x, -2.12, z, endX, -2.12, endZ]);
      const lines = segmentsFrom(values);
      lines.material.color.setHex(color);
      lines.renderOrder = -1;
      study.add(lines);
      return {lines, ink};
    },
  );
  const canopyGeometry = new THREE.IcosahedronGeometry(4.6, 1);
  for (const [x, z] of treeLocations) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.38, .52, 5.4, 6), edge);
    trunk.position.set(x, .6, z);
    const canopy = new THREE.Mesh(canopyGeometry, plaster);
    canopy.scale.y = 1.28;
    canopy.position.set(x, 5.2, z);
    study.add(trunk, canopy);
  }
  root.add(study);
  return (story, context) => {
    root.visible = story > -.041 && context > .001;
    if (!root.visible) return;
    const lift = smooth(story, -.041, .082);
    const retreat = 1 - smooth(story, .22, .67) * .55;
    const strength = smooth(story, -.041, .031) * retreat * context;
    study.visible = strength > .001;
    study.position.y = -8 * (1 - lift);
    plaster.opacity = strength * .84;
    edge.opacity = strength * .79;
    for (const {lines, ink} of stripes) lines.material.opacity = strength * ink;
  };
}
