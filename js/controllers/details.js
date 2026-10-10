// Opening the detail dialog: fetches the data and hands it to the view. Only the latest request may update the dialog
// (an older, slower response never overwrites a newer one).
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  let seq = 0;
  /** Starts a request: returns its token. Any earlier request becomes stale. */
  const begin = () => ++seq;
  const isCurrent = (token) => token === seq;

  // These requests open the dialog (as "Loading…") before the response arrives: if the user has closed it meanwhile, a
  // late response must not open it again.
  const wanted = (token) => isCurrent(token) && BTC.ui.detail.isOpen();

  async function openTx(txid) {
    const token = begin();
    BTC.ui.detail.loading();
    try {
      const tx = await BTC.api.tx(txid);
      if (wanted(token)) BTC.ui.detail.tx(tx);
    } catch (e) {
      if (wanted(token)) BTC.ui.detail.message(`Transaction not found (${e.message})`);
    }
  }

  async function openBlock(hash) {
    const token = begin();
    BTC.ui.detail.loading();
    try {
      // /v1/block carries the mining "extras" (pool, median fee, total fees) that /block lacks;
      // fall back to what the list already knows
      const [b0, txs] = await Promise.all([BTC.api.block(hash), BTC.api.blockTxs(hash)]);
      if (!wanted(token)) return;
      const known = BTC.state.blocks.find((x) => x.id === hash);
      BTC.ui.detail.block({ ...b0, extras: b0.extras ?? known?.extras }, txs);
    } catch (e) {
      if (wanted(token)) BTC.ui.detail.message(`Block not found (${e.message})`);
    }
  }

  // The address shown by the dialog: its totals and the transactions received so far (older ones are loaded on demand).
  let shown = null;

  async function openAddress(address) {
    const token = begin();
    shown = null;
    BTC.ui.detail.loading();
    // the totals and the transactions are separate requests: a very active address can fail on the list but still have totals
    const [totals, list] = await Promise.allSettled([BTC.api.address(address), BTC.api.addressTxs(address)]);
    if (!wanted(token)) return;
    if (totals.status === 'rejected') {
      const e = totals.reason;
      BTC.ui.detail.message(e.status === 400 ? 'Not a valid Bitcoin address.' : `Address lookup failed (${e.message})`);
      return;
    }
    const summary = { address, ...BTC.address.summary(totals.value) }; // the address as asked: its transactions spell it the same way
    const txs = list.status === 'fulfilled' ? list.value : null;
    shown = txs && { token, address, summary, txs: [...txs], busy: false };
    BTC.ui.detail.address(summary, txs, txs ? BTC.address.hasMore(summary, txs) : false, list.reason?.message);
  }

  /** "Load more" of the address page: the next 25 confirmed transactions. */
  async function moreAddressTxs() {
    const a = shown;
    if (!a || a.busy || !wanted(a.token)) return;
    a.busy = true;
    try {
      const last = BTC.address.lastConfirmed(a.txs);
      const page = last ? BTC.address.fresh(a.txs, await BTC.api.addressTxsAfter(a.address, last)) : [];
      if (!wanted(a.token)) return; // closed, or another page opened meanwhile
      a.txs.push(...page);
      BTC.ui.detail.moreTxs(page, page.length > 0 && BTC.address.hasMore(a.summary, a.txs));
    } catch (e) {
      console.warn('address transactions', e);
      if (wanted(a.token)) BTC.ui.detail.moreFailed();
    } finally {
      a.busy = false;
    }
  }

  BTC.details = { begin, isCurrent, openTx, openBlock, openAddress, moreAddressTxs };
})();
