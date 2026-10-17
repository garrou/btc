// The tracked wallet: how the transactions of an address are listed next to the 3D scene. Pure.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  Explorer.bitcoin = Explorer.bitcoin || {};

  const PAGE = 25; // confirmed transactions per page of the address API

  /**
   * One line of the wallet list. net: what the transaction did to the address, in sats (negative = money left).
   * rate: fee rate in sat/vB, null when unknown. hash / height / time: the block, for a confirmed transaction.
   */
  function entry(tx, address) {
    const st = tx.status ?? {};
    const confirmed = !!st.confirmed;
    return {
      txid: tx.txid,
      net: Explorer.bitcoin.address.delta(tx, address),
      pending: !confirmed,
      hash: confirmed ? st.block_hash : null,
      height: confirmed ? st.block_height : null,
      time: confirmed ? st.block_time : null,
      rate: Explorer.bitcoin.txs.fullFeeRate(tx),
    };
  }

  /** The lines of a list of transactions: unconfirmed ones first, then the confirmed ones, newest block first. */
  function entries(txs, address) {
    const seen = new Set(), pending = [], mined = [];
    for (const tx of txs) {
      if (seen.has(tx.txid)) continue;
      seen.add(tx.txid);
      (tx.status?.confirmed ? mined : pending).push(entry(tx, address));
    }
    mined.sort((a, b) => b.height - a.height); // stable: inside a block the order of the API is kept
    return [...pending, ...mined];
  }

  /** Lowest block height among the confirmed transactions (null when there are none): how far back the list goes. */
  function reach(txs) {
    let low = null;
    for (const t of txs) if (t.status?.confirmed && (low === null || t.status.block_height < low)) low = t.status.block_height;
    return low;
  }

  /**
   * The list after a refresh. `fresh` is the first page of the address API (every unconfirmed transaction and the newest
   * confirmed ones): it is the truth for what it covers. The older transactions loaded before stay, except when the page
   * holds the whole history (fewer confirmed ones than a page, and as many as the address has: total = its tx_count):
   * whatever it does not list is gone, e.g. after a reorganization. A page that is cut short for any other reason (fewer
   * than the total) does not erase the history that was loaded.
   */
  function merge(old, fresh, { total = null, pageSize = PAGE } = {}) {
    const confirmed = fresh.filter((t) => t.status?.confirmed);
    if (confirmed.length < pageSize && (total === null || confirmed.length >= total)) return [...fresh];
    const lowest = confirmed.reduce((m, t) => Math.min(m, t.status.block_height), Infinity);
    const known = new Set(fresh.map((t) => t.txid));
    // a transaction in the lowest block of the page may have been cut off by the page: it is older, keep it
    return [...fresh, ...old.filter((t) => t.status?.confirmed && !known.has(t.txid) && t.status.block_height <= lowest)];
  }

  /** Whether older confirmed transactions exist beyond the ones loaded (confirmedTotal: tx_count of the address). */
  const hasOlder = (txs, confirmedTotal) => txs.filter((t) => t.status?.confirmed).length < confirmedTotal;

  Explorer.bitcoin.wallet = { PAGE, entry, entries, reach, merge, hasOlder };
})();
