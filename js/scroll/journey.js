// Start screen: the Earth, the Moon and Mars, turning, with probes that keep leaving the Earth for the
// Moon and for Mars. It sits on top of the big 3D scene and fades away as the page scrolls toward the Moon.
// Sizes and distances are not to scale: the picture is about the journey.
import * as THREE from 'three';
import { h } from '../v1/dom.js';
import { t } from '../i18n.js';

const RAD = Math.PI / 180;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const EARTH_R = 2, MOON_R = 0.55, MARS_R = 1.25;
const MOON_ORBIT = 6.2, MOON_PERIOD = 80;                      // seconds for one trip around the Earth
const MARS_POS = new THREE.Vector3(24, 2.5, -17);
const TARGET = new THREE.Vector3(10, 1.5, -6);                 // between the Earth and Mars
const OFFSET = new THREE.Vector3(-12, 7, 26);                  // camera, seen from the target
const UP = new THREE.Vector3(0, 1, 0);

function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner); grad.addColorStop(0.3, outer); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const glowSprite = (tex, size, opacity = 1) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, toneMapped: false }));
  s.scale.setScalar(size);
  return s;
};

/** Placed just after `under` (the big 3D scene). onWorld(id) is called when someone clicks the Moon or Mars. */
export function createJourney(under, { onWorld } = {}) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch { return { set() {}, destroy() {} }; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const canvas = renderer.domElement;
  canvas.className = 'journey-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const labels = h('div', { class: 'journey-labels' });
  const el = h('div', { class: 'journey' }, canvas, labels);
  under.after(el);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 1000);

  // stars all around
  {
    const n = 1800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(300 + Math.random() * 200);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.75 })));
  }

  // no Sun on screen: the light comes from one side, so each world shows a lit face and a night side
  scene.add(new THREE.AmbientLight(0x5868a0, 0.28));
  const light = new THREE.DirectionalLight(0xfff3e2, 3);
  light.position.set(-30, 12, 22);
  scene.add(light);

  const loader = new THREE.TextureLoader();
  const tex = (src) => { const x = loader.load(src); x.colorSpace = THREE.SRGBColorSpace; return x; };

  // the Earth, with its clouds
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 64, 48), new THREE.MeshStandardMaterial({ map: tex('assets/maps/earth.jpg'), roughness: 0.85 }));
  earth.rotation.z = 23.4 * RAD;
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.012, 64, 48),
    new THREE.MeshStandardMaterial({ alphaMap: loader.load('assets/maps/earth-clouds.jpg'), transparent: true, depthWrite: false, color: 0xffffff, roughness: 1 }));
  earth.add(clouds);
  const earthAtmo = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.025, 64, 48),
    new THREE.MeshBasicMaterial({ color: 0x6fb4ff, transparent: true, opacity: 0.12, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  const earthGlow = glowSprite(glowTexture('rgba(120,180,255,.55)', 'rgba(60,120,255,.18)'), EARTH_R * 5.2, 0.8);
  scene.add(earth, earthAtmo, earthGlow);

  // the Moon, going round the Earth
  const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 48, 32), new THREE.MeshStandardMaterial({ map: tex('assets/maps/moon.jpg'), roughness: 1 }));
  const moonGlow = glowSprite(glowTexture('rgba(235,232,225,.35)', 'rgba(200,200,210,.08)'), MOON_R * 4.5, 0.7);
  scene.add(moon, moonGlow);
  const tilt = new THREE.Vector3(1, 0, 0);
  const ringPts = [];
  for (let i = 0; i <= 120; i++) ringPts.push(new THREE.Vector3(Math.cos(i * 3 * RAD) * MOON_ORBIT, 0, -Math.sin(i * 3 * RAD) * MOON_ORBIT));
  const moonRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: 0xd8d4cc, transparent: true, opacity: 0.22 }));
  moonRing.rotation.x = 5 * RAD;
  scene.add(moonRing);
  let moonAngle = 35 * RAD;
  const moonAt = (a, out) => out.set(Math.cos(a) * MOON_ORBIT, 0, -Math.sin(a) * MOON_ORBIT).applyAxisAngle(tilt, 5 * RAD);

  // Mars, far away
  const mars = new THREE.Mesh(new THREE.SphereGeometry(MARS_R, 64, 48), new THREE.MeshStandardMaterial({ map: tex('assets/maps/mars.jpg'), roughness: 0.95 }));
  mars.position.copy(MARS_POS);
  mars.rotation.z = 25 * RAD;
  const marsGlow = glowSprite(glowTexture('rgba(255,150,100,.5)', 'rgba(255,100,60,.14)'), MARS_R * 5, 0.75);
  marsGlow.position.copy(MARS_POS);
  scene.add(mars, marsGlow);

  // the routes: an arc from the Earth to each world, drawn dashed
  function route(to, lift) {
    const mid = to.clone().multiplyScalar(0.5).addScaledVector(UP, lift);
    const from = mid.clone().normalize().multiplyScalar(EARTH_R * 1.05);     // leave from the side facing the way
    return new THREE.QuadraticBezierCurve3(from, mid, to.clone());
  }
  const SEG = 96;
  function routeLine(color, opacity) {
    const geo = new THREE.BufferGeometry().setFromPoints(new Array(SEG + 1).fill(0).map(() => new THREE.Vector3()));
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.35, gapSize: 0.25, depthWrite: false }));
    scene.add(line);
    return line;
  }
  function setLine(line, curve) {
    const p = line.geometry.attributes.position;
    for (let i = 0; i <= SEG; i++) { const q = curve.getPoint(i / SEG); p.setXYZ(i, q.x, q.y, q.z); }
    p.needsUpdate = true;
    line.computeLineDistances();
    line.geometry.computeBoundingSphere();
  }
  const marsRoute = route(MARS_POS.clone().addScaledVector(MARS_POS.clone().normalize(), -MARS_R), 7);
  const marsLine = routeLine(0xff9a70, 0.5);
  setLine(marsLine, marsRoute);
  let moonRoute = route(moonAt(moonAngle, new THREE.Vector3()), 2.2);
  const moonLine = routeLine(0xcfd8ff, 0.45);

  // probes: a bright head and a fading tail that run along a route, again and again
  const probeTex = glowTexture('rgba(255,255,255,1)', 'rgba(140,200,255,.5)');
  function probe(color, size, period, offset) {
    const parts = [];
    for (let i = 0; i < 9; i++) {
      const s = glowSprite(probeTex, size * (1 - i * 0.09), 1 - i * 0.11);
      s.material.color = new THREE.Color(color);
      scene.add(s);
      parts.push(s);
    }
    return { parts, period, offset };
  }
  const marsProbes = [probe(0xffc4a0, 0.9, 9, 0), probe(0xffc4a0, 0.7, 9, 0.5)];
  const moonProbes = [probe(0xd6e4ff, 0.7, 4.5, 0.2)];
  function runProbes(list, curve, time) {
    for (const p of list) {
      const k = ((time / p.period + p.offset) % 1 + 1) % 1;
      const fade = Math.min(1, k * 8, (1 - k) * 8);               // appear at launch, vanish on arrival
      p.parts.forEach((s, i) => {
        s.position.copy(curve.getPoint(Math.max(0, k - i * 0.012)));
        s.material.opacity = (1 - i * 0.11) * fade;
      });
    }
  }

  // names: the Moon and Mars can be clicked
  // each name has a short line under it: how far, and how long the trip takes
  const label = (id, link) => {
    const l = h(link ? 'button' : 'span', { class: `journey-label${link ? ' is-link' : ''}`, type: link ? 'button' : null, 'aria-hidden': link ? null : 'true' },
      h('span', { class: 'journey-name' }, t(`body.${id}`)), h('span', { class: 'journey-sub' }, t(`journey.${id}`)));
    if (link) l.addEventListener('click', () => onWorld?.(id));
    labels.append(l);
    return l;
  };
  const earthLabel = label('earth', false), moonLabel = label('moon', true), marsLabel = label('mars', true);
  const v = new THREE.Vector3();
  function placeLabels(w, hgt) {
    const pxPerUnit = (hgt / 2) / Math.tan((camera.fov / 2) * RAD);
    const sx = (o) => { o.getWorldPosition(v); v.project(camera); return v.x; };
    const show = (l, o, r, left) => {
      o.getWorldPosition(v);
      const off = Math.min(160, (r / v.distanceTo(camera.position)) * pxPerUnit) + 12;
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * hgt;
      l.hidden = !(v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1);
      const goLeft = (left || x > w - (w >= 760 ? 330 : 190)) && x > 140;   // keep clear of the right edge and the stop list
      l.style.transform = `translate(${goLeft ? `calc(${x - off}px - 100%)` : `${x + off}px`}, ${y}px) translateY(-50%)`;
    };
    const moonLeft = sx(moon) < sx(earth);
    show(earthLabel, earth, EARTH_R, !moonLeft);
    show(moonLabel, moon, MOON_R, moonLeft);
    show(marsLabel, mars, MARS_R, false);
  }

  // size, and on wide screens keep the worlds in the right part (the title sits on the left)
  let w = 0, hgt = 0, rtl = false;
  const resize = () => {
    w = el.clientWidth; hgt = el.clientHeight;
    if (!w || !hgt) return;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    rtl = document.documentElement.dir === 'rtl';
    const shift = w >= 760 ? (rtl ? w * 0.08 : -w * 0.2) : 0;               // Arabic: the title is on the right, so the worlds go left
    camera.setViewOffset(w, hgt, shift, w >= 760 ? 0 : hgt * 0.24, w, hgt);   // phones: above the card
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(el);

  // camera: starts close to the Earth, pulls back, then sways slowly
  const dist = () => OFFSET.length() * (camera.aspect < 1 ? Math.pow(Math.min(2.2, 1 / camera.aspect), 0.8) * 1.2 : 1);
  const target = () => (camera.aspect < 1 ? TARGET.clone().multiplyScalar(0.7) : TARGET.clone());
  const startPos = new THREE.Vector3(-3.5, 1.5, 6.5);
  const ease = (k) => 1 - Math.pow(1 - k, 3);
  const t0 = performance.now();
  const INTRO = reduced() ? 0 : 4200;

  let raf = 0, last = t0, clock = 0, on = true;
  const moonPos = new THREE.Vector3();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, now - last) / 1000;
    last = now;
    if (!on || document.hidden || !w) return;
    if (rtl !== (document.documentElement.dir === 'rtl')) resize();
    const still = reduced(), k = still ? 0 : dt;
    clock += k;
    earth.rotation.y += 0.08 * k;
    clouds.rotation.y += 0.02 * k;
    mars.rotation.y += 0.11 * k;
    moonAngle += (Math.PI * 2 / MOON_PERIOD) * k;
    moon.position.copy(moonAt(moonAngle, moonPos));
    moon.rotation.y = -moonAngle + Math.PI / 2;                      // the same face always turned to the Earth
    moonGlow.position.copy(moon.position);
    moonRoute = route(moon.position.clone().addScaledVector(moon.position.clone().normalize(), -MOON_R), 2.2);
    setLine(moonLine, moonRoute);
    for (const p of [...marsProbes, ...moonProbes]) p.parts.forEach((s) => { s.visible = !still; });
    if (!still) {
      marsLine.material.opacity = 0.38 + Math.sin(now / 900) * 0.12;
      moonLine.material.opacity = 0.34 + Math.sin(now / 700 + 1) * 0.1;
      earthGlow.material.opacity = 0.72 + Math.sin(now / 1600) * 0.1;
      runProbes(marsProbes, marsRoute, clock);
      runProbes(moonProbes, moonRoute, clock);
    }
    const tg = target();
    const sway = still ? 0 : Math.sin(clock * 0.12) * 0.22;           // a slow look around
    const home = tg.clone().add(OFFSET.clone().applyAxisAngle(UP, sway).setLength(dist()));
    const a = INTRO ? ease(Math.min(1, (now - t0) / INTRO)) : 1;
    camera.position.lerpVectors(startPos, home, a);
    camera.lookAt(earth.position.clone().lerp(tg, a));
    renderer.render(scene, camera);
    placeLabels(w, hgt);
  }
  raf = requestAnimationFrame(frame);

  return {
    /** 0 = hidden, 1 = fully shown. Stops drawing while hidden. */
    set(o) {
      el.style.opacity = o;
      el.style.visibility = o > 0.001 ? 'visible' : 'hidden';
      on = o > 0.001;
      labels.style.pointerEvents = o > 0.6 ? '' : 'none';
    },
    destroy() {
      cancelAnimationFrame(raf); observer.disconnect();
      scene.traverse((o) => { o.geometry?.dispose(); const m = o.material; if (m) { m.map?.dispose(); m.dispose(); } });
      renderer.dispose(); el.remove();
    },
  };
}
