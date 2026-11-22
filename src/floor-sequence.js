import { MathUtils } from 'three';

const firstPlan = 1.16;
const interval = .068;
export const floors = [
  ['R3', [696520], 'ROOF CAPS'],
  ['R2', [613075, 1925045], 'ROOF PLATFORM'],
  ['R1', [964417], 'ROOF TERRACE'],
  ['L5', [593179], 'A105'],
  ['L4', [593178], 'A104'],
  ['L3', [593147], 'A103'],
  ['L2', [593177], 'A102'],
  ['M1', [828874], 'PARTIAL MEZZANINE'],
  ['L1', [593176, 633454, 593142], 'A101'],
  ['P', [], 'A100 / DRAWING ONLY'],
].map(([code, levels, source], index) => ({code, levels, source, stop: firstPlan + interval * index}));

export const storyEnd = floors.at(-1).stop + .024;

export function floorFrame(time) {
  const cursor = MathUtils.clamp((time - firstPlan) / interval, 0, floors.length - 1);
  const from = Math.floor(cursor);
  const blend = MathUtils.smoothstep(cursor - from, .30, .70);
  return {from, to: Math.min(from + 1, floors.length - 1), blend,
    active: floors[from + Number(blend >= .5)]};
}
