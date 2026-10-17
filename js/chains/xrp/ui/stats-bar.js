// The network statistics bar for the XRP Ledger. View only: the numbers come from controllers/stats.js.
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
    renderLedger(m) { setValue('st-ledger', m.value); $('#st-ledger-sub').textContent = m.sub; },
    renderTps(m) { setValue('st-tps', m.value, 'tx/s'); $('#st-tps-sub').textContent = m.sub; },
    renderMix(m) { setValue('st-mix', m.value, '% payments'); $('#st-mix-sub').textContent = m.sub; },
    /** m: { value (text), sub } */
    renderDay(m) { setValue('st-day', m.value, 'tx'); $('#st-day-sub').textContent = m.sub; },
    renderFee(m) { setValue('st-fee', m.value, 'drops'); $('#st-fee-sub').textContent = m.sub; },
  };
})();
