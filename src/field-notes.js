const svgNS = 'http://www.w3.org/2000/svg';
const circleRadius = 3.5;
const maxLeaderLength = 260;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function svgElement(name, attributes) {
  const element = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

export function makeFieldNote(container, text, key = text) {
  const node = document.createElement('div');
  node.className = 'field-note';
  node.hidden = true;
  node.lang = 'en';
  const svg = svgElement('svg', {'aria-hidden': 'true'});
  const path = svgElement('path', {pathLength: 1});
  const circle = svgElement('circle', {r: circleRadius});
  svg.append(path, circle);
  const label = document.createElement('span');
  label.textContent = text;
  node.append(svg, label);
  container.append(node);

  let seed = 2166136261;
  for (const character of key) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  const rotation = -3 + 5 * ((seed >>> 0) % 101) / 100;
  const bend = (seed & 1 ? -1 : 1) * (4 + ((seed >>> 8) & 7) / 2);
  node.style.setProperty('--note-rotation', rotation + 'deg');
  return {node, path, circle, label, rotation, bend};
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function turn(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function crosses(a, b, c, d) {
  return turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;
}

function hitsRect(a, b, rect) {
  const leftTop = {x: rect.left, y: rect.top};
  const rightTop = {x: rect.right, y: rect.top};
  const leftBottom = {x: rect.left, y: rect.bottom};
  const rightBottom = {x: rect.right, y: rect.bottom};
  return [a, b].some(p => p.x > rect.left && p.x < rect.right && p.y > rect.top && p.y < rect.bottom) ||
    crosses(a, b, leftTop, rightTop) || crosses(a, b, rightTop, rightBottom) ||
    crosses(a, b, rightBottom, leftBottom) || crosses(a, b, leftBottom, leftTop);
}

function outlineOf(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  function half(order) {
    const edge = [];
    for (const point of order) {
      while (edge.length > 1 && turn(edge.at(-2), edge.at(-1), point) <= 0) edge.pop();
      edge.push(point);
    }
    return edge.slice(0, -1);
  }
  const outline = [...half(sorted), ...half(sorted.reverse())];
  return outline.map((point, i) => [point, outline[(i + 1) % outline.length]]);
}

function leaderFrom(box, anchor, bend) {
  const start = {x: clamp(anchor.x, box.left, box.right), y: clamp(anchor.y, box.top, box.bottom)};
  const dx = anchor.x - start.x;
  const dy = anchor.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 17 || length > maxLeaderLength - 12) return null;
  const nx = -dy / length;
  const ny = dx / length;
  const curve = Math.sign(bend) * Math.min(Math.abs(bend), length * .16);
  const a = {x: start.x + dx * .32 + nx * curve, y: start.y + dy * .32 + ny * curve};
  const b = {x: start.x + dx * .67 - nx * curve, y: start.y + dy * .67 - ny * curve};
  const tipDistance = circleRadius / Math.hypot(anchor.x - b.x, anchor.y - b.y);
  const end = {x: anchor.x + (b.x - anchor.x) * tipDistance, y: anchor.y + (b.y - anchor.y) * tipDistance};
  const points = [start];
  for (const t of [.25, .5, .75]) {
    const u = 1 - t;
    points.push({
      x: u ** 3 * start.x + 3 * u ** 2 * t * a.x + 3 * u * t ** 2 * b.x + t ** 3 * end.x,
      y: u ** 3 * start.y + 3 * u ** 2 * t * a.y + 3 * u * t ** 2 * b.y + t ** 3 * end.y,
    });
  }
  points.push(anchor);
  return {
    d: `M ${start.x} ${start.y} C ${a.x} ${a.y}, ${b.x} ${b.y}, ${end.x} ${end.y}`,
    segments: points.slice(1).map((p, i) => [points[i], p]),
  };
}

export function placeFieldNotes(entries, width, height, protectedElements, projectedCorners) {
  if (!entries.length) return 0;
  const margin = width < 730 ? 17 : 31;
  const obstacles = protectedElements.map(element => {
    const {left, top, right, bottom} = element.getBoundingClientRect();
    return {left, top, right: element.classList.contains('scale') ? left + (width < 730 ? 29 : 37) : right, bottom};
  });
  const outline = projectedCorners ? outlineOf(projectedCorners) : [];
  const insideDrawing = point => outline.length && outline.every(([a, b]) => turn(a, b, point) > 0);
  const placed = [];
  for (const entry of entries) {
    const {note, anchor, ink, side, vertical, subject, separateFrom} = entry;
    const separateRow = separateFrom && placed.find(other => other.note === separateFrom)?.bounds;
    note.node.hidden = false;
    const w = note.label.offsetWidth;
    const h = note.label.offsetHeight;
    const padding = 8 + Math.abs(Math.sin(note.rotation * Math.PI / 180)) * w / 2;
    const otherAnchors = entries.filter(other => other !== entry).map(({anchor: {x, y}}) =>
      ({left: x - 9, right: x + 9, top: y - 9, bottom: y + 9}));
    const blockers = [...obstacles, ...otherAnchors];
    const directions = [[side, vertical], [side, 0], [0, vertical], [-side, vertical],
      [side, -vertical], [0, -vertical], [-side, 0], [-side, -vertical]];
    const candidates = [32, 47, 62, 78, 95, 112, 130, 151, 174].flatMap(gap => directions.map(([dx, dy]) => ({
      left: anchor.x + dx * (w / 2 + gap) - w / 2,
      top: anchor.y + dy * (h / 2 + gap) - h / 2,
      rank: gap + (dx === -side ? 13 : 0) + (dy === -vertical ? 45 : 0),
    })));
    const avoidsDrawing = outline.length && !insideDrawing(anchor);
    let placement;
    let sideBySide;
    let subjectFallback;
    for (const candidate of candidates.sort((a, b) => a.rank - b.rank)) {
      const left = clamp(candidate.left, margin, width - w - margin);
      const top = clamp(candidate.top, margin, height - h - margin);
      const box = {left, top, right: left + w, bottom: top + h};
      const bounds = {left: left - padding, top: top - padding,
        right: box.right + padding, bottom: box.bottom + padding};
      const overDrawing = insideDrawing({x: left + w / 2, y: top + h / 2}) ||
        outline.some(([a, b]) => hitsRect(a, b, bounds));
      if (overDrawing && (!subject || avoidsDrawing)) continue;
      if (blockers.some(rect => overlaps(bounds, rect))) continue;
      if (placed.some(other => overlaps(bounds, other.bounds) ||
        other.segments.some(([a, b]) => hitsRect(a, b, bounds)))) continue;
      const leader = leaderFrom(box, anchor, note.bend);
      if (!leader || leader.segments.some(([a, b]) =>
        blockers.some(rect => hitsRect(a, b, rect)) ||
        (avoidsDrawing && outline.some(([c, d]) => crosses(a, b, c, d))) ||
        placed.some(other => hitsRect(a, b, other.bounds) ||
          other.segments.some(([c, d]) => crosses(a, b, c, d))))) continue;
      const match = {note, box, bounds, ...leader};
      // When the subject is close to the viewport edge, keep its label near its own outline.
      if (overDrawing) {
        subjectFallback ??= match;
        continue;
      }
      if (separateRow && bounds.top < separateRow.bottom && bounds.bottom > separateRow.top) {
        sideBySide ??= match;
        continue;
      }
      placement = match;
      break;
    }
    placement ??= sideBySide ?? subjectFallback;
    if (!placement) {
      note.node.hidden = true;
      continue;
    }

    placed.push(placement);
    note.node.style.opacity = ink;
    note.label.style.transform = `translate(${placement.box.left}px,${placement.box.top}px) rotate(var(--note-rotation))`;
    note.path.setAttribute('d', placement.d);
    note.circle.setAttribute('cx', anchor.x);
    note.circle.setAttribute('cy', anchor.y);
  }
  return placed.length;
}
