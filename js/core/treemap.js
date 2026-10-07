// Block layout: squarified treemap (area proportional to vsize) with the coinbase as a fixed pillar. Pure math.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});
  const S = BTC.config.scene;

  /**
   * Squarified treemap: vals (> 0) -> rectangles {x, y, w, h} in a W x H area, area proportional to the value.
   * capacity: reference total for the scale (>= sum of values); a sparsely filled block leaves empty space.
   */
  function squarify(vals, W, H, capacity) {
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
    return out;
  }

  const byTxid = (a, b) => (a.txid < b.txid ? -1 : a.txid > b.txid ? 1 : 0);

  /** Orders txs for the layout: 'size' = largest first, 'txid' = by id, anything else = keep the given order. */
  function orderTxs(txs, order) {
    const out = txs.slice();
    if (order === 'size') out.sort((a, b) => b.vsize - a.vsize);
    else if (order === 'txid') out.sort(byTxid);
    return out;
  }

  /**
   * Layout of one block's platform. The coinbase is a fixed-size square pillar in a corner; the other txs share the
   * rest. A full block (~1 Mvb) fills everything, an almost empty block leaves most of it free (otherwise a lone
   * coinbase, or 2-3 big txs, would become a giant block). Provisional data (txs.approx, vsize = 1): whole platform.
   * Returns parallel arrays: list (txs in layout order), rects, heights, and colors (Float32Array, 3 per tx).
   */
  function layoutBlock(txs, order) {
    const cb = txs.filter((x) => x.coinbase);
    const rest = orderTxs(txs.filter((x) => !x.coinbase), order);
    const lane = cb.length ? S.coinbaseSide : 0;
    const sizes = rest.map((x) => Math.max(1, x.vsize));
    const sum = sizes.reduce((s, v) => s + v, 0);
    const laid = rest.length ? squarify(sizes, S.size, S.size - lane, txs.approx ? sum : S.blockVsize) : [];

    const list = cb.concat(rest);
    const rects = cb.map(() => ({ x: 0, y: 0, w: S.coinbaseSide, h: S.coinbaseSide }))
      .concat(laid.map((r) => ({ x: r.x, y: r.y + lane, w: r.w, h: r.h })));
    const heights = list.map((x) => (x.coinbase ? S.frameH - 1 : BTC.colors.towerHeight(x.rate)));
    const colors = new Float32Array(list.length * 3);
    list.forEach((x, k) => colors.set(x.coinbase ? BTC.colors.COINBASE : BTC.colors.rate(x.rate), k * 3));
    return { list, rects, heights, colors };
  }

  BTC.treemap = { squarify };
  BTC.layout = { block: layoutBlock, orderTxs };
})();
