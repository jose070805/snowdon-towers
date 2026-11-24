import * as THREE from 'three';

export const cafeDuration = .26;
const { smoothstep: smooth, lerp } = THREE.MathUtils;

// The café is designed in metres. Its paper is centered on the existing C101
// view in project feet, so the real drawing becomes the tabletop drawing.
export function makeCafeSequence(scene, site) {
  const room = new THREE.Group();
  room.name = 'night-street-and-cafe';
  const scale = site.width / 2.38;
  room.scale.setScalar(scale);
  room.rotation.y = site.bearing;
  room.position.set(site.x, 0, site.z);
  scene.add(room);

  const ramp = new THREE.DataTexture(new Uint8Array([69, 135, 205, 255]), 4, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  const palette = [];
  function toon(color) {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: ramp });
    palette.push(m);
    return m;
  }
  function lit(color) {
    const m = new THREE.MeshBasicMaterial({ color });
    palette.push(m);
    return m;
  }
  const brick = toon('#806c68'), stone = toon('#a69479'), trim = toon('#273c43');
  const upperBrick = toon('#535165');
  const road = toon('#273546'), curb = toon('#6b665a'), wood = toon('#5b3a28');
  const floor = toon('#72614e'), plaster = toon('#a99a7d'), metal = toon('#353b40');
  const glass = lit('#415254'), amber = lit('#f1b460'), dark = lit('#1e2b3c');
  const ivory = toon('#ddc5a0'), pool = lit('#615044');
  const cube = new THREE.BoxGeometry(1, 1, 1);
  function box(material, x, y, z, w, h, d, parent = room) {
    const mesh = new THREE.Mesh(cube, material);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  function cylinder(material, x, y, z, radius, height, sides = 10) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, sides), material);
    mesh.position.set(x, y, z);
    room.add(mesh);
    return mesh;
  }

  // Street section and masonry frontage. The door opening is actual geometry.
  box(road, 0, -.99, 8, 34, .22, 17);
  box(curb, 0, -.91, 4.15, 28, .18, 2.1);
  box(stone, 0, -.82, 5.19, 27, .07, .09);
  for (let i = -9; i <= 9; i++) {
    box(dark, i * .9, -.814, 4.17, .012, .004, 1.9);
    if (i % 2 === 0) box(curb, i * 1.5, -.876, 8.8, .74, .006, .045);
  }
  box(floor, 0, -.91, .05, 9.2, .17, 6.3);
  for (let i = -6; i <= 6; i++) box(wood, 0, -.821, .45 * i, 8.3, .007, .018);
  box(upperBrick, 0, 3.32, 3.19, 10, 2.4, .36);
  for (const x of [-3.65, -2.18, -.71, .76, 2.23, 3.70]) {
    box(stone, x, 3.15, 3.392, .74, 1.58, .078);
    box(dark, x, 3.18, 3.444, .60, 1.39, .045);
    box(glass, x, 3.19, 3.474, .43, 1.16, .009);
    box(trim, x, 3.25, 3.489, .43, .035, .014);
    box(stone, x, 2.36, 3.48, .84, .11, .27);
  }
  box(stone, 0, 2.09, 3.39, 10.1, .17, .29);
  box(stone, 0, 1.76, 3.42, 8.8, .11, .32);
  for (const x of [-4.7, -3.12, -1.47, .99, 2.57, 4.7]) {
    box(brick, x, .57, 3.21, .42, 2.79, .38);
    box(stone, x, -.64, 3.43, .50, .32, .18);
  }
  for (const x of [-3.90, -2.28, 1.78, 3.64]) {
    const width = x === 3.64 ? 1.73 : 1.15;
    box(glass, x, .62, 3.22, width, 1.88, .035);
    box(trim, x, .02, 3.27, width + .12, .06, .10);
    box(trim, x, 1.03, 3.27, width + .12, .06, .10);
    box(trim, x, .64, 3.28, .045, 1.85, .09);
    box(wood, x, -.53, 3.28, width + .16, .46, .2);
    box(amber, x - .2, .5, 3.242, .035, 1.15, .006);
  }
  box(trim, -.23, 1.61, 3.22, 2.08, .23, .21);
  box(amber, -.23, 1.51, 3.27, 1.47, .045, .12);
  const door = new THREE.Group();
  door.position.set(-1.24, 0, 3.12);
  door.rotation.y = .98;
  room.add(door);
  for (const x of [0, .89]) box(trim, x, .30, 0, .06, 2.20, .09, door);
  for (const y of [-.75, -.12, 1.37]) box(trim, .44, y, 0, .95, .08, .08, door);
  box(wood, .44, -.44, 0, .91, .60, .055, door);
  box(amber, .82, .14, .065, .034, .19, .03, door);
  for (const x of [-3.12, .97, 2.57]) {
    box(metal, x, 1.25, 3.55, .11, .34, .12);
    box(amber, x, 1.23, 3.62, .13, .20, .085);
  }
  for (const x of [-8.5, 8.7]) {
    box(upperBrick, x, 1.65, 3.38, 7.7, 5.15, .60);
    for (let i = -2; i <= 2; i++) {
      box(trim, x + .93 * i, 2.44, 3.72, .57, 1.13, .07);
      box(glass, x + .93 * i, 2.44, 3.78, .41, .91, .03);
    }
  }
  for (const x of [-3.45, 2.9]) {
    cylinder(metal, x, .48, 5.13, .038, 2.60);
    cylinder(amber, x, 1.83, 5.13, .14, .18, 6);
    cylinder(trim, x, 1.96, 5.13, .16, .09, 6);
  }

  // Interior route: a counter and a pair of tables flank the path to C101.
  box(plaster, 0, .78, -3.11, 9, 3.23, .19);
  box(trim, -4.50, .78, .06, .18, 3.23, 6.41);
  box(trim, 4.50, .78, .06, .18, 3.23, 6.41);
  box(plaster, 0, 2.45, .06, 9, .14, 6.41);
  box(wood, -2.94, -.44, -.76, 1.2, .72, 2.68);
  box(stone, -2.94, -.057, -.76, 1.33, .075, 2.76);
  box(metal, -2.99, .16, -1.52, .69, .38, .50);
  for (const z of [-2.54, -.78, -.62, -.46]) cylinder(ivory, -2.84, .035, z, .052, .088);
  for (const y of [.43, .97, 1.51]) box(wood, -2.62, y, -2.94, 3.16, .055, .32);
  for (const z of [.68, 2.14]) {
    cylinder(wood, 2.86, -.10, z, .51, .085, 14);
    cylinder(metal, 2.86, -.46, z, .043, .70);
    for (const x of [2.16, 3.57]) {
      box(wood, x, -.42, z, .40, .06, .39);
      box(wood, x + (x > 2.86 ? .15 : -.15), -.19, z, .07, .46, .40);
      for (const dx of [-.14, .14]) box(metal, x + dx, -.63, z, .045, .39, .35);
    }
  }
  for (const [x, z] of [[-.87,.65],[1.08,-.4],[-2.9,-.50],[2.87,1.7]]) {
    cylinder(metal, x, 1.99, z, .013, .77);
    cylinder(trim, x, 1.55, z, .22, .12);
    cylinder(amber, x, 1.48, z, .171, .025);
  }
  box(wood, 0, -.066, 0, 2.69, .13, 2.17);
  for (const x of [-1.12, 1.12]) for (const z of [-.81, .81]) box(wood, x, -.45, z, .095, .68, .095);
  cylinder(ivory, 1.24, .031, -.83, .077, .075);
  cylinder(pool, 1.24, .070, -.83, .066, .004);
  box(amber, 1.25, .007, .55, .020, .016, .37);

  const ambient = new THREE.HemisphereLight('#b0c9eb', '#463146', 1.27);
  const moon = new THREE.DirectionalLight('#bccaf7', 1.24);
  moon.position.set(-3 * scale, 7 * scale, 8 * scale);
  const warm = new THREE.PointLight('#ffc27a', 10 * scale * scale, 7 * scale);
  warm.position.copy(room.localToWorld(new THREE.Vector3(-.5, 1.35, 2.88)));
  const lights = new THREE.Group();
  lights.add(ambient, moon, warm);
  scene.add(lights);

  const camera = new THREE.PerspectiveCamera(51, 1, 2, 22000);
  const position = new THREE.Vector3(), aim = new THREE.Vector3();
  const streetEye = new THREE.Vector3(-2.9, .73, 10.80), doorEye = new THREE.Vector3(-.18, .57, 4.50);
  const interiorEye = new THREE.Vector3(-.14, .82, 2.11), tableEye = new THREE.Vector3(0, 1.51, .18);
  const streetAim = new THREE.Vector3(.38, 1.15, 2.66), doorAim = new THREE.Vector3(-.16, .38, .6);
  const tableAim = new THREE.Vector3(0, -.03, -.04);
  return {
    camera,
    apply(time, reference, width, height) {
      room.visible = lights.visible = time < 1;
      if (!room.visible) return;
      const start = smooth(time, .10, .41);
      const inside = smooth(time, .37, .66);
      const lean = smooth(time, .59, .85);
      const match = smooth(time, .79, .90);
      const flatten = smooth(time, .83, .92);
      const opacity = 1 - smooth(time, .91, .997);
      for (const material of palette) {
        if (material.transparent !== (opacity < 1)) {
          material.transparent = opacity < 1;
          material.needsUpdate = true;
        }
        material.opacity = opacity;
      }
      position.copy(streetEye).lerp(doorEye, start).lerp(interiorEye, inside).lerp(tableEye, lean);
      aim.copy(streetAim).lerp(doorAim, start).lerp(tableAim, inside);
      camera.position.copy(room.localToWorld(position)).lerp(reference.position, match);
      camera.lookAt(room.localToWorld(aim));
      camera.quaternion.slerp(reference.quaternion, match);
      camera.fov = width < 730 ? 57 : 44;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const depth = camera.position.distanceTo(new THREE.Vector3(site.x, 0, site.z));
      // Match the homogeneous scale at the paper before blending projections.
      const projection = camera.projectionMatrix.elements;
      const ortho = reference.projectionMatrix.elements;
      for (let i = 0; i < 16; i++) projection[i] = lerp(projection[i] / depth, ortho[i], flatten);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.updateMatrixWorld();
    },
  };
}
