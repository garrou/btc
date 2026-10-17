// XRP Ledger "blocks" (ledgers), as the engine sees them. A ledger closes every 3 to 5 seconds, and once validated it is final: there
// are no forks, so every ledger is shown and each one's parent is exactly the one before it. Pure.
//
// The engine's height is the ledger index; the id is the ledger hash.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const X = (Explorer.xrp = Explorer.xrp || {});

  /**
   * The result of a `ledger` command -> a block. `ledger.transactions` holds hashes (a light read) or whole transactions (a full
   * one); both count the same.
   */
  function normalize(result) {
    const l = result.ledger ?? result;
    const closed = Number(l.close_time), parentClosed = Number(l.parent_close_time);
    return {
      id: result.ledger_hash ?? l.ledger_hash ?? l.hash,
      height: Number(result.ledger_index ?? l.ledger_index ?? l.seqNum),
      previousblockhash: l.parent_hash ?? null,
      timestamp: X.format.unixTime(closed),
      tx_count: Array.isArray(l.transactions) ? l.transactions.length : Number(l.txn_count ?? 0),
      closedIn: Number.isFinite(parentClosed) && closed >= parentClosed ? closed - parentClosed : null, // seconds after the previous ledger
      totalCoins: l.total_coins ?? null,
    };
  }

  /** How busy a ledger looks, 0..1: its transactions against a busy ledger (config.txRef). */
  const fill = (b) => Math.min(1, b.tx_count / Explorer.chain.config.txRef);

  X.blocks = { normalize, fill };
})();
