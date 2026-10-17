// The network statistics bar for Solana. View only: the numbers come from controllers/stats.js.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const { $, el } = Explorer.dom;

  /** Value with a small unit: "52 %". */
  function setValue(id, text, unit = '') {
    $(`#${id}`).replaceChildren(text, el('em', {}, unit));
  }

  Explorer.ui.statsBar = {
    /** m: { value, sub } */
    renderSlot(m) { setValue('st-slot', m.value); $('#st-slot-sub').textContent = m.sub; },
    /** m: { value (text), sub } */
    renderDay(m) { setValue('st-day', m.value, 'tx'); $('#st-day-sub').textContent = m.sub; },
    renderTps(m) { setValue('st-tps', m.value, 'tx/s'); $('#st-tps-sub').textContent = m.sub; },
    renderMix(m) { setValue('st-mix', m.value, '% votes'); $('#st-mix-sub').textContent = m.sub; },
    /** m: { value, sub, bar: 0..100 } */
    renderEpoch(m) {
      setValue('st-epoch', m.value);
      $('#st-epoch-sub').textContent = m.sub;
      $('#st-epoch-bar').style.width = `${Math.min(100, Math.max(0, m.bar))}%`;
    },
  };
})();
