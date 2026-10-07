// The bar on top of the 3D scene (title, follow toggle, layout order, details button), the scene message, the status pill.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});
  const { $ } = BTC.dom;
  const F = BTC.format;

  const ORDER_KEY = 'layoutOrder';

  function savedOrder(select) {
    try {
      const saved = localStorage.getItem(ORDER_KEY);
      if (saved && [...select.options].some((o) => o.value === saved)) return saved;
    } catch { /* storage unavailable */ }
    return select.value;
  }

  BTC.ui.hud = {
    /**
     * handlers: onFollow(bool), onOrder(mode), onDetails().
     * Returns the layout order to start with (the remembered choice, if any).
     */
    init(handlers) {
      const select = $('#order');
      select.value = savedOrder(select);
      select.addEventListener('change', () => {
        try { localStorage.setItem(ORDER_KEY, select.value); } catch { /* storage unavailable */ }
        handlers.onOrder(select.value);
      });
      $('#follow').addEventListener('change', (e) => handlers.onFollow(e.target.checked));
      $('#hud-details').addEventListener('click', () => handlers.onDetails());
      return select.value;
    },
    hideStage() { $('.stage').hidden = true; },
    setFollow(on) { $('#follow').checked = on; },
    setMessage(text) { $('#scene-msg').textContent = text; },
    setStatus(online) {
      const pill = $('#status');
      pill.textContent = online ? 'en direct' : 'hors ligne';
      pill.className = `pill ${online ? 'on' : 'off'}`;
    },
    /** m: first projected block from the mempool (may be undefined). */
    showNext(m) {
      $('#hud-title').textContent = 'Prochain bloc';
      $('#hud-sub').textContent = m
        ? `projection · ${F.number(m.nTx)} tx · ~${Math.round(m.medianFee)} sat/vB`
        : 'projection du mempool';
      $('#hud-details').hidden = true;
    },
    showBlock(b) {
      $('#hud-title').textContent = `Bloc #${F.number(b.height)}`;
      $('#hud-sub').textContent = `${F.number(b.tx_count)} tx · ${F.fixed(BTC.blocks.fillPercent(b))} % plein · ${b.extras?.pool?.name ?? 'mineur inconnu'} · ${F.date(b.timestamp)}`;
      $('#hud-details').hidden = false;
    },
  };
})();
