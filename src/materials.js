import * as THREE from 'three';

const finishes = {
  ivory: ['#e9deca', 0],
  concrete: ['#b7adb0', 0],
  stone: ['#d6b692', 0],
  brick: ['#aa6a58', 1],
  'brick-light': ['#bd8166', 1],
  glass: ['#355887', 2],
  amber: ['#b87939', 3],
  metal: ['#354356', 0],
  wood: ['#a85e4c', 0],
  roof: ['#a6aeb3', 0],
  partition: ['#cbbda8', 0],
  solar: ['#243a64', 4],
  lawn: ['#8d9e79', 6],
  deck: ['#c8a67d', 5],
  paving: ['#b3a795', 0],
  soil: ['#88766a', 0],
  planter: ['#746e63', 0],
  pergola: ['#ddc29c', 5],
  umbrella: ['#d5c4af', 0],
  foliage: ['#8d9e79', 6],
  stem: ['#a99570', 0],
};

const vertex = /* glsl */`
  varying vec3 sitePosition;
  varying vec3 worldPosition;
  void main() {
    sitePosition = position;
    vec4 local = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
    #endif
    worldPosition = (modelMatrix * local).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * local;
  }
`;

const fragment = /* glsl */`
  uniform vec3 paper;
  uniform vec3 endColor;
  uniform float kind;
  uniform float solid;
  uniform float lamp;
  uniform vec3 spread;
  varying vec3 sitePosition;
  varying vec3 worldPosition;

  float hash(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  }

  float ruled(float t, float width) {
    float a = max(fwidth(t), .002);
    return (1. - smoothstep(width, width + a, abs(fract(t + .5) - .5))) * (1. - smoothstep(.28, .85, a));
  }

  void main() {
    float front = (sitePosition.x + .40 * sitePosition.z - spread.x) / spread.y;
    if (spread.z < .999 && front > spread.z) discard;
    vec3 normal = normalize(cross(dFdx(worldPosition), dFdy(worldPosition)));
    vec3 warmLight = normalize(vec3(-.57, .83, .65));
    vec3 coolLight = normalize(vec3(.9, .5, -.3));
    float direct = max(0., dot(normal, warmLight));
    float fill = max(0., dot(normal, coolLight));
    float band = .225 + .22 * smoothstep(.16, .35, direct) + .32 * smoothstep(.47, .64, direct);
    vec3 light = vec3(.59, .72, 1.12) * (.26 + fill * .16) + vec3(1.18, .99, .75) * band;
    float u = (abs(normal.x) > abs(normal.z)) ? sitePosition.z : sitePosition.x;
    float mixedGrain = hash(gl_FragCoord.xy) * .044;
    float hatch = ruled((u + sitePosition.y * .86) * 1.25, .055);
    float crosshatch = ruled((u - sitePosition.y * 1.43) * .96, .04);
    float shadow = 1. - smoothstep(.18, .62, direct);
    vec3 pigments = endColor;
    if (kind == 1. && abs(normal.y) < .6) {
      float course = (sitePosition.y + .02) * 4.05;
      float run = u * 1.51 + mod(floor(course), 2.) * .5;
      float mortar = max(ruled(course, .038), ruled(run, .026));
      pigments *= .90 + .17 * hash(vec2(floor(course), floor(run)));
      pigments = mix(pigments, vec3(.34, .23, .17), mortar * .36);
    }
    if (kind == 5.) pigments *= .95 - .19 * ruled(sitePosition.z * .72 + sitePosition.x * .05, .029);
    if (kind == 6.) pigments *= .91 + .11 * hash(floor(sitePosition.xz * 3.));
    vec3 ink = pigments * light * (1. - hatch * (.13 + .34 * shadow) - crosshatch * .15 * shadow);
    if (kind == 2. || kind == 3.) {
      float reflected = smoothstep(24., 67., worldPosition.y + worldPosition.x * .18);
      vec3 coolReflection = vec3(.07, .14, .28) * (.25 + .75 * reflected);
      if (kind == 3.) pigments = mix(vec3(.034, .079, .171), pigments, lamp);
      ink = pigments * (.48 + .26 * direct)
        + coolReflection * (kind == 2. ? .52 : mix(.52, .05, lamp));
      if (kind == 3.) ink += vec3(.38, .19, .042) * (.70 + .3 * (1. - reflected)) * lamp;
      ink *= 1. - hatch * .22;
    }
    if (kind == 4.) {
      float cell = max(ruled(u * 2.23, .03), ruled(sitePosition.y * 2.23, .025));
      ink = pigments * (.64 + .27 * direct) + vec3(.012, .025, .061);
      ink += cell * vec3(.014, .027, .046);
    }
    vec3 draft = paper * (.72 + .52 * direct) + vec3(.010, .012, .017) * fill;
    draft *= 1. - hatch * .16;
    vec3 result = mix(draft, ink, solid);
    result *= .977 + mixedGrain;
    gl_FragColor = vec4(result, 1.);
    #include <colorspace_fragment>
  }
`;

export function createFinish(name, solid, lamp = { value: 1 }) {
  const [color, kind] = finishes[name] ?? finishes.ivory;
  return new THREE.ShaderMaterial({
    uniforms: {
      paper: { value: new THREE.Color('#253650') },
      endColor: { value: new THREE.Color(color) },
      solid,
      lamp,
      spread: { value: new THREE.Vector3(0, 1, 1) },
      kind: { value: kind },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 0.8,
    polygonOffsetUnits: 1,
  });
}

export function makeGround() {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { opacity: { value: 1 } },
    vertexShader: /* glsl */`
      varying vec2 v;
      void main() {
        v = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float opacity;
      varying vec2 v;
      float grid(float p, float spacing) {
        float s = p / spacing;
        return 1. - smoothstep(0., max(fwidth(s), .01), abs(fract(s + .5) - .5));
      }
      void main() {
        vec2 p = v;
        vec2 q = p / vec2(154., 86.);
        float fade = 1. - smoothstep(.15, .99, length(q));
        float shadow = 1. - smoothstep(.22, .94, length((p - vec2(6., 8.)) / vec2(108., 54.)));
        float warm = exp(-dot((p - vec2(-42., -24.)) / vec2(73., 55.), (p - vec2(-42., -24.)) / vec2(73., 55.)));
        float minor = max(grid(p.x, 5.), grid(p.y, 5.));
        float major = max(grid(p.x, 20.), grid(p.y, 20.));
        vec3 pigment = vec3(.027, .049, .099);
        pigment += vec3(.034, .015, .002) * warm;
        pigment += vec3(.034, .032, .023) * (minor * .22 + major * .30);
        pigment *= 1. - shadow * .42;
        gl_FragColor = vec4(pigment, fade * opacity);
        #include <colorspace_fragment>
      }
    `,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(310, 178), material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -2.35;
  plane.renderOrder = 0;
  return plane;
}

export function makeCursor() {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */`
      varying vec2 v;
      void main() {
        v = uv - .5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 v;
      void main() {
        float r = length(v) * 2.;
        float core = 1. - smoothstep(.06, .23, r);
        float halo = exp(-r * 5.5) * (1. - smoothstep(.54, .98, r));
        gl_FragColor = vec4(mix(vec3(.84, .41, .05), vec3(1., .81, .46), core), min(1., core + halo * 1.55));
        #include <colorspace_fragment>
      }
    `,
  });
  const cursor = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), material);
  cursor.visible = false;
  cursor.renderOrder = 10;
  return cursor;
}
