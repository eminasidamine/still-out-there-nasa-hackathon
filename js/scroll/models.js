import * as THREE from "three";
let M = null;
function canvasTex(size, draw, repeat = [1, 1], srgb = true) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rng(seed) {
  return () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
}
function mats() {
  if (M) return M;
  const R = rng(7);
  const crinkle = (g, s) => {
    g.fillStyle = "#888";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const x = R() * s, y = R() * s, r = 6 + R() * 26, v = 90 + R() * 120;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2 + R();
        g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.fill();
    }
  };
  const foil = canvasTex(256, crinkle, [2, 2]);
  const foilBump = canvasTex(256, crinkle, [2, 2], false);
  const cellDraw = (g, s) => {
    g.fillStyle = "#121a33";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(200,205,215,.6)";
    g.lineWidth = 1.5;
    for (let i = 0; i <= s; i += s / 4) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, s);
      g.stroke();
      g.beginPath();
      g.moveTo(0, i);
      g.lineTo(s, i);
      g.stroke();
    }
    g.fillStyle = "rgba(80,110,170,.25)";
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.fillRect(i * s / 4 + 3, j * s / 4 + 3, s / 8, 2);
  };
  const meshDraw = (g, s) => {
    g.fillStyle = "#1a1a1a";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#b8bcc0";
    g.lineWidth = 2;
    for (let i = -s; i < s * 2; i += 8) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + s, s);
      g.stroke();
      g.beginPath();
      g.moveTo(i + s, 0);
      g.lineTo(i, s);
      g.stroke();
    }
  };
  const dustDraw = (g, s) => {
    g.fillStyle = "#e3e0d8";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const v = 150 + R() * 70;
      g.fillStyle = `rgba(${v},${v - 6},${v - 14},.35)`;
      g.fillRect(R() * s, R() * s, 1 + R() * 2, 1 + R() * 2);
    }
  };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M = {
    alu: std({ color: 13224388, metalness: 0.85, roughness: 0.32 }),
    darkAlu: std({ color: 7303283, metalness: 0.8, roughness: 0.4 }),
    paint: std({ map: canvasTex(128, dustDraw, [2, 2]), metalness: 0.05, roughness: 0.65 }),
    dusty: std({ color: 10918536, metalness: 0.2, roughness: 0.85 }),
    black: std({ color: 1908e3, metalness: 0.3, roughness: 0.55 }),
    gold: std({ map: foil, bumpMap: foilBump, bumpScale: 0.6, color: 14265672, metalness: 1, roughness: 0.3 }),
    silverFoil: std({ map: foil, bumpMap: foilBump, bumpScale: 0.6, color: 13685976, metalness: 1, roughness: 0.28 }),
    tyre: std({ map: canvasTex(128, meshDraw, [24, 2]), metalness: 0.75, roughness: 0.45 }),
    dishMesh: std({ map: canvasTex(128, meshDraw, [6, 6]), color: 14727264, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    titanium: std({ color: 10132638, metalness: 0.9, roughness: 0.38 }),
    seat: std({ color: 6255497, metalness: 0.05, roughness: 0.9 }),
    fender: std({ color: 9410979, metalness: 0.15, roughness: 0.6, side: THREE.DoubleSide }),
    glass: std({ color: 724242, metalness: 0.4, roughness: 0.08 }),
    mirror: std({ color: 14213868, metalness: 1, roughness: 0.04 }),
    cells: (rx, ry) => std({ map: canvasTex(128, cellDraw, [rx, ry]), metalness: 0.5, roughness: 0.25 })
  };
  return M;
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const mesh = (geo, m) => {
  const x = new THREE.Mesh(geo, m);
  x.castShadow = true;
  x.receiveShadow = true;
  return x;
};
const box = (w, h, d, m) => mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r1, r2, h, m, seg = 18) => mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);
const ball = (r, m) => mesh(new THREE.SphereGeometry(r, 12, 8), m);
const at = (o, x, y, z, rx = 0, ry = 0, rz = 0) => {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
};
function rod(g, a, b, r, m, joints = false) {
  const A = V3(...a), B = V3(...b), t = cyl(r, r, A.distanceTo(B), m, 10);
  t.position.copy(A).lerp(B, 0.5);
  t.quaternion.setFromUnitVectors(V3(0, 1, 0), B.clone().sub(A).normalize());
  g.add(t);
  if (joints) {
    g.add(at(ball(r * 1.6, m), ...a));
    g.add(at(ball(r * 1.6, m), ...b));
  }
  return t;
}
function ring(geo, m, n, place) {
  const im = new THREE.InstancedMesh(geo, m, n), o = new THREE.Object3D();
  im.castShadow = im.receiveShadow = true;
  for (let i = 0; i < n; i++) {
    place(o, i, i / n * Math.PI * 2);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  }
  return im;
}
function surveyor() {
  const m = mats(), g = new THREE.Group();
  const A = [90, 210, 330].map((d) => d * Math.PI / 180);
  const P = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
  const lo = A.map((a) => P(a, 0.72, 0.62)), hi = A.map((a) => P(a, 0.42, 1.55));
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    rod(g, lo[i], lo[j], 0.03, m.alu, true);
    rod(g, hi[i], hi[j], 0.025, m.alu, true);
    rod(g, lo[i], hi[i], 0.028, m.alu);
    rod(g, lo[i], hi[j], 0.02, m.alu);
  }
  rod(g, [0, 1.55, 0], [0, 3.05, 0], 0.04, m.alu);
  for (const p of hi) rod(g, p, [0, 2, 0], 0.018, m.alu);
  A.forEach((a, i) => {
    const knee = P(a, 1.55, 0.45), foot = P(a, 2.05, 0.12);
    rod(g, lo[i], knee, 0.045, m.alu, true);
    rod(g, knee, foot, 0.06, m.dusty);
    rod(g, hi[i], knee, 0.022, m.alu);
    const pad = mesh(new THREE.SphereGeometry(0.3, 18, 8, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4), m.dusty);
    pad.position.set(foot[0], 0.3 * 0.81 + 0, foot[2]);
    pad.scale.y = 0.5;
    g.add(pad);
    g.add(at(cyl(0.3, 0.3, 0.03, m.dusty, 24), foot[0], 0.015, foot[2]));
    g.add(at(box(0.16, 0.12, 0.16, m.dusty), lo[i][0] * 0.9, 0.5, lo[i][2] * 0.9));
    const n = cyl(0.035, 0.09, 0.2, m.darkAlu, 14);
    n.position.set(lo[i][0] * 0.62, 0.48, lo[i][2] * 0.62);
    g.add(n);
    if (i < 2) {
      const tip = P(a + 0.35, 1.05, 2.25);
      rod(g, hi[i], tip, 0.012, m.alu);
      g.add(at(cyl(0.012, 0.012, 0.35, m.alu, 8), tip[0], tip[1] + 0.17, tip[2]));
    }
  });
  const comp = (x, z, ry) => {
    const c = new THREE.Group();
    c.add(box(0.56, 0.34, 0.36, m.paint));
    for (let k = -2; k <= 2; k++) c.add(at(box(0.5, 0.012, 0.03, m.black), 0, 0.176, k * 0.065));
    c.position.set(x, 1.05, z);
    c.rotation.y = ry;
    g.add(c);
  };
  comp(0.36, 0.08, 0.3);
  comp(-0.36, -0.1, -0.5);
  const top = new THREE.Group();
  top.position.set(0, 3.05, 0);
  const panel = box(0.88, 0.025, 1.02, m.cells(3, 4));
  panel.position.set(0.12, 0.1, 0.42);
  panel.rotation.x = -0.45;
  top.add(panel);
  const pb = box(0.9, 0.012, 1.04, m.alu);
  pb.position.set(0.12, 0.085, 0.42);
  pb.rotation.x = -0.45;
  top.add(pb);
  const hga = box(0.82, 0.04, 0.82, m.silverFoil);
  hga.position.set(-0.05, -0.15, -0.45);
  hga.rotation.set(0.75, 0.2, 0.15);
  top.add(hga);
  rod(top, [0, 0, 0], [0.12, 0.1, 0.25], 0.02, m.alu);
  rod(top, [0, 0, 0], [-0.05, -0.12, -0.25], 0.02, m.alu);
  g.add(top);
  const mount = new THREE.Group();
  mount.position.set(0.5, 1.6, -0.3);
  mount.add(box(0.1, 0.06, 0.18, m.alu));
  mount.add(at(box(0.05, 0.18, 0.05, m.alu), 0, -0.1, 0));
  g.add(mount);
  g.add(at(box(0.12, 0.1, 0.12, m.darkAlu), -0.55, 0.85, 0.35));
  return g;
}
function lrv() {
  const m = mats(), g = new THREE.Group();
  for (const x of [-0.9, 0, 0.9]) g.add(at(box(0.86, 0.07, 1.15, m.alu), x, 0.5, 0));
  for (const x of [-0.45, 0.45]) g.add(at(box(0.04, 0.09, 1.17, m.darkAlu), x, 0.5, 0));
  g.add(at(box(1.9, 0.02, 1.05, m.black), 0.05, 0.545, 0));
  for (const x of [-1.15, 1.15]) for (const z of [-0.98, 0.98]) {
    const w = new THREE.Group();
    w.position.set(x, 0.41, z);
    const tyre = mesh(new THREE.TorusGeometry(0.33, 0.085, 12, 40), m.tyre);
    w.add(tyre);
    w.add(ring(new THREE.BoxGeometry(0.05, 6e-3, 0.12), m.titanium, 30, (o, i, a) => {
      o.position.set(Math.cos(a) * 0.416, Math.sin(a) * 0.416, 0);
      o.rotation.set(0, 0, a - Math.PI / 2);
      o.rotateY(i % 2 ? 0.35 : -0.35);
    }));
    const hub = cyl(0.16, 0.16, 0.16, m.alu, 20);
    hub.rotation.x = Math.PI / 2;
    w.add(hub);
    const motor = cyl(0.1, 0.1, 0.12, m.gold, 16);
    motor.rotation.x = Math.PI / 2;
    motor.position.z = -Math.sign(z) * 0.12;
    w.add(motor);
    w.add(ring(new THREE.CylinderGeometry(8e-3, 8e-3, 0.3, 6), m.alu, 12, (o, i, a) => {
      o.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0);
      o.rotation.set(0, 0, a + Math.PI / 2);
    }));
    g.add(w);
    const fender = mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.27, 24, 1, true, Math.PI * 0.08, Math.PI * 0.84), m.fender);
    fender.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    fender.position.set(x, 0.43, z);
    g.add(fender);
    rod(g, [x * 0.72, 0.5, z * 0.55], [x, 0.41, z * 0.85], 0.028, m.alu);
    rod(g, [x * 0.72, 0.62, z * 0.55], [x * 0.95, 0.47, z * 0.85], 0.018, m.darkAlu);
  }
  for (const z of [-0.3, 0.3]) {
    const s = new THREE.Group();
    s.position.set(0.05, 0.56, z);
    s.add(at(box(0.48, 0.03, 0.44, m.seat), 0, 0.22, 0));
    s.add(at(box(0.03, 0.46, 0.44, m.seat), -0.25, 0.44, 0, 0, 0, 0.18));
    rod(s, [0.22, 0, -0.2], [0.22, 0.22, -0.2], 0.012, m.alu);
    rod(s, [0.22, 0, 0.2], [0.22, 0.22, 0.2], 0.012, m.alu);
    rod(s, [-0.24, 0.22, -0.22], [-0.3, 0.66, -0.22], 0.012, m.alu);
    rod(s, [-0.24, 0.22, 0.22], [-0.3, 0.66, 0.22], 0.012, m.alu);
    g.add(s);
  }
  rod(g, [0.62, 0.55, 0], [0.62, 1.1, 0], 0.025, m.alu);
  g.add(at(box(0.08, 0.34, 0.4, m.black), 0.66, 1.22, 0, 0, 0, -0.25));
  g.add(at(box(0.01, 0.26, 0.32, m.gold), 0.705, 1.23, 0, 0, 0, -0.25));
  rod(g, [0.32, 0.56, 0], [0.32, 0.86, 0], 0.012, m.alu);
  g.add(at(box(0.04, 0.03, 0.14, m.black), 0.32, 0.88, 0));
  rod(g, [1.25, 0.55, 0.08], [1.25, 1.12, 0.08], 0.02, m.alu);
  const cam = new THREE.Group();
  cam.position.set(1.25, 1.2, 0.08);
  cam.add(box(0.24, 0.16, 0.16, m.silverFoil));
  cam.add(at(cyl(0.045, 0.05, 0.1, m.black, 14), 0.16, 0, 0, 0, 0, Math.PI / 2));
  cam.add(at(box(0.28, 0.01, 0.2, m.black), 0, 0.09, 0));
  g.add(cam);
  rod(g, [1.05, 0.55, -0.45], [1.05, 1.72, -0.45], 0.02, m.alu);
  const dish = mesh(new THREE.LatheGeometry(Array.from({ length: 9 }, (_, i) => new THREE.Vector2(i * 0.06, (i * 0.06) ** 2 * 0.9)), 32), m.dishMesh);
  const dishG = new THREE.Group();
  dishG.add(dish);
  dishG.add(ring(new THREE.CylinderGeometry(6e-3, 6e-3, 0.5, 5), m.alu, 12, (o, i, a) => {
    o.position.set(Math.cos(a) * 0.24, 0.06, Math.sin(a) * 0.24);
    o.lookAt(0, 0, 0);
    o.rotateX(Math.PI / 2 - 0.25);
  }));
  dishG.position.set(1.05, 1.72, -0.45);
  dishG.rotation.z = 0.4;
  dishG.rotation.x = -0.2;
  g.add(dishG);
  const helix = new THREE.CatmullRomCurve3(Array.from({ length: 60 }, (_, i) => V3(Math.cos(i * 0.6) * 0.03, i * 0.012, Math.sin(i * 0.6) * 0.03)));
  g.add(at(mesh(new THREE.TubeGeometry(helix, 120, 4e-3, 5), m.alu), 1.12, 1.1, 0.45));
  rod(g, [1.12, 0.55, 0.45], [1.12, 1.1, 0.45], 0.012, m.alu);
  const pallet = new THREE.Group();
  pallet.position.set(-1.12, 0.56, 0);
  pallet.add(at(box(0.3, 0.04, 0.8, m.alu), 0, 0.02, 0));
  pallet.add(at(box(0.24, 0.26, 0.3, m.silverFoil), 0, 0.17, -0.2));
  pallet.add(at(box(0.2, 0.2, 0.26, m.paint), 0, 0.14, 0.2));
  rod(pallet, [0.05, 0.04, 0.35], [-0.05, 0.8, 0.38], 0.01, m.alu);
  g.add(pallet);
  return g;
}
function retro() {
  const m = mats(), g = new THREE.Group();
  g.add(at(box(0.72, 0.035, 0.62, m.alu), 0, 0.11, 0));
  for (const x of [-0.32, 0.32]) for (const z of [-0.27, 0.27]) rod(g, [x, 0, z], [x, 0.1, z], 0.014, m.alu);
  const handle = mesh(new THREE.TorusGeometry(0.05, 6e-3, 6, 16, Math.PI), m.alu);
  handle.position.set(0, 0.13, -0.31);
  handle.rotation.x = -Math.PI / 2;
  g.add(handle);
  const arr = new THREE.Group();
  arr.add(box(0.48, 0.07, 0.48, m.alu));
  arr.add(at(box(0.5, 0.012, 0.5, m.darkAlu), 0, 0.035, 0));
  const pos = (o, i) => o.position.set(-0.2025 + i % 10 * 0.045, 0, -0.2025 + Math.floor(i / 10) * 0.045);
  arr.add(ring(new THREE.CylinderGeometry(0.0195, 0.0195, 0.075, 16), m.black, 100, (o, i) => {
    pos(o, i);
    o.position.y = 6e-3;
  }));
  arr.add(ring(new THREE.CylinderGeometry(0.017, 0.017, 0.01, 6), m.mirror, 100, (o, i) => {
    pos(o, i);
    o.position.y = 0.028;
    o.rotation.y = 0.3;
  }));
  arr.position.set(0, 0.36, 0.03);
  arr.rotation.x = -0.5;
  g.add(arr);
  rod(g, [0, 0.13, -0.22], [0, 0.3, -0.14], 0.016, m.alu, true);
  rod(g, [-0.2, 0.13, 0.24], [0.2, 0.13, 0.24], 0.012, m.alu);
  g.add(at(cyl(0.05, 0.05, 0.01, m.paint, 20), 0.27, 0.135, 0.18));
  g.add(at(cyl(4e-3, 4e-3, 0.06, m.black, 6), 0.27, 0.17, 0.18));
  g.add(at(ball(0.018, m.glass), 0.27, 0.14, -0.15));
  return g;
}
function sojourner() {
  const m = mats(), g = new THREE.Group();
  g.add(at(box(0.44, 0.12, 0.28, m.silverFoil), 0, 0.2, 0));
  g.add(at(box(0.46, 0.02, 0.3, m.gold), 0, 0.13, 0));
  g.add(at(box(0.62, 0.012, 0.47, m.alu), 0, 0.271, 0));
  g.add(at(box(0.6, 8e-3, 0.45, m.cells(5, 4)), 0, 0.28, 0));
  const wheel = (x, z) => {
    const w = new THREE.Group();
    w.position.set(x, 0.066, z);
    const rim = cyl(0.066, 0.066, 0.075, m.alu, 24);
    rim.rotation.x = Math.PI / 2;
    w.add(rim);
    w.add(ring(new THREE.BoxGeometry(6e-3, 7e-3, 0.076), m.darkAlu, 18, (o, i, a) => {
      o.position.set(Math.cos(a) * 0.067, Math.sin(a) * 0.067, 0);
      o.rotation.z = a;
    }));
    const cap = cyl(0.025, 0.025, 0.08, m.darkAlu, 12);
    cap.rotation.x = Math.PI / 2;
    w.add(cap);
    g.add(w);
  };
  for (const x of [-0.23, 0, 0.23]) for (const z of [-0.25, 0.25]) wheel(x, z);
  for (const z of [-0.205, 0.205]) {
    rod(g, [0.23, 0.066, z], [0.06, 0.2, z], 9e-3, m.alu, true);
    rod(g, [0.06, 0.2, z], [-0.08, 0.15, z], 9e-3, m.alu, true);
    rod(g, [-0.08, 0.15, z], [0, 0.066, z], 8e-3, m.alu);
    rod(g, [-0.08, 0.15, z], [-0.23, 0.066, z], 8e-3, m.alu);
  }
  for (const z of [-0.05, 0.05]) g.add(at(box(0.03, 0.035, 0.03, m.black), 0.235, 0.22, z));
  g.add(at(box(0.02, 0.02, 0.05, m.glass), 0.235, 0.18, 0));
  rod(g, [-0.22, 0.2, 0], [-0.3, 0.11, 0], 8e-3, m.alu, true);
  g.add(at(cyl(0.025, 0.025, 0.045, m.gold, 14), -0.3, 0.085, 0));
  rod(g, [-0.17, 0.28, 0.17], [-0.17, 0.55, 0.17], 4e-3, m.alu);
  g.add(at(ball(8e-3, m.black), -0.17, 0.555, 0.17));
  g.userData.fit = 0.7;
  return g;
}
const BUILT = { surveyor3: surveyor, lrv, retro, sojourner };
export {
  BUILT
};
