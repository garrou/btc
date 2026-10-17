// The live transaction list. View only: the model (dedup, rate) is core/feed.js.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const { $, el } = Explorer.dom;
  const F = Explorer.format;

  let handlers = {};

  function row(t) {
    const { amount, rate } = Explorer.chain.feedRow(t); // the texts are the chain's
    const open = () => handlers.onOpenTx(t.txid);
    return el('li', {
      class: 'fresh', 'data-id': t.txid, tabindex: 0, role: 'button', onclick: open,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
    },
      el('span', { class: 'mono' }, t.txid),
      el('span', {}, amount),
      el('span', { class: 'muted' }, rate));
  }

  Explorer.ui.feed = {
    /** handlers: onOpenTx(txid) */
    init(h) { handlers = h; },
    isPaused: () => $('#pause').checked,
    /** Adds the txs (newest first) on top and trims the list: only new rows are created. */
    prepend(batch) {
      const list = $('#txs'), max = Explorer.config.feed.maxRows;
      list.prepend(...batch.slice(0, max).map(row));
      while (list.children.length > max) list.lastElementChild.remove();
    },
    /** stats: {total, rate} from core/feed.js */
    setCounter(stats) {
      $('#txcount').textContent = `${F.number(stats.total)} seen · ≈ ${stats.rate.toFixed(1)} tx/s${$('#pause').checked ? ' · paused' : ''}`;
    },
  };
})();
