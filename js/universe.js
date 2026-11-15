import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { marsState } from "./time/marsTime.js";
import { moonSubsolar } from "./time/moonTime.js";
const RAD = Math.PI / 180;
const gsap = globalThis.gsap;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MODELS = {
  eagle: { file: "assets/models/eagle.glb", keepBelow: 0.5 },
  opportunity: { file: "assets/models/opportunity.glb", recolor: { SolarArrays: 1778226 } },
  ingenuity: { file: "assets/models/ingenuity.glb" },
  kepler: { file: "assets/models/kepler.glb" },
  pioneer10: { file: "assets/models/pioneer10.glb" }
};
const BODIES = {
  earth: { pos: V(0, 0, 0), r: 1 },
  moon: { pos: V(6.5, 0.9, -8), r: 0.42 },
  mars: { pos: V(-60, 5, -140), r: 0.8 }
};
const DEEP = { kepler: V(45, -3, -230), pioneer10: V(-25, 14, -420) };
const SUN_DIR = V(1, 0.08, 0.55).normalize();
function lonLat(lat, lon) {
  const phi = (lon + 180) * RAD, th = lat * RAD;
  return V(-Math.cos(phi) * Math.cos(th), Math.sin(th), Math.sin(phi) * Math.cos(th));
}
function earthSubsolar(d) {
  const day = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
  const decl = -23.44 * Math.cos(360 / 365 * (day + 10) * RAD);
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60;
  return { lat: decl, lonEast: -15 * (hours - 12) };
}
function createUniverse(host, { onPick } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  const REST_DPR = Math.min(devicePixelRatio || 1, 1.5);
  let dpr = REST_DPR, settleTimer = 0;
  renderer.setPixelRatio(dpr);
  function setDpr(v) {
    if (v === dpr) return;
    dpr = v;
    renderer.setPixelRatio(v);
    renderer.setSize(w, h, false);
  }
  function moving() {
    setDpr(1);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      setDpr(REST_DPR);
      dirty = true;
    }, 220);
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const canvas = renderer.domElement;
  canvas.className = "universe";
  canvas.setAttribute("aria-hidden", "true");
  const labelLayer = document.createElement("div");
  labelLayer.className = "labels";
  host.append(canvas, labelLayer);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 5e-3, 5e3);
  camera.position.set(2.6, 0.8, 4.6);
  let controls = null;
  function makeControls(target = V(0, 0, 0), keep = {}) {
    const old = controls;
    controls = new OrbitControls(camera, canvas);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.6;
    controls.target.copy(target);
    Object.assign(controls, keep);
    controls.addEventListener("change", () => {
      dirty = true;
    });
    old?.dispose();
    controls.update();
    return controls;
  }
  makeControls();
  let envTex = null;
  const env = () => envTex ??= new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const tex = new THREE.TextureLoader();
  const bitmaps = typeof createImageBitmap === "function" && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent) ? new THREE.ImageBitmapLoader().setOptions({ imageOrientation: "flipY" }) : null;
  const small = Math.min(screen.width, screen.height) < 800 || navigator.deviceMemory && navigator.deviceMemory <= 4;
  const pending = new Map();
  const load = (url, srgb = true) => {
    const src = small ? url.replace("assets/maps/", "assets/maps/2k/") : url;
    let ok;
    const p = new Promise((r) => {
      ok = r;
    });
    pending.set(url.split("/").pop().replace(".jpg", ""), p);
    const t = new THREE.Texture();
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (bitmaps) {
      bitmaps.load(src, (img) => {
        t.image = img;
        t.flipY = false;
        t.needsUpdate = true;
        dirty = true;
        ok();
      }, void 0, () => ok());
    } else {
      tex.load(src, (img) => {
        t.image = img.image ?? img;
        t.needsUpdate = true;
        dirty = true;
        ok();
      }, void 0, () => ok());
    }
    return t;
  };
  const sun = new THREE.DirectionalLight(16774114, 2.8);
  sun.position.copy(SUN_DIR).multiplyScalar(50);
  const sunTarget = new THREE.Object3D();
  scene.add(sunTarget);
  sun.target = sunTarget;
  const hemi = new THREE.HemisphereLight(9280440, 1446156, 0.08);
  const spot = new THREE.PointLight(16773340, 0, 1.2, 1.5);
  scene.add(sun, hemi, spot);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 40, 20), new THREE.MeshBasicMaterial({ map: load("assets/maps/stars.jpg"), side: THREE.BackSide, color: 8026746, depthWrite: false }));
  sky.renderOrder = -1;
  scene.add(sky);
  const sunGlow = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d"), grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, "rgba(255,250,235,1)");
    grd.addColorStop(0.08, "rgba(255,236,200,.9)");
    grd.addColorStop(0.3, "rgba(255,190,120,.18)");
    grd.addColorStop(1, "rgba(255,160,90,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.copy(SUN_DIR).multiplyScalar(1800);
    sp.scale.setScalar(260);
    scene.add(sp);
    return sp;
  })();
  const world = {};
  function makeBody(id, map, extra = {}) {
    const { pos, r } = BODIES[id];
    const group = new THREE.Group();
    group.position.copy(pos);
    scene.add(group);
    const spin = new THREE.Group();
    group.add(spin);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 64), new THREE.MeshStandardMaterial({ map: load(map), roughness: 1, metalness: 0, ...extra }));
    spin.add(mesh);
    world[id] = { group, spin, mesh, r, sites: new Map() };
    return world[id];
  }
  const earth = makeBody("earth", "assets/maps/earth.jpg", { roughness: 0.85 });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 64, 40), new THREE.MeshStandardMaterial({ alphaMap: load("assets/maps/earth-clouds.jpg", false), transparent: true, depthWrite: false, color: 16777215, roughness: 1 }));
  earth.spin.add(clouds);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { sun: { value: SUN_DIR } },
    vertexShader: "varying vec3 n; varying vec3 w; void main(){ n = normalize(normalMatrix*normal); w = normalize((modelMatrix*vec4(position,1.)).xyz - cameraPosition); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: "varying vec3 n; varying vec3 w; void main(){ float f = pow(0.72 - dot(n, vec3(0.,0.,1.)), 3.); gl_FragColor = vec4(0.35,0.6,1.0,1.) * clamp(f,0.,1.) * 1.4; }"
  }));
  earth.group.add(atmo);
  makeBody("moon", "assets/maps/moon.jpg");
  makeBody("mars", "assets/maps/mars.jpg");
  function faceSun(id, sub) {
    const w2 = world[id], s = lonLat(sub.lat, sub.lonEast);
    const ang = (v) => Math.atan2(-v.z, v.x);
    const qy = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), ang(SUN_DIR) - ang(s));
    const s1 = s.clone().applyQuaternion(qy);
    const qt = new THREE.Quaternion().setFromUnitVectors(s1, SUN_DIR);
    w2.spin.quaternion.copy(qt.multiply(qy));
  }
  function updateSun(now = new Date()) {
    try {
      faceSun("earth", earthSubsolar(now));
    } catch {
    }
    try {
      faceSun("moon", moonSubsolar(now));
    } catch {
    }
    try {
      faceSun("mars", marsState(now).subsolar);
    } catch {
    }
    dirty = true;
  }
  const draco = new DRACOLoader().setDecoderPath("vendor/three/addons/libs/draco/gltf/");
  const gltf = new GLTFLoader().setDRACOLoader(draco);
  const machines = new Map();
  function normalise(root, spec, size) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [o.material].flat()) {
        if (spec?.recolor?.[m.name] != null) {
          m.color = new THREE.Color(spec.recolor[m.name]);
          m.metalness = 0.6;
          m.roughness = 0.35;
        }
        m.envMap = env();
        m.envMapIntensity = 0.55;
      }
    });
    root.updateMatrixWorld(true);
    if (spec?.keepBelow) {
      const all = new THREE.Box3().setFromObject(root), cut = all.min.y + (all.max.y - all.min.y) * spec.keepBelow;
      root.traverse((o) => {
        if (o.isMesh) {
          const b = new THREE.Box3().setFromObject(o);
          if ((b.min.y + b.max.y) / 2 > cut) o.visible = false;
        }
      });
    }
    const box = new THREE.Box3();
    root.traverse((o) => {
      if (o.isMesh && o.visible) box.expandByObject(o);
    });
    const sz = box.getSize(V(0, 0, 0)), k = size / Math.max(sz.x, sz.y, sz.z), c = box.getCenter(V(0, 0, 0));
    root.scale.setScalar(k);
    root.position.set(-c.x * k, -box.min.y * k, -c.z * k);
    return sz.y * k;
  }
  function beacon(size) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(size * 0.16, size * 0.19, 48), new THREE.MeshBasicMaterial({ color: 16738867, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = size * 0.01;
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 128;
    const gg = c.getContext("2d"), grd = gg.createLinearGradient(0, 128, 0, 0);
    grd.addColorStop(0, "rgba(255,120,70,.55)");
    grd.addColorStop(1, "rgba(255,140,90,0)");
    gg.fillStyle = grd;
    gg.fillRect(0, 0, 4, 128);
    const beamMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.012, size * 0.012, size * 1.6, 8, 1, true), beamMat);
    beam.position.y = size * 0.8;
    const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.03, 16, 8), new THREE.MeshBasicMaterial({ color: 16756874 }));
    core.position.y = size * 0.03;
    g.add(ring, beam, core);
    g.userData.pulse = ring;
    return g;
  }
  function addMachine(a, photo) {
    if (machines.has(a.id)) return machines.get(a.id);
    const onWorld = a.body === "moon" || a.body === "mars";
    const holder = new THREE.Group();
    const w2 = onWorld ? world[a.body] : null;
    const size = onWorld ? w2.r * 0.11 : 0.9;
    if (onWorld) {
      const n = lonLat(a.location.lat, a.location.lon_east);
      holder.position.copy(n).multiplyScalar(w2.r * 0.999);
      holder.quaternion.setFromUnitVectors(V(0, 1, 0), n);
      w2.spin.add(holder);
    } else {
      holder.position.copy(DEEP[a.id]);
      scene.add(holder);
    }
    const rec = { id: a.id, holder, size, onWorld, height: size, body: a.body };
    const spec = MODELS[a.id];
    if (spec) {
      rec.load = () => rec.ready ??= new Promise((done) => gltf.load(spec.file, (g) => {
        rec.height = normalise(g.scene, spec, size);
        if (!onWorld) {
          g.scene.position.y -= rec.height / 2;
        }
        const pop = new THREE.Group();
        pop.add(g.scene);
        holder.add(pop);
        if (!reduced()) gsap.fromTo(pop.scale, { x: 1e-3, y: 1e-3, z: 1e-3 }, { x: 1, y: 1, z: 1, duration: 1.2, ease: "expo.out", onUpdate: () => {
          dirty = true;
        } });
        dirty = true;
        done();
      }, void 0, () => done()));
    } else {
      holder.add(beacon(size));
      rec.height = size * 0.6;
      rec.ready = Promise.resolve();
      rec.load = () => rec.ready;
    }
    machines.set(a.id, rec);
    return rec;
  }
  let labels = [];
  function setLabels(list) {
    labelLayer.replaceChildren();
    labels = list.map((L) => {
      const el = document.createElement(L.id && onPick ? "button" : "span");
      el.className = `label ${L.kind || ""}`;
      if (el.tagName === "BUTTON") {
        el.type = "button";
        el.addEventListener("click", () => onPick(L.id));
      }
      el.innerHTML = "<i></i><span></span>";
      el.lastChild.textContent = L.text;
      labelLayer.append(el);
      return { ...L, el };
    });
    dirty = true;
  }
  const tmp = V(0, 0, 0);
  function placeLabels() {
    const w2 = canvas.clientWidth, h2 = canvas.clientHeight, placed = [];
    for (const L of labels) {
      const p = L.get();
      tmp.copy(p).project(camera);
      let hidden = tmp.z > 1 || Math.abs(tmp.x) > 1.05 || Math.abs(tmp.y) > 1.05;
      if (!hidden && L.body) {
        const c = world[L.body].group.position, nrm = p.clone().sub(c).normalize(), toCam = camera.position.clone().sub(p).normalize();
        hidden = nrm.dot(toCam) < 0.05;
      }
      const x = (tmp.x * 0.5 + 0.5) * w2, y = (-tmp.y * 0.5 + 0.5) * h2;
      let flip = x > w2 * 0.7;
      if (placed.some((q) => Math.abs(q.y - y) < 22 && Math.abs(q.x - x) < 170 && q.flip === flip)) flip = !flip;
      placed.push({ x, y, flip });
      L.el.style.transform = `translate(${x}px, ${y}px)`;
      L.el.classList.toggle("is-hidden", hidden);
      L.el.classList.toggle("flip", flip);
    }
  }
  let flight = null;
  function worldPos(obj, local = V(0, 0, 0)) {
    obj.updateMatrixWorld(true);
    return obj.localToWorld(local.clone());
  }
  function shotFor(spec) {
    if (spec.kind === "body") {
      const b = BODIES[spec.body], w2 = world[spec.body];
      const view = SUN_DIR.clone().applyAxisAngle(V(0, 1, 0), spec.body === "earth" ? -0.9 : -0.75).normalize();
      const dist = b.r * (spec.dist ?? 3.4);
      return { pos: b.pos.clone().add(view.multiplyScalar(dist)).add(V(0, b.r * 0.5, 0)), target: b.pos.clone(), up: V(0, 1, 0) };
    }
    if (spec.kind === "machine") {
      const m = machines.get(spec.id);
      if (!m) return null;
      const base = worldPos(m.holder);
      if (!m.onWorld) {
        const side = SUN_DIR.clone().add(V(-0.6, 0.35, 0.4)).normalize();
        return { pos: base.clone().add(side.multiplyScalar(m.size * 3.2)), target: base.clone(), up: V(0, 1, 0) };
      }
      const w2 = world[m.body], c = w2.group.position;
      const n = base.clone().sub(c).normalize();
      let back = SUN_DIR.clone().sub(n.clone().multiplyScalar(SUN_DIR.dot(n)));
      if (back.lengthSq() < 1e-4) back = V(0, 1, 0).cross(n);
      back.normalize();
      const t = n.clone().cross(back).normalize();
      const model = !!MODELS[m.id], k = model ? 1 : 1.7;
      const look = base.clone().add(n.clone().multiplyScalar(m.size * (model ? 0.3 : 0.5)));
      const pos = base.clone().add(back.clone().multiplyScalar(m.size * 1.7 * k)).add(t.clone().multiplyScalar(m.size * 0.9 * k)).add(n.clone().multiplyScalar(m.size * 0.55 * k));
      return { pos, target: look, up: n };
    }
    if (spec.kind === "echo") {
      const e = BODIES.earth.pos, mo = BODIES.moon.pos;
      const mid = mo.clone().lerp(e, 0.5), span = mo.distanceTo(e);
      const off = V(0, 1, 0).cross(mo.clone().sub(e)).normalize();
      if (off.dot(SUN_DIR) < 0) off.negate();
      const k = w && w < 760 ? 1.05 : 1.55;
      return { pos: mid.clone().add(off.multiplyScalar(span * k)).add(V(0, span * 0.3 * k / 1.55, 0)), target: mid, up: V(0, 1, 0) };
    }
    if (spec.kind === "earthrise") {
      const e = BODIES.earth.pos, mo = BODIES.moon.pos, r = BODIES.moon.r;
      const toE = e.clone().sub(mo).normalize();
      const pos = mo.clone().add(V(0, r * 1.18, 0)).add(toE.clone().multiplyScalar(-r * 0.35));
      return { pos, target: e.clone().add(V(0, -0.8, 0)), up: V(0, 1, 0) };
    }
    if (spec.kind === "overview") {
      return { pos: V(150, 110, 120), target: V(-10, 0, -200), up: V(0, 1, 0) };
    }
    if (spec.kind === "home") {
      return { pos: V(-1.9, 0.5, 2.6), target: V(1.2, 0.35, -2.5), up: V(0, 1, 0) };
    }
    return null;
  }
  function fly(spec, { onProgress, instant = false } = {}) {
    const s = shotFor(spec);
    if (!s) return Promise.resolve();
    flight?.kill();
    controls.enabled = false;
    controls.autoRotate = false;
    const fromPos = camera.position.clone(), fromTarget = controls.target.clone(), fromUp = camera.up.clone(), toUp = (s.up || V(0, 1, 0)).clone().normalize();
    frameSide = spec.frame || "left";
    applyFrame();
    const dist = fromPos.distanceTo(s.pos);
    const long = dist > 20;
    const dur = instant || reduced() ? 0 : long ? 2.6 : Math.min(1.6, 0.9 + dist * 0.2);
    const mid = fromPos.clone().lerp(s.pos, 0.5);
    const lift = Math.min(dist * 0.25, 40);
    mid.add(V(0, lift * 0.6, 0)).add(fromPos.clone().sub(s.pos).cross(V(0, 1, 0)).normalize().multiplyScalar(lift * 0.4));
    const curve = new THREE.QuadraticBezierCurve3(fromPos, mid, s.pos);
    const k = { u: 0 };
    return new Promise((done) => {
      const finish = () => {
        camera.position.copy(s.pos);
        camera.up.copy(toUp);
        camera.lookAt(s.target);
        const keep = { minDistance: controls.minDistance, maxDistance: controls.maxDistance, autoRotate: false };
        makeControls(s.target, keep);
        dirty = true;
        onProgress?.(1);
        done();
      };
      if (!dur) {
        finish();
        return;
      }
      flight = gsap.to(k, {
        u: 1,
        duration: dur,
        ease: long ? "power3.inOut" : "power2.inOut",
        onUpdate() {
          camera.position.copy(curve.getPoint(k.u));
          controls.target.lerpVectors(fromTarget, s.target, Math.min(1, k.u * (long ? 1.4 : 1)));
          camera.up.copy(fromUp).lerp(toUp, k.u).normalize();
          camera.lookAt(controls.target);
          onProgress?.(k.u);
          dirty = true;
          moving();
        },
        onComplete: finish,
        onInterrupt: finish
      });
    });
  }
  function focusMachine(id) {
    focused = id;
    const m = machines.get(id);
    if (!m) {
      spot.intensity = 0;
      return;
    }
    const p = worldPos(m.holder);
    const c = m.onWorld ? world[m.body].group.position : p.clone().sub(V(1, 0, 0));
    const n = p.clone().sub(c).normalize();
    spot.position.copy(p).add(n.multiplyScalar(m.size * 1.4)).add(SUN_DIR.clone().multiplyScalar(m.size * 0.4));
    spot.distance = m.size * 5;
    spot.intensity = m.onWorld ? 0.9 * (m.size * 1.4) ** 2 : 0;
    controls.minDistance = m.size * 1.2;
    controls.maxDistance = m.size * 8;
    dirty = true;
  }
  function freeRange(bodyOrNull) {
    spot.intensity = 0;
    if (bodyOrNull && BODIES[bodyOrNull]) {
      const r = BODIES[bodyOrNull].r;
      controls.minDistance = r * 1.4;
      controls.maxDistance = r * 9;
    } else {
      controls.minDistance = 0.5;
      controls.maxDistance = 900;
    }
  }
  let dirty = true, w = 0, h = 0, dust = { v: 0 }, frameSide = "left";
  function applyFrame() {
    if (!w || !h) return;
    const narrow = w < 760;
    const flip = document.documentElement.dir === "rtl" ? -1 : 1;
    const x = narrow ? 0 : (frameSide === "left" ? -0.16 * w : frameSide === "right" ? 0.17 * w : 0) * flip;
    const y = narrow ? frameSide === "none" ? 0 : 0.2 * h : 0;
    camera.setViewOffset(w, h, x, y, w, h);
    camera.updateProjectionMatrix();
    dirty = true;
  }
  function resize() {
    const r = host.getBoundingClientRect();
    if (r.width === w && r.height === h) return;
    w = r.width;
    h = r.height;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.fov = camera.aspect < 1 ? Math.min(70, 40 / Math.sqrt(camera.aspect) * 0.95) : 40;
    applyFrame();
  }
  new ResizeObserver(resize).observe(host);
  let focused = null, lastAmbient = 0;
  canvas.addEventListener("pointerdown", () => {
    canvas.dataset.drag = "1";
  });
  addEventListener("pointerup", () => {
    delete canvas.dataset.drag;
  });
  let paused = false;
  function frame(t) {
    requestAnimationFrame(frame);
    if (document.hidden || paused) return;
    const userMoving = controls.enabled ? controls.update() : false;
    if (userMoving && canvas.dataset.drag) moving();
    let ambient = false;
    if (!reduced() && t - lastAmbient > 33) {
      if (camera.position.distanceTo(BODIES.earth.pos) < 14) {
        clouds.rotation.y += 25e-5;
        ambient = true;
      }
      const m = focused && machines.get(focused);
      if (m && !MODELS[m.id]) {
        for (const c of m.holder.children) if (c.userData.pulse) {
          const k = t / 1800 % 1;
          c.userData.pulse.scale.setScalar(1 + k * 1.6);
          c.userData.pulse.material.opacity = 0.9 * (1 - k);
          ambient = true;
        }
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
    sunAt(id) {
      const m = machines.get(id);
      if (!m?.onWorld) return null;
      const p = worldPos(m.holder), n = p.sub(world[m.body].group.position).normalize();
      return n.dot(SUN_DIR);
    },
    hasModel: (id) => !!MODELS[id],
    warm() {
      (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(() => env(), { timeout: 4e3 });
    },
    pause(on) {
      paused = on;
      dirty = true;
    },
    addMachine,
    fly,
    focusMachine,
    freeRange,
    setLabels,
    updateSun,
    ready: (id) => machines.get(id)?.load?.() ?? Promise.resolve(),
    loaded: (names) => Promise.all(names.map((n) => pending.get(n)).filter(Boolean)),
    worldPos,
    bodyPos: (id) => BODIES[id].pos.clone(),
    deepPos: (id) => DEEP[id].clone(),
    machinePos: (id) => {
      const m = machines.get(id);
      return m ? worldPos(m.holder).add(V(0, 0, 0)) : null;
    },
    machineTop: (id) => {
      const m = machines.get(id);
      if (!m) return null;
      const p = worldPos(m.holder);
      const c = m.onWorld ? world[m.body].group.position : null;
      const n = c ? p.clone().sub(c).normalize() : V(0, 1, 0);
      return p.add(n.multiplyScalar(m.height * 1.05));
    },
    laser(seconds, onDone) {
      const m = machines.get("retro");
      if (!m) return;
      const a = BODIES.earth.pos.clone().add(worldPos(m.holder).sub(BODIES.earth.pos).normalize().multiplyScalar(1.01)), b = worldPos(m.holder);
      const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 16738867, transparent: true, opacity: 0.35 }));
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 8), new THREE.MeshBasicMaterial({ color: 16756874 }));
      scene.add(line, dot);
      const t0 = performance.now(), ms = seconds * 1e3;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / ms), u = k < 0.5 ? k * 2 : 2 - k * 2;
        dot.position.lerpVectors(a, b, u);
        dirty = true;
        if (k < 1) requestAnimationFrame(step);
        else {
          gsap.to(line.material, { opacity: 0, duration: 1, onComplete: () => {
            scene.remove(line, dot);
            geo.dispose();
          } });
          onDone?.();
        }
      };
      requestAnimationFrame(step);
    },
    setDust(v) {
      gsap.to(dust, { v, duration: reduced() ? 0 : 2.4, ease: "power2.inOut", onUpdate() {
        sun.intensity = 2.8 * (1 - 0.82 * dust.v);
        scene.fog = dust.v > 0.01 ? scene.fog || new THREE.FogExp2(9067066, 0) : null;
        if (scene.fog) scene.fog.density = dust.v * 3.2;
        dirty = true;
      } });
    },
    orbit(on, speed = 0.25) {
      controls.autoRotate = on && !reduced();
      controls.autoRotateSpeed = speed;
      if (on) canvas.addEventListener("pointerdown", () => {
        controls.autoRotate = false;
      }, { once: true });
    }
  };
}
export {
  MODELS,
  createUniverse,
  lonLat
};
