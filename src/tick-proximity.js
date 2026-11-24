import { MathUtils } from 'three';

export function bindTickProximity(nav, ticks) {
  // Height is measured in viewport coordinates, just like PointerEvent.clientY.
  nav.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    const centers = ticks.map(tick => {
      const { top, height } = tick.getBoundingClientRect();
      return top + height / 2;
    });
    const step = Math.abs(centers[1] - centers[0]);
    // A row of mobile floor buttons has no vertical spacing.
    if (!step) return;
    const radius = step * 4;
    ticks.forEach((tick, index) => {
      const distance = Math.abs(event.clientY - centers[index]);
      const strength = 1 - MathUtils.smoothstep(distance, 0, radius);
      tick.style.setProperty('--tick-proximity', strength);
    });
  });
  nav.addEventListener('pointerleave', () => {
    for (const tick of ticks) tick.style.removeProperty('--tick-proximity');
  });
}
