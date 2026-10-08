// The bar on top of the 3D scene (title, follow toggle, layout order and placement, details button), the scene message,
// the status pill.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});
  const { $ } = BTC.dom;
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

  BTC.ui.hud = {
    /**
     * handlers: onFollow(bool), onOrder(mode), onPlacement(mode), onDetails().
     * Returns {order, placement}: the layout choices to start with (the remembered ones, if any).
     */
    init(handlers) {
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
        ? `projection · ${F.number(m.nTx)} tx · ~${Math.round(m.medianFee)} sat/vB`
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
