// The bar on top of the 3D scene (title, follow toggle, layout order and placement, details button), the scene message,
// the status pill.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});
  const { $, el } = BTC.dom;
  const F = BTC.format;

  const ORDER_KEY = 'layoutOrder', PLACEMENT_KEY = 'layoutPlacement';

  /** A <select> whose choice is remembered between visits. Calls onChange(value) on a change; returns the value to start with. */
  function rememberedSelect(selector, key, onChange) {
    const select = $(selector);
    try {
      const saved = localStorage.getItem(key);
      if (saved && [...select.options].some((o) => o.value === saved)) select.value = saved;
    } catch { /* storage unavailable */ }
    select.addEventListener('change', () => {
      try { localStorage.setItem(key, select.value); } catch { /* storage unavailable */ }
      onChange(select.value);
    });
    return select.value;
  }

  /** The fee scale legend: gradient and ticks come from the very stops the towers are colored with. */
  function renderLegend() {
    const C = BTC.colors, at = (r) => `${(C.position(r) * 100).toFixed(1)}%`;
    const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
    $('#legend-bar').style.background = `linear-gradient(90deg, ${C.stops.map((s) => `${css(s.hex)} ${at(s.rate)}`).join(', ')})`;
    $('#legend-ticks').replaceChildren(...[C.MIN_RATE, 1, 10, 100].map((r) =>
      el('span', { style: `left:${at(r)}`, class: r === C.MIN_RATE ? 'first' : '' }, String(r))));
    $('#legend-max').textContent = `${C.MAX_RATE}+ sat/vB`; // the right end of the bar: this rate and above look the same
  }

  BTC.ui.hud = {
    /**
     * handlers: onFollow(bool), onOrder(mode), onPlacement(mode), onDetails().
     * Returns {order, placement}: the layout choices to start with (the remembered ones, if any).
     */
    init(handlers) {
      renderLegend();
      const order = rememberedSelect('#order', ORDER_KEY, handlers.onOrder);
      const placement = rememberedSelect('#placement', PLACEMENT_KEY, handlers.onPlacement);
      $('#follow').addEventListener('change', (e) => handlers.onFollow(e.target.checked));
      $('#hud-details').addEventListener('click', () => handlers.onDetails());
      return { order, placement };
    },
    hideStage() { $('.stage').hidden = true; },
    setFollow(on) { $('#follow').checked = on; },
    setMessage(text) { $('#scene-msg').textContent = text; },
    setStatus(online) {
      const pill = $('#status');
      pill.textContent = online ? 'live' : 'offline';
      pill.className = `pill ${online ? 'on' : 'off'}`;
    },
    /** m: first projected block from the mempool (may be undefined). */
    showNext(m) {
      $('#hud-title').textContent = 'Next block';
      $('#hud-sub').textContent = m
        ? `mempool projection · ${F.number(m.nTx)} tx · median ${F.rate(m.medianFee)} sat/vB`
        : 'mempool projection';
      $('#hud-details').hidden = true;
    },
    showBlock(b) {
      $('#hud-title').textContent = `Block #${F.number(b.height)}`;
      $('#hud-sub').textContent = `${F.number(b.tx_count)} tx · ${F.fixed(BTC.blocks.fillPercent(b))}% full · ${b.extras?.pool?.name ?? 'unknown miner'} · ${F.date(b.timestamp)}`;
      $('#hud-details').hidden = false;
    },
  };
})();
