import * as THREE from 'three';

const CFG = { dot: 0x16181b, sig: 0xe08a3c, lip: 0xb4574f, personaX: 1.1 }; // personaX: shift right of the menu
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (a, b) => a + Math.random() * (b - a);
const $ = id => document.getElementById(id);

/* ---------- scene ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.domElement.id = 'stage'; document.querySelector('.scene').after(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100);

const group = new THREE.Group(); scene.add(group);
const pts = [], scatter = [];
const shell = (cx, cy, cz, rx, ry, rz, n, keep) => {
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)); if (v.length() < 0.05) continue;
    v.normalize().multiplyScalar(rand(0.86, 1)); const p = [cx + v.x * rx, cy + v.y * ry, cz + v.z * rz];
    if (!keep || keep(p)) pts.push(p);
  }
};
const noMouth = p => !(Math.abs(p[0]) < 0.14 && Math.abs(p[1] - 1.38) < 0.07 && p[2] > 0.2);
const noEye = p => !(Math.abs(Math.abs(p[0]) - 0.14) < 0.03 && Math.abs(p[1] - 1.62) < 0.03 && p[2] > 0.2);
shell(0, 1.55, 0, 0.36, 0.44, 0.38, 4200, p => noMouth(p) && noEye(p));          // head
for (let i = 0; i < 600; i++) { const a = rand(0, 6.28); pts.push([Math.cos(a) * 0.15, rand(1.0, 1.2), Math.sin(a) * 0.15]); } // neck
shell(0, 0.35, 0, 0.92, 0.85, 0.42, 6000, p => p[1] < 1.05);                       // shoulders
for (let i = 0; i < 3200; i++) { const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * 3.6; pts.push([Math.cos(a) * r, -0.62 + rand(-0.01, 0.01), Math.sin(a) * r]); } // floor
pts.forEach(() => { const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(4, 9)); scatter.push(v.x, v.y, v.z); });

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
geo.setAttribute('aScatter', new THREE.Float32BufferAttribute(scatter, 3));
geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(pts.map(() => Math.random()), 1));
const mat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: {
    uTime: { value: 0 }, uAsm: { value: 0 }, uPulse: { value: 99 }, uSize: { value: 20 * renderer.getPixelRatio() },
    uMouse: { value: new THREE.Vector3(99, 99, 99) }, uMouth: { value: new THREE.Vector3(0, 1.38, 0.36) },
    uPaper: { value: new THREE.Color(CFG.dot) }, uSig: { value: new THREE.Color(CFG.sig) }
  },
  vertexShader: `
    uniform float uTime, uAsm, uPulse, uSize; uniform vec3 uMouse, uMouth;
    attribute vec3 aScatter; attribute float aSeed; varying float vSig, vGlow;
    void main(){
      float e = clamp(uAsm * 1.6 - aSeed * .6, 0., 1.); e = e * e * (3. - 2. * e);     // assemble from scatter
      vec3 p = mix(aScatter, position, e);
      p += vec3(sin(uTime*.6+aSeed*40.), cos(uTime*.5+aSeed*70.), sin(uTime*.7+aSeed*10.)) * .007;
      vec3 d = p - uMouse; p += normalize(d + 1e-5) * smoothstep(.55, .0, length(d)) * .22; // part around cursor
      float dm = distance(position, uMouth);                                              // answer ripple from the mouth
      float w = sin(dm * 10. - uPulse * 9.) * exp(-uPulse * 1.6) * exp(-dm * .45);
      p.z += w * .14;
      vSig = step(.88, aSeed); vGlow = abs(w);
      vec4 mv = modelViewMatrix * vec4(p, 1.);
      gl_PointSize = uSize * (.6 + aSeed * .8) * (1. + vGlow * 2.) / -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 uPaper, uSig; varying float vSig, vGlow;
    void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard;
      vec3 c = mix(uPaper, uSig, max(vSig, vGlow * 3.));
      gl_FragColor = vec4(c, smoothstep(.5, .25, d) * min(1., .8 + vGlow)); }`
});
group.add(new THREE.Points(geo, mat));

const eyes = [-0.14, 0.14].map(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), new THREE.MeshBasicMaterial({ color: CFG.sig })); e.position.set(x, 1.62, 0.352); group.add(e); return e; });
const lip = new THREE.Mesh(new THREE.CircleGeometry(0.085, 40), new THREE.MeshBasicMaterial({ color: CFG.lip }));
lip.position.set(0, 1.38, 0.356); group.add(lip);
const mouthIn = new THREE.Mesh(new THREE.CircleGeometry(0.06, 40), new THREE.MeshBasicMaterial({ color: 0x2a1512 }));
mouthIn.position.set(0, 1.38, 0.358); group.add(mouthIn);

/* ---------- layout, pointer, loop ---------- */
const pointer = { nx: 0, ny: 0 }, ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
let base = new THREE.Vector3(), look = new THREE.Vector3(), t = 0, open = 0, openTarget = 0, blinkAt = 3, ready = false, asm = 0;
function layout() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; const narrow = camera.aspect < 1;
  group.position.x = narrow ? 0 : CFG.personaX; group.position.y = narrow ? -0.9 : -0.55;
  base.set(0, 0.9, narrow ? 9 : 6.6); look.set(0, 0.6, 0); camera.updateProjectionMatrix();
}
addEventListener('resize', layout);
addEventListener('pointermove', e => { pointer.nx = e.clientX / innerWidth * 2 - 1; pointer.ny = -(e.clientY / innerHeight) * 2 + 1; });
layout(); camera.position.copy(base);

