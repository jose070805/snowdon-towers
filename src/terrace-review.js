import * as THREE from 'three';
import siteUrl from '../assets/site-plan.json?url';
import { loadGeometry } from './geometry.js';
import { makeTerrace } from './terrace-scene.js';
import { setStreetView, setTableView } from './terrace-views.js';

export async function renderTerraceFrame(view) {
  const [site, model] = await Promise.all([
    fetch(siteUrl).then(response => {
      if (!response.ok) throw new Error('C101 could not be loaded: ' + response.status);
      return response.json();
    }),
    loadGeometry(),
  ]);
  const scene = new THREE.Scene();
  const table = makeTerrace(scene, site, model.read(model.meta.plan.shell));
  const renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.domElement.style.cssText = 'display:block;width:100vw;height:100svh;';
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', view === 'table' ? '露台圆桌上的 C101 图纸' : '从夜街看向咖啡馆露台');
  document.body.replaceChildren(renderer.domElement);
  document.body.style.overflow = 'hidden';

  function render() {
    const width = window.innerWidth, height = window.innerHeight;
    const aspect = width / height;
    let camera;
    if (view === 'table') {
      camera = new THREE.OrthographicCamera();
      setTableView(camera, table, aspect);
    } else {
      camera = new THREE.PerspectiveCamera();
      setStreetView(camera, aspect);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.render(scene, camera);
    renderer.domElement.dataset.terraceView = view;
  }
  addEventListener('resize', render);
  render();
}
