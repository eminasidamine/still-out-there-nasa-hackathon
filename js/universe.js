// One continuous 3D scene for the whole journey. Earth, the Moon and Mars are turned so their
// real sunlit side faces the Sun right now (Mars24 + Astronomy Engine). Each machine stands at its
// real latitude/longitude. Sizes and distances between worlds are NOT to scale (the clock on screen
// gives the real light-travel time); the camera flies between "shots", one per stop.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { marsState } from './time/marsTime.js';
import { moonSubsolar } from './time/moonTime.js';

const RAD = Math.PI / 180;
const gsap = globalThis.gsap;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** NASA 3D Resources models (glTF). Other machines are shown as a real photo standing on the ground. */
export const MODELS = {
  eagle: { file: 'assets/models/eagle.glb', keepBelow: 0.5 },          // only the bottom half is still on the Moon
  opportunity: { file: 'assets/models/opportunity.glb', recolor: { SolarArrays: 0x1b2232 } },
  ingenuity: { file: 'assets/models/ingenuity.glb' },
  kepler: { file: 'assets/models/kepler.glb' },
  pioneer10: { file: 'assets/models/pioneer10.glb' },
};

// Storybook layout (scene units). Not to scale.
const BODIES = {
  earth: { pos: V(0, 0, 0), r: 1 },
  moon: { pos: V(6.5, 0.9, -8), r: 0.42 },
  mars: { pos: V(-60, 5, -140), r: 0.8 },
};
const DEEP = { kepler: V(45, -3, -230), pioneer10: V(-25, 14, -420) };
const SUN_DIR = V(1, 0.08, 0.55).normalize();

/** Latitude/longitude → unit vector in a body's own frame (matches three.js sphere UVs). */
export function lonLat(lat, lon) {
  const phi = (lon + 180) * RAD, th = lat * RAD;
  return V(-Math.cos(phi) * Math.cos(th), Math.sin(th), Math.sin(phi) * Math.cos(th));
}

/** Earth's subsolar point (good to a fraction of a degree). */
function earthSubsolar(d) {
  const day = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
  const decl = -23.44 * Math.cos((360 / 365) * (day + 10) * RAD);
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60;
  return { lat: decl, lonEast: -15 * (hours - 12) };
}

