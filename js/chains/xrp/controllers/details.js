// Opening the detail dialog: fetches the data and hands it to the view. Only the latest request may update the dialog
// (an older, slower response never overwrites a newer one: see controllers/requests.js).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const X = (Explorer.xrp = Explorer.xrp || {});
  const { begin, isCurrent } = Explorer.requests;

  // These requests open the dialog (as "Loading…") before the response arrives: if the user has closed it meanwhile, a
  // late response must not open it again.
  const wanted = (token) => isCurrent(token) && Explorer.ui.dialog.isOpen();

  /** What the dialog says when a request failed: "not found" only for a 404, the reason otherwise (network, timeout...). */
  const failure = (what, e) => (e.status === 404 ? `${what} not found.` : `Could not load the ${what.toLowerCase()} (${e.message})`);

  async function openTx(hash) {
    const token = begin();
    Explorer.ui.detail.loading();
    try {
      const res = await X.ws.call('tx', { transaction: hash, binary: false });
      const r = X.txs.row(res);
      if (!r) throw Object.assign(new Error('not a transaction'), { status: 404 });
      if (!wanted(token)) return;
      Explorer.ui.detail.tx({ r, ledgerIndex: res.ledger_index ?? res.inLedger ?? null, date: res.date != null ? X.format.unixTime(res.date) : null, validated: res.validated });
    } catch (e) {
      if (wanted(token)) Explorer.ui.detail.message(failure('Transaction', e));
    }
  }

  /** A ledger by its hash, or by its index (any ledger the server still has, shown on the page or not). */
  async function openLedger(which) {
    const token = begin();
    Explorer.ui.detail.loading();
    try {
      const by = typeof which === 'number' ? { ledger_index: which } : { ledger_hash: which };
      const res = await X.ws.call('ledger', { ...by, transactions: true, expand: true });
      const block = X.blocks.normalize(res);
      const rows = (res.ledger?.transactions ?? []).map(X.txs.row).filter(Boolean);
      if (!wanted(token)) return;
      Explorer.ui.detail.block({ block, rows });
    } catch (e) {
      if (wanted(token)) Explorer.ui.detail.message(failure('Ledger', e));
    }
  }

  /** An account: balance, what it owns, its latest transactions. */
  async function openAddress(address) {
    const token = begin();
    Explorer.ui.detail.loading();
    try {
      const [info, history] = await Promise.allSettled([
        X.ws.call('account_info', { account: address, ledger_index: 'validated' }),
        X.ws.call('account_tx', { account: address, ledger_index_min: -1, ledger_index_max: -1, limit: Explorer.chain.config.historyShown }),
      ]);
      let data = null;
      if (info.status === 'fulfilled') data = info.value.account_data ?? null;
      else if (info.reason.code !== 'actNotFound') throw info.reason;
      const rows = history.status === 'fulfilled' ? (history.value.transactions ?? []).map((h) => {
        const r = X.txs.row(h);
        const p = X.txs.parts(h);
        return r && { ...r, ledger: p.extra.ledger_index ?? p.tx.ledger_index ?? null, date: p.tx.date != null ? X.format.unixTime(p.tx.date) : p.extra.close_time_iso ? Date.parse(p.extra.close_time_iso) / 1000 : null };
      }).filter(Boolean) : null;
      if (!wanted(token)) return;
      Explorer.ui.detail.address({ address, data, history: rows, historyError: history.status === 'rejected' ? history.reason.message : null });
    } catch (e) {
      if (wanted(token)) Explorer.ui.detail.message(e.code === 'actMalformed' ? 'Not a valid XRP Ledger address.' : `Account lookup failed (${e.message})`);
    }
  }

  X.details = { openTx, openLedger, openAddress };
})();
