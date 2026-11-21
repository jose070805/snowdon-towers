import * as THREE from 'three';
import './annotations.css';

// Anchors use the model's feet and ride their original explosion groups.
const notes = [
  { text: 'retained frontage', at: [53.94, 34.93, 36.17], group: 'heritage-2', mobile: true },
  { text: 'floor plates', at: [-80, 38.16, -2.3], group: 'slab-3', mobile: true, below: true },
  { text: 'roof platform', at: [-.63, 66.09, -22.84], group: 'roof-6', up: true, mobile: true },
  { text: 'solar envelope', at: [-67.65, 43.26, 11.1], group: 'envelope-4', up: true },
  { text: 'terrace pergola', at: [74, 66.25, -24], group: 'roof-6', up: true },
];

const smooth = THREE.MathUtils.smoothstep;
const clamp = THREE.MathUtils.clamp;
export function makeAnnotations(groups) {
  const container = document.getElementById('annotations');
  const index = new Map(groups.map(group => [group.node.name, group]));
  const entries = notes.map(note => {
    const tag = document.createElement('span');
    tag.className = 'anchor-note';
    tag.lang = 'en';
    tag.textContent = note.text;
    const leader = document.createElement('i');
    leader.className = 'anchor-line';
    const dot = document.createElement('i');
    dot.className = 'anchor-dot';
    container.append(tag, leader, dot);
    return { ...note, group: index.get(note.group), tag, leader, dot };
  });
  const point = new THREE.Vector3();
  return (camera, width, height, progress, reduced) => {
    const compact = width < 730;
    const margin = compact ? 20 : 40;
    const occupied = [];
    for (const { at, group, mobile, up, below, tag, leader, dot } of entries) {
      const ink = smooth(progress, .931, .953);
      if (!ink || (compact && !mobile)) {
        tag.hidden = leader.hidden = dot.hidden = true;
        continue;
      }
      point.fromArray(at);
      if (group) {
        point.y -= group.pivot;
        group.node.localToWorld(point);
      }
      point.project(camera);
      const x = (.5 + point.x * .5) * width;
      const y = (.5 - point.y * .5) * height;
      const visible = ink > .005 && group?.node.visible !== false && Math.abs(point.z) <= 1 &&
        x >= margin && x <= width - margin && y >= 35 && y <= height - 52;
      tag.hidden = leader.hidden = dot.hidden = !visible;
      if (!visible) continue;

      const w = tag.offsetWidth, h = tag.offsetHeight;
      const side = x < width * .56 ? -1 : 1;
      const dx = compact ? 20 : 46;
      const dy = compact && below ? Math.min(width * .39, height * .20) : compact ? 44 : 58;
      let box;
      for (const vertical of [up ? -1 : 1, up ? 1 : -1]) {
        for (const horizontal of [side, -side]) {
          const left = clamp(horizontal > 0 ? x + dx : x - dx - w, margin, width - margin - w);
          const top = clamp(y + vertical * dy - h / 2, compact ? 80 : 96, height - h - 68);
          if (left < (compact ? 63 : 100) && top + h > height * .36 && top < height * .78) continue;
          if (left + w > width - 280 && top < (compact ? 65 : 120)) continue;
          if (occupied.some(b => left < b.left + b.w + 8 && left + w + 8 > b.left &&
            top < b.top + b.h + 8 && top + h + 8 > b.top)) continue;
          box = { left, top, w, h };
          break;
        }
        if (box) break;
      }
      if (!box) {
        tag.hidden = leader.hidden = dot.hidden = true;
        continue;
      }
      occupied.push(box);
      const endX = clamp(x, box.left, box.left + w);
      const endY = clamp(y, box.top, box.top + h);
      const length = Math.hypot(endX - x, endY - y);
      const angle = Math.atan2(endY - y, endX - x);
      const reveal = reduced ? 1 : ink;
      dot.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-50%)';
      leader.style.width = length + 'px';
      leader.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + angle + 'rad) scaleX(' + reveal + ')';
      tag.style.transform = 'translate(' + box.left + 'px,' + box.top + 'px)';
      dot.style.opacity = ink;
      leader.style.opacity = ink * .78;
      tag.style.opacity = reduced ? 1 : smooth(ink, .25, 1);
    }
  };
}
