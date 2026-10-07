// The network statistics bar. View only: the numbers come from core/stats.js.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});
  const { $, el } = BTC.dom;
  const F = BTC.format;

  /** Value with a small unit: "890,0 EH/s". */
  function setValue(id, text, unit) {
    $(`#${id}`).replaceChildren(text, el('em', {}, unit));
  }

  BTC.ui.statsBar = {
    /** m: result of BTC.stats.fromHashrate */
    renderHashrate(m) {
      if (m.hashrate) {
        setValue('st-hash', F.fixed(m.hashrate / 1e18), 'EH/s');
        setValue('st-power', `≈ ${F.fixed(m.powerGW)}`, 'GW');
        $('#st-power-sub').textContent = `≈ ${F.fixed(m.twhPerYear, 0)} TWh/an · estimation à ${m.jPerTh} J/TH`;
        $('#st-power-box').title = `Estimation : hashrate × ${m.jPerTh} J/TH (efficacité moyenne supposée du parc de machines).`;
      }
      if (m.difficulty) setValue('st-diff', F.fixed(m.difficulty / 1e12, 2), 'T');
    },
    /** m: result of BTC.stats.fromAdjustment */
    renderAdjustment(m) {
      if (m.change != null) {
        const node = $('#st-adj');
        node.className = m.change >= 0 ? 'up' : 'down';
        node.replaceChildren(F.signed(m.change), el('em', {}, '%'));
      }
      if (m.remainingMs != null && m.remainingBlocks != null) {
        $('#st-adj-sub').textContent = `dans ~${F.duration(m.remainingMs)} · ${F.number(m.remainingBlocks)} blocs`;
      }
      if (m.progress != null) $('#st-adj-bar').style.width = `${Math.min(100, Math.max(0, m.progress))}%`;
      if (m.previous != null) $('#st-diff-sub').textContent = `dernier ajustement ${F.signed(m.previous)} %`;
    },
  };
})();
