// Multi-block 3D scene: the next block (projection) followed by the latest mined blocks, in a row.
// Each transaction is a tower standing on its block's platform:
//   footprint = size (vsize, treemap: largest txs first)   height + color = fee rate (sat/vB)
// Depends on the global THREE scripts (r147); EffectComposer/UnrealBloomPass are optional.
(function () {
  'use strict';

  const SIZE = 40;          // side of a block's platform
  const PITCH = 60;         // distance between two blocks
  const FRAME_H = 16;       // height of the cage
  const COINBASE_SIDE = 3;  // side of the coinbase pillar
  const BLOCK_VSIZE = 1e6;  // block capacity (vB): reference for the footprint scale
  const GROW = 0.7;         // tower growth duration (s)
  const STAGGER = 0.9;      // spread of the start times (s)
  const STOPS = [[1, 0x2d3a9e], [4, 0x1f8fe0], [10, 0x22c9a6], [25, 0x7ddc4a], [60, 0xf2d33c], [120, 0xf7931a], [250, 0xff3d6e]];
  const MAX_ARRIVALS = 40;  // animated arrivals per update (the rest appear directly)
  const MAX_STREAM = 90;    // stream particles in flight/pending (txs arriving in the mempool)
  const ARRIVAL_GAP = 0.05; // delay between two arrivals (s)
  const FLIGHT = 1.2;       // fall duration (s)
  const POP = 0.35;         // tower pop duration on landing (s)
  const FLASH = 0.7;        // white flash duration (s)
  const THEME ={ mined: 0xf7931a, next: 0x4cc9f0 };

  // Squarified treemap: vals (>0) -> rectangles whose area is proportional to the value.
  // capacity: reference total for the area scale (≥ sum of values); a sparsely filled block leaves empty space
  function treemap(vals, W, H, capacity) {
    const k = (W * H) / Math.max(capacity || 0, vals.reduce((s, v) => s + v, 0));
    const out = new Array(vals.length);
    let x = 0, y = 0, w = W, h = H, i = 0;
    while (i < vals.length) {
      const side = Math.min(w, h);
      let sum = 0, mx = 0, mn = Infinity, prev = Infinity, j = i;
      for (; j < vals.length; j++) {
        const a = vals[j] * k, s2 = sum + a, nmx = Math.max(mx, a), nmn = Math.min(mn, a);
        const worst = Math.max((side * side * nmx) / (s2 * s2), (s2 * s2) / (side * side * nmn));
        if (j > i && worst > prev) break;
        sum = s2; mx = nmx; mn = nmn; prev = worst;
      }
      const thick = sum / side;
      let off = 0;
      if (w >= h) {
        for (let m = i; m < j; m++) { const len = (vals[m] * k) / thick; out[m] = { x, y: y + off, w: thick, h: len }; off += len; }
        x += thick; w -= thick;
      } else {
        for (let m = i; m < j; m++) { const len = (vals[m] * k) / thick; out[m] = { x: x + off, y, w: len, h: thick }; off += len; }
        y += thick; h -= thick;
      }
      i = j;
    }
    return out;
  }

  function create(container, opts = {}) {
    if (typeof THREE === 'undefined' || !THREE.OrbitControls) return null; // core or required add-on script missing

    const tmpB = new THREE.Color();
    function rateColor(rate, out) {
      const r = Math.max(1, rate);
      let i = 0;
      while (i < STOPS.length - 2 && r > STOPS[i + 1][0]) i++;
      const [a, ca] = STOPS[i], [b, cb] = STOPS[i + 1];
      const t = Math.min(1, Math.max(0, (Math.log(r) - Math.log(a)) / (Math.log(b) - Math.log(a))));
      out.setHex(ca).lerp(tmpB.setHex(cb), t);
      return out.multiplyScalar(0.75 + Math.min(0.55, Math.log10(r + 1) * 0.3)); // >1: makes the bloom "glow"
    }
    const towerHeight = (rate) => 0.6 + 12 * (Math.log(1 + Math.min(rate, 300)) / Math.log(301));

    // ----- shared scene -----
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    const canvas = renderer.domElement;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d14);
    scene.fog = new THREE.Fog(0x0b0d14, 110, 340);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 800);
    camera.position.set(46, 34, 58);

    const controls = new THREE.OrbitControls(camera, canvas);
    controls.target.set(0, 5, 0);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 20;
    controls.maxDistance = 170;
    controls.autoRotateSpeed = 0.7;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff1dd, 1.1); sun.position.set(30, 60, 20); scene.add(sun);

    const grid = new THREE.GridHelper(900, 150, 0x3a2a10, 0x1a1e2b); grid.position.y = -0.82; scene.add(grid);

    let composer = null;
    if (THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass) {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 0.92));
    }

    // ----- shared resources -----
    const unitBox = new THREE.BoxGeometry(1, 1, 1); unitBox.translate(0, 0.5, 0); // tower base at y = 0
    const cageGeo = new THREE.BoxGeometry(SIZE, FRAME_H, SIZE);
    const cageEdges = new THREE.EdgesGeometry(cageGeo);
    const slabGeo = new THREE.BoxGeometry(SIZE + 2, 0.8, SIZE + 2);
    const ringGeo = new THREE.RingGeometry(SIZE * 0.55, SIZE * 0.575, 96);
    const cubeGeo = new THREE.BoxGeometry(1, 1, 1);   // particle for an incoming transaction
    const dummy = new THREE.Object3D();
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const easeOutBack = (q) => 1 + 2.70158 * Math.pow(q - 1, 3) + 1.70158 * Math.pow(q - 1, 2);

    function labelSprite(text, color) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 128;
      const g = c.getContext('2d');
      g.font = 'bold 72px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#' + color.toString(16).padStart(6, '0'); g.shadowBlur = 24;
      g.fillStyle = '#fff'; g.fillText(text, 256, 64);
      const tex = new THREE.CanvasTexture(c);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
      sp.scale.set(24, 6, 1);
      return sp;
    }

    // ----- blocks ("slots") -----
    const slots = new Map();   // id -> slot
    let focusId = null, snapped = false;

    function makeSlot(meta) {
      const color = THEME[meta.kind] ?? THEME.mined;
      const group = new THREE.Group();
      const slab = new THREE.Mesh(slabGeo, new THREE.MeshStandardMaterial({ color: 0x1b1e29, metalness: 0.6, roughness: 0.45 }));
      slab.position.y = -0.4; group.add(slab);
      const cage = new THREE.LineSegments(cageEdges, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }));
      cage.position.y = FRAME_H / 2; group.add(cage);
      const glass = new THREE.Mesh(cageGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.035, side: THREE.BackSide, depthWrite: false }));
      glass.position.y = FRAME_H / 2; group.add(glass);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; group.add(ring);
      const label = labelSprite(meta.label, color);
      label.position.set(0, FRAME_H + 5, 0); group.add(label);
      group.position.y = 28; // new blocks "fall" into place
      scene.add(group);
      const slot = { id: meta.id, kind: meta.kind, group, ring, cage, glass, targetX: 0, mesh: null, txs: null,
        list: [], rects: [], heights: [], base: null, t: 0, growing: false, shock: 0, arrivals: [], stream: [], pulse: 0 };
      slots.set(meta.id, slot);
      return slot;
    }

    function clearArrivals(slot) {
      for (const a of slot.arrivals) if (!a.landed) { slot.group.remove(a.mesh); a.mesh.material.dispose(); }
      slot.arrivals = [];
    }

    function disposeLite(slot) {
      if (!slot.lite) return;
      slot.group.remove(slot.lite); slot.lite.material.dispose(); slot.lite = null;
    }

    function disposeMesh(slot) {
      clearArrivals(slot);
      disposeLite(slot);
      if (!slot.mesh) return;
      slot.group.remove(slot.mesh); slot.mesh.material.dispose(); slot.mesh.dispose && slot.mesh.dispose();
      slot.mesh = null;
      dropHover(slot);
    }

    // The hovered instance index is meaningless once the mesh is rebuilt: clear hover, tooltip and cursor.
    function dropHover(slot) {
      if (!hover || hover.slot !== slot) return;
      hover = null;
      canvas.style.cursor = 'grab';
      hideTip();
    }

    function removeSlot(slot) {
      disposeMesh(slot);
      scene.remove(slot.group);
      slot.group.traverse((o) => {
        if (o.material) { o.material.map && o.material.map.dispose(); o.material.dispose(); }
      });
      slots.delete(slot.id);
    }

    // e = growth progress (0 = on the ground, 1 = full height)
    function setTower(slot, k, e) {
      const r = slot.rects[k];
      dummy.position.set(r.x + r.w / 2 - SIZE / 2, 0, r.y + r.h / 2 - SIZE / 2);
      dummy.scale.set(Math.max(0.02, r.w * 0.86), Math.max(0.001, slot.heights[k] * e), Math.max(0.02, r.h * 0.86));
      dummy.updateMatrix();
      slot.mesh.setMatrixAt(k, dummy.matrix);
    }

    function writeMatrices(slot) {
      const n = slot.list.length;
      for (let k = 0; k < n; k++) {
        const p = Math.min(1, Math.max(0, (slot.t - (k / n) * STAGGER) / GROW));
        setTower(slot, k, 1 - Math.pow(1 - p, 3));
      }
      slot.mesh.instanceMatrix.needsUpdate = true;
    }

    // A transaction joining the block: a glowing cube falls from the sky onto the platform, then its tower pops up.
    function spawnArrivals(slot, ids) {
      const index = new Map(slot.list.map((x, k) => [x.txid, k]));
      let n = 0;
      for (const id of ids) {
        const k = index.get(id);
        if (k === undefined || n >= MAX_ARRIVALS) continue;
        const r = slot.rects[k], side = Math.min(2.2, Math.max(0.8, Math.sqrt(r.w * r.h) * 0.9));
        const color = new THREE.Color().fromArray(slot.base, k * 3).multiplyScalar(1.8);
        const mesh = new THREE.Mesh(cubeGeo, new THREE.MeshBasicMaterial({ color, fog: false }));
        mesh.scale.setScalar(side);
        mesh.visible = false;
        const ang = Math.random() * Math.PI * 2, rad = SIZE * (0.7 + Math.random() * 0.5);
        const from = new THREE.Vector3(Math.cos(ang) * rad, FRAME_H + 22 + Math.random() * 10, Math.sin(ang) * rad);
        const to = new THREE.Vector3(r.x + r.w / 2 - SIZE / 2, side / 2, r.y + r.h / 2 - SIZE / 2);
        slot.group.add(mesh);
        slot.arrivals.push({ txid: id, k, mesh, from, to, delay: n * ARRIVAL_GAP, t: 0, landed: false, popT: 0 });
        setTower(slot, k, 0); // the tower doesn't exist yet: it pops up on landing
        n++;
      }
      if (n) slot.mesh.instanceMatrix.needsUpdate = true;
    }

    // Stream: every new mempool transaction is a particle falling toward the next block (decoration, not its exact content)
    function streamInto(slot, items) {
      for (const it of items) {
        if (slot.stream.length >= MAX_STREAM) break;
        const color = new THREE.Color(it.rate != null ? rateColor(it.rate, new THREE.Color()) : 0x4cc9f0).multiplyScalar(1.6);
        const mesh = new THREE.Mesh(cubeGeo, new THREE.MeshBasicMaterial({ color, fog: false }));
        const side = 0.7 + Math.random() * 0.6;
        mesh.scale.setScalar(side);
        mesh.visible = false;
        const ang = Math.random() * Math.PI * 2, rad = SIZE * (0.8 + Math.random() * 0.6);
        const from = new THREE.Vector3(Math.cos(ang) * rad, FRAME_H + 14 + Math.random() * 14, Math.sin(ang) * rad);
        const to = new THREE.Vector3((Math.random() - 0.5) * SIZE * 0.85, 1 + Math.random() * 3, (Math.random() - 0.5) * SIZE * 0.85);
        slot.group.add(mesh);
        slot.stream.push({ mesh, from, to, delay: Math.random() * 1.8, t: 0, dur: 0.9 + Math.random() * 0.5 });
      }
    }

    function updateStream(s, dt) {
      if (!s.stream.length) return;
      for (const a of s.stream) {
        a.t += dt;
        const p = (a.t - a.delay) / a.dur;
        if (p < 0) continue;
        a.mesh.visible = p < 1;
        a.mesh.position.copy(a.from).lerp(a.to, p * p);
        a.mesh.rotation.y += dt * 5;
        if (p >= 1) { a.done = true; s.group.remove(a.mesh); a.mesh.material.dispose(); s.pulse = Math.max(s.pulse, 0.45); }
      }
      s.stream = s.stream.filter((a) => !a.done);
    }

    function updateArrivals(s, dt) {
      if (!s.arrivals.length) return;
      for (const a of s.arrivals) {
        a.t += dt;
        const local = a.t - a.delay;
        if (local < 0) continue;
        if (!a.landed) {
          const p = Math.min(1, local / FLIGHT);
          a.mesh.visible = true;
          a.mesh.position.copy(a.from).lerp(a.to, p * p); // accelerates while falling
          a.mesh.rotation.y += dt * 6;
          if (p >= 1) { // landing: the particle disappears, the tower grows, the cage pulses
            a.landed = true;
            s.group.remove(a.mesh); a.mesh.material.dispose();
            s.pulse = 1;
          }
        } else {
          a.popT += dt;
          setTower(s, a.k, easeOutBack(Math.min(1, a.popT / POP)));
          const flash = Math.max(0, 1 - a.popT / FLASH); // white flash fading to the real color
          const col = s.mesh.instanceColor.array;
          for (let c = 0; c < 3; c++) col[a.k * 3 + c] = s.base[a.k * 3 + c] * (1 - flash) + 2.4 * flash;
        }
      }
      s.mesh.instanceMatrix.needsUpdate = true;
      s.mesh.instanceColor.needsUpdate = true;
      s.arrivals = s.arrivals.filter((a) => !(a.landed && a.popT > FLASH));
    }

    function buildMesh(slot, animate, incoming) {
      // In-flight arrival particles survive a rebuild (re-anchored by txid below); everything else is reset.
      const carried = animate ? [] : slot.arrivals.filter((a) => !a.landed);
      slot.arrivals = slot.arrivals.filter((a) => !carried.includes(a));
      clearArrivals(slot);
      disposeLite(slot);
      const txs = slot.txs;
      if (!txs || !txs.length) {
        for (const a of carried) { slot.group.remove(a.mesh); a.mesh.material.dispose(); }
        disposeMesh(slot); slot.list = []; slot.growing = false; return;
      }
      // The coinbase is a fixed-size square pillar in a corner; the other txs share the rest of the platform.
      // Scale: a full block (~1 Mvb) fills everything, an almost empty block leaves most of it free (otherwise a
      // lone coinbase, or 2-3 big txs, would become a giant block). Provisional data (vsize=1): the whole platform.
      const cb = txs.filter((x) => x.coinbase), rest = txs.filter((x) => !x.coinbase).sort((a, b) => b.vsize - a.vsize);
      const lane = cb.length ? COINBASE_SIDE : 0;
      const sum = rest.reduce((s, x) => s + Math.max(1, x.vsize), 0);
      const laid = rest.length ? treemap(rest.map((x) => Math.max(1, x.vsize)), SIZE, SIZE - lane, txs.approx ? sum : BLOCK_VSIZE) : [];
      slot.list = cb.concat(rest);
      slot.rects = cb.map(() => ({ x: 0, y: 0, w: COINBASE_SIDE, h: COINBASE_SIDE })).concat(laid.map((r) => ({ x: r.x, y: r.y + lane, w: r.w, h: r.h })));
      slot.heights = slot.list.map((x) => (x.coinbase ? FRAME_H - 1 : towerHeight(x.rate)));
      const n = slot.list.length;
      // Reuse the GPU buffers when the existing mesh is big enough (frequent projected-block updates): only
      // matrices and colors are rewritten. The capacity has headroom so growing blocks rarely reallocate.
      let mesh = slot.mesh;
      if (mesh && mesh.userData.cap >= n && mesh.userData.cap <= n * 2) {
        dropHover(slot);
        mesh.count = n;
      } else {
        disposeMesh(slot);
        const material = new THREE.MeshStandardMaterial({ metalness: 0.35, roughness: 0.4 });
        if (slot.kind === 'next') { material.transparent = true; material.opacity = 0.82; }
        const cap = Math.ceil(n * 1.25);
        mesh = slot.mesh = new THREE.InstancedMesh(unitBox, material, cap);
        mesh.userData.cap = cap;
        mesh.count = n;
        mesh.frustumCulled = false; // the unit box sits at the origin: culling would make it disappear
        slot.group.add(mesh);
      }
      slot.base = new Float32Array(n * 3);
      const c = new THREE.Color();
      slot.list.forEach((x, k) => {
        if (x.coinbase) c.setHex(0xffd76a).multiplyScalar(1.5); else rateColor(x.rate, c);
        c.toArray(slot.base, k * 3);
        mesh.setColorAt(k, c);
      });
      mesh.instanceColor.needsUpdate = true;
      slot.t = animate ? 0 : STAGGER + GROW;
      slot.growing = !!animate;
      if (animate) slot.shock = 0.0001;
      writeMatrices(slot);
      // re-anchor in-flight particles on their (possibly moved) tower; drop those whose tx left the block
      const index = new Map(slot.list.map((x, k) => [x.txid, k]));
      for (const a of carried) {
        const k = index.get(a.txid);
        if (k === undefined) { slot.group.remove(a.mesh); a.mesh.material.dispose(); continue; }
        const r = slot.rects[k];
        a.k = k;
        a.to.set(r.x + r.w / 2 - SIZE / 2, a.mesh.scale.y / 2, r.y + r.h / 2 - SIZE / 2);
        slot.arrivals.push(a);
        setTower(slot, k, 0);
      }
      if (carried.length) mesh.instanceMatrix.needsUpdate = true;
      if (!animate && incoming && incoming.length && !reduceMotion) spawnArrivals(slot, incoming);
    }

    // ----- interaction -----
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), box = new THREE.Box3();
    let hover = null, pending = null, down = null, inside = false, auto = true, visible = true;

    function setHover(h) {
      if ((hover && h && hover.slot === h.slot && hover.id === h.id) || (!hover && !h)) return;
      if (hover) { // restore the color
        const col = hover.slot.mesh.instanceColor;
        col.array.set(hover.slot.base.subarray(hover.id * 3, hover.id * 3 + 3), hover.id * 3);
        col.needsUpdate = true;
      }
      hover = h;
      if (h) { const col = h.slot.mesh.instanceColor; col.array.set([2.4, 2.4, 2.4], h.id * 3); col.needsUpdate = true; }
      canvas.style.cursor = h ? 'pointer' : 'grab';
    }
    function hideTip() { if (opts.tooltip) opts.tooltip.hidden = true; }

    function pick(e) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      let best = null;
      for (const slot of slots.values()) {
        if (!slot.mesh) continue;
        // pre-test on the cage: avoids testing thousands of instances for blocks outside the ray
        const x = slot.group.position.x;
        box.min.set(x - SIZE / 2, 0, -SIZE / 2); box.max.set(x + SIZE / 2, FRAME_H, SIZE / 2);
        if (!ray.ray.intersectsBox(box)) continue;
        slot.group.updateMatrixWorld(true);
        const hit = ray.intersectObject(slot.mesh)[0];
        if (hit && (!best || hit.distance < best.dist)) best = { slot, id: hit.instanceId, dist: hit.distance };
      }
      setHover(best);
      if (best && opts.tooltip) {
        const tip = opts.tooltip, b = container.getBoundingClientRect();
        tip.hidden = false;
        const tx = best.slot.list[best.id];
        tip.textContent = opts.describe ? opts.describe(tx) : tx.txid;
        tip.style.left = Math.min(e.clientX - b.left + 14, b.width - tip.offsetWidth - 8) + 'px';
        tip.style.top = Math.max(8, e.clientY - b.top - tip.offsetHeight - 10) + 'px';
      } else hideTip();
    }

    canvas.addEventListener('pointerenter', () => { inside = true; });
    canvas.addEventListener('pointerleave', () => { inside = false; pending = null; hideTip(); setHover(null); });
    canvas.addEventListener('pointermove', (e) => { pending = e; });
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', (e) => {
      const isClick = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5;
      down = null;
      if (!isClick) return;
      pick(e); // also covers touch (no pointermove before the tap)
      if (!hover) return;
      // click on another block: move to it; click on the current block: transaction detail
      if (hover.slot.id !== focusId) opts.onFocus && opts.onFocus(hover.slot.id);
      else opts.onPick && opts.onPick(hover.slot.list[hover.id]);
    });

    // ----- chain: a line links each block to the previous one, with its hash -----
    // A pair = (most recent block, its predecessor). The "NEXT" link is pending: it must reference the latest mined block.
    const LINK_LEN = PITCH - SIZE - 2;   // length of the line between two platforms
    const linkGeo = new THREE.BoxGeometry(1, 0.2, 0.2);
    const packetGeo = new THREE.SphereGeometry(0.75, 12, 8);
    const links = new Map();   // id of the pair's most recent block -> link
    let linksReady = false;    // false until the first block list has arrived: no animation on load

    function hashSprite(hash, color) {
      const c = document.createElement('canvas'); c.width = 2048; c.height = 128;
      const g = c.getContext('2d');
      g.font = 'bold 46px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const text = hash, zeros = (hash.match(/^0*/)[0]).length;
      const w = g.measureText(text).width, x0 = 1024 - w / 2, cw = w / text.length;
      g.textAlign = 'left';
      g.shadowColor = '#' + color.toString(16).padStart(6, '0'); g.shadowBlur = 18;
      for (let i = 0; i < text.length; i++) { g.fillStyle = i < zeros ? '#' + color.toString(16).padStart(6, '0') : '#fff'; g.fillText(text[i], x0 + i * cw, 64); }
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, fog: false, depthWrite: false }));
      sp.scale.set(56, 3.5, 1);
      return sp;
    }

    function makeLink(newer, older, animate) {
      const pending = newer.kind === 'next', color = pending ? THEME.next : THEME.mined;
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.5), transparent: true, opacity: pending ? 0.6 : 1, fog: false });
      const group = new THREE.Group(), beam = new THREE.Mesh(linkGeo, mat);
      beam.scale.x = LINK_LEN; group.add(beam);
      const sprite = hashSprite(older.id, color); sprite.position.y = 3; group.add(sprite);
      const packet = new THREE.Mesh(packetGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
      packet.visible = false; group.add(packet);
      group.position.y = 3;
      scene.add(group);
      const anim = animate && !reduceMotion;
      return { newer: newer.id, older: older.id, pending, group, beam, mat, sprite, packet, t: anim ? 0 : 99, landed: !anim };
    }

    function disposeLink(l) {
      scene.remove(l.group);
      l.mat.dispose(); l.sprite.material.map.dispose(); l.sprite.material.dispose(); l.packet.material.dispose();
    }

    function syncLinks(metas) {
      const want = new Map();
      for (let i = 0; i + 1 < metas.length; i++) want.set(metas[i].id, [metas[i], metas[i + 1]]);
      for (const [id, l] of [...links]) {
        const w = want.get(id);
        if (!w || w[1].id !== l.older) { disposeLink(l); links.delete(id); }
      }
      for (const [id, [n, o]] of want) if (!links.has(id)) links.set(id, makeLink(n, o, linksReady));
      if (metas.length >= 2) linksReady = true;
    }

    function updateLinks(dt, now) {
      for (const l of links.values()) {
        const a = slots.get(l.newer), b = slots.get(l.older);
        if (!a || !b) continue;
        l.group.position.x = (a.group.position.x + b.group.position.x) / 2;
        l.t += dt;
        const half = LINK_LEN / 2;
        const grow = Math.min(1, l.t / 0.9);
        l.beam.scale.x = Math.max(0.001, LINK_LEN * (1 - Math.pow(1 - grow, 3)));
        l.beam.position.x = half - l.beam.scale.x / 2; // grows from the previous block (on the right)
        l.mat.opacity = l.pending ? 0.45 + 0.2 * Math.sin(now * 3) : 1; // pending: the line pulses
        l.sprite.material.opacity = Math.min(1, Math.max(0, (l.t - 0.9) / 0.5)) * (l.pending ? 0.75 : 0.95);
        if (!l.landed) { // the hash travels from the previous block (right) to the new one (left), then the cage lights up
          const q = (l.t - 0.9) / 1;
          l.packet.visible = q > 0 && q < 1;
          l.packet.position.set(half - 2 * half * Math.min(1, Math.max(0, q)), 0, 0);
          if (q >= 1) { l.landed = true; a.pulse = 1; if (!a.shock) a.shock = 0.0001; }
        }
      }
    }

    // ----- size & loop -----
    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      if (composer) composer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(container);
    new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(container);
    resize();

    let last = performance.now();
    (function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!visible) return;
      const k = Math.min(1, dt * 5);
      for (const s of slots.values()) {
        s.group.position.x += (s.targetX - s.group.position.x) * k;   // slides into place
        s.group.position.y += (0 - s.group.position.y) * Math.min(1, dt * 3.5); // fall
        if (s.growing && s.mesh) { s.t += dt; writeMatrices(s); if (s.t > STAGGER + GROW) s.growing = false; }
        if (s.shock > 0) {
          s.shock += dt / 1.4;
          s.ring.scale.setScalar(0.6 + s.shock * 2.6);
          s.ring.material.opacity = Math.max(0, 0.9 * (1 - s.shock));
          if (s.shock >= 1) { s.shock = 0; s.ring.material.opacity = 0; }
        }
        updateArrivals(s, dt);
        updateStream(s, dt);
        if (s.pulse > 0) { // the cage lights up on every landing
          s.pulse = Math.max(0, s.pulse - dt * 2.5);
          s.cage.material.opacity = 0.6 + 0.4 * s.pulse;
          s.glass.material.opacity = 0.035 + 0.1 * s.pulse;
        }
      }
      updateLinks(dt, now / 1000);
      // the camera follows the selected block, translation only (the user-chosen angle is kept)
      const f = slots.get(focusId);
      if (f) {
        const dx = (f.targetX - controls.target.x) * (snapped ? Math.min(1, dt * 4) : 1);
        controls.target.x += dx; camera.position.x += dx;
        snapped = true;
      }
      if (pending) { pick(pending); pending = null; }
      controls.autoRotate = auto && !inside; // freeze the rotation while hovering
      controls.update();
      composer ? composer.render() : renderer.render(scene, camera);
    })(last);

    return {
      setSlots(metas) {
        const keep = new Set(metas.map((m) => m.id));
        for (const s of [...slots.values()]) if (!keep.has(s.id)) removeSlot(s);
        metas.forEach((m, i) => { (slots.get(m.id) || makeSlot(m)).targetX = i * PITCH; });
        syncLinks(metas);
      },
      setTxs(id, txs, incoming) {
        const s = slots.get(id);
        if (!s || s.txs === txs) return;
        const first = !s.txs || s.txs.approx; // provisional -> real data: the growth restarts
        s.txs = txs;
        buildMesh(s, first, incoming);
      },
      stream(items) {
        if (reduceMotion || !visible) return;
        for (const s of slots.values()) if (s.kind === 'next') streamInto(s, items);
      },
      setSummary(id, { fill, rate }) {
        const s = slots.get(id);
        if (!s || s.mesh) return;
        disposeLite(s);
        const h = Math.max(0.8, Math.min(1, fill) * (FRAME_H - 2));
        const m = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: rateColor(rate ?? 2, new THREE.Color()), metalness: 0.35, roughness: 0.5, transparent: true, opacity: 0.85 }));
        m.scale.set(SIZE - 3, h, SIZE - 3);
        s.group.add(m); s.lite = m;
      },
      focus(id) { focusId = id; },
      setAutoRotate(v) { auto = !!v; },
    };
  }

  window.Block3D = { create };
})();
