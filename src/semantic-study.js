import * as THREE from 'three';
import studyUrl from '../assets/semantic-plates.sdt?url';
import plansUrl from '../assets/floor-plans.sdp?url';
import { meshGeometry } from './geometry.js';
import { floors } from './floor-sequence.js';

async function unpack(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error('Floor asset: ' + response.status);
  return new Response(response.body.pipeThrough(new DecompressionStream('gzip')));
}

function levelNavigation(jump) {
  const nav = document.createElement('nav');
  nav.className = 'floor-nav';
  nav.setAttribute('aria-label', '楼层俯视');
  nav.hidden = true;
  const buttons = floors.map(floor => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = floor.label;
    button.setAttribute('aria-label', '俯视 ' + floor.label);
    button.addEventListener('click', () => jump(floor.stop));
    nav.append(button);
    return button;
  });
  document.querySelector('.stage').append(nav);
  return (visible, active) => {
    nav.hidden = !visible;
    buttons.forEach((button, i) => button.setAttribute('aria-current', floors[i] === active ? 'step' : 'false'));
  };
}

export async function makeSemanticStudy(scene, model, landscape, jump) {
  const [binary, drawings] = await Promise.all([
    unpack(studyUrl).then(r => r.arrayBuffer()), unpack(plansUrl).then(r => r.json()),
  ]);
  const size = new DataView(binary).getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(binary, 4, size)));
  if (meta.version !== 1 || meta.triangles !== model.meta.triangles) throw Error('Semantic study version mismatch');
  const payload = new DataView(binary, 4 + size);
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  const plates = new THREE.Group();
  root.add(plates);
  const roofLevels = new Set([964417, 613075, 1925045, 696520]);
  const gold = new THREE.LineBasicMaterial({color: '#dfaf64', transparent: true, depthWrite: false});
  const roofGold = gold.clone();
  const layers = floors.map(floor => {
    const plan = new THREE.Group();
    root.add(plan);
    const detail = gold.clone(), fine = gold.clone(), cut = gold.clone();
    const bounds = new THREE.Box3();
    const drawing = drawings.plans[floor.code];
    for (const [index, coords] of drawing.ink.entries()) {
      const positions = new Float32Array(coords.length * 1.5);
      for (let i = 0, vertex = 0; i < coords.length; i += 2, vertex += 3) {
        positions[vertex] = coords[i] / drawings.unitsPerFoot;
        positions[vertex+2] = coords[i+1] / drawings.unitsPerFoot;
      }
      const geometry = meshGeometry(positions);
      geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox);
      plan.add(new THREE.LineSegments(geometry, [detail, fine, cut][index]));
    }
    const datum = meta.datums[floor.level];
    plan.position.y = datum ? datum.zFt + 6 + datum.liftFt : -16 - 11/12 + 6;
    return {plan, detail, fine, cut, bounds};
  });
  const mezzanine = document.createElement('span');
  mezzanine.className = 'section-datum mezzanine-datum';
  // A301 (P1 p.14) confirms the M1 datum, 5′–6″ above Block 43.
  mezzanine.textContent = 'M1  5′–6″';
  mezzanine.hidden = true;
  document.querySelector('.stage').append(mezzanine);
  const mezzanineId = 828874;
  const anchor = new THREE.Vector3();
  const projected = new THREE.Vector3();
  let mezzanineLine;
  const batches = meta.batches.map(({level, kind, floor, edgeRange: [offset, length]}) => {
    const strokes = Float32Array.from({length}, (_, i) =>
      payload.getInt16((offset + i) * 2, true) / model.meta.quantization);
    const line = new THREE.LineSegments(meshGeometry(strokes), roofLevels.has(level) ? roofGold : gold);
    plates.add(line);
    if (level === mezzanineId) {
      for (let i = 0; i < strokes.length; i += 3) {
        if (!i || strokes[i] < anchor.x) anchor.fromArray(strokes, i);
      }
      mezzanineLine = line;
    }
    return {line, kind, floor, lift: meta.datums[level].liftFt};
  });
  for (const {geometry, band, lift} of landscape.supportedEdges(meta.roofSupports)) {
    const line = new THREE.LineSegments(geometry, roofGold);
    plates.add(line);
    batches.push({line, kind: 'roof', floor: band, lift});
  }

  const navigation = levelNavigation(jump);
  const frames = layers.map(({bounds, plan}) => ({
    x: (bounds.min.x + bounds.max.x) / 2, y: plan.position.y, z: (bounds.min.z + bounds.max.z) / 2,
    width: Math.max(15, bounds.max.x - bounds.min.x), depth: Math.max(10, bounds.max.z - bounds.min.z),
  }));
  return {
    frame({from, to, blend}) {
      const a = frames[from], b = frames[to];
      return Object.fromEntries(Object.keys(a).map(k => [k, THREE.MathUtils.lerp(a[k], b[k], blend)]));
    },
    apply(street, page, camera, width, height, offset) {
      const {study, split, explosion, overhead, planReveal} = street;
      root.visible = study > .001;
      navigation(study >= .96, overhead >= .99 ? page.active : null);
      const plateVisibility = study * (1 - overhead);
      mezzanine.hidden = plateVisibility < .24 || !mezzanineLine;
      if (!root.visible) return;
      gold.opacity = .94 * plateVisibility;
      // The roof lines and A106 share project X/Z. At the orthographic pole
      // their different heights are immaterial, so the contour needs no offset.
      roofGold.opacity = .94 * study * (1 - planReveal);
      plates.visible = roofGold.opacity > .001;
      for (const {line, kind, floor, lift} of batches) {
        line.visible = line.material.opacity > .001;
        if (!line.visible) continue;
        const p = offset(kind, floor, explosion);
        line.position.set(p.x, p.y + lift * split, p.z);
      }
      if (!mezzanine.hidden) {
        projected.copy(anchor).add(mezzanineLine.position).project(camera);
        const x = (.5 + projected.x * .5) * width;
        const y = (.5 - projected.y * .5) * height;
        mezzanine.style.left = THREE.MathUtils.clamp(x - 18, 40, width - mezzanine.offsetWidth - 16) + 'px';
        mezzanine.style.top = (y + 15) + 'px';
        mezzanine.style.transform = 'translateY(-50%)';
        mezzanine.style.opacity = THREE.MathUtils.smoothstep(plateVisibility, .24, .84);
      }
      layers.forEach((layer, i) => {
        const weight = Number(i === page.from) * (1 - page.blend) + Number(i === page.to) * page.blend;
        const isolated = weight * planReveal;
        layer.plan.visible = isolated > .001;
        layer.detail.opacity = .38 * isolated;
        layer.fine.opacity = .65 * isolated;
        layer.cut.opacity = .96 * isolated;
      });
    },
  };
}
