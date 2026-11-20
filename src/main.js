import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DrawnLines, loadGeometry, meshGeometry, segmentsFrom } from './geometry.js';
import { createFinish, makeCursor, makeGround } from './materials.js';
import { makeSitePlan } from './site-plan.js';
import { makeLandscape } from './landscape.js';
import { earlySequenceScale, makeSectionDatums, makeSouthElevations, streetSequence } from './street-sequence.js';
import './style.css';
import './street-sequence.css';

gsap.registerPlugin(ScrollTrigger);

const smooth = THREE.MathUtils.smoothstep;
const mix = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const stageElement = document.querySelector('.stage');
const chapters = [
  { id: '00', label: '场地', note: '从道路、地形与地块读起', view: 'C101 / SITE PLAN', start: 0, stop: .104 },
  { id: '01', label: '聚焦', note: '由场地定位到建筑轮廓', view: 'SITE → BUILDING', start: .145, stop: .261 },
  { id: '02', label: '生长', note: '墙体与楼板沿原坐标升起', view: 'RAISING', start: .285, stop: .471 },
  { id: '03', label: '实体', note: '拱窗与斜向幕墙显现', view: 'AXONOMETRIC', start: .485, stop: .584 },
  { id: '04', label: '屋顶景观', note: '从退台边线到空中花园', view: 'G106 / ROOF LANDSCAPE', start: .600, stop: .810 },
  { id: '05', label: '降至街道', note: '沿街看向历史拱窗', view: 'SOUTH / STREET', start: .653, stop: .768 },
  { id: '06', label: '立面对照', note: '既有与拟建南立面沿共同轴网叠合', view: 'A200 → A201 / SOUTH', start: .776, stop: .820 },
  { id: '07', label: '分层分析', note: '从 A301 标高参照进入分组解构', view: 'A301 / SECTION DATUMS', start: .875, stop: .999 },
];
for (const chapter of chapters.slice(0, 5)) {
  chapter.start *= earlySequenceScale;
  chapter.stop *= earlySequenceScale;
}

const controls = [...document.querySelectorAll('[data-stage]')];
const tickCount = 32;
const ticks = Array.from({ length: tickCount }, (_, index) => {
  const chapter = chapters.findLastIndex(({ start }) => index >= Math.round(start * tickCount));
  const tick = document.createElement('i');
  tick.setAttribute('aria-hidden', 'true');
  controls[chapter].append(tick);
  return tick;
});
let previousTick = -1;
const callouts = [...document.querySelectorAll('.callout')];
const assembledLabels = [
  { name: '拱窗立面', at: [53.94, 34.93, 36.17], kind: 'heritage', floor: 2, side: 'right' },
  { name: '光伏表皮', at: [-67.65, 43.26, 11.10], kind: 'envelope', floor: 4, side: 'left' },
];
const explodedLabels = [
  { name: '屋顶', at: [-.63, 66.09, -22.84], kind: 'roof', floor: 6, side: 'right' },
  { name: '楼板', at: [-80, 38.16, -2.30], kind: 'slab', floor: 3, side: 'left' },
  { name: '历史立面', at: [53.94, 34.93, 36.17], kind: 'heritage', floor: 2, side: 'right' },
];
const gardenLabels = [
  { name: '屋顶退台', at: [-16, 53, 22], kind: 'roof', floor: 4, side: 'right' },
  { name: '木平台与花架', at: [74, 66.25, -24], kind: 'roof', floor: 6, side: 'right' },
  { name: '开敞前庭', at: [-62, 2.1, 28], kind: 'slab', floor: 0, side: 'left' },
];
const streetLabels = [
  { name: 'Retained frontage', at: [45, 56.6, 39], kind: 'heritage', floor: 2, side: 'right', handwritten: true },
];
const queries = Object.fromEntries(
  ['view-type', 'phase-index', 'phase-label', 'phase-note', 'percent', 'progress', 'scene', 'loading']
    .map((id) => [id, document.getElementById(id)]),
);
const masthead = document.querySelector('.masthead h1');

for (const button of controls) {
  button.addEventListener('click', () => {
    const chapter = chapters[Number(button.dataset.stage)];
    const distance = document.querySelector('.scroll-space').offsetHeight;
    window.scrollTo({ top: Math.round(distance * chapter.stop), behavior: motionPreference.matches ? 'instant' : 'smooth' });
  });
}

