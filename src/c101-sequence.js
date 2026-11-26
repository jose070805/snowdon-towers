import * as THREE from 'three';
import './c101-sequence.css';

const {clamp, lerp, smoothstep: smooth} = THREE.MathUtils;
const noteWindows = [
  {key: 'road', label: '道路', from: 0, to: .266},
  {key: 'contour', label: '等高线', from: .022, to: .198},
  {key: 'massing', label: '周边体量', from: .248, to: .672},
  {key: 'parking', label: '停车', from: .283, to: .463},
  {key: 'landscape', label: '景观', from: .471, to: .862},
];

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
  function makeNote(text) {
    const node = document.createElement('div');
    node.className = 'c101-note';
    node.hidden = true;
    const line = document.createElement('i');
    const dot = document.createElement('i');
    line.className = 'c101-leader';
    dot.className = 'c101-dot';
    const label = document.createElement('span');
    label.textContent = text;
    node.append(line, dot, label);
    layer.append(node);
    return {node, label, line, dot};
  }
  const main = makeNote('落点');
  main.node.classList.add('c101-note--tower');
  const notes = noteWindows.map(entry => ({...entry, ...makeNote(entry.label)}));
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
  const road = nearestEdgePoint(site.layers.roads, 32, 56);
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
    const compact = width < 730;
    const taken = [];
    const labelBlock = titleBlock.getBoundingClientRect();
    function place(note, world, ink, xDirection, yDirection, pinned = false) {
      if (ink < .01) {
        note.node.hidden = true;
        return;
      }
      projected.copy(world).project(camera);
      const x = (.5 + .5 * projected.x) * width;
      const y = (.5 - .5 * projected.y) * height;
      note.node.hidden = !pinned && (x < 18 || x > width - 18 || y < 30 || y > height - 59);
      if (note.node.hidden) return;
      const labelWidth = note.label.offsetWidth;
      const labelHeight = note.label.offsetHeight;
      const overlap = (rect, box) => rect.left < box.right + 10 && rect.right + 10 > box.left &&
        rect.top < box.bottom + 8 && rect.bottom + 8 > box.top;
      let box;
      for (const side of [xDirection, -xDirection]) {
        for (const dir of [yDirection, -yDirection]) {
          const offset = compact ? 29 : pinned ? 71 : 52;
          const left = clamp(x + (side > 0 ? offset : -offset - labelWidth), compact ? 43 : 85, width - labelWidth - 24);
          const top = clamp(y + dir * (compact ? 31 : 39), compact ? 59 : 72, height - labelHeight - 107);
          const candidate = {left, top, right: left + labelWidth, bottom: top + labelHeight};
          if (!overlap(candidate, labelBlock) && !taken.some(other => overlap(candidate, other))) box = candidate;
          if (box) break;
        }
        if (box) break;
      }
      if (!box && pinned) {
        const left = clamp(x + 22, 43, width - labelWidth - 24);
        box = {left, right: left + labelWidth, top: 66, bottom: 66 + labelHeight};
      }
      note.node.hidden = !box;
      if (!box) return;
      taken.push(box);
      const dx = clamp(x, box.left, box.right) - x;
      const dy = clamp(y, box.top, box.bottom) - y;
      note.node.style.opacity = pinned || reduced ? 1 : ink;
      note.label.style.transform = `translate(${box.left}px,${box.top}px)`;
      note.dot.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      note.line.style.width = Math.hypot(dx, dy) + 'px';
      const reveal = pinned || reduced ? 1 : ink;
      note.line.style.transform = `translate(${x}px,${y}px) rotate(${Math.atan2(dy, dx)}rad) scaleX(${reveal})`;
    }
    const finalAnchor = towerGroup.node.localToWorld(towerVertex.clone());
    const point = footprint.clone().lerp(finalAnchor, smooth(progress, .592, .70));
    const label = progress < .45 ? '落点' : progress < .58 ? '基座' : '主楼';
    if (main.label.textContent !== label) main.label.textContent = label;
    place(main, point, 1, 1, -1, true);
    for (const note of notes) {
      const ink = reduced ? Number(progress >= note.from && progress < note.to)
        : smooth(progress, note.from, note.from + .045) * (1 - smooth(progress, note.to - .049, note.to));
      let point = road;
      if (note.key === 'contour') point = contour;
      else if (note.key !== 'road' && ink > .01) point = miniature.anchor(note.key);
      place(note, point, ink, -1, note.key === 'massing' || note.key === 'contour' ? -1 : 1);
    }
  };
}
