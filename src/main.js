import { cafeDuration, makeCafeSequence } from './cafe-sequence.js';
import { makeC101Overlay, makeC101Sweep } from './c101-sequence.js';
import { makeMiniatureSite } from './miniature-site.js';
import { bindTickProximity } from './tick-proximity.js';
import { floorFrame, storyEnd } from './floor-sequence.js';
import { makeSemanticStudy } from './semantic-study.js';
import { makeDragOrbit } from './drag-orbit.js';
import { makeAnnotations } from './annotations.js';
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
  { id: '07', label: '分层分析', note: '爆炸轴测、语义分层与逐层俯视', view: 'A301 / SECTION DATUMS', start: .875, stop: 1.070 },
];
for (const chapter of chapters.slice(0, 5)) {
  chapter.start *= earlySequenceScale;
  chapter.stop *= earlySequenceScale;
}

chapters[0].start = -cafeDuration;
const c101Start = -cafeDuration * .40;
const c101End = chapters[4].start;

// Holds are measured in scroll distance on the original, one-unit shot sequence.
const holds = [
  { at: .0832, length: .028 }, { at: .648, length: .038 },
  { at: .818, length: .029 }, { at: .916, length: .029 },
];
const scrollLength = storyEnd + cafeDuration + holds.reduce((total, hold) => total + hold.length, 0);
function storyAt(scroll) {
  let time = scroll * scrollLength - cafeDuration;
  for (const { at, length } of holds) time -= clamp(time - at, 0, length);
  return clamp(time, -cafeDuration, storyEnd);
}
function scrollAt(time) {
  return (time + cafeDuration + holds.reduce((sum, hold) => sum + (time > hold.at ? hold.length : 0), 0)) / scrollLength;
}
const controls = [...document.querySelectorAll('[data-stage]')];
const tickCount = 32;
const ticks = Array.from({ length: tickCount }, (_, i) => {
  const chapter = chapters.findLastIndex(({ start }) => i >= Math.round(scrollAt(start) * tickCount));
  const tick = document.createElement('i');
  tick.setAttribute('aria-hidden', 'true');
  controls[chapter].append(tick);
  return tick;
});
bindTickProximity(document.querySelector('.scale'), ticks);
let currentTick = -1;
const queries = Object.fromEntries(
  ['view-type', 'percent', 'progress', 'scene', 'loading']
    .map((id) => [id, document.getElementById(id)]),
);
const masthead = document.querySelector('.masthead');

