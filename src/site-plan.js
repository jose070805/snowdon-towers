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

// Reuse the registered C101 strokes and its sheet bearing for the full-bleed underlay.
function makeSiteTrace(site, footprints) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('site-trace');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.opacity = 0;
  const { bearing, x, z } = site.camera;
  const group = document.createElementNS(ns, 'g');
  group.setAttribute('transform', 'rotate(' + bearing * 180 / Math.PI + ') translate(' + -x + ' ' + -z + ')');
  svg.append(group);
  function addPath(segments, opacity) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', segments.map(([a,b,c,d]) => 'M' + a + ' ' + b + 'L' + c + ' ' + d).join(''));
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    path.setAttribute('opacity', opacity);
    group.append(path);
  }
  for (const { key, ink } of layers) {
    if (key !== 'locator') addPath(site.layers[key], ink);
  }
  const outline = [];
  for (let i = 0; i + 5 < footprints.length; i += 6) {
    outline.push([footprints[i], footprints[i + 2], footprints[i + 3], footprints[i + 5]]);
  }
  addPath(outline, .85);
  document.getElementById('scene').before(svg);
  const box = svg.getBBox();
  svg.setAttribute('viewBox', [box.x - 2, box.y - 2, box.width + 4, box.height + 4].join(' '));
  return svg;
}

export async function makeSitePlan(scene, footprints) {
  const response = await fetch(siteUrl);
  if (!response.ok) throw new Error(`Site plan request returned ${response.status}`);
  const site = await response.json();
  const officePlate = document.querySelector('.drawing-sheet');
  const trace = makeSiteTrace(site, footprints);
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
    apply(progress) {
      const fade = 1 - smooth(progress, .135, .273);
      trace.style.opacity = (.10 + .12 * smooth(progress, .13, .32)).toFixed(3);
      officePlate.style.setProperty('--sheet-opacity', fade);
      let tip = null;
      for (const { key, from, to, ink, pencil } of byPhase) {
        const fraction = scale(key === 'locator' ? .13 : .26, 1, smooth(progress, from, to));
        const opacity = key === 'locator' ? ink * (1 - smooth(progress, .193, .284)) : ink * fade;
        if (pencil.apply(fraction, opacity)) tip = pencil.tip;
      }
      return tip;
    },
  };
}
