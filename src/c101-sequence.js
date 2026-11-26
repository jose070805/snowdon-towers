import * as THREE from 'three';
import './c101-sequence.css';

const {clamp, lerp, smoothstep: smooth} = THREE.MathUtils;
const noteWindows = [
  {key: 'road', label: '道路', from: 0, to: .40, lane: 'lower-left'},
  {key: 'contour', label: '等高线', from: .145, to: .35, lane: 'upper-right'},
  {key: 'massing', label: '周边体量', from: .32, to: 1, lane: 'upper-left'},
  {key: 'parking', label: '停车', from: .37, to: 1, lane: 'lower-left'},
  {key: 'landscape', label: '景观', from: .55, to: 1, lane: 'bottom'},
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
  function makeNote(text) {
    const node = document.createElement('div');
    node.className = 'c101-note';
    node.hidden = true;
    const line = document.createElement('i');
    const dot = document.createElement('i');
    line.className = 'c101-leader';
    dot.className = 'c101-dot';
    line.setAttribute('aria-hidden', 'true');
    dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = text;
    label.lang = 'zh-CN';
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
  const drawingAnchors = {contour, road};
  const transport = stage.querySelector('.transport');
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
    const topLimit = compact ? 74 : 115;
    const transportTop = transport.getBoundingClientRect().top;
    const inset = lerp(width * .17, Math.max(30, width * .04), smooth(progress, .58, .77));
    function place(note, world, ink, lane) {
      note.node.hidden = false;
      projected.copy(world).project(camera);
      const x = (.5 + .5 * projected.x) * width;
      const y = (.5 - .5 * projected.y) * height;
      const labelWidth = note.label.offsetWidth;
      const labelHeight = note.label.offsetHeight;
      const tower = lane === 'tower';
      const right = tower || lane.endsWith('right');
      const upper = lane.startsWith('upper');
      const lowerCenter = lane === 'bottom';
      const gutter = compact ? width * .14 : inset;
      const left = lowerCenter
        ? clamp(compact ? width * .51 - labelWidth / 2 : x + 18, 48, width - gutter - labelWidth)
        : right ? width - gutter - labelWidth : Math.max(compact ? 47 : 96, gutter);
      const mobileRow = tower ? .71 : lerp(.71, .79, smooth(progress, .55, .70));
      const belowModel = compact ? height * mobileRow : lowerCenter ? Math.max(y + 42, height * .82) : y + 42;
      const aboveModel = compact ? height * .31 : Math.min(y - 52, height * .16);
      const preferredTop = tower ? lerp(belowModel, aboveModel, smooth(progress, .58, .70))
        : upper ? aboveModel : belowModel;
      const overTitle = left < labelBlock.right + 8 && left + labelWidth + 8 > labelBlock.left;
      const bottomLimit = overTitle ? Math.min(transportTop, labelBlock.top) : transportTop;
      const limit = Math.max(topLimit, bottomLimit - labelHeight - 14);
      const desiredTop = clamp(preferredTop, topLimit, limit);
      const step = labelHeight + 9;
      const boxAt = top => ({left, top, right: left + labelWidth, bottom: top + labelHeight});
      const candidates = [desiredTop, desiredTop - step, desiredTop + step,
        desiredTop - 2 * step, desiredTop + 2 * step, topLimit, limit];
      const box = candidates.filter(top => top >= topLimit && top <= limit).map(boxAt).find(rect =>
        !taken.some(other => rect.left < other.right + 8 && rect.right + 8 > other.left &&
          rect.top < other.bottom + 8 && rect.bottom + 8 > other.top)) ?? boxAt(desiredTop);
      taken.push(box);
      const dx = clamp(x, box.left, box.right) - x;
      const dy = clamp(y, box.top, box.bottom) - y;
      note.node.style.opacity = ink;
      note.label.style.transform = `translate(${box.left}px,${box.top}px)`;
      note.dot.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      note.line.style.width = Math.hypot(dx, dy) + 'px';
      note.line.style.transform = `translate(${x}px,${y}px) rotate(${Math.atan2(dy, dx)}rad)`;
    }
    const finalAnchor = towerGroup.node.localToWorld(towerVertex.clone());
    const point = footprint.clone().lerp(finalAnchor, smooth(progress, .592, .70));
    const label = progress < .45 ? '落点' : progress < .58 ? '基座' : '主楼';
    if (main.label.textContent !== label) main.label.textContent = label;
    place(main, point, 1, 'tower');
    for (const note of notes) {
      const ink = noteOpacity(progress, note.from, note.to, reduced);
      if (ink < .001) {
        note.node.hidden = true;
        continue;
      }
      place(note, drawingAnchors[note.key] ?? miniature.anchor(note.key), ink, note.lane);
    }
  };
}
