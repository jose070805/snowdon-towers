import { MathUtils } from 'three';

export function bindTickProximity(nav, ticks) {
  let lit = false;

  function clear() {
    if (!lit) return;
    lit = false;
    for (const tick of ticks) tick.style.removeProperty('--tick-proximity');
  }

  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || nav.hidden) {
      clear();
      return;
    }
    const bounds = nav.getBoundingClientRect();
    // Leave the navigation hit areas intact while letting the gutter respond.
    const gutter = 64;
    if (event.clientX < bounds.left - gutter || event.clientX > bounds.right + gutter) {
      clear();
      return;
    }
    const centers = ticks.map(tick => {
      const { top, height } = tick.getBoundingClientRect();
      return top + height / 2;
    });
    const spacing = Math.abs(centers[1] - centers[0]);
    const radius = MathUtils.clamp(spacing * 5.5, 56, 95);
    if (!spacing || event.clientY < centers[0] - radius || event.clientY > centers.at(-1) + radius) {
      clear();
      return;
    }

    lit = true;
    ticks.forEach((tick, index) => {
      const distance = Math.abs(event.clientY - centers[index]);
      const strength = 1 - MathUtils.smoothstep(distance, 0, radius);
      tick.style.setProperty('--tick-proximity', strength);
    });
  }, { passive: true });
  window.addEventListener('pointerout', event => {
    if (!event.relatedTarget) clear();
  });
  window.addEventListener('blur', clear);
  window.addEventListener('resize', clear);
}
