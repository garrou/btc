// The network statistics bar for Ethereum. View only: the numbers come from controllers/stats.js.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const { $, el } = Explorer.dom;

  /** Value with a small unit: "0.31 gwei". */
  function setValue(id, text, unit, cls = '') {
    const node = $(`#${id}`);
    node.className = cls;
    node.replaceChildren(text, el('em', {}, unit));
  }

  Explorer.ui.statsBar = {
    /** m: { value (text), unit, trend: 'up'|'down'|'', sub } */
    renderBase(m) {
      setValue('st-base', m.value, m.unit, m.trend);
      $('#st-base-sub').textContent = m.sub;
    },
    /** m: { value, sub, bar: 0..100 } */
    renderUsage(m) {
      setValue('st-util', m.value, '%');
      $('#st-util-sub').textContent = m.sub;
      $('#st-util-bar').style.width = `${Math.min(100, Math.max(0, m.bar))}%`;
    },
    /** m: { value (text), sub } */
    renderDay(m) {
      setValue('st-day', m.value, 'tx');
      $('#st-day-sub').textContent = m.sub;
    },
    renderBurn(m) {
      setValue('st-burn', m.value, 'ETH');
      $('#st-burn-sub').textContent = m.sub;
    },
    renderFinality(m) {
      setValue('st-final', m.value, '');
      $('#st-final-sub').textContent = m.sub;
    },
  };
})();