export function createUniverse(host, { onPick } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // Sharp when still, lighter while moving: full ratio (max 1.5) at rest, 1 during flights and drags.
  const REST_DPR = Math.min(devicePixelRatio || 1, 1.5);
  let dpr = REST_DPR, settleTimer = 0;
  renderer.setPixelRatio(dpr);
  function setDpr(v) { if (v === dpr) return; dpr = v; renderer.setPixelRatio(v); renderer.setSize(w, h, false); }
  function moving() { setDpr(1); clearTimeout(settleTimer); settleTimer = setTimeout(() => { setDpr(REST_DPR); dirty = true; }, 220); }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const canvas = renderer.domElement;
  canvas.className = 'universe';
  canvas.setAttribute('aria-hidden', 'true');
  const labelLayer = document.createElement('div');
  labelLayer.className = 'labels';
  host.append(canvas, labelLayer);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.005, 5000);
  camera.position.set(2.6, 0.8, 4.6);
  // OrbitControls fixes "up" when it is created, so it is rebuilt whenever the ground under you changes.
  let controls = null;
  function makeControls(target = V(0, 0, 0), keep = {}) {
    const old = controls;
    controls = new OrbitControls(camera, canvas);
    controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.07;
    controls.rotateSpeed = 0.5; controls.zoomSpeed = 0.6;
    controls.target.copy(target);
    Object.assign(controls, keep);
    controls.addEventListener('change', () => { dirty = true; });
    old?.dispose();
    controls.update();
    return controls;
  }
  makeControls();
  // reflections for the metal on the models; built the first time a model needs it (it is slow to make)
  let envTex = null;
  const env = () => (envTex ??= new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture);

  const tex = new THREE.TextureLoader();
  const bitmaps = typeof createImageBitmap === 'function' && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    ? new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY' }) : null;
  // Phones and small windows get 2K maps (a quarter of the pixels); big screens get 4K.
  const small = Math.min(screen.width, screen.height) < 800 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const pending = new Map();            // file name → promise, for the loading screen
  const load = (url, srgb = true) => {
    const src = small ? url.replace('assets/maps/', 'assets/maps/2k/') : url;
    let ok; const p = new Promise((r) => { ok = r; }); pending.set(url.split('/').pop().replace('.jpg', ''), p);
    const t = new THREE.Texture();
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    // decode off the main thread where the browser can (no stutter while a 4K map arrives)
    if (bitmaps) {
      bitmaps.load(src, (img) => { t.image = img; t.flipY = false; t.needsUpdate = true; dirty = true; ok(); }, undefined, () => ok());
    } else {
      tex.load(src, (img) => { t.image = img.image ?? img; t.needsUpdate = true; dirty = true; ok(); }, undefined, () => ok());
    }
    return t;
  };

  // ---- light: one Sun ------------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xfff3e2, 2.8);
  sun.position.copy(SUN_DIR).multiplyScalar(50);
  const sunTarget = new THREE.Object3D(); scene.add(sunTarget); sun.target = sunTarget;
  const hemi = new THREE.HemisphereLight(0x8d9bb8, 0x16110c, 0.08);
  const spot = new THREE.PointLight(0xfff0dc, 0, 1.2, 1.5);    // a gentle lamp on the machine you are visiting
  scene.add(sun, hemi, spot);

  // ---- sky -----------------------------------------------------------------------------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 40, 20), new THREE.MeshBasicMaterial({ map: load('assets/maps/stars.jpg'), side: THREE.BackSide, color: 0x7a7a7a, depthWrite: false }));
  sky.renderOrder = -1;
  scene.add(sky);
  const sunGlow = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,250,235,1)'); grd.addColorStop(0.08, 'rgba(255,236,200,.9)'); grd.addColorStop(0.3, 'rgba(255,190,120,.18)'); grd.addColorStop(1, 'rgba(255,160,90,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.copy(SUN_DIR).multiplyScalar(1800); sp.scale.setScalar(260); scene.add(sp); return sp;
  })();

  // ---- worlds --------------------------------------------------------------------------
  const world = {};
  function makeBody(id, map, extra = {}) {
    const { pos, r } = BODIES[id];
    const group = new THREE.Group(); group.position.copy(pos); scene.add(group);
    const spin = new THREE.Group(); group.add(spin);           // rotated so today's subsolar point faces the Sun
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 64), new THREE.MeshStandardMaterial({ map: load(map), roughness: 1, metalness: 0, ...extra }));
    spin.add(mesh);
    world[id] = { group, spin, mesh, r, sites: new Map() };
    return world[id];
  }
  const earth = makeBody('earth', 'assets/maps/earth.jpg', { roughness: 0.85 });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 64, 40), new THREE.MeshStandardMaterial({ alphaMap: load('assets/maps/earth-clouds.jpg', false), transparent: true, depthWrite: false, color: 0xffffff, roughness: 1 }));
  earth.spin.add(clouds);
  // thin blue rim of atmosphere
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { sun: { value: SUN_DIR } },
    vertexShader: 'varying vec3 n; varying vec3 w; void main(){ n = normalize(normalMatrix*normal); w = normalize((modelMatrix*vec4(position,1.)).xyz - cameraPosition); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 n; varying vec3 w; void main(){ float f = pow(0.72 - dot(n, vec3(0.,0.,1.)), 3.); gl_FragColor = vec4(0.35,0.6,1.0,1.) * clamp(f,0.,1.) * 1.4; }',
  }));
  earth.group.add(atmo);
  makeBody('moon', 'assets/maps/moon.jpg');
  makeBody('mars', 'assets/maps/mars.jpg');

  function faceSun(id, sub) {
    const w = world[id], s = lonLat(sub.lat, sub.lonEast);
    const ang = (v) => Math.atan2(-v.z, v.x);
    const qy = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), ang(SUN_DIR) - ang(s));
    const s1 = s.clone().applyQuaternion(qy);
    const qt = new THREE.Quaternion().setFromUnitVectors(s1, SUN_DIR);
    w.spin.quaternion.copy(qt.multiply(qy));
  }
  function updateSun(now = new Date()) {
    try { faceSun('earth', earthSubsolar(now)); } catch { /* keep last */ }
    try { faceSun('moon', moonSubsolar(now)); } catch { /* keep last */ }
    try { faceSun('mars', marsState(now).subsolar); } catch { /* keep last */ }
    dirty = true;
  }

  // ---- machines --------------------------------------------------------------------------
  const draco = new DRACOLoader().setDecoderPath('vendor/three/addons/libs/draco/gltf/');
  const gltf = new GLTFLoader().setDRACOLoader(draco);
  const machines = new Map();            // id → { holder, kind, ready }

  function normalise(root, spec, size) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [o.material].flat()) {
        if (spec?.recolor?.[m.name] != null) { m.color = new THREE.Color(spec.recolor[m.name]); m.metalness = 0.6; m.roughness = 0.35; }
        m.envMap = env(); m.envMapIntensity = 0.55;
      }
    });
    root.updateMatrixWorld(true);
    if (spec?.keepBelow) {
      const all = new THREE.Box3().setFromObject(root), cut = all.min.y + (all.max.y - all.min.y) * spec.keepBelow;
      root.traverse((o) => { if (o.isMesh) { const b = new THREE.Box3().setFromObject(o); if ((b.min.y + b.max.y) / 2 > cut) o.visible = false; } });
    }
    const box = new THREE.Box3();
    root.traverse((o) => { if (o.isMesh && o.visible) box.expandByObject(o); });
    const sz = box.getSize(V(0, 0, 0)), k = size / Math.max(sz.x, sz.y, sz.z), c = box.getCenter(V(0, 0, 0));
    root.scale.setScalar(k);
    root.position.set(-c.x * k, -box.min.y * k, -c.z * k);
    return sz.y * k;
  }

  /** Where a machine with no public 3D model rests: a ring on the ground and a soft column of light. */
  function beacon(size) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(size * 0.16, size * 0.19, 48), new THREE.MeshBasicMaterial({ color: 0xff6a33, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = size * 0.01;
    const c = document.createElement('canvas'); c.width = 4; c.height = 128;
    const gg = c.getContext('2d'), grd = gg.createLinearGradient(0, 128, 0, 0);
    grd.addColorStop(0, 'rgba(255,120,70,.55)'); grd.addColorStop(1, 'rgba(255,140,90,0)');
    gg.fillStyle = grd; gg.fillRect(0, 0, 4, 128);
    const beamMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.012, size * 0.012, size * 1.6, 8, 1, true), beamMat);
    beam.position.y = size * 0.8;
    const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.03, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffb08a }));
    core.position.y = size * 0.03;
    g.add(ring, beam, core);
    g.userData.pulse = ring;
    return g;
  }

  /** Puts machine `a` on its world (or in space) — a NASA model if we have one, else its photo. */
  function addMachine(a, photo) {
    if (machines.has(a.id)) return machines.get(a.id);
    const onWorld = a.body === 'moon' || a.body === 'mars';
    const holder = new THREE.Group();
    const w = onWorld ? world[a.body] : null;
    const size = onWorld ? w.r * 0.11 : 0.9;
    if (onWorld) {
      const n = lonLat(a.location.lat, a.location.lon_east);
      holder.position.copy(n).multiplyScalar(w.r * 0.999);
      holder.quaternion.setFromUnitVectors(V(0, 1, 0), n);
      w.spin.add(holder);
    } else {
      holder.position.copy(DEEP[a.id]);
      scene.add(holder);
    }
    const rec = { id: a.id, holder, size, onWorld, height: size, body: a.body };
    const spec = MODELS[a.id];
    if (spec) {
      // loaded on first request (the stop before it asks), not all at start-up
      rec.load = () => (rec.ready ??= new Promise((done) => gltf.load(spec.file, (g) => {
        rec.height = normalise(g.scene, spec, size);
        if (!onWorld) { g.scene.position.y -= rec.height / 2; }
        const pop = new THREE.Group(); pop.add(g.scene); holder.add(pop);
        if (!reduced()) gsap.fromTo(pop.scale, { x: 0.001, y: 0.001, z: 0.001 }, { x: 1, y: 1, z: 1, duration: 1.2, ease: 'expo.out', onUpdate: () => { dirty = true; } });
        dirty = true; done();
      }, undefined, () => done())));
    } else {
      holder.add(beacon(size));
      rec.height = size * 0.6;
      rec.ready = Promise.resolve();
      rec.load = () => rec.ready;
    }
    machines.set(a.id, rec);
    return rec;
  }

  // ---- labels (HTML, projected) -----------------------------------------------------------
  let labels = [];
  function setLabels(list) {
    labelLayer.replaceChildren();
    labels = list.map((L) => {
      const el = document.createElement(L.id && onPick ? 'button' : 'span');
      el.className = `label ${L.kind || ''}`;
      if (el.tagName === 'BUTTON') { el.type = 'button'; el.addEventListener('click', () => onPick(L.id)); }
      el.innerHTML = '<i></i><span></span>';
      el.lastChild.textContent = L.text;
      labelLayer.append(el);
      return { ...L, el };
    });
    dirty = true;
  }
  const tmp = V(0, 0, 0);
  function placeLabels() {
    const w = canvas.clientWidth, h = canvas.clientHeight, placed = [];
    for (const L of labels) {
      const p = L.get();
      tmp.copy(p).project(camera);
      let hidden = tmp.z > 1 || Math.abs(tmp.x) > 1.05 || Math.abs(tmp.y) > 1.05;
      if (!hidden && L.body) {            // hide pins on the far side of a world
        const c = world[L.body].group.position, nrm = p.clone().sub(c).normalize(), toCam = camera.position.clone().sub(p).normalize();
        hidden = nrm.dot(toCam) < 0.05;
      }
      const x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * h;
      // nudge labels that would sit on top of each other
      let flip = x > w * 0.7;
      if (placed.some((q) => Math.abs(q.y - y) < 22 && Math.abs(q.x - x) < 170 && q.flip === flip)) flip = !flip;
      placed.push({ x, y, flip });
      L.el.style.transform = `translate(${x}px, ${y}px)`;
      L.el.classList.toggle('is-hidden', hidden);
      L.el.classList.toggle('flip', flip);
    }
  }

  // ---- camera shots ------------------------------------------------------------------------
  let flight = null;

  function worldPos(obj, local = V(0, 0, 0)) { obj.updateMatrixWorld(true); return obj.localToWorld(local.clone()); }

  /** Where the camera should be for each kind of stop. */
  function shotFor(spec) {
    if (spec.kind === 'body') {
      const b = BODIES[spec.body], w = world[spec.body];
      // look at the sunlit side, a little off-axis so the terminator shows
      const view = SUN_DIR.clone().applyAxisAngle(V(0, 1, 0), spec.body === 'earth' ? -0.9 : -0.75).normalize();
      const dist = b.r * (spec.dist ?? 3.4);
      return { pos: b.pos.clone().add(view.multiplyScalar(dist)).add(V(0, b.r * 0.5, 0)), target: b.pos.clone(), up: V(0, 1, 0) };
    }
    if (spec.kind === 'machine') {
      const m = machines.get(spec.id);
      if (!m) return null;
      const base = worldPos(m.holder);
      if (!m.onWorld) {
        const side = SUN_DIR.clone().add(V(-0.6, 0.35, 0.4)).normalize();      // the lit side, a little off-axis
        return { pos: base.clone().add(side.multiplyScalar(m.size * 3.2)), target: base.clone(), up: V(0, 1, 0) };
      }
      const w = world[m.body], c = w.group.position;
      const n = base.clone().sub(c).normalize();
      // stand on the ground a little away from the machine, eye slightly above it, with the horizon and space behind
      // "back": along the ground toward the Sun (so lit machines are lit from behind the camera);
      // "t": along the ground at right angles to it, for a three-quarter view.
      let back = SUN_DIR.clone().sub(n.clone().multiplyScalar(SUN_DIR.dot(n)));
      if (back.lengthSq() < 1e-4) back = V(0, 1, 0).cross(n);
      back.normalize();
      const t = n.clone().cross(back).normalize();
      const model = !!MODELS[m.id], k = model ? 1 : 1.7;
      const look = base.clone().add(n.clone().multiplyScalar(m.size * (model ? 0.3 : 0.5)));
      const pos = base.clone().add(back.clone().multiplyScalar(m.size * 1.7 * k)).add(t.clone().multiplyScalar(m.size * 0.9 * k)).add(n.clone().multiplyScalar(m.size * 0.55 * k));
      return { pos, target: look, up: n };
    }
    if (spec.kind === 'echo') {
      const e = BODIES.earth.pos, mo = BODIES.moon.pos;
      const mid = mo.clone().lerp(e, 0.5), span = mo.distanceTo(e);
      const off = V(0, 1, 0).cross(mo.clone().sub(e)).normalize();
      if (off.dot(SUN_DIR) < 0) off.negate();                                   // stand on the day side
      const k = w && w < 760 ? 1.05 : 1.55;          // phones: closer, so Earth and the Moon are big enough to see
      return { pos: mid.clone().add(off.multiplyScalar(span * k)).add(V(0, span * 0.3 * k / 1.55, 0)), target: mid, up: V(0, 1, 0) };
    }
    if (spec.kind === 'earthrise') {
      const e = BODIES.earth.pos, mo = BODIES.moon.pos, r = BODIES.moon.r;
      const toE = e.clone().sub(mo).normalize();
      // just above the Moon's limb, looking home: the grey horizon below, Earth hanging above it
      const pos = mo.clone().add(V(0, r * 1.18, 0)).add(toE.clone().multiplyScalar(-r * 0.35));
      return { pos, target: e.clone().add(V(0, -0.8, 0)), up: V(0, 1, 0) };
    }
    if (spec.kind === 'overview') {
      return { pos: V(150, 110, 120), target: V(-10, 0, -200), up: V(0, 1, 0) };
    }
    if (spec.kind === 'home') {
      return { pos: V(-1.9, 0.5, 2.6), target: V(1.2, 0.35, -2.5), up: V(0, 1, 0) };
    }
    return null;
  }

  /** Flies the camera to a stop. Long trips (between worlds) take longer and call onProgress(0…1). */
  function fly(spec, { onProgress, instant = false } = {}) {
    const s = shotFor(spec);
    if (!s) return Promise.resolve();
    flight?.kill();
    controls.enabled = false;
    controls.autoRotate = false;
    const fromPos = camera.position.clone(), fromTarget = controls.target.clone(), fromUp = camera.up.clone(), toUp = (s.up || V(0, 1, 0)).clone().normalize();
    frameSide = spec.frame || 'left'; applyFrame();
    const dist = fromPos.distanceTo(s.pos);
    const long = dist > 20;
    const dur = instant || reduced() ? 0 : long ? 2.6 : Math.min(1.6, 0.9 + dist * 0.2);
    // arc: lift the middle of the path away from the straight line so worlds swing past
    const mid = fromPos.clone().lerp(s.pos, 0.5);
    const lift = Math.min(dist * 0.25, 40);
    mid.add(V(0, lift * 0.6, 0)).add(fromPos.clone().sub(s.pos).cross(V(0, 1, 0)).normalize().multiplyScalar(lift * 0.4));
    const curve = new THREE.QuadraticBezierCurve3(fromPos, mid, s.pos);
    const k = { u: 0 };
    return new Promise((done) => {
      const finish = () => {
        camera.position.copy(s.pos); camera.up.copy(toUp); camera.lookAt(s.target);
        const keep = { minDistance: controls.minDistance, maxDistance: controls.maxDistance, autoRotate: false };
        makeControls(s.target, keep);
        dirty = true; onProgress?.(1); done();
      };
      if (!dur) { finish(); return; }
      flight = gsap.to(k, { u: 1, duration: dur, ease: long ? 'power3.inOut' : 'power2.inOut',
        onUpdate() {
          camera.position.copy(curve.getPoint(k.u));
          controls.target.lerpVectors(fromTarget, s.target, Math.min(1, k.u * (long ? 1.4 : 1)));
          camera.up.copy(fromUp).lerp(toUp, k.u).normalize();
          camera.lookAt(controls.target);
          onProgress?.(k.u); dirty = true; moving();
        },
        onComplete: finish, onInterrupt: finish });
    });
  }

  function focusMachine(id) {
    focused = id;
    const m = machines.get(id);
    if (!m) { spot.intensity = 0; return; }
    const p = worldPos(m.holder);
    const c = m.onWorld ? world[m.body].group.position : p.clone().sub(V(1, 0, 0));
    const n = p.clone().sub(c).normalize();
    spot.position.copy(p).add(n.multiplyScalar(m.size * 1.4)).add(SUN_DIR.clone().multiplyScalar(m.size * 0.4));
    spot.distance = m.size * 5;
    spot.intensity = m.onWorld ? 0.9 * (m.size * 1.4) ** 2 : 0;     // scaled to scene units: a soft lamp, not a floodlight
    controls.minDistance = m.size * 1.2; controls.maxDistance = m.size * 8;
    dirty = true;
  }
  function freeRange(bodyOrNull) {
    spot.intensity = 0;
    if (bodyOrNull && BODIES[bodyOrNull]) { const r = BODIES[bodyOrNull].r; controls.minDistance = r * 1.4; controls.maxDistance = r * 9; }
    else { controls.minDistance = 0.5; controls.maxDistance = 900; }
  }

  // ---- loop ------------------------------------------------------------------------------
  let dirty = true, w = 0, h = 0, dust = { v: 0 }, frameSide = 'left';
  /** Shifts the picture so the subject sits beside the card instead of under it. */
  function applyFrame() {
    if (!w || !h) return;
    const narrow = w < 760;
    const flip = document.documentElement.dir === 'rtl' ? -1 : 1;     // in Arabic the card sits on the other side
    const x = narrow ? 0 : (frameSide === 'left' ? -0.16 * w : frameSide === 'right' ? 0.17 * w : 0) * flip;
    const y = narrow ? (frameSide === 'none' ? 0 : 0.2 * h) : 0;
    camera.setViewOffset(w, h, x, y, w, h);
    camera.updateProjectionMatrix(); dirty = true;
  }
  function resize() {
    const r = host.getBoundingClientRect();
    if (r.width === w && r.height === h) return;
    w = r.width; h = r.height;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    // portrait screens: widen the view so the horizontal field stays about the same as on a laptop
    camera.fov = camera.aspect < 1 ? Math.min(70, 40 / Math.sqrt(camera.aspect) * 0.95) : 40;
    applyFrame();
  }
  new ResizeObserver(resize).observe(host);

  // Only redraw when something on screen changes. Ambient motion (clouds, the beacon ring, the slow
  // drift at a machine) runs at most 30 times a second, and only when it can actually be seen.
  let focused = null, lastAmbient = 0;
  canvas.addEventListener('pointerdown', () => { canvas.dataset.drag = '1'; });
  addEventListener('pointerup', () => { delete canvas.dataset.drag; });
  let paused = false;
  function frame(t) {
    requestAnimationFrame(frame);
    if (document.hidden || paused) return;
    const userMoving = controls.enabled ? controls.update() : false;
    if (userMoving && canvas.dataset.drag) moving();
    let ambient = false;
    if (!reduced() && t - lastAmbient > 33) {
      if (camera.position.distanceTo(BODIES.earth.pos) < 14) { clouds.rotation.y += 0.00025; ambient = true; }
      const m = focused && machines.get(focused);
      if (m && !MODELS[m.id]) {
        for (const c of m.holder.children) if (c.userData.pulse) { const k = (t / 1800) % 1; c.userData.pulse.scale.setScalar(1 + k * 1.6); c.userData.pulse.material.opacity = 0.9 * (1 - k); ambient = true; }
      }
      if (controls.autoRotate) ambient = true;
      if (ambient) lastAmbient = t;
    }
    if (!dirty && !userMoving && !ambient) return;
    dirty = false;
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
    placeLabels();
  }
  updateSun();
  requestAnimationFrame(frame);

  return {
    /** Debug: cosine of the Sun's angle from straight up at a machine, as drawn (compare with the time engine). */
    sunAt(id) { const m = machines.get(id); if (!m?.onWorld) return null; const p = worldPos(m.holder), n = p.sub(world[m.body].group.position).normalize(); return n.dot(SUN_DIR); },
    hasModel: (id) => !!MODELS[id],
    /** Prepare slow one-time work (model reflections) while the reader is still on the first screens. */
    warm() { (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(() => env(), { timeout: 4000 }); },
    /** Stop drawing while something covers the whole view (the loading screen). */
    pause(on) { paused = on; dirty = true; },
    addMachine,
    fly,
    focusMachine,
    freeRange,
    setLabels,
    updateSun,
    ready: (id) => machines.get(id)?.load?.() ?? Promise.resolve(),
    /** Resolves when the textures that are visible first have arrived (for the loading screen). */
    loaded: (names) => Promise.all(names.map((n) => pending.get(n)).filter(Boolean)),
    worldPos,
    bodyPos: (id) => BODIES[id].pos.clone(),
    deepPos: (id) => DEEP[id].clone(),
    machinePos: (id) => { const m = machines.get(id); return m ? worldPos(m.holder).add(V(0, 0, 0)) : null; },
    machineTop: (id) => { const m = machines.get(id); if (!m) return null; const p = worldPos(m.holder); const c = m.onWorld ? world[m.body].group.position : null; const n = c ? p.clone().sub(c).normalize() : V(0, 1, 0); return p.add(n.multiplyScalar(m.height * 1.05)); },
    /** The laser: a light pulse from Earth to the mirror and back, in real time. */
    laser(seconds, onDone) {
      const m = machines.get('retro'); if (!m) return;
      const a = BODIES.earth.pos.clone().add(worldPos(m.holder).sub(BODIES.earth.pos).normalize().multiplyScalar(1.01)), b = worldPos(m.holder);
      const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff6a33, transparent: true, opacity: 0.35 }));
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffb08a }));
      scene.add(line, dot);
      const t0 = performance.now(), ms = seconds * 1000;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / ms), u = k < 0.5 ? k * 2 : 2 - k * 2;
        dot.position.lerpVectors(a, b, u); dirty = true;
        if (k < 1) requestAnimationFrame(step);
        else { gsap.to(line.material, { opacity: 0, duration: 1, onComplete: () => { scene.remove(line, dot); geo.dispose(); } }); onDone?.(); }
      };
      requestAnimationFrame(step);
    },
    /** Mars dust storm: the Sun fades and the air turns brown (0…1). */
    setDust(v) {
      gsap.to(dust, { v, duration: reduced() ? 0 : 2.4, ease: 'power2.inOut', onUpdate() {
        sun.intensity = 2.8 * (1 - 0.82 * dust.v);
        scene.fog = dust.v > 0.01 ? (scene.fog || new THREE.FogExp2(0x8a5a3a, 0)) : null;
        if (scene.fog) scene.fog.density = dust.v * 3.2;
        dirty = true;
      } });
    },
    /** A slow camera drift (on arrival at a machine, or the finale). Stops as soon as you drag. */
    orbit(on, speed = 0.25) {
      controls.autoRotate = on && !reduced(); controls.autoRotateSpeed = speed;
      if (on) canvas.addEventListener('pointerdown', () => { controls.autoRotate = false; }, { once: true });
    },
  };
}