function makeAxisLines(grids) {
  const strokes = [];
  const terminals = [];
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const bounds = new THREE.Box3(new THREE.Vector3(-112, -1, -54), new THREE.Vector3(109, 1, 51));
  for (const grid of grids) {
    for (let i = 1; i < grid.points.length; i++) {
      start.fromArray(grid.points[i - 1]);
      end.fromArray(grid.points[i]);
      const length = start.distanceTo(end);
      for (let shift = 0; shift < length; shift += 4.2) {
        a.lerpVectors(start, end, shift / length);
        b.lerpVectors(start, end, Math.min(shift + 2.35, length) / length);
        if (bounds.containsPoint(a) && bounds.containsPoint(b)) strokes.push(...a.toArray(), ...b.toArray());
      }
    }
    for (const point of [grid.points[0], grid.points.at(-1)]) {
      start.fromArray(point);
      if (!bounds.containsPoint(start)) continue;
      for (let i = 0; i < 12; i++) {
        const phi = Math.PI * 2 * i / 12;
        const next = Math.PI * 2 * (i + 1) / 12;
        terminals.push(start.x + Math.cos(phi) * 1.02, start.y, start.z + Math.sin(phi) * 1.02,
          start.x + Math.cos(next) * 1.02, start.y, start.z + Math.sin(next) * 1.02);
      }
    }
  }
  return { strokes, terminals };
}

function guideLines() {
  const values = [];
  for (const [x, z] of [[-86, -24], [-44, 13], [12, -18], [51, 23], [79, -22]]) {
    for (let y = 1; y < 144; y += 4.25) values.push(x, y, z, x, y + 1.75, z);
    values.push(x - 2.6, -.22, z, x + 2.6, -.22, z, x, -.22, z - 2.6, x, -.22, z + 2.6);
  }
  for (const x of [-25, 25, 64]) {
    for (let z = 35; z < 72; z += 3.6) values.push(x, -.21, z, x, -.21, z + 1.85);
  }
  return segmentsFrom(values);
}

function createGroups(model, scene, lamp, drawing, shell, wire) {
  const groups = new Map();
  const solid = { value: 0 };
  const materials = new Map();
  const shellMaterials = [];
  const lineMaterials = Array.from({ length: 4 }, () => new THREE.LineBasicMaterial({
    color: 0xd9a34c, transparent: true, opacity: .65, depthWrite: false,
  }));
  const isShell = (kind) => kind === 'heritage' || kind === 'envelope';
  function getGroup(kind, floor) {
    const key = `${kind}-${floor}`;
    if (!groups.has(key)) {
      const pivot = kind === 'heritage' ? 0 : Math.max(0, model.meta.levelY[floor] - 0.50);
      const node = new THREE.Group();
      node.name = key;
      node.position.y = pivot;
      scene.add(node);
      groups.set(key, { kind, floor, pivot, node });
    }
    return groups.get(key);
  }
  for (const part of model.meta.parts) {
    const { node, pivot } = getGroup(part.group, part.floor);
    const skin = isShell(part.group);
    const materialKey = `${skin}-${part.finish}`;
    if (!materials.has(materialKey)) {
      const material = createFinish(part.finish, solid, lamp, { drawing, wire, shell: skin ? shell : undefined });
      if (skin) {
        material.forceSinglePass = true;
        shellMaterials.push(material);
      }
      materials.set(materialKey, material);
    }
    const geometry = meshGeometry(model.read(part.range, pivot));
    const mesh = new THREE.Mesh(geometry, materials.get(materialKey));
    mesh.name = part.finish;
    node.add(mesh);
  }
  for (const edge of model.meta.edges) {
    const { node, pivot } = getGroup(edge.group, edge.floor);
    const material = lineMaterials[(isShell(edge.group) ? 2 : 0) + (edge.grade === 'mass' ? 0 : 1)];
    const lines = new THREE.LineSegments(meshGeometry(model.read(edge.range, pivot)), material);
    lines.renderOrder = 3;
    node.add(lines);
  }
  return { groups: [...groups.values()], solid, lineMaterials, shellMaterials };
}

function motionFor(group, progress, explosion) {
  const { kind, floor, pivot } = group;
  const stage = clamp((progress - .285) / .187, 0, 1);
  const ordinal = floor / 8;
  const lead = kind === 'slab' ? .035 : kind === 'roof' ? .15 : kind === 'envelope' ? .15 : .075;
  const delay = kind === 'heritage' ? .13 + ordinal * .24 : lead + ordinal * .44;
  const rise = smooth(stage, delay, Math.min(1, delay + (kind === 'heritage' ? .65 : .35)));
  const lift = floor === 0 ? 0 : Math.max(0, floor - .4) * 9.1;
  const grownPivot = pivot * smooth(stage, delay, Math.min(.98, delay + .33));
  const result = { rise, x: 0, y: grownPivot + lift * explosion, z: 0 };
  if (kind === 'heritage') {
    result.x = explosion * 24;
    result.y = explosion * 4;
    result.z = explosion * 46;
  } else if (kind === 'roof') {
    result.y = grownPivot + (floor >= 6 ? 72 : lift + 14) * explosion;
    result.z = explosion * -6;
  } else if (kind === 'slab') {
    result.x = explosion * Math.min(floor * 1.15, 6);
  }
  return result;
}

