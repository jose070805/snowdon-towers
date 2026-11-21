import { MathUtils } from 'three';

const { clamp, smoothstep } = MathUtils;

// Angular displacement is relative to the authored shot, in radians.
// The elevation comparison stays close to normal incidence on the drawing plane.
export function makeDragOrbit(canvas, requestRender) {
  let yaw = 0, pitch = 0, targetYaw = 0, targetPitch = 0;
  let active = false, pointer = null, lastFrame = 0;

  let previousTime = 0, rewind = 0;

  function release() {
    if (!pointer) return;
    const id = pointer.id;
    pointer = null;
    delete canvas.dataset.dragging;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  canvas.addEventListener('pointerdown', event => {
    if (!active || !event.isPrimary || event.button !== 0 || pointer) return;
    rewind = 0;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY,
      yaw: targetYaw, pitch: targetPitch, accepted: event.pointerType === 'mouse' };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer?.id) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (!pointer.accepted) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 7) return;
      if (Math.abs(dy) >= Math.abs(dx)) { release(); return; }
      pointer.accepted = true;
    }
    canvas.dataset.dragging = '';
    const span = Math.min(canvas.clientWidth, canvas.clientHeight);
    targetYaw = clamp(pointer.yaw - dx / span * 3.2, -1, 1);
    targetPitch = clamp(pointer.pitch - dy / span * 3.8, -1, 1);
    requestRender();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, event => { if (event.pointerId === pointer?.id) release(); });
  }
  window.addEventListener('blur', release);

  return (time, reduced) => {
    // Rewinding relinquishes the local pose progressively to the authored shot.
    if (!pointer && time < previousTime && rewind < 1) {
      const next = Math.min(1, rewind + (previousTime - time) / .045);
      const ratio = (1 - smoothstep(next, 0, 1)) / (1 - smoothstep(rewind, 0, 1));
      yaw *= ratio; pitch *= ratio; targetYaw *= ratio; targetPitch *= ratio;
      rewind = next;
    }
    previousTime = time;
    const roof = smoothstep(time, .480, .503) * (1 - smoothstep(time, .648, .653));
    const south = smoothstep(time, .776, .789);
    const axon = smoothstep(time, .875, .916);
    const enabled = roof > 0 || south > 0;
    if (active !== enabled) {
      active = enabled;
      canvas.toggleAttribute('data-orbit', active);
      if (!active) { release(); yaw = pitch = targetYaw = targetPitch = 0; }
    }
    const now = performance.now();
    const dt = Math.min(.064, (now - lastFrame) / 1000);
    lastFrame = now;
    const blend = reduced ? 1 : 1 - Math.exp(-14 * dt);
    yaw += (targetYaw - yaw) * blend;
    pitch += (targetPitch - pitch) * blend;
    if (Math.max(Math.abs(targetYaw - yaw), Math.abs(targetPitch - pitch)) > .0008) requestRender();
    else { yaw = targetYaw; pitch = targetPitch; }
    return {
      bearing: yaw * (.54 * roof + south * (.09 + .49 * axon)),
      tilt: pitch * (.19 * roof + south * (.035 + .18 * axon)),
    };
  };
}