const mouthFor = c => { c = c.toLowerCase(); const m = { a: 1, o: 1, u: .7, e: .6, i: .5 }; return m[c] || ('bmp'.includes(c) ? 0 : /[a-z]/.test(c) ? .3 : 0); };
const orbit = $('orbit'), nodes = [], v3 = new THREE.Vector3();
function tick() {
  t += 0.016;
  camera.position.x += (base.x + pointer.nx * 0.45 - camera.position.x) * 0.04;
  camera.position.y += (base.y + pointer.ny * 0.25 - camera.position.y) * 0.04;
  camera.position.z = base.z + (reduce ? 0 : Math.sin(t * 0.2) * 0.15); camera.lookAt(look);
  group.rotation.y += (pointer.nx * 0.35 - group.rotation.y) * 0.05;
  group.rotation.x += (-pointer.ny * 0.1 - group.rotation.x) * 0.05;
  group.updateMatrixWorld();
  ray.setFromCamera(new THREE.Vector2(pointer.nx, pointer.ny), camera); plane.constant = -group.position.z;
  if (ray.ray.intersectPlane(plane, hit)) mat.uniforms.uMouse.value.copy(group.worldToLocal(hit.clone()));
  mat.uniforms.uTime.value = t; mat.uniforms.uPulse.value += 0.016; mat.uniforms.uAsm.value = asm;
  open += (openTarget - open) * 0.35; openTarget *= 0.82;
  lip.scale.set(1, 0.32 + open * 0.95, 1); mouthIn.scale.set(0.9, Math.max(0.02, open * 1.15 - 0.1), 1);
  if (t > blinkAt) { eyes.forEach(e => e.scale.y = 0.1); if (t > blinkAt + 0.12) { eyes.forEach(e => e.scale.y = 1); blinkAt = t + rand(2.5, 5.5); } }
  nodes.forEach(n => { // portfolio items orbit the persona in 3D
    const a = t * n.sp + n.ph;
    v3.set(group.position.x + Math.cos(a) * 2.1 * n.rs, 0.5 + Math.sin(a * n.k) * 1.1 * n.rs, Math.sin(a) * 1.4 * n.rs).project(camera);
    n.el.style.transform = `translate(${(v3.x * .5 + .5) * innerWidth - n.w / 2}px, ${(-v3.y * .5 + .5) * innerHeight - 14}px)`;
    n.el.style.opacity = ready ? (0.7 + 0.3 * Math.sin(a)).toFixed(2) : 0; n.el.style.zIndex = Math.sin(a) > 0 ? 3 : 1;
  });
  renderer.render(scene, camera); requestAnimationFrame(tick);
}
tick();

