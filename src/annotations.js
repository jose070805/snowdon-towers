import * as THREE from 'three';
import {makeFieldNote, placeFieldNotes} from './field-notes.js';
import './annotations.css';

// Anchors use the model's feet and ride their original explosion groups.
const layers = [.956, 1.008];
const notes = [
  { text: 'retained frontage', at: [53.94, 34.93, 36.17], group: 'heritage-2', mobile: true },
  { text: 'floor plates', at: [-80, 38.16, -2.3], group: 'slab-3', mobile: true },
  { text: 'roof platform', at: [-.63, 66.09, -22.84], group: 'roof-6', up: true, mobile: true },
  { text: 'solar envelope', at: [-67.65, 43.26, 11.1], group: 'envelope-4', up: true },
  { text: 'terrace pergola', at: [74, 66.25, -24], group: 'roof-6', up: true },
];

const smooth = THREE.MathUtils.smoothstep;
export function makeAnnotations(groups) {
  const container = document.getElementById('annotations');
  const protectedElements = [...container.closest('.stage').querySelectorAll('.viewstamp, .scale, .transport')];
  const index = new Map(groups.map(group => [group.node.name, group]));
  const entries = notes.map(entry => ({...entry, group: index.get(entry.group),
    note: makeFieldNote(container, entry.text)}));
  const point = new THREE.Vector3();
  return (camera, width, height, progress, reduced) => {
    const [start, end] = layers;
    const ink = smooth(progress, start, start + .014) * (1 - smooth(progress, end - .012, end));
    const compact = width < 730;
    const margin = compact ? 20 : 40;
    const shown = [];
    for (const {at, group, mobile, up, note} of entries) {
      if (!ink || (compact && !mobile)) {
        note.node.hidden = true;
        continue;
      }
      point.fromArray(at);
      if (group) {
        point.y -= group.pivot;
        group.node.localToWorld(point);
      }
      point.project(camera);
      const x = (.5 + point.x * .5) * width;
      const y = (.5 - point.y * .5) * height;
      const visible = ink > .005 && group?.node.visible !== false && Math.abs(point.z) <= 1 &&
        x >= margin && x <= width - margin && y >= 35 && y <= height - 52;
      if (visible) shown.push({note, anchor: {x, y}, ink: reduced ? 1 : ink,
        side: x < width * .56 ? -1 : 1, vertical: up ? -1 : 1});
      else note.node.hidden = true;
    }
    if (placeFieldNotes(shown, width, height, protectedElements) === 1) {
      for (const {note} of shown) note.node.hidden = true;
    }
  };
}
