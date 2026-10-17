// The network statistics bar. View only: the numbers come from core/stats.js.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const { $, el } = Explorer.dom;
  const F = Explorer.format;

  /** Value with a small unit: "890.0 EH/s". */
  function setValue(id, text, unit) {
    $(`#${id}`).replaceChildren(text, el('em', {}, unit));
  }

  Explorer.ui.statsBar = {
    /** m: result of Explorer.bitcoin.stats.fromHashrate */
    renderHashrate(m) {
      if (m.hashrate) {
        setValue('st-hash', F.fixed(m.hashrate / 1e18), 'EH/s');
        setValue('st-power', `≈ ${F.fixed(m.powerGW)}`, 'GW');
        $('#st-power-sub').textContent = `≈ ${F.fixed(m.twhPerYear, 0)} TWh/yr · estimate at ${m.jPerTh} J/TH`;
        $('#st-power-box').title = `Estimate: hashrate × ${m.jPerTh} J/TH`;
      }
      if (m.difficulty) setValue('st-diff', F.fixed(m.difficulty / 1e12, 2), 'T');
    },
    /** m: { value (text), sub } */
    renderDay(m) { setValue('st-day', m.value, 'tx'); $('#st-day-sub').textContent = m.sub; },
    /** m: result of Explorer.bitcoin.stats.fromAdjustment */
    renderAdjustment(m) {
      if (m.change != null) {
        const node = $('#st-adj');
        node.className = m.change >= 0 ? 'up' : 'down';
        node.replaceChildren(F.signed(m.change), el('em', {}, '%'));
      }
      if (m.remainingMs != null && m.remainingBlocks != null) {
        $('#st-adj-sub').textContent = `in ~${F.duration(m.remainingMs)} · ${F.number(m.remainingBlocks)} blocks`;
      }
      if (m.progress != null) $('#st-adj-bar').style.width = `${Math.min(100, Math.max(0, m.progress))}%`;
      if (m.previous != null) $('#st-diff-sub').textContent = `last adjustment ${F.signed(m.previous)}%`;
    },
  };
})();
