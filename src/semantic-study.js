import * as THREE from 'three';
import studyUrl from '../assets/semantic-plates.sdt?url';
import { meshGeometry } from './geometry.js';

const labels = [
  [696520, 'R3', 'roof caps'], [613075, 'R2', 'roof platform'], [964417, 'R1', ''],
  [593179, 'L5', 'upper terrace'], [593178, 'L4', ''], [593147, 'L3', 'residential plates'],
  [593177, 'L2', ''], [828874, 'M1', 'mezzanine'], [593142, 'L1', 'street floor'],
];

// The extra file contains source IDs, ranges into the existing assembled SDT and
// per-owner feature edges. Surfaces always come from the same quantized triangles.
export async function makeSemanticStudy(scene, model, landscape) {
  const response = await fetch(studyUrl);
  if (!response.ok) throw Error('Semantic study: ' + response.status);
  const binary = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const size = new DataView(binary).getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(binary, 4, size)));
  if (meta.version !== 1 || meta.triangles !== model.meta.triangles) throw Error('Semantic study version mismatch');
  landscape.bindRoofSupports(meta.roofSupports);
  const edges = new DataView(binary, 4 + size);
  const skin = new THREE.MeshBasicMaterial({color: '#152039', side: THREE.DoubleSide,
    transparent: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1});
  const gold = new THREE.LineBasicMaterial({color: '#dfaf64', transparent: true, depthWrite: false});
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  const batches = meta.batches.map(({ level, kind, floor, records, edgeRange: [offset, length] }) => {
    const positions = new Float32Array(records.reduce((n, row) => n + row[4], 0));
    let cursor = 0;
    for (const [, , , start, count] of records) {
      positions.set(model.read([start, count]), cursor);
      cursor += count;
    }
    const strokes = Float32Array.from({length}, (_, i) =>
      edges.getInt16((offset + i) * 2, true) / model.meta.quantization);
    const node = new THREE.Group();
    const slab = new THREE.Mesh(meshGeometry(positions), skin);
    const lines = new THREE.LineSegments(meshGeometry(strokes), gold);
    lines.renderOrder = 4;
    node.add(slab, lines);
    root.add(node);
    // Attach the legend to an actual right-hand vertex of a plate, never a
    // partition centroid or the empty space inside a level's bounding box.
    let anchor = null;
    if (kind === 'slab' || kind === 'roof') {
      let best = -Infinity;
      for (let i = 0; i < positions.length; i += 3) {
        const score = positions[i] - positions[i + 2] * .35;
        if (score > best) { best = score; anchor = new THREE.Vector3().fromArray(positions, i); }
      }
    }
    return {node, anchor, level, kind, floor, lift: meta.datums[level].liftFt};
  });
  const legend = document.createElement('div');
  legend.className = 'plate-legend';
  legend.setAttribute('aria-hidden', 'true');
  document.querySelector('.stage').append(legend);
  const entries = labels.map(([level, code, note]) => {
    const tag = document.createElement('span');
    const handwriting = document.createElement('em');
    handwriting.textContent = note;
    tag.append(code, handwriting);
    const line = document.createElement('i');
    legend.append(line, tag);
    return {tag, line, hosts: batches.filter(b => b.level === level && b.anchor)};
  });
  const point = new THREE.Vector3();
  return (street, camera, width, height, explodedOffset) => {
    const {study, split, explosion} = street;
    root.visible = study > .001;
    const ink = THREE.MathUtils.smoothstep(split, .45, .92) * study;
    legend.hidden = ink < .01;
    if (!root.visible) return;
    skin.opacity = study;
    gold.opacity = study * .94;
    for (const {node, kind, floor, lift} of batches) {
      const pos = explodedOffset(kind, floor, explosion);
      node.position.set(pos.x, pos.y + lift * split, pos.z);
    }
    if (legend.hidden) return;
    legend.style.opacity = ink;
    const compact = width < 730;
    const x = width - (compact ? 46 : 160);
    let previous = Math.min(compact ? 76 : 105, height * .16);
    const spacing = Math.min(compact ? 18 : 25, (height - 78 - previous) / entries.length);
    for (const [i, {tag, line, hosts}] of entries.entries()) {
      let left = -Infinity, top = 0;
      for (const {anchor, node} of hosts) {
        point.copy(anchor).add(node.position).project(camera);
        if (point.x > left) { left = point.x; top = point.y; }
      }
      const ax = (.5 + left / 2) * width;
      const ay = (.5 - top / 2) * height;
      const y = THREE.MathUtils.clamp(ay, previous + spacing, height - 78 - (entries.length - 1 - i) * spacing);
      previous = y;
      tag.style.transform = 'translate(' + x + 'px,' + y + 'px) translateY(-50%)';
      line.style.width = Math.hypot(x - 4 - ax, y - ay) + 'px';
      line.style.transform = 'translate(' + ax + 'px,' + ay + 'px) rotate(' + Math.atan2(y - ay, x - 4 - ax) + 'rad)';
    }
  };
}