/* ---------- intro counter drives the assembly ---------- */
const t0 = performance.now(), DUR = reduce ? 300 : 2800;
(function intro() {
  const p = Math.min(1, (performance.now() - t0) / DUR); asm = p; $('count').textContent = Math.round(p * 100);
  if (p < 1) return requestAnimationFrame(intro);
  document.body.classList.add('ready'); ready = true; setTimeout(() => $('loader').classList.add('done'), 250);
})();

/* ---------- panel, menu, items ---------- */
const panel = $('panel'), menuBtns = [...document.querySelectorAll('#menu button')];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const show = (title, html) => { $('ptitle').textContent = title; $('pbody').innerHTML = html; panel.hidden = false; };
const closePanel = () => { panel.hidden = true; menuBtns.forEach(b => b.classList.remove('on')); };
$('close').onclick = closePanel; addEventListener('keydown', e => e.key === 'Escape' && closePanel());
let data = { topics: [], posts: [] }; const SECTIONS = ['about', 'skills', 'experience', 'contact'];
const topicItem = x => ({ label: x.name, go: () => show(x.name, `<p>${esc(x.description || 'No description yet.')}</p>`) });
const postItem = p => ({ label: p.title, go: () => show(p.title, p.html) });
function view(name) {
  menuBtns.forEach(b => b.classList.toggle('on', b.dataset.view === name));
  if (name === 'home') return closePanel();
  if (name === 'projects') {
    show('Projects', '<div class="list"></div>'); const list = $('pbody').firstChild;
    [...data.topics.map(topicItem), ...data.posts.map(postItem)].forEach(i => { const b = document.createElement('button'); b.textContent = i.label; b.onclick = i.go; list.appendChild(b); });
    if (!list.children.length) list.innerHTML = '<p>Nothing published yet.</p>'; return;
  }
  const post = data.posts.find(p => p.title.trim().toLowerCase() === name), label = name[0].toUpperCase() + name.slice(1);
  show(label, post ? post.html : `<p>Nothing here yet. In the admin, write a post titled “${label}” and publish it.</p>`);
}
menuBtns.forEach(b => b.onclick = () => view(b.dataset.view));
fetch('/api/items').then(r => r.json()).then(d => {
  data = d;
  [...d.topics.map(topicItem), ...d.posts.filter(p => !SECTIONS.includes(p.title.trim().toLowerCase())).map(postItem)].slice(0, 12).forEach((it, i) => {
    const el = document.createElement('button'); el.className = 'node'; el.textContent = it.label; el.onclick = it.go; orbit.appendChild(el);
    nodes.push({ el, w: el.offsetWidth, sp: reduce ? 0 : 0.07 + (i % 5) * 0.015, ph: i * 2.4, rs: 0.7 + (i % 4) * 0.14, k: 1 + (i % 3) * 0.5 });
  });
});

/* ---------- chat: lip-sync, ripple, source chips ---------- */
const bubble = $('bubble'); let typing, voiceOn = false;
$('voice').onclick = e => { voiceOn = !voiceOn; e.target.setAttribute('aria-pressed', voiceOn); e.target.textContent = voiceOn ? 'Voice on' : 'Voice off'; if (!voiceOn) speechSynthesis.cancel(); };
function say(text, sources = []) {
  clearInterval(typing); bubble.textContent = ''; $('sources').innerHTML = ''; let i = 0;
  mat.uniforms.uPulse.value = 0; // ripple out from the mouth
  sources.forEach((s, k) => { const c = document.createElement('span'); c.textContent = s; c.style.animationDelay = (0.3 + k * 0.12) + 's'; $('sources').appendChild(c); });
  if (voiceOn && 'speechSynthesis' in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)); }
  typing = setInterval(() => { const c = text[i++] || ''; bubble.textContent += c; openTarget = mouthFor(c); bubble.scrollTop = bubble.scrollHeight; if (i >= text.length) clearInterval(typing); }, 55);
}
$('chat').addEventListener('submit', async e => {
  e.preventDefault(); const q = $('q'), message = q.value.trim(); if (!message) return;
  q.value = ''; bubble.textContent = '...'; $('sources').innerHTML = '';
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
    const d = await r.json(); say(d.reply || d.error, d.sources || []);
  } catch { say("I can't reach my notes right now. Try again in a moment."); }
});