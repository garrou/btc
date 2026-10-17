// The bar on top of the 3D scene (title, follow toggle, layout order and placement, details button), the scene message,
// the status pill.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const { $, el } = Explorer.dom;

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

  /** The fee scale legend: gradient and ticks come from the very stops the towers are colored with (the chain's rates). */
  function renderLegend() {
    const legend = Explorer.chain.legend;
    if (legend) return renderCategories(legend);
    const C = Explorer.colors, rates = Explorer.chain.rates, label = rates.label ?? String, at = (r) => `${(C.position(r) * 100).toFixed(1)}%`;
    const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
    $('#legend-bar').style.background = `linear-gradient(90deg, ${C.stops.map((s) => `${css(s.hex)} ${at(s.rate)}`).join(', ')})`;
    $('#legend-ticks').replaceChildren(...rates.ticks.map((r) =>
      el('span', { style: `left:${at(r)}`, class: r === C.MIN_RATE ? 'first' : '' }, label(r))));
    $('#legend-max').textContent = `${label(C.MAX_RATE)}+ ${rates.unit}`; // the right end of the bar: this rate and above look the same
  }

  /** A chain whose colors name a kind of tower rather than a rate (chain.legend): a swatch and a word for each kind. */
  function renderCategories(legend) {
    const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
    const scale = $('.legend-scale');
    scale.classList.add('categories');
    scale.replaceChildren(...legend.items.map((it) => el('span', { class: 'kind' }, el('i', { style: `background:${css(it.color)}` }), it.label)));
    $('#legend-max').textContent = legend.note ?? '';
  }

  Explorer.ui.hud = {
    /**
     * handlers: onFollow(bool), onOrder(mode), onPlacement(mode), onDetails().
     * Returns {order, placement}: the layout choices to start with (the remembered ones, if any).
     */
    init(handlers) {
      renderLegend();
      const order = rememberedSelect('#order', ORDER_KEY, handlers.onOrder);
      const placement = rememberedSelect('#placement', PLACEMENT_KEY, handlers.onPlacement);
      $('#follow').checked = Explorer.state.follow; // a browser may restore the checkbox of the previous visit
      $('#follow').addEventListener('change', (e) => handlers.onFollow(e.target.checked));
      $('#hud-details').addEventListener('click', () => handlers.onDetails());
      return { order, placement };
    },
    /** No 3D view: hides it, with the reason (nothing else says why the page has no scene). */
    hideStage(reason) {
      const stage = $('.stage');
      stage.hidden = true;
      if (reason) stage.before(Explorer.dom.el('p', { class: 'no3d' }, `3D view off: ${reason}`));
    },
    setFollow(on) { $('#follow').checked = on; },
    setMessage(text) { $('#scene-msg').textContent = text; },
    setStatus(online) {
      const pill = $('#status');
      pill.textContent = online ? 'live' : 'offline';
      pill.className = `pill ${online ? 'on' : 'off'}`;
    },
    /** m: first projected block from the mempool (may be undefined). The sentence under the title is the chain's. */
    showNext(m) {
      $('#hud-title').textContent = 'Next block';
      $('#hud-sub').textContent = Explorer.chain.nextLine(m);
      $('#hud-details').hidden = true;
    },
    showBlock(b) {
      $('#hud-title').textContent = `Block #${Explorer.chain.blockNumber(b)}`;
      $('#hud-sub').textContent = Explorer.chain.blockLine(b);
      $('#hud-details').hidden = false;
    },
  };
})();
