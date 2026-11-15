import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { marsState } from "../time/marsTime.js";
import { moonSubsolar } from "../time/moonTime.js";
import { BUILT } from "./models.js";
import { reliefMap } from "./relief.js";
const RAD = Math.PI / 180;
const gsap = globalThis.gsap;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MODELS = {
  eagle: { file: "assets/models/eagle.glb", keepBelow: 0.5 },
  opportunity: { file: "assets/models/opportunity.glb", recolor: { SolarArrays: 1778226 } },
  ingenuity: { file: "assets/models/ingenuity.glb" },
  kepler: { file: "assets/models/kepler.glb" },
  pioneer10: { file: "assets/models/pioneer10.glb" },
  insight: { file: "assets/models/insight.glb" }
};
const BODIES = {
  earth: { pos: V(0, 0, 0), r: 1 },
  moon: { pos: V(6.5, 0.9, -8), r: 0.42 },
  mars: { pos: V(-60, 5, -140), r: 0.8 }
};
const DEEP = { kepler: V(45, -3, -230), pioneer10: V(-25, 14, -420) };
const SUN_DIR = V(1, 0.08, 0.55).normalize();
const STORM_SKY = new THREE.Color(3810324);
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
  const REST_DPR = Math.min(devicePixelRatio || 1, 1.25);
  let dpr = REST_DPR, settleTimer = 0;
  renderer.setPixelRatio(dpr);
  function setDpr(v) {
    if (v === dpr) return;
    dpr = v;
    renderer.setPixelRatio(v);
    renderer.setSize(w, h, false);
  }
  function moving() {
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "universe";
  canvas.setAttribute("aria-hidden", "true");
  const labelLayer = document.createElement("div");
  labelLayer.className = "labels";
  host.append(canvas, labelLayer);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(9067066, 0);
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
  canvas.style.pointerEvents = "none";
  let envTex = null;
  const env = () => envTex ??= new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const tex = new THREE.TextureLoader();
  const bitmaps = typeof createImageBitmap === "function" && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent) ? new THREE.ImageBitmapLoader().setOptions({ imageOrientation: "flipY" }) : null;
  const small = Math.min(screen.width, screen.height) < 800 || navigator.deviceMemory && navigator.deviceMemory <= 4;
  const pending = new Map();
  const RELIEF = new Set(["moon", "mars"]);
  const read = (src, cb, fail) => {
    const kind = src.split("/").pop().replace(".jpg", "");
    if (RELIEF.has(kind)) {
      reliefMap(src, kind).then(({ image, flipY }) => cb(image, flipY), fail);
      return;
    }
    if (bitmaps) bitmaps.load(src, (img) => cb(img, false), void 0, fail);
    else tex.load(src, (img) => cb(img.image ?? img, true), void 0, fail);
  };
  const sharpJobs = new Map();
  let lowQuality = false;
  const loadSharp = (name) => {
    const job = sharpJobs.get(name);
    if (!job || lowQuality) return;
    sharpJobs.delete(name);
    read(job.src, (img, flip) => {
      job.t.image = img;
      job.t.flipY = flip;
      job.t.needsUpdate = true;
      dirty = true;
    });
  };
  const load = (url, srgb = true) => {
    const lo = url.replace("assets/maps/", "assets/maps/2k/");
    let ok;
    const p = new Promise((r) => {
      ok = r;
    });
    pending.set(url.split("/").pop().replace(".jpg", ""), p);
    const t = new THREE.Texture();
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    read(lo, (img, flip) => {
      t.image = img;
      t.flipY = flip;
      t.needsUpdate = true;
      dirty = true;
      ok();
    }, () => ok());
    const name = url.split("/").pop().replace(".jpg", "");
    if (!small && (name === "moon" || name === "mars")) sharpJobs.set(name, { src: url, t });
    return t;
  };
  const sun = new THREE.DirectionalLight(16774114, 2.8);
  sun.position.copy(SUN_DIR).multiplyScalar(50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.autoUpdate = false;
  const sunTarget = new THREE.Object3D();
  scene.add(sunTarget);
  sun.target = sunTarget;
  const hemi = new THREE.HemisphereLight(9280440, 1446156, 0.08);
  const spot = new THREE.PointLight(16773340, 0, 1.2, 1.5);
  scene.add(sun, hemi, spot);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 40, 20), new THREE.MeshBasicMaterial({ map: load("assets/maps/stars.jpg"), side: THREE.BackSide, color: 8026746, depthWrite: false }));
  sky.renderOrder = -1;
  scene.add(sky);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2300, 32, 16), new THREE.MeshBasicMaterial({ color: 13214330, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  dome.renderOrder = -0.5;
  dome.visible = false;
  scene.add(dome);
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
    mesh.castShadow = mesh.receiveShadow = true;
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
          if ((b.min.y + b.max.y) / 2 > cut) {
            o.visible = false;
            (root.userData.top ??= []).push(o);
          }
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
    const rec = { id: a.id, holder, size, onWorld, height: size, body: a.body, solid: !!(MODELS[a.id] || BUILT[a.id]) };
    const spec = MODELS[a.id];
    if (BUILT[a.id]) {
      const root = BUILT[a.id]();
      rec.height = normalise(root, null, size * (root.userData.fit ?? 1));
      holder.add(root);
      rec.ready = Promise.resolve();
      rec.load = () => rec.ready;
    } else if (spec) {
      rec.load = () => rec.ready ??= new Promise((done) => gltf.load(spec.file, (g) => {
        rec.height = normalise(g.scene, spec, size);
        g.scene.traverse((o) => {
          if (o.isMesh) o.castShadow = o.receiveShadow = true;
        });
        if (!onWorld) {
          g.scene.position.y -= rec.height / 2;
        }
        const pop = new THREE.Group();
        pop.add(g.scene);
        holder.add(pop);
        if (g.scene.userData.top) rec.stage = makeAscent(rec, g.scene.userData.top);
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
  function makeAscent(rec, meshes) {
    const { holder } = rec;
    holder.updateMatrixWorld(true);
    const group = new THREE.Group();
    holder.add(group);
    let floor = Infinity;
    const inv = new THREE.Matrix4().copy(holder.matrixWorld).invert(), c = V(0, 0, 0);
    for (const m of meshes) {
      m.updateMatrixWorld(true);
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox;
      for (let i = 0; i < 8; i++) {
        c.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
        floor = Math.min(floor, c.y);
      }
      group.attach(m);
      m.material = [m.material].flat().map((x) => {
        const y = x.clone();
        y.transparent = true;
        return y;
      });
      if (m.material.length === 1) m.material = m.material[0];
      m.visible = true;
    }
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g2 = cv.getContext("2d"), grd = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,240,215,1)");
    grd.addColorStop(0.3, "rgba(255,170,100,.6)");
    grd.addColorStop(1, "rgba(255,120,60,0)");
    g2.fillStyle = grd;
    g2.fillRect(0, 0, 64, 64);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false, blending: THREE.AdditiveBlending, transparent: true, opacity: 0 }));
    flame.position.y = floor;
    flame.scale.setScalar(rec.size * 0.35);
    group.add(flame);
    return { group, flame, meshes };
  }
  let streakObj = null, pulseObj = null;
  function streakField() {
    if (streakObj) return streakObj;
    scene.add(camera);
    const N = 140, geo = new THREE.BufferGeometry(), base = [];
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = 1.6 + Math.random() ** 0.7 * 9;
      base.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: Math.random() * 60, s: 0.4 + Math.random() * 0.8 });
    }
    streakObj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 14673663, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    streakObj.userData.base = base;
    streakObj.frustumCulled = false;
    camera.add(streakObj);
    return streakObj;
  }
  function pulseSprite() {
    if (pulseObj) return pulseObj;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d"), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.2, "rgba(255,180,140,.9)");
    grd.addColorStop(1, "rgba(255,106,51,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    pulseObj = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, transparent: true }));
    pulseObj.renderOrder = 5;
    scene.add(pulseObj);
    return pulseObj;
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
      if (L.photo) {
        const img = document.createElement("img");
        img.src = L.photo;
        img.alt = "";
        img.decoding = "async";
        img.draggable = false;
        el.firstChild.append(img);
      }
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
      let flip = L.photo ? false : x > w2 * 0.7;
      if (!L.photo && placed.some((q) => Math.abs(q.y - y) < 22 && Math.abs(q.x - x) < 170 && q.flip === flip)) flip = !flip;
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
      const model = m.solid, k = (model ? 1 : 1.7) * (w2 && w2 < 760 ? 1.35 : 1);
      const look = base.clone().add(n.clone().multiplyScalar(m.size * (model ? 0.3 : 0.5)));
      const pos = base.clone().add(back.clone().multiplyScalar(m.size * 1.7 * k)).add(t.clone().multiplyScalar(m.size * 0.9 * k)).add(n.clone().multiplyScalar(m.size * 0.55 * k));
      return { pos, target: look, up: n };
    }
    if (spec.kind === "echo") {
      const e = BODIES.earth.pos, mo = BODIES.moon.pos;
      const mid = mo.clone().lerp(e, 0.5), span = mo.distanceTo(e);
      const off = V(0, 1, 0).cross(mo.clone().sub(e)).normalize();
      if (off.dot(SUN_DIR) < 0) off.negate();
      if (w && w < 760) {
        return { pos: mid.clone().add(off.multiplyScalar(span * 2.4)).add(V(0, span * 0.35, 0)), target: mid, up: V(0, 1, 0) };
      }
      const k = 1.55;
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
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  ray.camera = camera;
  function focusMachine(id) {
    focused = id;
    const m = machines.get(id);
    for (const r of machines.values()) {
      r.holder.visible = !m || !m.onWorld || !r.onWorld || r === m || r.body !== m.body || r.holder.position.angleTo(m.holder.position) > 0.26;
    }
    if (!m) {
      spot.intensity = 0;
      sun.shadow.autoUpdate = false;
      sunTarget.position.set(0, 0, 0);
      sun.position.copy(SUN_DIR).multiplyScalar(50);
      return;
    }
    const p = worldPos(m.holder);
    const D = m.onWorld ? world[m.body].r * 2.4 : m.size * 12, e = m.size * 2.4;
    sunTarget.position.copy(p);
    sun.position.copy(p).addScaledVector(SUN_DIR, D);
    Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1e-3, far: D + m.size * 6 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -4e-4;
    sun.shadow.normalBias = m.size * 0.012;
    sun.shadow.autoUpdate = true;
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
    const y = narrow ? frameSide === "none" ? 0 : 0.27 * h : 0;
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
  let paused = false, covered = false;
  function frame(t) {
    requestAnimationFrame(frame);
    if (document.hidden || paused || covered) return;
    const userMoving = false;
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
    dome.position.copy(camera.position);
    renderer.render(scene, camera);
    placeLabels();
  }
  updateSun();
  requestAnimationFrame(frame);
  return {
    pick(x, y) {
      const r = canvas.getBoundingClientRect();
      ndc.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const list = [...machines.values()].filter((m) => m.holder.visible && m.solid);
      const hit = ray.intersectObjects(list.map((m) => m.holder), true)[0];
      if (!hit) return null;
      for (let o = hit.object; o; o = o.parent) {
        const m = list.find((x2) => x2.holder === o);
        if (m) return m.id;
      }
      return null;
    },
    sunAt(id) {
      const m = machines.get(id);
      if (!m?.onWorld) return null;
      const p = worldPos(m.holder), n = p.sub(world[m.body].group.position).normalize();
      return n.dot(SUN_DIR);
    },
    hasModel: (id) => !!MODELS[id],
    modelNote: (id) => id === "eagle" ? "scroll.model.eagle" : id === "insight" ? "scroll.model.insight" : MODELS[id] ? "scroll.model.nasa" : id === "surveyor3" ? "scroll.model.surveyor3" : BUILT[id] ? "scroll.model.built" : null,
    night(v, body) {
      hemi.color.setHex(body === "moon" ? 10467071 : 9076880);
      hemi.intensity = 0.08 + v * (body === "moon" ? 0.55 : 0.3);
      dirty = true;
    },
    warm() {
      (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(() => env(), { timeout: 4e3 });
    },
    pause(on) {
      paused = on;
      dirty = true;
    },
    cover(on) {
      if (covered === on) return;
      covered = on;
      dirty = true;
    },
    addMachine,
    fly,
    focusMachine,
    freeRange,
    setLabels,
    showMachines(on) {
      for (const m of machines.values()) if (m.holder) m.holder.visible = on;
      dirty = true;
    },
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
    flight(keys, { look = 0, bank = 0 } = {}) {
      const P = new THREE.CatmullRomCurve3(keys.map((k) => k.pos.clone()), false, "centripetal");
      const T = new THREE.CatmullRomCurve3(keys.map((k) => k.target.clone()), false, "centripetal");
      const Q = new THREE.CatmullRomCurve3(keys.map((k) => (k.up || V(0, 1, 0)).clone().normalize()), false, "catmullrom", 0.5);
      const a = keys[0], b = keys.at(-1), N = 2e3;
      const c = 0.6 * Math.max(1e-4, Math.min(a.pos.distanceTo(a.target), b.pos.distanceTo(b.target)));
      const cum = new Float64Array(N + 1), p = V(0, 0, 0), prev = P.getPoint(0);
      for (let i = 1; i <= N; i++) {
        P.getPoint(i / N, p);
        cum[i] = cum[i - 1] + p.distanceTo(prev) / (Math.min(p.distanceTo(a.pos), p.distanceTo(b.pos)) + c);
        prev.copy(p);
      }
      const total = cum[N] || 1;
      const tOf = (s) => {
        const x = s * total;
        let lo = 0, hi = N;
        while (hi - lo > 1) {
          const m = lo + hi >> 1;
          if (cum[m] < x) lo = m;
          else hi = m;
        }
        return (lo + (x - cum[lo]) / (cum[hi] - cum[lo] || 1)) / N;
      };
      const pos = V(0, 0, 0), tgt = V(0, 0, 0), up = V(0, 1, 0), d1 = V(0, 0, 0), d2 = V(0, 0, 0), turn = V(0, 0, 0);
      const set = (u) => {
        const e = u * u * u * (u * (u * 6 - 15) + 10), t = tOf(e);
        P.getPoint(t, pos);
        T.getPoint(t, tgt);
        Q.getPoint(t, up).normalize();
        if (look) {
          P.getTangent(Math.min(0.999, t), d1);
          tgt.lerp(d2.copy(pos).addScaledVector(d1, pos.distanceTo(tgt)), look * Math.sin(Math.PI * e) ** 2);
        }
        camera.position.copy(pos);
        camera.up.copy(up);
        camera.lookAt(tgt);
        if (bank) {
          P.getTangent(Math.max(0, t - 0.01), d1);
          P.getTangent(Math.min(1, t + 0.01), d2);
          const k = turn.crossVectors(d1, d2).dot(up);
          camera.rotateZ(Math.max(-0.14, Math.min(0.14, k * 4)) * bank * Math.sin(Math.PI * e));
        }
        dirty = true;
      };
      set.raw = true;
      set.ahead = (u, by = 0.08) => {
        const e = u * u * u * (u * (u * 6 - 15) + 10);
        return P.getPoint(Math.min(1, tOf(e) + by));
      };
      return set;
    },
    prewarm() {
      const S = streakField(), Pl = pulseSprite(), was = [S.visible, Pl.visible, dome.visible];
      S.visible = Pl.visible = dome.visible = true;
      renderer.compile(scene, camera);
      [S.visible, Pl.visible, dome.visible] = was;
      scene.traverse((o) => {
        for (const m of [o.material].flat()) {
          if (!m) continue;
          for (const k of ["map", "alphaMap", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap"]) if (m[k]?.image) renderer.initTexture(m[k]);
        }
      });
      dirty = true;
    },
    quality(v) {
      setDpr(Math.min(REST_DPR, v));
      lowQuality = true;
      sharpJobs.clear();
      dirty = true;
    },
    sharpen(id) {
      loadSharp(id);
    },
    air(v, dark = 0) {
      dome.visible = v > 2e-3;
      dome.material.opacity = 0.92 * v;
      dome.material.color.setHex(13214330).lerp(STORM_SKY, dark);
      dirty = true;
    },
    path(fromSpec, toSpec) {
      const a = typeof fromSpec.pos === "object" && fromSpec.target ? fromSpec : shotFor(fromSpec);
      const b = typeof toSpec.pos === "object" && toSpec.target ? toSpec : shotFor(toSpec);
      if (!a || !b) return () => {
      };
      const upA = (a.up || V(0, 1, 0)).clone().normalize(), upB = (b.up || V(0, 1, 0)).clone().normalize();
      const dist = a.pos.distanceTo(b.pos), long = dist > 20, lift = Math.min(dist * 0.25, 40);
      const mid = a.pos.clone().lerp(b.pos, 0.5);
      if (dist > 1e-6) mid.add(V(0, lift * 0.6, 0)).add(a.pos.clone().sub(b.pos).cross(V(0, 1, 0)).normalize().multiplyScalar(lift * 0.4));
      const curve = new THREE.QuadraticBezierCurve3(a.pos.clone(), mid, b.pos.clone());
      const tgt = V(0, 0, 0);
      const set = (u) => {
        camera.position.copy(curve.getPoint(u));
        tgt.lerpVectors(a.target, b.target, Math.min(1, u * (long ? 1.4 : 1)));
        camera.up.copy(upA).lerp(upB, u).normalize();
        camera.lookAt(tgt);
        dirty = true;
        moving();
      };
      set.curve = curve;
      return set;
    },
    route(shots) {
      const curve = new THREE.CatmullRomCurve3(shots.map((x) => x.pos.clone()), false, "centripetal");
      const n = shots.length - 1, tgt = V(0, 0, 0), up = V(0, 1, 0);
      const set = (u) => {
        camera.position.copy(curve.getPoint(u));
        const f = Math.min(n - 1e-6, u * n), i = Math.floor(f), k = f - i, e = k * k * (3 - 2 * k);
        tgt.lerpVectors(shots[i].target, shots[i + 1].target, e);
        up.copy(shots[i].up || V(0, 1, 0)).lerp(shots[i + 1].up || V(0, 1, 0), e).normalize();
        camera.up.copy(up);
        camera.lookAt(tgt);
        dirty = true;
        moving();
      };
      set.curve = curve;
      return set;
    },
    pose(pos, target, up) {
      camera.position.copy(pos);
      camera.up.copy(up).normalize();
      camera.lookAt(target);
      dirty = true;
      moving();
    },
    size: (id) => machines.get(id)?.size ?? 0,
    streaks(offset, k) {
      const S = streakField();
      S.visible = k > 0.01;
      if (!S.visible) return;
      const pos = S.geometry.attributes.position, base = S.userData.base, len = 0.02 + k * 0.12;
      for (let i = 0; i < base.length; i++) {
        const b = base[i];
        let z = ((b.z + offset) % 60 + 60) % 60 - 62;
        pos.setXYZ(i * 2, b.x, b.y, z);
        pos.setXYZ(i * 2 + 1, b.x, b.y, z - len * b.s);
      }
      pos.needsUpdate = true;
      S.material.opacity = 0.3 * k;
      dirty = true;
    },
    pulse(at, k = 1) {
      const P = pulseSprite();
      P.visible = !!at && k > 0.01;
      if (P.visible) {
        P.position.copy(at);
        P.material.opacity = k;
        P.scale.setScalar(0.06 + 0.02 * Math.sin(performance.now() / 120));
      }
      dirty = true;
    },
    shot: (spec) => shotFor(spec),
    frame(side) {
      if (side === frameSide) return;
      frameSide = side;
      applyFrame();
    },
    dustNow(v) {
      sun.intensity = 2.8 * (1 - 0.82 * v);
      scene.fog.density = v * 3.2;
      dirty = true;
    },
    ascent(id, u) {
      const st = machines.get(id)?.stage, m = machines.get(id);
      if (!st) return false;
      const e = u * u;
      st.group.position.y = e * m.size * 9;
      st.flame.material.opacity = u > 5e-3 && u < 0.75 ? 0.95 * (1 - u / 0.75) : 0;
      st.flame.scale.setScalar(m.size * (0.3 + 0.1 * Math.sin(performance.now() / 40)));
      const fade = u < 0.8 ? 1 : Math.max(0, 1 - (u - 0.8) / 0.2);
      for (const mesh of st.meshes) for (const x of [mesh.material].flat()) x.opacity = fade;
      st.group.visible = fade > 0;
      dirty = true;
      return true;
    },
    setDust(v) {
      gsap.to(dust, { v, duration: reduced() ? 0 : 2.4, ease: "power2.inOut", onUpdate() {
        sun.intensity = 2.8 * (1 - 0.82 * dust.v);
        scene.fog.density = dust.v * 3.2;
        dirty = true;
      } });
    },
    turn(id, angle) {
      const w2 = world[id];
      if (!w2 || w2.group.rotation.y === angle) return;
      w2.group.rotation.y = angle;
      dirty = true;
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
