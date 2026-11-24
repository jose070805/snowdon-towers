import * as THREE from 'three';
import { segmentsFrom } from './geometry.js';
import treeLocations from '../assets/site-planting.json';

const { smoothstep: smooth } = THREE.MathUtils;

export function makeMiniatureSite(scene, site) {
  const root = new THREE.Group();
  root.name = 'miniature-site';
  scene.add(root);

  const sheet = new THREE.Group();
  sheet.position.set(site.camera.x, -.395, site.camera.z);
  sheet.rotation.y = site.camera.bearing;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(site.camera.width, site.camera.height),
    new THREE.MeshBasicMaterial({color: '#132b4a', transparent: true, depthWrite: false}));
  paper.rotation.x = -Math.PI / 2;
  paper.renderOrder = 1;
  sheet.add(paper);
  root.add(sheet);

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
  const stripes = [['roads', 0x566772, .52], ['context', 0x69777a, .44], ['contours', 0x8d9893, .33]].map(
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
    root.visible = context > .001;
    if (!root.visible) return;
    const lift = smooth(story, -.029, .089);
    const retreat = 1 - smooth(story, .22, .67) * .61;
    const strength = lift * retreat * context;
    const paperInk = context * (1 - smooth(story, -.013, .18) * .86);
    paper.material.opacity = paperInk;
    study.visible = strength > .001;
    study.position.y = -8 * (1 - lift);
    plaster.opacity = strength * .66;
    edge.opacity = strength * .79;
    for (const {lines, ink} of stripes) lines.material.opacity = strength * ink;
  };
}
