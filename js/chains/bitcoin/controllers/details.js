// Opening the detail dialog: fetches the data and hands it to the view. Only the latest request may update the dialog
// (an older, slower response never overwrites a newer one: see controllers/requests.js).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  Explorer.bitcoin = Explorer.bitcoin || {};

  const { begin, isCurrent } = Explorer.requests;

  // These requests open the dialog (as "Loading…") before the response arrives: if the user has closed it meanwhile, a
  // late response must not open it again.
  const wanted = (token) => isCurrent(token) && Explorer.ui.dialog.isOpen();

  /** What the dialog says when a request failed: "not found" only for a 404, the reason otherwise (network, rate limit...). */
  const failure = (what, e) => (e.status === 404 ? `${what} not found` : `Could not load the ${what.toLowerCase()} (${e.message})`);

  async function openTx(txid) {
    const token = begin();
    Explorer.ui.detail.loading();
    try {
      const tx = await Explorer.bitcoin.api.tx(txid);
      if (wanted(token)) Explorer.ui.detail.tx(tx);
    } catch (e) {
      if (wanted(token)) Explorer.ui.detail.message(failure('Transaction', e));
    }
  }

  async function openBlock(hash) {
    const token = begin();
    Explorer.ui.detail.loading();
    try {
      // /v1/block carries the mining "extras" (pool, median fee, total fees) that /block lacks;
      // fall back to what the list already knows
      const [b0, txs] = await Promise.all([Explorer.bitcoin.api.block(hash), Explorer.bitcoin.api.blockTxs(hash)]);
      if (!wanted(token)) return;
      const known = Explorer.state.blocks.find((x) => x.id === hash);
      Explorer.ui.detail.block({ ...b0, extras: b0.extras ?? known?.extras }, txs);
    } catch (e) {
      if (wanted(token)) Explorer.ui.detail.message(failure('Block', e));
    }
  }

  // The address shown by the dialog: its totals and the transactions received so far (older ones are loaded on demand).
  let shown = null;

  async function openAddress(address) {
    const token = begin();
    shown = null;
    Explorer.ui.detail.loading();
    // the totals and the transactions are separate requests: a very active address can fail on the list but still have totals
    const [totals, list] = await Promise.allSettled([Explorer.bitcoin.api.address(address), Explorer.bitcoin.api.addressTxs(address)]);
    if (!wanted(token)) return;
    if (totals.status === 'rejected') {
      const e = totals.reason;
      Explorer.ui.detail.message(e.status === 400 ? 'Not a valid Bitcoin address.' : `Address lookup failed (${e.message})`);
      return;
    }
    const summary = { address, ...Explorer.bitcoin.address.summary(totals.value) }; // the address as asked: its transactions spell it the same way
    const txs = list.status === 'fulfilled' ? list.value : null;
    shown = txs && { token, address, summary, txs: [...txs], busy: false };
    Explorer.ui.detail.address(summary, txs, txs ? Explorer.bitcoin.address.hasMore(summary, txs) : false, list.reason?.message);
  }

  /** "Load more" of the address page: the next 25 confirmed transactions. */
  async function moreAddressTxs() {
    const a = shown;
    if (!a || a.busy || !wanted(a.token)) return;
    a.busy = true;
    try {
      const last = Explorer.bitcoin.address.lastConfirmed(a.txs);
      const page = last ? Explorer.bitcoin.address.fresh(a.txs, await Explorer.bitcoin.api.addressTxsAfter(a.address, last)) : [];
      if (!wanted(a.token)) return; // closed, or another page opened meanwhile
      a.txs.push(...page);
      Explorer.ui.detail.moreTxs(page, page.length > 0 && Explorer.bitcoin.address.hasMore(a.summary, a.txs));
    } catch (e) {
      console.warn('address transactions', e);
      if (wanted(a.token)) Explorer.ui.detail.moreFailed();
    } finally {
      a.busy = false;
    }
  }

  /** The address page that is open: { address, summary, txs } (null when the dialog shows something else, or the list failed). */
  const shownAddress = () => (shown && wanted(shown.token) ? shown : null);

  Explorer.bitcoin.details = { openTx, openBlock, openAddress, moreAddressTxs, shownAddress };
})();
