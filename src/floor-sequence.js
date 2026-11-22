import { MathUtils } from 'three';

const firstPlan = 1.16;
const interval = .068;
export const floors = [
  ['ROOF', 613075, 'A106 / ROOF OVERVIEW', '屋顶总览'],
  ['L5', 593179, 'A105'],
  ['L4', 593178, 'A104'],
  ['L3', 593147, 'A103'],
  ['L2', 593177, 'A102'],
  ['L1', 593176, 'A101'],
  ['P', null, 'A100 / DRAWING ONLY'],
].map(([code, level, source, label = code], index) => ({
  code, level, heading: label === code ? code + ' / ' + source : source, label, stop: firstPlan + interval * index,
}));

export const storyEnd = floors.at(-1).stop + .024;

export function floorFrame(time) {
  const cursor = MathUtils.clamp((time - firstPlan) / interval, 0, floors.length - 1);
  const from = Math.floor(cursor);
  const blend = MathUtils.smoothstep(cursor - from, .30, .70);
  return {from, to: Math.min(from + 1, floors.length - 1), blend,
    active: floors[from + Number(blend >= .5)]};
}
