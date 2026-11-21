import * as THREE from 'three';
import elevationUrl from '../assets/south-elevations.json?url';
import { meshGeometry, segmentsFrom } from './geometry.js';

const smooth = THREE.MathUtils.smoothstep;

export const earlySequenceScale = .8;

export function streetSequence(progress) {
  const returnToAxon = smooth(progress, .839, .914);
  return {
    approach: smooth(progress, .698, .769) * (1 - returnToAxon),
    headOn: smooth(progress, .769, .789),
    drawing: smooth(progress, .781, .796) * (1 - smooth(progress, .836, .872)),
    wire: smooth(progress, .752, .776),
    comparison: smooth(progress, .803, .829),
    shell: smooth(progress, .890, .928),
    datum: smooth(progress, .890, .907) * (1 - smooth(progress, .929, .952)),
    study: smooth(progress, .917, .945) * (1 - smooth(progress, 1.065, 1.104)),
    split: smooth(progress, .938, .985) * (1 - smooth(progress, 1.031, 1.094)),
    explosion: smooth(progress, 1.034, 1.115),
  };
}

// Street elevations share project X/Y. This drawing plane sits in front of the street wall.
const streetPlane = 39;

function makeLinework(values, color, existing, order) {
  const positions = new Float32Array(values.length * 1.5);
  for (let i = 0, vertex = 0; i < values.length; i += 2, vertex += 3) {
    positions.set([values[i], values[i + 1], streetPlane], vertex);
  }
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      ink: { value: new THREE.Color(color) },
      opacity: { value: 0 },
      boundary: { value: 0 },
      existing: { value: existing ? 1 : 0 },
    },
    vertexShader: /* glsl */`
      varying float paperX;
      void main() {
        paperX = position.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 ink;
      uniform float opacity;
      uniform float boundary;
      uniform float existing;
      varying float paperX;
      void main() {
        float wipe = 1. - smoothstep(boundary - 5., boundary + 5., paperX);
        float coverage = mix(wipe, mix(1., .09, wipe), existing);
        gl_FragColor = vec4(ink, opacity * coverage);
        #include <colorspace_fragment>
      }
    `,
  });
  const lines = new THREE.LineSegments(meshGeometry(positions), material);
  lines.visible = false;
  lines.renderOrder = order;
  return lines;
}

export async function makeSouthElevations(scene) {
  const response = await fetch(elevationUrl);
  if (!response.ok) throw new Error(`Elevation request returned ${response.status}`);
  const { existing, proposed } = await response.json();
  const lines = [
    makeLinework(existing, '#c79e60', true, 6),
    makeLinework(proposed, '#d9a34c', false, 7),
  ];
  const building = lines[1].geometry;
  building.computeBoundingBox();
  const { min, max } = building.boundingBox;
  scene.add(...lines);
  return ({ drawing, comparison }) => {
    const boundary = THREE.MathUtils.lerp(min.x - 8, max.x + 8, comparison);
    for (const [index, layer] of lines.entries()) {
      layer.visible = drawing > .002;
      layer.material.uniforms.opacity.value = drawing * (index === 0 ? .72 : .95);
      layer.material.uniforms.boundary.value = boundary;
    }
  };
}

export function makeSectionDatums(scene, stage) {
  // A301 longitudinal section, P3 p.1. The Web origin is six feet below Block 43.
  const levels = [
    { text: 'L1   0′–0″', y: 6 },
    { text: 'L3  18′–10″', y: 6 + 18 + 10 / 12 },
    { text: 'L5  45′–6″', y: 6 + 45.5 },
    { text: 'R3  68′–10″', y: 6 + 68 + 10 / 12 },
  ];
  const x = 103;
  const z = -15;
  const strokes = [x, levels[0].y, z, x, levels.at(-1).y, z];
  const labels = levels.map(({ text, y }) => {
    const label = document.createElement('span');
    label.className = 'section-datum';
    label.textContent = text;
    label.hidden = true;
    label.setAttribute('aria-hidden', 'true');
    stage.append(label);
    strokes.push(x - 4, y, z, x + 1.4, y, z);
    return { label, at: new THREE.Vector3(x + 2.5, y, z) };
  });
  const rule = segmentsFrom(strokes);
  rule.visible = false;
  scene.add(rule);
  const point = new THREE.Vector3();
  return (opacity, camera, width, height) => {
    rule.visible = opacity > .002;
    rule.material.opacity = opacity * .50;
    for (const { label, at } of labels) {
      label.hidden = !rule.visible;
      if (label.hidden) continue;
      point.copy(at).project(camera);
      const left = Math.min((.5 + point.x * .5) * width, width - (width < 730 ? 67 : 79));
      const top = (.5 - point.y * .5) * height;
      label.style.transform = `translate(${left}px, ${top}px) translateY(-50%)`;
      label.style.opacity = opacity;
    }
  };
}