function pose(camera, progress, width, height, site, street) {
  const mobile = width < 730;
  const push = smooth(progress, .116, .282);
  const tilt = smooth(progress, .284, .477);
  const orbit = smooth(progress, .466, .603);
  const garden = smooth(progress, .592, .752) * (1 - smooth(progress, .816, .913));
  const turn = smooth(progress, .816, .913);
  const { approach, headOn, explosion } = street;
  const axonPhi = mix(.018, 1.065, tilt) - garden * .247 + explosion * .065;
  const axonBearing = mix(site.bearing, mix(-.045, -.66, tilt), push) + orbit * .94
    - garden * .51 + turn * .285 - explosion * .31;
  const phi = mix(axonPhi, mix(1.74, Math.PI / 2, headOn), approach);
  const bearing = mix(axonBearing, mix(.26, 0, headOn), approach);
  const focus = new THREE.Vector3(
    mix(site.x, mix(1, -1, tilt), push) + 9 * explosion,
    (33.5 + 8 * garden) * tilt + 43 * explosion,
    mix(site.z, 1, push) - 4 * garden + 11 * explosion,
  );
  focus.lerp(new THREE.Vector3(1, 38, 15), approach);
  const distance = mix(480, 154, approach);
  camera.position.set(
    focus.x + Math.sin(phi) * Math.sin(bearing) * distance,
    focus.y + Math.cos(phi) * distance,
    focus.z + Math.sin(phi) * Math.cos(bearing) * distance,
  );
  camera.lookAt(focus);
  const ratio = width / height;
  const modelSpan = mix(mix(site.width * (mobile ? .84 : 1), mix(268, 256, tilt), push) + explosion * 17, 246, approach);
  const heightSpan = mix(mix(site.height, mix(145, 171, tilt), push) + explosion * 63, mobile ? 105 : 139, approach);
  const spanWidth = Math.max(modelSpan * (mobile ? .98 : 1), heightSpan * ratio);
  const spanHeight = spanWidth / ratio;
  const translateX = mobile ? mix(mix(.027, .045, push), .025, approach) : mix(.089, .073, push) - explosion * .012;
  const translateY = mobile ? -.016 : mix(.025, -.065, push) + tilt * .076 + explosion * .005;
  camera.left = (-.5 - translateX) * spanWidth;
  camera.right = (.5 - translateX) * spanWidth;
  camera.top = (.5 - translateY) * spanHeight;
  camera.bottom = (-.5 - translateY) * spanHeight;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return { tilt, spanWidth, push };
}

function updateCallouts(camera, width, height, progress, position, street) {
  const { explosion, drawing } = street;
  const dAlpha = smooth(position, .947, .982);
  const cAlpha = smooth(progress, .509, .563) * (1 - smooth(progress, .579, .625));
  const enlarged = position >= .936;
  const atStreet = position >= .778 && position < .876;
  const gardens = progress >= .699 && progress < .848;
  const entries = enlarged ? explodedLabels : atStreet ? streetLabels : gardens ? gardenLabels : assembledLabels;
  const alpha = enlarged ? dAlpha : atStreet ? drawing * (1 - smooth(position, .819, .833)) : gardens
    ? smooth(progress, .752, .791) * (1 - smooth(progress, .815, .848))
    : cAlpha;
  const project = new THREE.Vector3();
  for (let i = 0; i < callouts.length; i++) {
    const label = callouts[i];
    const item = entries[i];
    if (!item || alpha < .005) {
      label.style.opacity = 0;
      continue;
    }
    const motion = motionFor({ kind: item.kind, floor: item.floor, pivot: 0 }, progress, explosion);
    project.fromArray(item.at);
    project.x += motion.x;
    project.y += item.kind === 'slab' && item.floor === 0 ? 0 : motion.y;
    project.z += motion.z;
    project.project(camera);
    const px = (project.x * .5 + .5) * width;
    const py = (.5 - project.y * .5) * height;
    const anchor = item.side === 'left' ? '-100%' : '0%';
    label.dataset.side = item.side;
    label.classList.toggle('technical-handwriting', Boolean(item.handwritten));
    label.lastElementChild.textContent = item.name;
    label.style.transform = `translate(${Math.round(px)}px,${Math.round(py)}px) translate(${anchor},-50%)`;
    label.style.opacity = px > 100 && px < width - 86 && py > 48 && py < height - 100 ? alpha : 0;
  }
}

