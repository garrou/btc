// Opening the detail dialog: fetches the data and hands it to the view. Only the latest request may update the dialog
// (an older, slower response never overwrites a newer one).
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  let seq = 0;
  /** Starts a request: returns its token. Any earlier request becomes stale. */
  const begin = () => ++seq;
  const isCurrent = (token) => token === seq;

  async function openTx(txid) {
    const token = begin();
    BTC.ui.detail.loading();
    try {
      const tx = await BTC.api.tx(txid);
      if (isCurrent(token)) BTC.ui.detail.tx(tx);
    } catch (e) {
      if (isCurrent(token)) BTC.ui.detail.message(`Transaction introuvable (${e.message})`);
    }
  }

  async function openBlock(hash) {
    const token = begin();
    BTC.ui.detail.loading();
    try {
      // /v1/block carries the mining "extras" (pool, median fee, total fees) that /block lacks;
      // fall back to what the list already knows
      const [b0, txs] = await Promise.all([BTC.api.block(hash), BTC.api.blockTxs(hash)]);
      if (!isCurrent(token)) return;
      const known = BTC.state.blocks.find((x) => x.id === hash);
      BTC.ui.detail.block({ ...b0, extras: b0.extras ?? known?.extras }, txs);
    } catch (e) {
      if (isCurrent(token)) BTC.ui.detail.message(`Bloc introuvable (${e.message})`);
    }
  }

  BTC.details = { begin, isCurrent, openTx, openBlock };
})();
