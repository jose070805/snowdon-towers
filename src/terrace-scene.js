import * as THREE from 'three';

const ground = 0;
const terraceFloor = .12;
const tableY = terraceFloor + .72;
const tableRadius = .445;
const frontTable = [-.57, .77];
const paperWidth = .596;
const paperDepth = .464;

function brushTexture(seed, strokeCount) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const random = randomFrom(seed);
  ctx.fillStyle = '#e4dcd0';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < strokeCount; i++) {
    ctx.save();
    ctx.translate(random() * 256, random() * 256);
    ctx.rotate(.35 + random() * 1.1);
    ctx.fillStyle = random() > .47 ? 'rgba(79,65,65,.10)' : 'rgba(255,253,241,.25)';
    ctx.fillRect(0, 0, .65 + random() * 2.8, 2 + random() * 19);
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function randomFrom(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function makeTerrace(scene, site, shell) {
  const root = new THREE.Group();
  root.name = 'Café terrace at night';
  scene.add(root);

  const ramp = new THREE.DataTexture(new Uint8Array([91, 139, 191, 255]), 4, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  const plasterTexture = brushTexture(114, 5900);
  plasterTexture.repeat.set(2.5, 3.5);
  const stoneTexture = brushTexture(702, 3200);
  function toon(color, texture = null) {
    return new THREE.MeshToonMaterial({color, map: texture, gradientMap: ramp});
  }
  const glaze = color => new THREE.MeshBasicMaterial({color});
  const ochre = toon('#f7bf46', plasterTexture);
  const yellow = toon('#f7b237', plasterTexture);
  const orange = toon('#b85622', plasterTexture);
  const cream = toon('#e9bc60', plasterTexture);
  const awning = toon('#f9c749', plasterTexture);
  awning.side = THREE.DoubleSide;
  const stitch = toon('#b17e21');
  const blue = toon('#253c66', plasterTexture);
  const royal = toon('#305d98', plasterTexture);
  const crevice = toon('#14273f');
  const brick = toon('#343957', plasterTexture);
  const green = toon('#50604b', plasterTexture);
  const sill = toon('#635f49');
  const terracotta = toon('#be601f', plasterTexture);
  const chairWood = toon('#b58a44', stoneTexture);
  const iron = toon('#303b35');
  const pale = toon('#c1cfc7');
  const rim = toon('#626e53');
  const light = glaze('#ffc45b');
  const dimLight = glaze('#b86619');
  const glass = glaze('#2c465b');

  const cube = new THREE.BoxGeometry();
  const upAxis = new THREE.Vector3(0, 1, 0);
  function box(name, parent, material, x, y, z, w, h, d) {
    const mesh = new THREE.Mesh(cube, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    parent.add(mesh);
    return mesh;
  }
  function rod(parent, material, from, to, radius, top = radius) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const delta = b.clone().sub(a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, radius, delta.length(), 6), material);
    mesh.position.copy(a).lerp(b, .5);
    mesh.quaternion.setFromUnitVectors(upAxis, delta.normalize());
    parent.add(mesh);
    return mesh;
  }
  const originBox = (name, material, x, y, z, w, h, d) =>
    box(name, root, material, x, y, z, w, h, d);
  const cy = (name, parent, material, x, y, z, radius, height, sides = 40) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, sides), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  // Warm side of the lane, with a raised terrace and a narrow blue entrance at the near corner.
  // A cool masonry return frames the near edge of the street view.
  originBox('near blue masonry return', crevice, -1.60, 2.31, 2.49, 2.79, 4.62, .17);
  originBox('near cobalt corner jamb', royal, -.225, 2.31, 2.56, .126, 4.62, .18);
  originBox('near blue window header', royal, -.391, 2.68, 2.58, .36, .12, .16);
  originBox('near blue window sill', blue, -.381, 1.17, 2.57, .40, .12, .15);
  originBox('café façade', ochre, -2.48, 2.10, -5.4, .44, 4.20, 15.6);
  originBox('café base course', yellow, -2.207, .26, -5.4, .12, .49, 15.55);
  originBox('blue corner pier', royal, -2.30, 2.15, 1.87, .56, 4.3, .78);
  originBox('blue corner recess', crevice, -2.006, 1.19, 2.05, .065, 2.38, .46);
  originBox('corner upper window trim', blue, -1.994, 2.83, 1.85, .08, .75, .46);
  originBox('corner upper window', glass, -1.944, 2.83, 1.85, .03, .61, .30);
  for (const z of [1.03, -2.18, -5.38, -8.58, -11.77]) {
    originBox('ochre window casing', cream, -2.228, 1.66, z, .14, 2.48, 1.21);
    originBox('deep orange opening', orange, -2.140, 1.62, z, .058, 2.31, 1.02);
    originBox('warm window inset', dimLight, -2.100, 1.72, z, .020, 1.85, .77);
    originBox('window mullion', green, -2.074, 1.65, z, .043, 2.14, .040);
    originBox('window transom', orange, -2.060, 2.28, z, .058, .046, .99);
    originBox('window sill', sill, -2.076, .51, z, .24, .082, 1.28);
    for (const offset of [-.46, .46]) {
      originBox('orange shutter stile', orange, -2.052, 1.42, z + offset, .062, 1.70, .100);
    }
  }
  originBox('terrace slab', terracotta, -1.15, .063, -5.82, 2.31, .126, 14.56);
  originBox('terrace edge coping', cream, .02, .127, -5.82, .116, .036, 14.56);
  originBox('front terrace curb', terracotta, -1.13, .053, 1.48, 2.33, .107, .16);
  originBox('front terrace coping', cream, -1.13, .117, 1.53, 2.34, .039, .11);
  for (let i = 0; i < 18; i++) {
    originBox('painted curb brick', i % 3 ? green : orange, -2.23 + i * .127, .063, 1.565, .092, .093, .018);
  }
  // Fabric canopy: a sloped panel with ribs and a shaped hanging hem.
  const canopy = new THREE.BufferGeometry();
  canopy.setAttribute('position', new THREE.Float32BufferAttribute([
    -2.27,3.52,1.53, .13,2.59,1.53, .13,2.59,-11.95,
    -2.27,3.52,1.53, .13,2.59,-11.95, -2.27,3.52,-11.95,
  ], 3));
  canopy.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, 1,0, 1,4, 0,0, 1,4, 0,4], 2));
  canopy.computeVertexNormals();
  const cloth = new THREE.Mesh(canopy, awning);
  cloth.name = 'Saffron canvas awning';
  root.add(cloth);
  rod(root, stitch, [.13, 2.59, 1.54], [.13, 2.59, -11.97], .026);
  for (let i = 0; i < 34; i++) {
    const z = 1.32 - i * .392;
    cy('scalloped canvas hem', root, yellow, .147, 2.47, z, .185, .047, 9)
      .rotation.z = Math.PI / 2;
  }
  for (const z of [1.38, -.92, -3.38, -5.81, -8.24, -10.99]) {
    rod(root, stitch, [-2.225, 3.50, z], [.12, 2.558, z], .019);
    rod(root, iron, [-2.24, 2.31, z], [-.63, 2.89, z], .017);
  }
  for (const z of [.15, -3.15, -6.35, -9.55]) {
    rod(root, iron, [-2.22, 2.27, z], [-1.84, 2.27, z], .016);
    originBox('lantern amber pane', light, -1.82, 2.09, z, .19, .30, .16);
    originBox('lantern canopy', orange, -1.82, 2.27, z, .26, .050, .23);
    originBox('lantern lower cap', iron, -1.82, 1.93, z, .22, .032, .18);
    for (const x of [-1.92, -1.72]) for (const dz of [-.085,.085]) {
      originBox('lantern frame', iron, x, 2.09, z + dz, .018, .31, .018);
    }
  }
  // Opposite buildings and their receding window bays.
  const random = randomFrom(613);
  for (const [index, z] of [1.2, -3.8, -9.1, -14.1, -19.7, -25.7, -32.3].entries()) {
    const h = [6.7, 6.2, 7.25, 5.8, 6.5, 5, 5.8][index];
    const x = 5.92 + (index % 3) * .22;
    const w = index > 3 ? 5.8 : 4.94;
    originBox('opposite townhouse', index % 2 ? blue : brick, x, h / 2, z, 4.0, h, w);
    originBox('upper cornice', royal, x - 1.95, h - .17, z, .30, .23, w + .18);
    originBox('opposite masonry plinth', crevice, x - 2.0, .45, z, .22, .90, w + .09);
    for (const dz of [-1.55, 0, 1.55]) {
      for (const y of [1.42, 3.51, 5.18]) {
        const frame = index === 2 && y < 2 ? orange : royal;
        originBox('window surround', frame, x - 2.035, y, z + dz, .075, 1.16, .64);
        originBox('window recess', random() < .37 || (index === 2 && y < 2) ? dimLight : crevice,
          x - 2.09, y, z + dz, .063, .99, .48);
        originBox('window glazing bar', iron, x - 2.13, y + .12, z + dz, .022, .036, .49);
      }
    }
    if (index > 1) originBox('distant left silhouette', blue, -4.18, h / 2, z - 4, 3.8, h, w);
  }
  originBox('right-side shop front', green, 3.84, 1.12, -8.78, .20, 2.24, 4.53);
  for (const dz of [-1.67, -.51, .72, 1.74]) {
    originBox('gold shop reveal', orange, 3.71, 1.25, -8.78 + dz, .14, 1.93, .85);
    originBox('lit shop window', dimLight, 3.629, 1.27, -8.78 + dz, .042, 1.72, .65);
    originBox('shop glazing stile', iron, 3.598, 1.27, -8.78 + dz, .052, 1.72, .037);
  }
  originBox('shop fascia', orange, 3.68, 2.32, -8.78, .39, .24, 4.83);
  originBox('right gutter line', royal, 3.52, .066, -11.5, .15, .090, 24);
  originBox('distance termination', crevice, .80, 2.6, -37, 11, 5.4, .7);
  originBox('cobble bedding', crevice, 1.68, -.042, -13.3, 13.4, .080, 42.0);
  addCobblestones();

  function addCobblestones() {
    const shape = new THREE.Shape();
    const corners = [[-.40,-.48],[.31,-.50],[.49,-.27],[.48,.33],[.30,.46],[-.31,.49],[-.49,.29],[-.50,-.24]];
    corners.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
    shape.closePath();
    const stone = new THREE.ExtrudeGeometry(shape, {depth: .044, bevelEnabled: false, steps: 1});
    stone.rotateX(-Math.PI / 2);
    const material = toon('#e9e7d8', stoneTexture);
    const objects = [];
    for (let row = 0; row < 174; row++) {
      const z = 4.35 - row * .219;
      for (let col = 0; col < 31; col++) {
        const x = -3.18 + col * .345 + (row % 2) * .172;
        if (x < .10 && z > -13.05 && z < 1.60) continue;
        objects.push([x, z]);
      }
    }
    const mesh = new THREE.InstancedMesh(stone, material, objects.length);
    mesh.name = 'Individually colored slate cobbles';
    const dummy = new THREE.Object3D();
    const slate = ['#496692','#5b77ab','#34486a','#2f4d68','#424b49','#818452','#8e723d','#a66629','#b47e36','#b1a27a','#8a8f89','#4a5954'];
    const warm = ['#7190b7','#6588bc','#3c5e83','#9a7545','#c8812b','#cf9b51','#a1632e','#d3ae6c','#a3a7a0','#4e6657'];
    const ink = new THREE.Color();
    for (const [i, [x,z]] of objects.entries()) {
      dummy.position.set(x + (random() - .5) * .043, ground + random() * .014, z + (random() - .5) * .022);
      dummy.scale.set(.29 + random() * .055, .4, .174 + random() * .048);
      dummy.rotation.y = (random() - .5) * .22;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const palette = x < 1.65 && z > -9 && random() < .7 ? warm : slate;
      mesh.setColorAt(i, ink.set(palette[Math.floor(random() * palette.length)]));
    }
    root.add(mesh);

    const tile = new THREE.InstancedMesh(cube, toon('#fff5d7', stoneTexture), 540);
    tile.name = 'Terrace brick pavers';
    const alternating = ['#c4782a','#e29538','#946028','#b68a53','#a55b2c','#b27a37'];
    for (let i = 0; i < 540; i++) {
      const row = Math.floor(i / 9), col = i % 9;
      dummy.position.set(-2.17 + col * .258 + (row % 2) * .051, .130, 1.38 - row * .240);
      dummy.scale.set(.235, .016, .216);
      dummy.rotation.y = (random() - .5) * .043;
      dummy.updateMatrix();
      tile.setMatrixAt(i, dummy.matrix);
      tile.setColorAt(i, ink.set(alternating[Math.floor(random() * alternating.length)]));
    }
    root.add(tile);
  }

  function chair(x, z, yaw) {
    const group = new THREE.Group();
    group.name = 'Open-back terrace chair';
    group.position.set(x, terraceFloor, z);
    group.rotation.y = yaw;
    root.add(group);
    const seat = cy('thin oval chair seat', group, chairWood, 0, .423, 0, .173, .037, 20);
    seat.scale.z = .88;
    for (const side of [-1, 1]) {
      rod(group, iron, [side*.182, .007, .151], [side*.139, .421, .108], .012);
      rod(group, iron, [side*.174, .007, -.177], [side*.137, .421, -.132], .013);
      rod(group, iron, [side*.137, .421, -.132], [side*.144, .791, -.207], .014);
      rod(group, iron, [side*.167, .167, .126], [side*.160, .167, -.168], .009);
    }
    box('curved backrest top slat', group, chairWood, 0, .756, -.195, .291, .052, .026);
    box('open back lower slat', group, chairWood, 0, .670, -.180, .249, .035, .021);
  }

  function table(x, z, radius, forDrawing, seats) {
    const body = new THREE.Group();
    body.name = forDrawing ? 'Front round table carrying C101' : 'Pale café bistro table';
    body.position.set(x, 0, z);
    root.add(body);
    cy('thin round tabletop', body, pale, 0, tableY - .014, 0, radius, .028);
    cy('narrow dark rim under the top', body, rim, 0, tableY - .031, 0, radius * .994, .009);
    for (let leg = 0; leg < 3; leg++) {
      const angle = leg * (2 * Math.PI / 3) + .42;
      const cx = Math.cos(angle), cz = Math.sin(angle);
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(cx*radius*.29, tableY-.034, cz*radius*.29),
        new THREE.Vector3(cx*radius*.25, terraceFloor+.49, cz*radius*.25),
        new THREE.Vector3(cx*radius*.53, terraceFloor+.21, cz*radius*.53),
        new THREE.Vector3(cx*radius*.84, terraceFloor+.018, cz*radius*.84),
      ]);
      body.add(new THREE.Mesh(new THREE.TubeGeometry(path, 10, .014, 6, false), iron));
      rod(body, iron, [0, terraceFloor+.28, 0], [cx*radius*.44, terraceFloor+.28, cz*radius*.44], .008);
    }
    for (const angle of seats) {
      const reach = radius + .28;
      chair(x + Math.sin(angle)*reach, z + Math.cos(angle)*reach, angle + Math.PI);
    }
    return body;
  }
  const hero = table(...frontTable, tableRadius, true, [2.69]);
  // This chair faces out toward the lane. Its top rail overlaps the rim in
  // the overhead view while the uprights clear the edge of the tabletop.
  const frontChairAngle = .75;
  const frontChairDistance = .632;
  chair(frontTable[0] + Math.sin(frontChairAngle) * frontChairDistance,
    frontTable[1] + Math.cos(frontChairAngle) * frontChairDistance, frontChairAngle);
  table(-1.73, .61, .303, false, [3.55, 5.6]);
  table(-1.61, -1.15, .329, false, [.33, 1.94]);
  table(-.66, -2.29, .351, false, [1.71, 3.16]);
  table(-1.73, -3.37, .303, false, [.6, 2.5]);
  table(-.51, -4.39, .335, false, [-2.8, .89]);
  table(-1.56, -5.39, .32, false, [.55, 2.23]);
  table(-.59, -6.80, .337, false, [.30, 3.04]);
  table(-1.73, -8.28, .319, false, [1.11, 2.8]);
  table(-.61, -9.48, .313, false, [-.26, 2.42]);
  addPaper(hero, site, shell);

  const foliage = toon('#193b4e', stoneTexture);
  const leaf = new THREE.IcosahedronGeometry(1, 1);
  const crown = new THREE.Group();
  crown.name = 'Tree canopy over the blue shop corner';
  crown.position.set(3.65, 4.60, -6.9);
  root.add(crown);
  rod(root, iron, [3.34, .06, -7.10], [3.38, 4.36, -7.10], .105, .035);
  for (let i = 0; i < 57; i++) {
    const cluster = new THREE.Mesh(leaf, foliage);
    cluster.position.set((random() - .54) * 2.34, random() * .69, (random() - .5) * 2.65);
    const radius = .17 + random() * .39;
    cluster.scale.set(radius, radius * .68, radius);
    crown.add(cluster);
  }

  const skyFill = new THREE.HemisphereLight('#afc3ed', '#56432f', 1.63);
  const moon = new THREE.DirectionalLight('#9bbafa', 1.10);
  moon.position.set(0.5, 6.0, 3.6);
  root.add(skyFill, moon, moon.target);
  for (const z of [-.6, -4.2, -8.4]) {
    const warmLight = new THREE.PointLight('#ffba36', 13.3, 6.4, 2);
    warmLight.position.set(-1.32, 2.19, z);
    root.add(warmLight);
  }
  const shopLight = new THREE.PointLight('#f0a331', 10, 4.4, 2);
  shopLight.position.set(3.43, 1.43, -8.76);
  root.add(shopLight);
  scene.background = new THREE.Color('#102957');
  scene.fog = new THREE.Fog('#102957', 16, 43);

  return hero;
}

