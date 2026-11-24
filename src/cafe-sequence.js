import * as THREE from 'three';
import { makeTerrace } from './terrace-scene.js';
import { setStreetView, setTableView } from './terrace-views.js';

export const cafeDuration = .26;
const { smoothstep: smooth, lerp } = THREE.MathUtils;

export function makeCafeSequence(scene, site, shell) {
  const table = makeTerrace(scene, site, shell);
  const terrace = table.parent;
  const paper = table.getObjectByName('C101 paper');
  const {angle, center, scale} = paper.userData.print;
  paper.updateWorldMatrix(true, false);
  // C101 project feet -> centered print -> physical paper on the round table.
  // Put the terrace in the inverse transform; the building itself never moves.
  const projectToTerrace = paper.matrixWorld.clone()
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, .35, -center.y))
    .multiply(new THREE.Matrix4().makeRotationY(-angle));
  projectToTerrace.invert().decompose(terrace.position, terrace.quaternion, terrace.scale);
  terrace.updateWorldMatrix(true, true);
  const unit = 1 / scale;
  const fog = scene.fog;
  fog.near *= unit;
  fog.far *= unit;
  scene.background = null;

  const ink = new Set();
  paper.traverse(node => { if (node.material) ink.add(node.material); });
  const surfaces = new Set();
  terrace.traverse(node => {
    if (node.material && !ink.has(node.material)) surfaces.add(node.material);
    if (node.isPointLight) {
      node.distance *= unit;
      node.intensity *= unit ** node.decay;
    }
  });
  function setOpacity(materials, opacity) {
    for (const material of materials) {
      const transparent = opacity < 1;
      material.opacity = opacity;
      material.depthWrite = !transparent;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
    }
  }

  const camera = new THREE.PerspectiveCamera();
  const outside = new THREE.PerspectiveCamera();
  const overhead = new THREE.OrthographicCamera();
  const point = new THREE.Vector3();
  const viewport = document.querySelector('.stage');
  return {
    camera,
    apply(time, reference, width, height) {
      terrace.visible = time < 1;
      scene.fog = terrace.visible ? fog : null;
      const opacity = 1 - smooth(time, .79, .982);
      viewport.style.setProperty('--cafe-sky', opacity);
      if (!terrace.visible) return;
      setOpacity(surfaces, opacity);
      setOpacity(ink, 1 - smooth(time, .865, .997));

      const aspect = width / height;
      setStreetView(outside, aspect, unit);
      setTableView(overhead, table, aspect, unit);
      const approach = smooth(time, .065, .58);
      const tilt = smooth(time, .15, .61);
      const ortho = smooth(time, .34, .61);
      const focus = smooth(time, .69, 1);

      // Stay on the street side of the entrance jamb, above the furniture and
      // below the awning. At the table the authored top-view frame is exact.
      point.lerpVectors(outside.position, overhead.position, approach);
      const distanceToPaper = (point.y - paper.position.y) * unit;
      camera.position.copy(terrace.localToWorld(point));
      camera.quaternion.copy(outside.quaternion).slerp(overhead.quaternion, tilt)
        .premultiply(terrace.quaternion);
      const fittedFov = THREE.MathUtils.radToDeg(2 * Math.atan(overhead.top / distanceToPaper));
      camera.fov = lerp(outside.fov, fittedFov, ortho);
      camera.aspect = aspect;
      camera.near = outside.near;
      camera.far = outside.far;
      camera.updateProjectionMatrix();
      const projection = camera.projectionMatrix.elements;
      for (let i = 0; i < 16; i++) {
        projection[i] = lerp(projection[i] / distanceToPaper, overhead.projectionMatrix.elements[i], ortho);
        projection[i] = lerp(projection[i], reference.projectionMatrix.elements[i], focus);
      }
      camera.position.lerp(reference.position, focus);
      camera.quaternion.slerp(reference.quaternion, focus);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.updateMatrixWorld();
    },
  };
}