let previousChapter = -1;
let previousPercent = -1;
function updateEditorial(progress, base, street, width) {
  const activeTick = Math.min(tickCount - 1, Math.floor(progress * tickCount));
  if (activeTick !== previousTick) {
    ticks.forEach((tick, i) => {
      tick.classList.toggle('current', i === activeTick);
      tick.classList.toggle('passed', i < activeTick);
    });
    previousTick = activeTick;
  }
  const position = Math.round(progress * 100);
  if (position !== previousPercent) {
    previousPercent = position;
    queries.percent.textContent = String(position).padStart(2, '0');
    queries.progress.style.transform = `scaleX(${progress})`;
  }
  const era = chapters.findLastIndex((chapter) => progress + .0001 >= chapter.start);
  if (era !== previousChapter) {
    previousChapter = era;
    const chapter = chapters[era];
    stageElement.dataset.phase = chapter.id;
    queries['phase-index'].textContent = chapter.id;
    queries['phase-label'].textContent = chapter.label;
    queries['phase-note'].textContent = chapter.note;
    queries['view-type'].textContent = chapter.view;
    controls.forEach((control, index) => control.setAttribute('aria-current', index === era ? 'step' : 'false'));
  }
  const titleScale = mix(.715, .515, smooth(base, .135, .420));
  masthead.style.transform = `scale(${mix(titleScale, width < 730 ? .46 : .39, street.approach)})`;
  const title = 1 - .23 * smooth(base, .11, .258) * (1 - smooth(base, .31, .43));
  stageElement.style.setProperty('--title-opacity', title * (1 - street.approach * .49));
  if (era === 7 && street.explosion >= .07) queries['view-type'].textContent = 'EXPLODED / DISPLAY GROUPS';
  else if (era === 7) queries['view-type'].textContent = chapters[era].view;
}