function scrollToStory(time, behavior = 'instant') {
  const distance = document.querySelector('.scroll-space').offsetHeight;
  window.scrollTo({top: Math.round(distance * scrollAt(time)), behavior});
}
for (const button of controls) {
  button.addEventListener('click', () => scrollToStory(chapters[Number(button.dataset.stage)].stop,
    motionPreference.matches ? 'instant' : 'smooth'));
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

function createGroups(model, scene, lamp, drawing, shell, wire, studyMask) {
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
      const material = createFinish(part.finish, solid, lamp, { drawing, wire, studyMask, shell: skin ? shell : undefined });
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

function pose(camera, progress, width, height, site, street, offset, plan, siteProgress) {
  const mobile = width < 730;
  const push = smooth(progress, .116, .282);
  const tilt = smooth(progress, .284, .477);
  const orbit = smooth(progress, .466, .603);
  const garden = smooth(progress, .592, .752) * (1 - smooth(progress, .816, .913));
  const turn = smooth(progress, .816, .913);
  const { approach, headOn, explosion, split } = street;
  const datumMargin = mobile ? street.datum : 0;
  const siteOverview = smooth(progress, .018, .111) * (1 - smooth(progress, .186, .341));
  const siteTilt = .99 * siteOverview;
  const axonPhi = mix(.018, 1.065, tilt) + siteTilt - garden * .247 + explosion * .065 + split * .22;
  const axonBearing = mix(site.bearing, mix(-.045, -.66, tilt), push) + orbit * .94
    - garden * .51 + turn * .285 - explosion * .31;
  let phi = mix(axonPhi, mix(1.74, Math.PI / 2, headOn), approach) + offset.tilt;
  let bearing = mix(mix(axonBearing, .785, siteOverview), mix(.26, 0, headOn), approach) + offset.bearing;
  const focus = new THREE.Vector3(
    mix(site.x, mix(1, -1, tilt), push) + 9 * explosion,
    (33.5 + 8 * garden) * tilt + 43 * explosion + 50 * split,
    mix(site.z, 1, push) - 4 * garden + 11 * explosion,
  );
  focus.lerp(new THREE.Vector3(13, 0, 35), siteOverview);
  focus.lerp(new THREE.Vector3(1, 38, 15), approach);
  const top = plan ? street.overhead : 0;
  if (top) {
    phi = mix(phi, 0, top);
    bearing = mix(bearing, 0, top);
    focus.lerp(new THREE.Vector3(plan.x, plan.y, plan.z), top);
  }
  // Give lookAt an explicit drawing-up direction at the orthographic pole.
  camera.up.set(0, 1, 0);
  if (top) camera.up.set(-Math.cos(phi) * Math.sin(bearing), Math.sin(phi), -Math.cos(phi) * Math.cos(bearing));
  const revealStage = siteProgress === null ? 0 : smooth(siteProgress, .20, .45);
  const focusStage = siteProgress === null ? 0 : smooth(siteProgress, .45, .58);
  const heroStage = siteProgress === null ? 1 : smooth(siteProgress, .58, .76);
  if (siteProgress !== null) {
    const siteBearing = mix(site.bearing, .785, revealStage);
    phi = mix(mix(.018, 1.008, revealStage), phi, heroStage);
    bearing = mix(siteBearing, bearing, heroStage);
    const siteFocus = new THREE.Vector3(site.x, 0, site.z)
      .lerp(new THREE.Vector3(13, 1, 35), revealStage)
      .lerp(new THREE.Vector3(8, 6, 24), focusStage);
    focus.lerp(siteFocus, 1 - heroStage);
  }
  const distance = mix(480, 154, approach);
  camera.position.set(
    focus.x + Math.sin(phi) * Math.sin(bearing) * distance,
    focus.y + Math.cos(phi) * distance,
    focus.z + Math.sin(phi) * Math.cos(bearing) * distance,
  );
  camera.lookAt(focus);
  const ratio = width / height;
  const paperZoom = mix(.72, 1, smooth(progress, .09, .22));
  const modelSpan = mix(mix(site.width * paperZoom * (mobile ? .84 : 1), mix(268, 256, tilt), push) + explosion * 17 + split * (mobile ? 25 : 22) + 36 * datumMargin, 246, approach);
  const heightSpan = mix(mix(site.height * paperZoom, mix(145, 171, tilt), push) + explosion * 63 + split * 88, mobile ? 105 : 139, approach);
  let spanWidth = Math.max(modelSpan * (mobile ? .98 : 1), heightSpan * ratio);
  spanWidth = mix(spanWidth, Math.max(746, 461 * ratio), siteOverview);
  if (siteProgress !== null) {
    const planWidth = Math.max(site.width * .72 * (mobile ? .84 * .98 : 1), site.height * .72 * ratio);
    const siteWidth = mix(planWidth, Math.max(746, 461 * ratio), revealStage) * (1 - .12 * focusStage);
    spanWidth = mix(siteWidth, spanWidth, heroStage);
  }
  if (top) spanWidth = mix(spanWidth, Math.max(plan.width * (mobile ? 1.22 : 1.42),
    plan.depth * ratio * (mobile ? 1.70 : 1.38)), top);
  const spanHeight = spanWidth / ratio;
  const translateX = mobile ? mix(mix(.027, .045, push), .025, approach) : mix(.089, .073, push) - explosion * .012;
  let translateY = mix(mobile ? -.016 : mix(.025, -.065, push) + tilt * .076 + explosion * .005, mobile ? .06 : 0, top);
  let centeredX = mix(translateX * paperZoom * (1 - siteOverview * .86) - split * (mobile ? .04 : .08) - .075 * datumMargin, mobile ? .015 : -.025, top);
  if (siteProgress !== null) {
    translateY = mix(mobile ? -.016 : .025, translateY, heroStage);
    const planShift = (mobile ? .027 : .089) * .72;
    centeredX = mix(mix(planShift, mobile ? .004 : .01, revealStage), centeredX, heroStage);
  }
  camera.left = (-.5 - centeredX) * spanWidth;
  camera.right = (.5 - centeredX) * spanWidth;
  camera.top = (.5 - translateY) * spanHeight;
  camera.bottom = (-.5 - translateY) * spanHeight;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return { tilt, spanWidth, push };
}

let previousChapter = -1;
function updateEditorial(progress, street, scroll, page) {
  const era = chapters.findLastIndex(chapter => progress >= chapter.start);
  const first = Math.round(scrollAt(chapters[era].start) * tickCount);
  const end = era + 1 < chapters.length ? Math.round(scrollAt(chapters[era + 1].start) * tickCount) : tickCount;
  const tick = clamp(Math.floor(scroll * tickCount), first, end - 1);
  if (tick !== currentTick) {
    ticks[currentTick]?.classList.remove('current');
    ticks[tick].classList.add('current');
    currentTick = tick;
  }
  const percent = String(Math.round(scroll * 100)).padStart(2, '0');
  if (queries.percent.textContent !== percent) queries.percent.textContent = percent;
  queries.progress.style.transform = 'scaleX(' + scroll + ')';
  if (era !== previousChapter) {
    previousChapter = era;
    const chapter = chapters[era];
    stageElement.dataset.phase = chapter.id;
    queries.scene.setAttribute('aria-label', 'Snowdon Towers · ' + chapter.note);
    queries['view-type'].textContent = chapter.view;
    controls.forEach((control, index) => control.setAttribute('aria-current', index === era ? 'step' : 'false'));
  }
  const title = 1 - smooth(progress, -cafeDuration * .79, -cafeDuration * .42);
  if (era === 0) {
    const view = progress < -cafeDuration * .62 ? 'NIGHT STREET'
      : progress < c101Start ? 'CAFÉ TERRACE' : chapters[era].view;
    if (queries['view-type'].textContent !== view) queries['view-type'].textContent = view;
  }
  masthead.style.opacity = title;
  masthead.style.visibility = title === 0 ? 'hidden' : 'visible';
  if (era === 7 && street.planReveal > .5) queries['view-type'].textContent = page.active.heading;
  else if (era === 7 && street.explosion >= .55) queries['view-type'].textContent = 'EXPLODED / DISPLAY GROUPS';
  else if (era === 7 && street.study > .5) queries['view-type'].textContent = 'A301 / LEVEL ASSEMBLIES';
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
  const studyMask = { value: 0 };
  const drawing = { value: 0 };
  const wire = { value: 0 };
  const shell = { value: 0 };
  const gardens = new THREE.Group();
  gardens.name = 'landscape';
  scene.add(gardens);
  const footprints = model.read(model.meta.plan.shell);
  const [site, landscape, elevations] = await Promise.all([
    makeSitePlan(scene, footprints),
    makeLandscape(gardens, drawing, wire, studyMask),
    makeSouthElevations(scene),
  ]);
  const cafe = makeCafeSequence(scene, site.data, footprints);
  const miniature = makeMiniatureSite(scene);
  const lamp = { value: 0 };
  const { groups, solid, lineMaterials, shellMaterials } = createGroups(model, scene, lamp, drawing, shell, wire, studyMask);
  const annotations = makeAnnotations(groups);
  const c101Overlay = makeC101Overlay(stageElement, site.data, miniature, footprints, groups);
  const c101Sweep = makeC101Sweep(lineMaterials);
  const sectionDatums = makeSectionDatums(scene, stageElement);
  const ground = makeGround();
  ground.name = 'ground';
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
  let applyStudy;
  let studyRequested = false;
  function requestStudy() {
    studyRequested = true;
    makeSemanticStudy(scene, model, landscape, scrollToStory).then(apply => {
      applyStudy = apply;
      stageElement.dataset.study = 'ready';
      queueRender(true);
    }).catch(error => {
      stageElement.dataset.study = 'unavailable';
      console.error(error);
      queueRender(true);
    });
  }
  const dragOrbit = makeDragOrbit(renderer.domElement, () => queueRender(true));
  function render() {
    pendingFrame = 0;
    previousPosition = position;
    const story = storyAt(position);
    let storyPosition = story;
    if (motionPreference.matches) {
      storyPosition = chapters[chapters.findLastIndex(chapter => story >= chapter.start)].stop;
      if (story < 0) {
        const introStep = story < -.18 ? 0 : story < -.035 ? .64 : .94;
        storyPosition = (introStep - 1) * cafeDuration;
      } else if (story >= .875) {
        if (story < .923) storyPosition = .916;
        else if (story < 1.012) storyPosition = .981;
        else if (story < 1.115) storyPosition = 1.072;
        else storyPosition = floorFrame(story).active.stop;
      }
    }
    const intro = clamp((storyPosition + cafeDuration) / cafeDuration, 0, 1);
    const p = clamp(storyPosition / earlySequenceScale, 0, .913);
    const siteProgress = story >= c101Start && story < c101End
      ? clamp((storyPosition - c101Start) / (c101End - c101Start), 0, 1) : null;
    const growth = siteProgress === null ? p : mix(.285, .472, clamp((siteProgress - .58) / .12, 0, 1));
    const street = streetSequence(storyPosition);
    if (storyPosition >= .74 && !studyRequested) requestStudy();
    const page = floorFrame(storyPosition);
    const plan = applyStudy?.frame(page);
    const context = street.context;
    stageElement.style.setProperty('--site-context', context);
    studyMask.value = street.study;
    const { explosion } = street;
    const viewProgress = siteProgress === null ? p : c101End / earlySequenceScale;
    const { spanWidth } = pose(camera, viewProgress, width, height, site.focus, street,
      dragOrbit(storyPosition, motionPreference.matches), plan, siteProgress);
    const tilt = smooth(p, .284, .477);
    const push = smooth(p, .116, .282);
    cafe.apply(intro, camera, width, height);
    miniature.apply(storyPosition, context, siteProgress);
    c101Sweep(siteProgress, motionPreference.matches);
    const entity = siteProgress === null ? Math.max(.74 * smooth(p, .015, .145), smooth(p, .482, .577))
      : smooth(siteProgress, .662, .835);
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
      material.opacity = mix(oldInk, wireInk * (1 - .85 * drawing.value) * (i >= 2 ? 1 - .35 * shell.value : 1), wire.value) * (1 - street.study);
    });
    for (const group of groups) {
      const change = motionFor(group, growth, explosion);
      group.node.visible = change.rise > .008 && street.study < .9999;
      group.node.position.set(change.x, change.y, change.z);
      group.node.scale.y = Math.max(.003, change.rise);
    }
    ground.visible = ghostAxes.visible = axisTips.visible = gardens.visible = context > .001;
    ground.material.uniforms.opacity.value = context * mix(.92, .72, tilt) * push * (1 - drawing.value * .88);
    ghostAxes.material.opacity = context * mix(.23, .08, tilt) * push * (1 - drawing.value);
    axisTips.material.opacity = context * smooth(p, .185, .261) * .42 * (1 - tilt * .85);
    const pageInk = 1 - smooth(p, .3, .476) * .72;
    const openingInk = smooth(intro, .90, 1) * (1 - smooth(storyPosition, .106, .151));
    let current = site.apply(Math.max(p, .105), context * openingInk, siteProgress);
    for (const { pencil, start, end, ink } of plot) {
      const fraction = clamp((p - start) / (end - start), 0, 1);
      const opacity = siteProgress === null ? ink * pageInk * context * (1 - drawing.value) : 0;
      if (pencil.apply(fraction, opacity)) current = pencil.tip;
    }
    cursor.visible = Boolean(current) && p < .290 && intro > .76;
    if (cursor.visible) {
      cursor.position.copy(current);
      cursor.position.y += .15;
      cursor.quaternion.copy(camera.quaternion);
      cursor.scale.setScalar(Math.max(1, spanWidth / 290));
    }
    guides.visible = explosion * context > .005;
    guides.material.opacity = explosion * context * .58;
    const plants = gardens.visible ? landscape.apply(p, (band) => band < 0
      ? { x: 0, y: 0, z: 0 }
      : motionFor({ kind: 'roof', floor: band, pivot: 0 }, p, explosion)) : 0;
    stageElement.dataset.plantVolumes = plants;
    elevations(street);
    applyStudy?.apply(street, page, camera, width, height, (kind, floor, explosion) =>
      motionFor({ kind, floor, pivot: 0 }, p, explosion));
    sectionDatums(street.datum, camera, width, height);
    updateEditorial(story, street, position, page);
    if (!applyStudy && storyPosition >= 1.025) {
      queries['view-type'].textContent = 'LOADING / LEVEL DATA';
    }
    if (stageElement.dataset.study === 'unavailable' && storyPosition >= 1.025) {
      queries['view-type'].textContent = 'A301 / PLATE DATA UNAVAILABLE';
    }
    annotations(camera, width, height, storyPosition, motionPreference.matches);
    const renderCamera = intro < 1 ? cafe.camera : camera;
    c101Overlay(siteProgress, chapters[previousChapter], renderCamera, width, height, motionPreference.matches);
    renderer.render(scene, renderCamera);
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
    chapters.forEach((chapter) => timeline.addLabel(chapter.id, scrollAt(chapter.start)));
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
  document.fonts.addEventListener('loadingdone', () => queueRender(true));
  new ResizeObserver(resize).observe(stageElement);
  resize();
  ScrollTrigger.refresh();
  requestAnimationFrame(() => {
    queries.loading.hidden = true;
    stageElement.dataset.ready = 'true';
    stageElement.dataset.triangles = model.meta.triangles;
  });
}

const terraceView = new URLSearchParams(location.search).get('terrace');
const startup = terraceView === 'street' || terraceView === 'table'
  ? import('./terrace-review.js').then(({ renderTerraceFrame }) => renderTerraceFrame(terraceView))
  : initialize();
startup.catch((error) => {
  console.error(error);
  queries.loading.textContent = '三维场景加载失败。请通过本地预览地址打开，并检查浏览器 WebGL 支持。';
  stageElement.dataset.ready = 'error';
});
