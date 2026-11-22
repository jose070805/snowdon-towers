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
    button.textContent = floor.code;
    button.setAttribute('aria-label', '俯视 ' + floor.code);
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

  const layers = floors.map(floor => {
    const plate = new THREE.Group(), plan = new THREE.Group();
    root.add(plate, plan);
    const ink = new THREE.LineBasicMaterial({color: '#dfaf64', transparent: true, depthWrite: false});
    const detail = ink.clone();
    const fine = ink.clone();
    const cut = ink.clone();
    const bounds = new THREE.Box3();
    const drawing = drawings.plans[floor.code];
    if (drawing) {
      for (const [index, coords] of drawing.ink.entries()) {
        const positions = [];
        for (let i = 0; i < coords.length; i += 2) {
          positions.push(coords[i] / drawings.unitsPerFoot, 0, coords[i+1] / drawings.unitsPerFoot);
        }
        const geometry = meshGeometry(new Float32Array(positions));
        geometry.computeBoundingBox();
        bounds.union(geometry.boundingBox);
        plan.add(new THREE.LineSegments(geometry, [detail, fine, cut][index]));
      }
    }
    const datum = meta.datums[floor.levels[0]];
    // Plans sit at the separated floor height during the handoff to top view.
    plan.position.y = datum ? datum.zFt + 6 + datum.liftFt : -16 - 11/12 + 6;
    return {plate, plan, ink, detail, fine, cut, bounds, drawing};
  });
  const batches = meta.batches.map(({level, kind, floor, edgeRange: [offset, length]}) => {
    const layer = layers[floors.findIndex(f => f.levels.includes(level))];
    const strokes = Float32Array.from({length}, (_, i) =>
      payload.getInt16((offset + i) * 2, true) / model.meta.quantization);
    const geometry = meshGeometry(strokes);
    const line = new THREE.LineSegments(geometry, layer.ink);
    layer.plate.add(line);
    if (!layer.drawing) {
      geometry.computeBoundingBox();
      layer.bounds.union(geometry.boundingBox);
    }
    return {line, kind, floor, lift: meta.datums[level].liftFt};
  });
  // Seven verified R2 fixtures reuse the original feature edges in this line-only pass.
  const roof = layers[floors.findIndex(f => f.code === 'R2')];
  for (const {geometry, band, lift} of landscape.supportedEdges(meta.roofSupports)) {
    const line = new THREE.LineSegments(geometry, roof.ink);
    roof.plate.add(line);
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
    apply(street, page, offset) {
      const {study, split, explosion, overhead} = street;
      root.visible = study > .001;
      navigation(study >= .96, overhead >= .99 ? page.active : null);
      if (!root.visible) return;
      for (const {line, kind, floor, lift} of batches) {
        const p = offset(kind, floor, explosion);
        line.position.set(p.x, p.y + lift * split, p.z);
      }
      layers.forEach((layer, i) => {
        const weight = Number(i === page.from) * (1 - page.blend) + Number(i === page.to) * page.blend;
        const isolated = weight * overhead;
        layer.ink.opacity = study * (.94 * (1 - overhead) + (layer.drawing ? 0 : .94 * isolated));
        layer.plate.visible = layer.ink.opacity > .001;
        layer.plan.visible = Boolean(layer.drawing && isolated > .001);
        layer.detail.opacity = .38 * isolated;
        layer.fine.opacity = .65 * isolated;
        layer.cut.opacity = .96 * isolated;
      });
    },
  };
}