function addPaper(table, site, shell) {
  const group = new THREE.Group();
  group.name = 'C101 paper';
  group.position.y = tableY + .002;
  group.rotation.y = -.17;
  table.add(group);
  const sheetGeometry = new THREE.PlaneGeometry(paperWidth, paperDepth);
  sheetGeometry.rotateX(-Math.PI / 2);
  group.add(new THREE.Mesh(sheetGeometry, new THREE.MeshBasicMaterial({color: '#102c50'})));

  const sourceOutline = [];
  for (let i = 0; i < shell.length; i += 6) {
    sourceOutline.push([shell[i], shell[i+2], shell[i+3], shell[i+5]]);
  }
  const layers = [
    [site.layers.contours, '#3b5571'], [site.layers.roads, '#9aa88f'],
    [site.layers.context, '#5a7993'], [site.layers.boundary, '#d0c2a6'], [sourceOutline, '#e4cfa4'],
  ];
  const angle = site.camera.bearing;
  const c = Math.cos(angle), s = Math.sin(angle);
  const flat = (x, z) => [x * c - z * s, x * s + z * c];
  const bounds = new THREE.Box2();
  const points = layers.map(([rows]) => rows.flatMap(([x, z, xx, zz]) => [flat(x,z),flat(xx,zz)]));
  for (const layer of points) for (const p of layer) bounds.expandByPoint(new THREE.Vector2(...p));
  const center = bounds.getCenter(new THREE.Vector2());
  const span = bounds.getSize(new THREE.Vector2());
  const scale = Math.min(paperWidth * .84 / span.x, paperDepth * .82 / span.y);
  // This is also the registration used by the scroll camera. Keeping it on
  // the paper makes the site agree with the exact crop seen in both previews.
  group.userData.print = {angle, center, scale};
  for (const [i, coords] of points.entries()) {
    const geometry = new THREE.BufferGeometry();
    const values = coords.flatMap(([x,z]) => [(x-center.x)*scale, .0006 + i*.00008, (z-center.y)*scale]);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
    group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({color: layers[i][1]})));
  }
  const border = new THREE.BufferGeometry();
  const x = paperWidth * .461, z = paperDepth * .452;
  border.setAttribute('position', new THREE.Float32BufferAttribute(
    [-x,.001,-z, x,.001,-z, x,.001,z, -x,.001,z], 3));
  group.add(new THREE.LineLoop(border, new THREE.LineBasicMaterial({color: '#7a8b85'})));
}
