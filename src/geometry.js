import * as THREE from 'three';
import assetUrl from '../assets/snowdon.sdt?url';

export async function loadGeometry() {
  const response = await fetch(assetUrl);
  if (!response.ok) throw new Error(`Model request returned ${response.status}`);
  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  const binary = await new Response(stream).arrayBuffer();
  const metadataBytes = new DataView(binary).getUint32(0, true);
  const offset = 4 + metadataBytes;
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(binary, 4, metadataBytes)));
  if (meta.version !== 1) throw new Error('Unrecognized geometry version');
  const integers = new DataView(binary, offset);
  const read = ([start, length], pivot = 0) => {
    const vertexData = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      vertexData[i] = integers.getInt16((start + i) * 2, true) / meta.quantization;
      if (i % 3 === 1) vertexData[i] -= pivot;
    }
    return vertexData;
  };
  return { meta, read };
}

export function meshGeometry(positions, normals = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (normals) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function segmentsFrom(values) {
  return new THREE.LineSegments(meshGeometry(Float32Array.from(values)), new THREE.LineBasicMaterial({
    color: 0xd9a34c, transparent: true, opacity: 0.85, depthWrite: false,
  }));
}

export class DrawnLines {
  constructor(values, scene, baseOrder = 1) {
    this.values = values;
    this.lengths = new Float32Array(values.length / 6);
    this.total = 0;
    for (let i = 0; i < values.length; i += 6) {
      this.total += Math.hypot(values[i] - values[i + 3], values[i + 2] - values[i + 5]);
      this.lengths[i / 6] = this.total;
    }
    this.lines = segmentsFrom(values);
    this.lines.renderOrder = baseOrder;
    this.tail = segmentsFrom(new Float32Array(6));
    this.tail.frustumCulled = false;
    this.tail.renderOrder = baseOrder;
    this.tail.material = this.lines.material;
    scene.add(this.lines, this.tail);
    this.tip = new THREE.Vector3();
  }

  apply(fraction, opacity) {
    this.lines.material.opacity = opacity;
    const show = this.total > 0 && fraction > 0 && opacity > 0.001;
    this.lines.visible = show;
    this.tail.visible = show && fraction < 0.99999;
    if (!show) return false;
    if (fraction >= 0.99999) {
      this.lines.geometry.setDrawRange(0, this.lengths.length * 2);
      return false;
    }
    const target = fraction * this.total;
    let low = 0;
    let high = this.lengths.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.lengths[mid] <= target) low = mid + 1;
      else high = mid;
    }
    this.lines.geometry.setDrawRange(0, low * 2);
    const start = low === 0 ? 0 : this.lengths[low - 1];
    const k = (target - start) / Math.max(1e-7, this.lengths[low] - start);
    const attr = this.tail.geometry.attributes.position;
    const values = this.values;
    const a = low * 6;
    this.tip.set(
      THREE.MathUtils.lerp(values[a], values[a + 3], k),
      values[a + 1],
      THREE.MathUtils.lerp(values[a + 2], values[a + 5], k),
    );
    attr.setXYZ(0, values[a], values[a + 1], values[a + 2]);
    attr.setXYZ(1, this.tip.x, this.tip.y, this.tip.z);
    attr.needsUpdate = true;
    return true;
  }
}
