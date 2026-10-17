// The panel over the 3D scene for a tracked address: its transactions (a click goes to their block), "load older".
// Views only: the data comes from the chain's own controller (Bitcoin: chains/bitcoin/controllers/wallet.js). The chain
// says how an amount reads (format) and how the "more" button is called, the engine draws the rest.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const { $, el } = Explorer.dom;
  const F = Explorer.format;

  const DIM_KEY = 'walletDim';

  let handlers = {};
  let formatAmount = () => '';
  let shown = { address: null, count: 0, reach: null, failed: false }; // what the summary line says

  /** One transaction: a lit dot when its tower is drawn, the block (or "Pending"), what it did to the balance. */
  function line(e, lit, note) {
    return el('li', {},
      el('button', { type: 'button', class: `w-row${e.pending ? ' pending' : ''}${lit ? ' lit' : ''}`, 'data-txid': e.txid, title: e.txid, onclick: () => handlers.onJump(e) },
        el('i', { class: 'w-dot' }),
        el('span', { class: 'w-what' },
          el('b', {}, e.pending ? 'Pending' : `#${F.number(e.height)}`),
          el('small', {}, e.pending ? note ?? '' : F.ago(e.time))),
        el('span', { class: `amt ${e.net < 0 ? 'down' : 'up'}` }, formatAmount(e))));
  }

  function summary(litCount) {
    const { count, reach, failed } = shown;
    const parts = [`${F.number(count)} transaction${count === 1 ? '' : 's'}`, `${F.number(litCount)} lit in 3D`];
    if (reach != null) parts.push(`back to #${F.number(reach)}`);
    if (failed) parts.push('last reload failed');
    $('#wallet-sum').textContent = parts.join(' · ');
  }

  Explorer.ui.tracker = {
    /**
     * handlers: onJump(entry), onOpenAddress(address), onRefresh(), onClear(), onMore(), onDim(bool), and
     * format(entry) -> text of the amount the transaction moved (e.g. "-0.1 BTC"), colored by the sign of entry.net.
     * Returns {dim}: the "dim the other transactions" choice to start with (the remembered one, if any).
     */
    init(h) {
      handlers = h;
      formatAmount = h.format;
      let dim = true;
      try { dim = localStorage.getItem(DIM_KEY) !== '0'; } catch { /* storage unavailable */ }
      $('#wallet-dim').checked = dim;
      $('#wallet-dim').addEventListener('change', (e) => {
        try { localStorage.setItem(DIM_KEY, e.target.checked ? '1' : '0'); } catch { /* storage unavailable */ }
        handlers.onDim(e.target.checked);
      });
      $('#wallet-address').addEventListener('click', () => shown.address && handlers.onOpenAddress(shown.address));
      $('#wallet-refresh').addEventListener('click', () => handlers.onRefresh());
      $('#wallet-clear').addEventListener('click', () => handlers.onClear());
      $('#wallet-more').addEventListener('click', () => handlers.onMore());
      $('#wallet-toggle').addEventListener('click', () => {
        const collapsed = $('#wallet').classList.toggle('collapsed');
        $('#wallet-toggle').setAttribute('aria-expanded', String(!collapsed));
        $('#wallet-toggle').title = collapsed ? 'Show the list' : 'Hide the list';
      });
      return { dim };
    },

    /**
     * m: { address, entries (core/wallet.entries), lit: Set of the txids whose tower is drawn, notes: Map txid -> what a
     * pending transaction waits for, reach: lowest block loaded, more: older ones can be loaded (moreLabel: what the button
     * says, default "Load older"), busy, failed, dim }.
     */
    render(m) {
      shown = { address: m.address, count: m.entries.length, reach: m.reach, failed: m.failed };
      $('#wallet').hidden = false;
      $('#wallet-address').textContent = F.short(m.address, 10, 6);
      $('#wallet-address').title = `${m.address}\nClick for the details of this address`;
      $('#wallet-list').replaceChildren(...m.entries.map((e) => line(e, m.lit.has(e.txid), m.notes.get(e.txid))));
      $('#wallet-more').hidden = !m.more;
      $('#wallet-more').textContent = m.moreLabel ?? 'Load older';
      Explorer.ui.tracker.setBusy(m.busy);
      $('#wallet-dim').checked = m.dim;
      summary(m.lit.size);
    },

    /** A reload is in progress (or over): spinner and buttons only, the list is left alone. */
    setBusy(busy) {
      $('#wallet').classList.toggle('busy', busy);
      $('#wallet-refresh').disabled = busy;
      $('#wallet-more').disabled = busy;
    },

    /** The scene changed: updates which lines are lit and what the pending ones wait for, without rebuilding the list. */
    refreshLit(lit, notes) {
      document.querySelectorAll('#wallet-list .w-row').forEach((row) => {
        const id = row.dataset.txid;
        row.classList.toggle('lit', lit.has(id));
        if (notes.has(id)) row.querySelector('small').textContent = notes.get(id);
      });
      summary(lit.size);
    },

    hide() {
      $('#wallet').hidden = true;
      shown = { address: null, count: 0, reach: null, failed: false };
    },

    /** Brings the scene into view (the panel is over it). */
    reveal() { $('.stage').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
  };
})();
