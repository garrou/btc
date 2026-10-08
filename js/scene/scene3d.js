// Three.js view of the blocks: the next block (projection) followed by the mined blocks, in a row.
// Each transaction is a tower on its block's platform: footprint = size, height + color = fee rate.
// A transaction joining a block falls from the sky as that same tower (real footprint and height), then stays there.
// Rendering only: the layout, colors and heights come from core/ (pure functions); this file knows nothing about the
// app state or the network. Depends on the global THREE scripts (r147); EffectComposer/UnrealBloomPass are optional.
(function () {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});
  const S = BTC.config.scene;

  const { size: SIZE, pitch: PITCH, frameH: FRAME_H } = S;
  const GROW = 0.7;         // tower growth duration (s)
  const STAGGER = 0.9;      // spread of the start times (s)
  const MAX_ARRIVALS = 80;  // animated arrivals per update (the rest appear directly)
  const MAX_STREAM = 200;   // stream particles in flight/pending (txs arriving in the mempool)
  const MORPH = 0.8;        // towers glide to their new place when a block is re-laid out (s)
  const ARRIVAL_GAP = 0.03; // delay between two arrivals (s)
  const FLIGHT = 1.2;       // fall duration (s)
  const SETTLE = 0.3;       // a tower that just landed squashes a little, then recovers (s)
  const SQUASH = 0.15;      // how much it squashes (share of its height)
  const FILL = 0.86;        // share of its treemap cell a tower covers (the rest is the gap between towers)
  const FLASH = 0.7;        // white flash duration (s)
  const HOVER_WHITE = 2.4;  // color value of the hovered tower (> 1: glows with the bloom)
  const THEME = { mined: BTC.colors.MINED_BLOCK_HEX, next: BTC.colors.NEXT_BLOCK_HEX };

  function create(container, opts = {}) {
    if (typeof THREE === 'undefined' || !THREE.OrbitControls) return null; // core or required add-on script missing

    const colorOf = (rgb, out = new THREE.Color()) => out.setRGB(rgb[0], rgb[1], rgb[2]);

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
    const dummy = new THREE.Object3D();
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fit = (v) => Math.max(0.02, v * FILL); // size of a tower on a cell of the layout

    const sizeTower = (mesh, w, height, d) => mesh.scale.set(fit(w), Math.max(0.05, height), fit(d));

    // A falling transaction is its own tower: footprint w x d, height as in the block. Base-anchored (like the instances).
    function fallingTower(color, w, height, d) {
      const mesh = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, metalness: 0.35, roughness: 0.4 }));
      sizeTower(mesh, w, height, d);
      mesh.visible = false;
      return mesh;
    }
    const randomSpin = () => (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3); // radians, unwound while falling

    // Position of a falling tower at progress p (0..1): it moves over the block early, then drops straight down onto
    // its place (accelerating) while turning until it is aligned with it.
    function fall(a, p) {
      const move = 1 - Math.pow(1 - p, 3), drop = p * p, { from, to } = a;
      a.mesh.position.set(from.x + (to.x - from.x) * move, from.y + (to.y - from.y) * drop, from.z + (to.z - from.z) * move);
      a.mesh.rotation.y = a.spin * (1 - p) * (1 - p);
    }

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
      const label = labelSprite(meta.label, color);
      label.position.set(0, FRAME_H + 5, 0); group.add(label);
      group.position.y = 28; // new blocks "fall" into place
      scene.add(group);
      const slot = {
        id: meta.id, kind: meta.kind, group, cage, glass, targetX: 0, mesh: null, txs: null,
        placer: meta.kind === 'next' ? BTC.layout.stable() : null, // the projected block changes all the time: its towers stay put
        list: [], rects: [], heights: [], base: null, t: 0, growing: false, arrivals: [], stream: [], pulse: 0
      };
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
      slot.morph = null;
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
    function place(slot, k, r, height) {
      dummy.position.set(r.x + r.w / 2 - SIZE / 2, 0, r.y + r.h / 2 - SIZE / 2);
      dummy.scale.set(fit(r.w), Math.max(0.001, height), fit(r.h));
      dummy.updateMatrix();
      slot.mesh.setMatrixAt(k, dummy.matrix);
    }
    function setTower(slot, k, e) { place(slot, k, slot.rects[k], slot.heights[k] * e); }

    // Re-layout transition: every tower already in the block glides from its old footprint to its new one
    // (new towers grow in place). Towers still handled by an arrival animation are left alone.
    function writeMorph(slot, p) {
      const skip = new Set(slot.arrivals.map((a) => a.k));
      const e = 1 - Math.pow(1 - p, 3), lerp = (a, b) => a + (b - a) * e;
      for (let k = 0; k < slot.list.length; k++) {
        if (skip.has(k)) continue;
        const to = slot.rects[k], th = slot.heights[k], f = slot.morph.from[k];
        if (!f) place(slot, k, to, th * e);
        else place(slot, k, { x: lerp(f.r.x, to.x), y: lerp(f.r.y, to.y), w: lerp(f.r.w, to.w), h: lerp(f.r.h, to.h) }, lerp(f.h, th));
      }
      slot.mesh.instanceMatrix.needsUpdate = true;
    }

    function writeMatrices(slot) {
      const n = slot.list.length;
      for (let k = 0; k < n; k++) {
        const p = Math.min(1, Math.max(0, (slot.t - (k / n) * STAGGER) / GROW));
        setTower(slot, k, 1 - Math.pow(1 - p, 3));
      }
      slot.mesh.instanceMatrix.needsUpdate = true;
    }

    // A transaction joining the block: its tower (real footprint and height) falls from the sky onto its place.
    function spawnArrivals(slot, ids) {
      const index = new Map(slot.list.map((x, k) => [x.txid, k]));
      let n = 0;
      for (const id of ids) {
        const k = index.get(id);
        if (k === undefined || n >= MAX_ARRIVALS) continue;
        const r = slot.rects[k];
        const mesh = fallingTower(new THREE.Color().fromArray(slot.base, k * 3), r.w, slot.heights[k], r.h);
        const ang = Math.random() * Math.PI * 2, rad = SIZE * (0.7 + Math.random() * 0.5);
        const from = new THREE.Vector3(Math.cos(ang) * rad, FRAME_H + 22 + Math.random() * 10, Math.sin(ang) * rad);
        const to = new THREE.Vector3(r.x + r.w / 2 - SIZE / 2, 0, r.y + r.h / 2 - SIZE / 2);
        slot.group.add(mesh);
        slot.arrivals.push({ txid: id, k, mesh, from, to, spin: randomSpin(), delay: n * ARRIVAL_GAP, t: 0, landed: false, landT: 0 });
        setTower(slot, k, 0); // the tower of the block doesn't exist yet: the falling one takes over on landing
        n++;
      }
      if (n) slot.mesh.instanceMatrix.needsUpdate = true;
    }

    // Stream: every new mempool transaction falls toward the next block as its real tower (size and fee known) or, when
    // only its id is known, as a small cube. Decoration: it lands anywhere on the platform, not at its place in the block.
    function streamInto(slot, items) {
      for (const it of items) {
        if (slot.stream.length >= MAX_STREAM) break;
        const color = it.rate != null ? colorOf(BTC.colors.rate(it.rate)) : new THREE.Color(BTC.colors.NEXT_BLOCK_HEX);
        const side = 0.7 + Math.random() * 0.6;
        const t = it.rate != null && it.vsize > 1 ? BTC.layout.nominalTower(it.vsize, it.rate) : { w: side, h: side, height: side };
        const mesh = fallingTower(color, t.w, t.height, t.h);
        const ang = Math.random() * Math.PI * 2, rad = SIZE * (0.8 + Math.random() * 0.6);
        const from = new THREE.Vector3(Math.cos(ang) * rad, FRAME_H + 14 + Math.random() * 14, Math.sin(ang) * rad);
        const to = new THREE.Vector3((Math.random() - 0.5) * SIZE * 0.85, 0, (Math.random() - 0.5) * SIZE * 0.85);
        slot.group.add(mesh);
        slot.stream.push({ mesh, from, to, spin: randomSpin(), delay: Math.random() * 1.8, t: 0, dur: 0.9 + Math.random() * 0.5 });
      }
    }

    function updateStream(s, dt) {
      if (!s.stream.length) return;
      for (const a of s.stream) {
        a.t += dt;
        const p = (a.t - a.delay) / a.dur;
        if (p < 0) continue;
        a.mesh.visible = p < 1;
        fall(a, Math.min(1, p));
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
          fall(a, p);
          if (p < 1) continue;
          a.landed = true; // landing: the falling tower is replaced by the tower of the block (same size), the cage pulses
          s.group.remove(a.mesh); a.mesh.material.dispose();
          s.pulse = 1;
        }
        a.landT += dt; // time since landing
        setTower(s, a.k, 1 - SQUASH * Math.sin(Math.PI * Math.min(1, a.landT / SETTLE))); // lands full-size, squashes a little
        const flash = Math.max(0, 1 - a.landT / FLASH); // white flash fading to the real color
        const col = s.mesh.instanceColor.array;
        for (let c = 0; c < 3; c++) col[a.k * 3 + c] = s.base[a.k * 3 + c] * (1 - flash) + 2.4 * flash;
      }
      s.mesh.instanceMatrix.needsUpdate = true;
      s.mesh.instanceColor.needsUpdate = true;
      s.arrivals = s.arrivals.filter((a) => !(a.landed && a.landT > FLASH));
    }

    let layoutOrder = BTC.config.defaultOrder;

    function buildMesh(slot, animate, incoming) {
      // In-flight arrival particles survive a rebuild (re-anchored by txid below); everything else is reset.
      const carried = animate ? [] : slot.arrivals.filter((a) => !a.landed);
      slot.arrivals = slot.arrivals.filter((a) => !carried.includes(a));
      clearArrivals(slot);
      disposeLite(slot);
      const txs = slot.txs;
      if (!txs || !txs.length) {
        for (const a of carried) { slot.group.remove(a.mesh); a.mesh.material.dispose(); }
        if (slot.placer) slot.placer.reset();
        disposeMesh(slot); slot.list = []; slot.growing = false; return;
      }
      // previous footprints by txid, to glide towers to their new place (only for an in-place update of a shown block)
      const prev = !animate && !reduceMotion && slot.mesh && slot.list.length
        ? new Map(slot.list.map((x, k) => [x.txid, { r: slot.rects[k], h: slot.heights[k] }])) : null;
      // pure computations (core/treemap.js). The projected block keeps the places of its towers from one update to the
      // next (newcomers take free room, everything is laid out again only when there is none); a first fill starts afresh.
      if (slot.placer && animate) slot.placer.reset();
      const layout = slot.placer ? slot.placer.update(txs, layoutOrder) : BTC.layout.block(txs, layoutOrder);
      slot.list = layout.list;
      slot.rects = layout.rects;
      slot.heights = layout.heights;
      slot.base = layout.colors;
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
      const c = new THREE.Color();
      for (let k = 0; k < n; k++) mesh.setColorAt(k, c.fromArray(slot.base, k * 3));
      mesh.instanceColor.needsUpdate = true;
      slot.t = animate ? 0 : STAGGER + GROW;
      slot.growing = !!animate;
      if (prev) { slot.morph = { t: 0, from: slot.list.map((x) => prev.get(x.txid) || null) }; writeMorph(slot, 0); }
      else { slot.morph = null; writeMatrices(slot); }
      // re-anchor in-flight particles on their (possibly moved) tower; drop those whose tx left the block
      const index = new Map(slot.list.map((x, k) => [x.txid, k]));
      for (const a of carried) {
        const k = index.get(a.txid);
        if (k === undefined) { slot.group.remove(a.mesh); a.mesh.material.dispose(); continue; }
        const r = slot.rects[k];
        a.k = k;
        a.to.set(r.x + r.w / 2 - SIZE / 2, 0, r.y + r.h / 2 - SIZE / 2);
        sizeTower(a.mesh, r.w, slot.heights[k], r.h); // its cell may have changed shape
        slot.arrivals.push(a);
        setTower(slot, k, 0);
      }
      if (carried.length) mesh.instanceMatrix.needsUpdate = true;
      if (!animate && incoming && incoming.length && !reduceMotion) spawnArrivals(slot, incoming);
    }

    // ----- interaction -----
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), box = new THREE.Box3();
    let hover = null, pending = null, down = null, visible = true;

    function setHover(h) {
      if ((hover && h && hover.slot === h.slot && hover.id === h.id) || (!hover && !h)) return;
      if (hover) { // restore the color
        const col = hover.slot.mesh.instanceColor;
        col.array.set(hover.slot.base.subarray(hover.id * 3, hover.id * 3 + 3), hover.id * 3);
        col.needsUpdate = true;
      }
      hover = h;
      paintHover();
      canvas.style.cursor = h ? 'pointer' : 'grab';
    }

    // The highlight lives in the same color buffer as the arrival flash and the rebuilds: repaint it after them every
    // frame (only writes when something overwrote it), so the highlight never disagrees with the 'pointer' cursor.
    function paintHover() {
      if (!hover || !hover.slot.mesh) return;
      const col = hover.slot.mesh.instanceColor, i = hover.id * 3;
      if (col.array[i] === HOVER_WHITE && col.array[i + 1] === HOVER_WHITE && col.array[i + 2] === HOVER_WHITE) return;
      col.array.set([HOVER_WHITE, HOVER_WHITE, HOVER_WHITE], i);
      col.needsUpdate = true;
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
        const { x, y } = slot.group.position; // the group falls into place when created: follow it
        box.min.set(x - SIZE / 2, y, -SIZE / 2); box.max.set(x + SIZE / 2, y + FRAME_H, SIZE / 2);
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

    canvas.addEventListener('pointerleave', () => { pending = null; hideTip(); setHover(null); });
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
          if (q >= 1) { l.landed = true; a.pulse = 1; }
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
        if (s.morph && s.mesh) { s.morph.t += dt; const p = Math.min(1, s.morph.t / MORPH); writeMorph(s, p); if (p >= 1) s.morph = null; }
        if (s.growing && s.mesh) { s.t += dt; writeMatrices(s); if (s.t > STAGGER + GROW) s.growing = false; }
        updateArrivals(s, dt);
        updateStream(s, dt);
        if (s.pulse > 0) { // the cage lights up on every landing
          s.pulse = Math.max(0, s.pulse - dt * 2.5);
          s.cage.material.opacity = 0.6 + 0.4 * s.pulse;
          s.glass.material.opacity = 0.035 + 0.1 * s.pulse;
        }
      }
      paintHover();
      updateLinks(dt, now / 1000);
      // the camera follows the selected block, translation only (the user-chosen angle is kept)
      const f = slots.get(focusId);
      if (f) {
        const dx = (f.targetX - controls.target.x) * (snapped ? Math.min(1, dt * 4) : 1);
        controls.target.x += dx; camera.position.x += dx;
        snapped = true;
      }
      if (pending) { pick(pending); pending = null; }
      controls.update();
      composer ? composer.render() : renderer.render(scene, camera);
    })(last);

    // Public API (everything the controllers need; no app state leaks in)
    return {
      /** metas: [{ id, kind: 'next' | 'mined', label }] from left to right. Slots no longer listed are removed. */
      setSlots(metas) {
        const keep = new Set(metas.map((m) => m.id));
        for (const s of [...slots.values()]) if (!keep.has(s.id)) removeSlot(s);
        metas.forEach((m, i) => { (slots.get(m.id) || makeSlot(m)).targetX = i * PITCH; });
        syncLinks(metas);
      },
      /** Number of transactions (towers) a slot currently displays; 0 for an empty or unknown slot. */
      txCount(id) { const s = slots.get(id); return s && s.txs ? s.txs.length : 0; },
      /**
       * Content of a slot: array of txs (same reference = nothing to do), or null to clear. Growth animation on the
       * first fill. incoming: txids that just entered the block (later updates) -> arrival animation.
       */
      setTxs(id, txs, incoming) {
        const s = slots.get(id);
        if (!s || s.txs === txs) return;
        // growth animation on the first fill, and when provisional data is replaced by the real one (not on a provisional refresh)
        const first = !s.txs || (s.txs.approx && !txs?.approx);
        s.txs = txs;
        buildMesh(s, first, incoming);
      },
      /** items: [{ rate?, vsize? }], transactions that just entered the mempool: they fall toward the next block as their tower. */
      stream(items) {
        if (reduceMotion || !visible) return;
        for (const s of slots.values()) if (s.kind === 'next') streamInto(s, items);
      },
      /** Light version of an old block (no per-tx detail): a solid block, high according to its fullness, colored by median fee. */
      setSummary(id, { fill, rate }) {
        const s = slots.get(id);
        if (!s || s.mesh) return;
        const h = Math.max(0.8, Math.min(1, fill) * (FRAME_H - 2));
        const key = `${h.toFixed(3)}|${rate ?? ''}`;
        if (s.lite && s.liteKey === key) return; // already showing this shape
        disposeLite(s);
        s.liteKey = key;
        const m = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: colorOf(BTC.colors.rate(rate ?? 2)), metalness: 0.35, roughness: 0.5, transparent: true, opacity: 0.85 }));
        m.scale.set(SIZE - 3, h, SIZE - 3);
        s.group.add(m); s.lite = m;
      },
      /** The camera follows this slot. */
      focus(id) { focusId = id; },
      // Change the layout order: every displayed block is re-laid out, towers glide to their new place.
      setOrder(mode) {
        if (!BTC.config.orders.includes(mode) || mode === layoutOrder) return;
        layoutOrder = mode;
        for (const s of slots.values()) {
          if (!s.txs || !s.mesh) continue;
          if (s.placer) s.placer.reset(); // the order applies to the next layout: lay the block out again
          buildMesh(s, false, null);
        }
      },
    };
  }

  BTC.scene3d = { create };
})();
