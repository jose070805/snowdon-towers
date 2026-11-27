import * as THREE from 'three';
import {makeFieldNote, placeFieldNotes} from './field-notes.js';
import './c101-sequence.css';

const {clamp, lerp, smoothstep: smooth} = THREE.MathUtils;
const noteWindows = [
  {key: 'road', label: 'road', from: 0, to: .40, side: -1, vertical: 1},
  {key: 'contour', label: 'contours', from: .145, to: .35, side: 1, vertical: -1},
  {key: 'massing', label: 'perimeter blocks', from: .32, to: 1, side: -1, vertical: -1},
  {key: 'parking', label: 'parking', from: .37, to: 1, side: -1, vertical: 1},
  {key: 'landscape', label: 'landscape', from: .55, to: 1, side: -1, vertical: 1},
];

function noteOpacity(progress, from, to, reduced) {
  if (progress < from || progress >= to) return 0;
  if (reduced) return 1;
  const fade = (to - from) * .20;
  return smooth(progress, from, from + fade) * (1 - smooth(progress, to - fade, to));
}

export function makeC101Sweep(materials) {
  const front = {value: -140};
  const strength = {value: 0};
  for (const material of materials) {
    material.onBeforeCompile = shader => {
      shader.uniforms.c101Front = front;
      shader.uniforms.c101Strength = strength;
      shader.vertexShader = 'varying float c101Position;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nc101Position = position.x - .36 * position.z;',
      );
      shader.fragmentShader = 'uniform float c101Front;\nuniform float c101Strength;\nvarying float c101Position;\n' +
        shader.fragmentShader.replace('#include <color_fragment>', `
          #include <color_fragment>
          float band = (1.0 - smoothstep(2.0, 23.0, abs(c101Position - c101Front))) * c101Strength;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, .69, .30), band);
          diffuseColor.a = max(diffuseColor.a, band * .92);
        `);
    };
  }
  return (progress, reduced) => {
    const finish = progress === null ? 0 : clamp((progress - .70) / .30, 0, 1);
    front.value = lerp(-140, 147, finish);
    strength.value = progress === null || reduced ? 0
      : .91 * smooth(finish, 0, .12) * (1 - smooth(finish, .87, 1));
  };
}

function closestVertex(group) {
  const desired = new THREE.Vector3(105, 30 - group.pivot, 38);
  const vertex = new THREE.Vector3();
  const chosen = new THREE.Vector3();
  let distance = Infinity;
  for (const mesh of group.node.children.filter(node => node.isMesh)) {
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i);
      const next = vertex.distanceToSquared(desired);
      if (next < distance) {
        chosen.copy(vertex);
        distance = next;
      }
    }
  }
  return chosen;
}

function nearestEdgePoint(segments, x, z) {
  const edge = segments.reduce((best, candidate) =>
    Math.hypot(candidate[0] - x, candidate[1] - z) < Math.hypot(best[0] - x, best[1] - z) ? candidate : best);
  return new THREE.Vector3((edge[0] + edge[2]) / 2, -.35, (edge[1] + edge[3]) / 2);
}

export function makeC101Overlay(stage, site, miniature, footprints, groups) {
  const layer = document.createElement('div');
  layer.className = 'c101-overlay';
  layer.hidden = true;
  const titleBlock = document.createElement('dl');
  titleBlock.className = 'c101-title-block';
  const values = ['Sheet', 'Stage', 'View', 'Focus'].map(field => {
    const cell = document.createElement('div');
    const label = document.createElement('dt');
    const value = document.createElement('dd');
    label.textContent = field;
    cell.append(label, value);
    titleBlock.append(cell);
    return value;
  });
  const main = makeFieldNote(layer, 'drop point', 'tower');
  main.node.classList.add('field-note--subject');
  const notes = noteWindows.map(entry => ({...entry, note: makeFieldNote(layer, entry.label)}));
  layer.append(titleBlock);
  stage.append(layer);

  const towerGroup = groups.find(group => group.node.name === 'heritage-2');
  const towerVertex = closestVertex(towerGroup);
  const outline = [];
  for (let i = 0; i < footprints.length; i += 6) {
    outline.push([footprints[i], footprints[i + 2], footprints[i + 3], footprints[i + 5]]);
  }
  const footprint = nearestEdgePoint(outline, towerVertex.x, towerVertex.z);
  const contour = nearestEdgePoint(site.layers.contours, 23, -118);
  const road = nearestEdgePoint(site.layers.roads, -60, 48);
  const drawingAnchors = {contour, road};
  const protectedElements = [titleBlock, ...stage.querySelectorAll('.viewstamp, .scale, .transport')];
  const towerBounds = new THREE.Box3();
  for (const {node} of groups) towerBounds.expandByObject(node);
  const corners = [towerBounds.min.x, towerBounds.max.x].flatMap(x =>
    [towerBounds.min.y, towerBounds.max.y].flatMap(y =>
      [towerBounds.min.z, towerBounds.max.z].map(z => new THREE.Vector3(x, y, z))));
  const projected = new THREE.Vector3();
  return (progress, chapter, camera, width, height, reduced) => {
    layer.hidden = progress === null;
    if (layer.hidden) return;
    const words = ['C101', chapter.view.split(' / ').at(-1),
      progress < .355 ? 'PLAN' : 'AXONOMETRIC',
      progress < .45 ? 'SITE' : progress < .919 ? 'TOWER' : 'SITE COMPLETE'];
    for (const [index, value] of values.entries()) {
      if (value.textContent !== words[index]) value.textContent = words[index];
    }
    const active = [];
    function project(note, world, ink, side, vertical, options = {}) {
      projected.copy(world).project(camera);
      const x = (.5 + .5 * projected.x) * width;
      const y = (.5 - .5 * projected.y) * height;
      if (x < 5 || x > width - 5 || y < 5 || y > height - 5) note.node.hidden = true;
      else active.push({note, anchor: {x, y}, ink, side, vertical, ...options});
    }
    const finalAnchor = towerGroup.node.localToWorld(towerVertex.clone());
    const point = footprint.clone().lerp(finalAnchor, smooth(progress, .592, .70));
    const label = progress < .45 ? 'drop point' : progress < .58 ? 'building base' : 'main building';
    if (main.label.textContent !== label) main.label.textContent = label;
    project(main, point, 1, 1, progress >= .58 ? -1 : 1, {subject: true});
    for (const {note, key, from, to, side, vertical} of notes) {
      const ink = noteOpacity(progress, from, to, reduced);
      if (ink < .001) note.node.hidden = true;
      else {
        const separateFrom = key === 'parking' && width < 730 && label === 'main building' ? main : undefined;
        project(note, drawingAnchors[key] ?? miniature.anchor(key), ink, side, vertical, {separateFrom});
      }
    }
    const drawing = progress >= .65 ? corners.map(corner => {
      projected.copy(corner).project(camera);
      return {x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2};
    }) : undefined;
    placeFieldNotes(active, width, height, protectedElements, drawing);
  };
}