async function initialize() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .2, 1300);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x101a32, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  queries.scene.append(renderer.domElement);

  const model = await loadGeometry();
  const drawing = { value: 0 };
  const wire = { value: 0 };
  const shell = { value: 0 };
  const [site, landscape, elevations] = await Promise.all([
    makeSitePlan(scene, model.read(model.meta.plan.shell)),
    makeLandscape(scene, drawing, wire),
    makeSouthElevations(scene),
  ]);
  const lamp = { value: 0 };
  const { groups, solid, lineMaterials, shellMaterials } = createGroups(model, scene, lamp, drawing, shell, wire);
  const sectionDatums = makeSectionDatums(scene, stageElement);
  const ground = makeGround();
  scene.add(ground);

  const axis = makeAxisLines(model.meta.grids);
  const ghostAxes = segmentsFrom(axis.strokes);
  scene.add(ghostAxes);
  const axisTips = segmentsFrom(axis.terminals);
  scene.add(axisTips);
  const plot = [
    { pencil: new DrawnLines(axis.strokes, scene), start: .163, end: .231, ink: .45 },
    { pencil: new DrawnLines(model.read(model.meta.plan.slab), scene), start: .178, end: .248, ink: .56 },
    { pencil: new DrawnLines(model.read(model.meta.plan.shell), scene), start: .181, end: .254, ink: 1 },
    { pencil: new DrawnLines(model.read(model.meta.plan.interior), scene), start: .222, end: .282, ink: .62 },
    { pencil: new DrawnLines(model.read(model.meta.plan.openings), scene), start: .240, end: .289, ink: .68 },
  ];
  const cursor = makeCursor();
  scene.add(cursor);
  const guides = guideLines();
  guides.renderOrder = 4;
  scene.add(guides);

  const draftColor = new THREE.Color('#e1b166');
  const inkColor = new THREE.Color('#171f33');
  const wireGold = new THREE.Color('#d9a34c');
  const trimColor = new THREE.Color('#506581');
  let width = 1;
  let height = 1;
  let pendingFrame = 0;
  let position = 0;
  let previousPosition = -1;
  function render() {
    pendingFrame = 0;
    previousPosition = position;
    const storyPosition = motionPreference.matches ? chapters[chapters.findLastIndex((chapter) => position + .0001 >= chapter.start)].stop : position;
    const p = Math.min(storyPosition / earlySequenceScale, .913);
    const street = streetSequence(storyPosition);
    const { explosion } = street;
    const { tilt, spanWidth, push } = pose(camera, p, width, height, site.focus, street);
    const entity = smooth(p, .482, .577);
    solid.value = entity;
    lamp.value = smooth(p, .776, .810);
    drawing.value = street.drawing;
    wire.value = street.wire;
    shell.value = street.shell * (1 - explosion * .52);
    const shellFades = shell.value > .001;
    for (const material of shellMaterials) {
      material.alphaToCoverage = shellFades;
    }
    stageElement.style.setProperty('--entity', entity);
    lineMaterials.forEach((material, i) => {
      const major = i % 2 === 0;
      const ink = major ? inkColor : trimColor;
      const tone = 1 - drawing.value * .89;
      const cover = i >= 2 ? 1 - shell.value * .76 : 1;
      material.color.copy(draftColor).lerp(ink, entity).lerp(wireGold, wire.value);
      const oldInk = mix(major ? .75 : .55, major ? .51 : .36, entity) * tone * cover;
      const wireInk = major ? (width < 730 ? .76 : .94) : (width < 730 ? .23 : .48);
      material.opacity = mix(oldInk, wireInk * (i >= 2 ? 1 - .35 * shell.value : 1), wire.value);
    });
    for (const group of groups) {
      const change = motionFor(group, p, explosion);
      group.node.visible = change.rise > .008;
      group.node.position.set(change.x, change.y, change.z);
      group.node.scale.y = Math.max(.003, change.rise);
    }
    ground.material.uniforms.opacity.value = mix(.92, .72, tilt) * push * (1 - drawing.value * .88);
    ghostAxes.material.opacity = mix(.23, .08, tilt) * push * (1 - drawing.value);
    axisTips.material.opacity = smooth(p, .185, .261) * .42 * (1 - tilt * .85);
    const pageInk = 1 - smooth(p, .3, .476) * .72;
    let current = site.apply(p, camera, width, height);
    for (const { pencil, start, end, ink } of plot) {
      const fraction = clamp((p - start) / (end - start), 0, 1);
      if (pencil.apply(fraction, ink * pageInk * (1 - drawing.value))) current = pencil.tip;
    }
    cursor.visible = Boolean(current) && p < .290;
    if (cursor.visible) {
      cursor.position.copy(current);
      cursor.position.y += .15;
      cursor.quaternion.copy(camera.quaternion);
      cursor.scale.setScalar(Math.max(1, spanWidth / 290));
    }
    guides.visible = explosion > .005;
    guides.material.opacity = explosion * .58;
    const plants = landscape.apply(p, (band) => band < 0
      ? { x: 0, y: 0, z: 0 }
      : motionFor({ kind: 'roof', floor: band, pivot: 0 }, p, explosion));
    stageElement.dataset.plantVolumes = plants;
    elevations(street);
    sectionDatums(street.datum, camera, width, height);
    updateEditorial(position, p, street, width);
    updateCallouts(camera, width, height, p, storyPosition, street);
    renderer.render(scene, camera);
  }
  function queueRender(force = false) {
    if (!pendingFrame && (force || Math.abs(previousPosition - position) > .000001)) {
      pendingFrame = requestAnimationFrame(render);
    }
  }
  function resize() {
    width = stageElement.clientWidth;
    height = stageElement.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, width < 730 ? 1.45 : 1.6));
    renderer.setSize(width, height, false);
    queueRender(true);
  }
  function startTimeline() {
    const state = { progress: 0 };
    const timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: '#sequence', start: 'top top', end: 'bottom bottom',
        scrub: true,
        invalidateOnRefresh: true,
      },
      onUpdate() {
        position = state.progress;
        queueRender();
      },
    });
    timeline.to(state, { progress: 1, duration: 1 }, 0);
    chapters.forEach((chapter) => timeline.addLabel(chapter.id, chapter.start));
    return timeline;
  }

  let timeline = startTimeline();
  motionPreference.addEventListener('change', () => {
    timeline.scrollTrigger.kill();
    timeline.kill();
    timeline = startTimeline();
    ScrollTrigger.refresh();
    queueRender(true);
  });
  new ResizeObserver(resize).observe(stageElement);
  resize();
  ScrollTrigger.refresh();
  requestAnimationFrame(() => {
    queries.loading.hidden = true;
    stageElement.dataset.ready = 'true';
    stageElement.dataset.triangles = model.meta.triangles;
  });
}

initialize().catch((error) => {
  console.error(error);
  queries.loading.textContent = '三维场景加载失败。请通过本地预览地址打开，并检查浏览器 WebGL 支持。';
  stageElement.dataset.ready = 'error';
});
