// Block layout: squarified treemap (area proportional to vsize, the coinbase included), and an incremental
// variant for a block that keeps changing (the projected one: towers stay where they are). Pure math.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});
  const S = BTC.config.scene;

  /**
   * Squarified treemap: vals (> 0) -> rectangles {x, y, w, h} in a W x H area, area proportional to the value.
   * capacity: reference total for the scale (>= sum of values); a sparsely filled block leaves empty space.
   * Returns {rects, rest, scale}: `rest` is the single free rectangle left after the last row, `scale` the area per unit.
   */
  function pack(vals, W, H, capacity) {
    const k = (W * H) / Math.max(capacity || 0, vals.reduce((s, v) => s + v, 0));
    const out = new Array(vals.length);
    let x = 0, y = 0, w = W, h = H, i = 0;
    while (i < vals.length) {
      const side = Math.min(w, h);
      if (!(side > 1e-9)) { // no free area left (full block, rounding): the remaining items get empty rects instead of NaN/Infinity
        for (let m = i; m < vals.length; m++) out[m] = { x, y, w: 0, h: 0 };
        break;
      }
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
    return { rects: out, rest: { x, y, w, h }, scale: k };
  }

  const EPS = 1e-4; // tolerance on coordinates (the treemap adds floats), and the smallest piece of platform worth keeping

  const byTxid = (a, b) => (a.txid < b.txid ? -1 : a.txid > b.txid ? 1 : 0);

  /** Orders txs for the layout: 'size' = largest first, 'txid' = by id, anything else = keep the given order. */
  function orderTxs(txs, order) {
    const out = txs.slice();
    if (order === 'size') out.sort((a, b) => b.vsize - a.vsize);
    else if (order === 'txid') out.sort(byTxid);
    return out;
  }

  /**
   * Layout of one block's platform: every tx, the coinbase too, gets a rectangle with an area proportional to its vsize,
   * on the same scale for every block (a full block, ~1 Mvb, fills the platform). A lighter block fills only a square of
   * the corner, so a lone coinbase, or 2-3 big txs, stay compact (neither a giant block, nor thin slivers). The coinbase
   * comes first, so it always sits in the same corner; only its color and its fixed height mark it. Provisional data
   * (txs.approx, vsize = 1): whole platform. Returns parallel arrays: list (txs in layout order), rects, heights, and
   * colors (Float32Array, 3 per tx), plus `free` (the rectangles left empty) and `scale` (area per vB).
   */
  function layoutBlock(txs, order, capacity = S.blockVsize) {
    const list = [...txs.filter((x) => x.coinbase), ...orderTxs(txs.filter((x) => !x.coinbase), order)];
    const scale = (S.size * S.size) / capacity;
    if (!list.length) return { ...finish(list, []), free: [{ x: 0, y: 0, w: S.size, h: S.size }], scale };
    const sizes = list.map((x) => Math.max(1, x.vsize));
    const sum = sizes.reduce((s, v) => s + v, 0);
    const side = txs.approx ? S.size : Math.min(S.size, Math.sqrt(sum * scale)); // the square the txs fill
    const packed = pack(sizes, side, side, sum);
    const free = side < S.size - EPS
      ? [{ x: side, y: 0, w: S.size - side, h: S.size }, { x: 0, y: side, w: side, h: S.size - side }] // the L around the square
      : [];
    return { ...finish(list, packed.rects), free: free.filter((r) => r.w > EPS && r.h > EPS), scale: packed.scale };
  }

  /** Heights and colors of laid out txs: parallel arrays with the list and its rects. */
  function finish(list, rects) {
    const heights = list.map((x) => (x.coinbase ? S.frameH - 1 : BTC.colors.towerHeight(x.rate)));
    const colors = new Float32Array(list.length * 3);
    list.forEach((x, k) => colors.set(x.coinbase ? BTC.colors.COINBASE : BTC.colors.rate(x.rate), k * 3));
    return { list, rects, heights, colors };
  }

  // Accepted shapes of a newcomer (long side / short side), the squarest first: a tight block takes thin slabs
  // rather than a new layout.
  const ASPECTS = [3, 8, 20];
  const MIN_FREE = 0.05; // free pieces smaller than this (units^2) hold no tower: dropped
  const HEADROOM = 1.1;  // a nearly full block is laid out as if it held 10 % more: room left for newcomers (fewer full layouts)

  /** The rectangle formed by two free rectangles that share a whole edge, or null. */
  function join(a, b) {
    const sameCol = Math.abs(a.x - b.x) < EPS && Math.abs(a.w - b.w) < EPS;
    const sameRow = Math.abs(a.y - b.y) < EPS && Math.abs(a.h - b.h) < EPS;
    if (sameCol && Math.abs(a.y + a.h - b.y) < EPS) return { x: a.x, y: a.y, w: a.w, h: a.h + b.h };
    if (sameCol && Math.abs(b.y + b.h - a.y) < EPS) return { x: a.x, y: b.y, w: a.w, h: a.h + b.h };
    if (sameRow && Math.abs(a.x + a.w - b.x) < EPS) return { x: a.x, y: a.y, w: a.w + b.w, h: a.h };
    if (sameRow && Math.abs(b.x + b.w - a.x) < EPS) return { x: b.x, y: a.y, w: a.w + b.w, h: a.h };
    return null;
  }

  /** Shape {w, h} of a tower of this area inside the free rectangle f, as square as allowed (long/short <= maxAspect), or null. */
  function shapeIn(area, f, maxAspect) {
    const lo = Math.max(area / f.h, Math.sqrt(area / maxAspect)), hi = Math.min(f.w, Math.sqrt(area * maxAspect));
    if (lo > hi + EPS) return null;
    const w = Math.min(hi, Math.max(lo, Math.sqrt(area)));
    return { w, h: area / w };
  }

  /**
   * Incremental layout of a block that keeps changing (the projected next block). A tower keeps its place for as long as
   * it stays in the block; the place of a tower that left is reused by the newcomers (best fit, biggest first), and the
   * whole block is laid out again from scratch only when a newcomer finds no room, or after reset().
   * update(txs, order) returns what layoutBlock returns, plus `relaid` (true when everything was laid out again).
   */
  function stableLayout() {
    let placed = null;  // txid -> rect, null before the first layout
    let free = [];      // free rectangles: disjoint from each other and from the placed ones
    let scale = 0;      // area per vB, fixed between two full layouts

    function addFree(r) { // a free piece, merged with the neighbours it shares a whole edge with
      let cur = r;
      for (let i = 0; i < free.length;) {
        const m = join(cur, free[i]);
        if (m) { cur = m; free.splice(i, 1); i = 0; } else i++;
      }
      free.push(cur);
    }

    /** Takes a place of this area out of the free space: the smallest free rectangle where it fits. Null when none does. */
    function take(area) {
      for (const maxAspect of ASPECTS) {
        let best = null;
        free.forEach((f, i) => {
          const shape = shapeIn(area, f, maxAspect);
          const waste = f.w * f.h - area;
          if (shape && (!best || waste < best.waste - 1e-9)) best = { i, shape, waste };
        });
        if (!best) continue;
        const f = free.splice(best.i, 1)[0], { w, h } = best.shape;
        // two ways to cut what is left of f around the tower: keep the largest leftover piece as large as possible
        const a = [{ x: f.x + w, y: f.y, w: f.w - w, h }, { x: f.x, y: f.y + h, w: f.w, h: f.h - h }];
        const b = [{ x: f.x + w, y: f.y, w: f.w - w, h: f.h }, { x: f.x, y: f.y + h, w, h: f.h - h }];
        const biggest = (pieces) => Math.max(...pieces.map((q) => q.w * q.h));
        for (const q of biggest(a) >= biggest(b) ? a : b) if (q.w > EPS && q.h > EPS && q.w * q.h >= MIN_FREE) addFree(q);
        return { x: f.x, y: f.y, w, h };
      }
      return null;
    }

    function relayout(txs, order) {
      const total = txs.reduce((s, t) => s + (t.coinbase ? 0 : Math.max(1, t.vsize)), 0);
      const L = layoutBlock(txs, order, Math.max(S.blockVsize, total * HEADROOM));
      placed = new Map(L.list.map((t, k) => [t.txid, L.rects[k]]));
      free = L.free.filter((r) => r.w * r.h >= MIN_FREE);
      scale = L.scale;
      return { ...L, relaid: true };
    }

    return {
      reset() { placed = null; free = []; },
      update(txs, order) {
        if (!placed || txs.approx || txs.some((t) => t.coinbase)) return relayout(txs, order);
        const now = new Set(txs.map((t) => t.txid));
        for (const [id, r] of placed) if (!now.has(id)) { placed.delete(id); addFree({ ...r }); }
        const added = txs.filter((t) => !placed.has(t.txid)).sort((a, b) => b.vsize - a.vsize || byTxid(a, b));
        for (const t of added) {
          const r = take(Math.max(1, t.vsize) * scale);
          if (!r) return relayout(txs, order); // no room left for this one: everything is laid out again
          placed.set(t.txid, r);
        }
        const list = txs.slice();
        return { ...finish(list, list.map((t) => placed.get(t.txid))), relaid: false };
      },
    };
  }

  /**
   * Size of a lone tower, before it has a place in a block: the same scale as the projected block's layout (area
   * proportional to vsize, a full block = the whole platform) and the same height rule (fee rate). The footprint is a square.
   */
  function nominalTower(vsize, rate) {
    const side = Math.sqrt((Math.max(1, vsize) * S.size * S.size) / S.blockVsize);
    return { w: side, h: side, height: BTC.colors.towerHeight(rate) };
  }

  BTC.layout = { block: layoutBlock, stable: stableLayout, nominalTower };
})();
