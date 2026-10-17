// The towers of the next block, as the engine keeps them (Explorer.chain.createPending): a full snapshot, then deltas.
// Same holder as Bitcoin's; the raw messages come from data/live.js: { snapshot: tower[] } or { added: tower[], removed: txid[] }.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const E = (Explorer.ethereum = Explorer.ethereum || {});

  function create() {
    let map = null;            // txid -> tower (null until the first snapshot)
    const fresh = new Set();   // txids that entered the block since the last takeFresh() (arrival animation)

    return {
      /** Returns { added } (towers that just entered), or null if the message is ignored. */
      apply(raw) {
        if (Array.isArray(raw.snapshot)) {
          map = new Map(raw.snapshot.map((t) => [t.txid, t]));
          return { added: [] };
        }
        if (map && (raw.added || raw.removed)) {
          (raw.removed || []).forEach((id) => map.delete(id));
          (raw.added || []).forEach((t) => { map.set(t.txid, t); fresh.add(t.txid); });
          return { added: raw.added || [] };
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

  E.projection = { create };
})();
