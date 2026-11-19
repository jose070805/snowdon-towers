import * as THREE from 'three';
import { DrawnLines } from './geometry.js';
import siteUrl from '../assets/site-plan.json?url';

const smooth = THREE.MathUtils.smoothstep;
const scale = THREE.MathUtils.lerp;
const layers = [
  { key: 'boundary', from: 0, to: .041, ink: .63 },
  { key: 'roads', from: .006, to: .071, ink: .82 },
  { key: 'contours', from: .018, to: .087, ink: .29 },
  { key: 'context', from: .027, to: .104, ink: .48 },
  { key: 'locator', from: .051, to: .10, ink: 1 },
];

export async function makeSitePlan(scene, footprints) {
  const response = await fetch(siteUrl);
  if (!response.ok) throw new Error(`Site plan request returned ${response.status}`);
  const site = await response.json();
  const officePlate = document.querySelector('.drawing-sheet');
  const pin = document.querySelector('.site-pin');
  const project = new THREE.Vector3();
  const datasets = { ...site.layers, locator: Array.from(footprints) };
  const byPhase = layers.map((layer) => {
    const geometry = layer.key === 'locator'
      ? datasets.locator
      : datasets[layer.key].flatMap(([x0, z0, x1, z1]) => [x0, -0.35, z0, x1, -0.35, z1]);
    const pencil = new DrawnLines(Float32Array.from(geometry), scene, 2);
    if (layer.key === 'locator') pencil.lines.material.color.set('#f3ba61');
    return { ...layer, pencil };
  });

  return {
    focus: site.camera,
    apply(progress, camera, width, height) {
      const fade = 1 - smooth(progress, .135, .273);
      officePlate.style.setProperty('--sheet-opacity', fade);
      let tip = null;
      for (const { key, from, to, ink, pencil } of byPhase) {
        const fraction = scale(key === 'locator' ? .13 : .26, 1, smooth(progress, from, to));
        const opacity = key === 'locator' ? ink * (1 - smooth(progress, .193, .284)) : ink * fade;
        if (pencil.apply(fraction, opacity)) tip = pencil.tip;
      }
      const labelAlpha = smooth(progress, .039, .083) * (1 - smooth(progress, .175, .268));
      if (labelAlpha > .005) {
        project.set(27, -.10, -9).project(camera);
        const x = (project.x * .5 + .5) * width;
        const y = (.5 - project.y * .5) * height;
        pin.style.transform = `translate(${x}px,${y}px) translateY(-50%)`;
      }
      pin.style.opacity = labelAlpha;
      return tip;
    },
  };
}
