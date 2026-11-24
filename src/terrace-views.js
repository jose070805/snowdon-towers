export function setStreetView(camera, aspect, unit = 1) {
  const compact = aspect < .85;
  camera.fov = compact ? 64 : 49;
  camera.aspect = aspect;
  camera.near = .045 * unit;
  camera.far = 75 * unit;
  camera.updateProjectionMatrix();
  camera.position.set(compact ? .61 : .55, 1.43, compact ? 3.82 : 3.65);
  camera.up.set(0, 1, 0);
  camera.lookAt(compact ? -.33 : -.12, 1.11, -6.5);
}

export function setTableView(camera, table, aspect, unit = 1) {
  const halfHeight = Math.max(1.28, 1.05 / aspect) * unit / 2;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.near = .03 * unit;
  camera.far = 40 * unit;
  camera.updateProjectionMatrix();
  const x = table.position.x + .012, z = table.position.z + .035;
  camera.position.set(x, 2.22, z);
  camera.up.set(.16, 0, -.985);
  camera.lookAt(x, 0, z);
}
