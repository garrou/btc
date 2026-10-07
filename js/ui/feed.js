// The live transaction list. View only: the model (dedup, rate) is core/feed.js.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});
  const { $, el } = BTC.dom;
  const F = BTC.format;

  let handlers = {};

  function row(t) {
    const rate = t.vsize ? `${Math.round((t.fee || 0) / t.vsize)} sat/vB` : '—';
    return el('li', { class: 'fresh', 'data-id': t.txid, onclick: () => handlers.onOpenTx(t.txid) },
      el('span', { class: 'mono' }, t.txid),
      el('span', {}, t.value != null ? F.btc(t.value) : '—'),
      el('span', { class: 'muted' }, rate));
  }

  BTC.ui.feed = {
    /** handlers: onOpenTx(txid) */
    init(h) { handlers = h; },
    isPaused: () => $('#pause').checked,
    /** Adds the txs (newest first) on top and trims the list: only new rows are created. */
    prepend(batch) {
      const list = $('#txs'), max = BTC.config.feed.maxRows;
      list.prepend(...batch.slice(0, max).map(row));
      while (list.children.length > max) list.lastElementChild.remove();
    },
    /** stats: {total, rate} from core/feed.js */
    setCounter(stats) {
      $('#txcount').textContent = `${F.number(stats.total)} vues · ≈ ${stats.rate.toFixed(1).replace('.', ',')} tx/s${$('#pause').checked ? ' · en pause' : ''}`;
    },
  };
})();
