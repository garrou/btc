// Content of the projected next block, as pushed by the WebSocket (full snapshot, then deltas). Pure state holder.
// Format not verified live: txs are accepted as [txid, fee, vsize, value] arrays or as objects.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  function create() {
    let map = null;            // txid -> tx (null until the first snapshot)
    const fresh = new Set();   // txids that entered the block since the last takeFresh() (arrival animation)

    return {
      /** Applies a `projected-block-transactions` message. Returns {added} (txs that just entered), or null if ignored. */
      apply(raw) {
        if (Array.isArray(raw.blockTransactions)) {
          map = new Map(raw.blockTransactions.map(BTC.txs.normalizeProjected).map((t) => [t.txid, t]));
          return { added: [] };
        }
        if (raw.delta && map) {
          (raw.delta.removed || []).forEach((id) => map.delete(id));
          const added = (raw.delta.added || []).map(BTC.txs.normalizeProjected);
          added.forEach((t) => { map.set(t.txid, t); fresh.add(t.txid); });
          return { added };
        }
        return null;
      },
      hasData: () => map !== null,
      has: (txid) => map !== null && map.has(txid),
      size: () => (map ? map.size : 0),
      values: () => (map ? [...map.values()] : []),
      /** Ids that entered since the last call and are still in the block. */
      takeFresh() {
        const ids = [...fresh].filter((id) => map && map.has(id));
        fresh.clear();
        return ids;
      },
      reset() { map = null; fresh.clear(); },
    };
  }

  BTC.projection = { create };
})();
