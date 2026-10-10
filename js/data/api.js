// REST client for mempool.space. Network only: no DOM, no app state.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  /** GET a path of the API. Rejects with an Error carrying `.status` (HTTP status) when the response is not ok. */
  async function get(path) {
    const res = await fetch(BTC.config.api + path);
    if (!res.ok) {
      const err = new Error(`${res.status} ${path}`);
      err.status = res.status;
      throw err;
    }
    const type = res.headers.get('content-type') || '';
    return type.includes('json') ? res.json() : res.text();
  }

  BTC.api = {
    get,
    /** 15 latest blocks, newest first (with the mining `extras`). */
    blocks: () => get('/v1/blocks'),
    /** 15 blocks starting at `height`, newest first. */
    blocksFrom: (height) => get(`/v1/blocks/${height}`),
    /** Basic block data (no mining extras). */
    blockBasic: (hash) => get(`/block/${hash}`),
    /** Block with the mining extras (pool, median fee, total fees); falls back to the basic data. */
    block: (hash) => get(`/v1/block/${hash}`).catch(() => get(`/block/${hash}`)),
    blockHash: (height) => get(`/block-height/${height}`),
    /** First 25 full transactions of a block. */
    blockTxs: (hash) => get(`/block/${hash}/txs`),
    /** One row per tx ({txid, fee, vsize, rate, ...}), coinbase first. */
    blockSummary: (hash) => get(`/v1/block/${hash}/summary`),
    blockTxids: (hash) => get(`/block/${hash}/txids`),
    tx: (txid) => get(`/tx/${txid}`),
    /** Totals of an address ({address, chain_stats, mempool_stats}); an address without history gives zeros. 400 = not a valid address. */
    address: (address) => get(`/address/${encodeURIComponent(address)}`),
    /** Transactions of an address, newest first: the unconfirmed ones (up to 50), then the 25 latest confirmed. */
    addressTxs: (address) => get(`/address/${encodeURIComponent(address)}/txs`),
    /** The 25 confirmed transactions of an address that come after `lastTxid` (the oldest one already known). */
    addressTxsAfter: (address, lastTxid) => get(`/address/${encodeURIComponent(address)}/txs/chain/${lastTxid}`),
    /** ~10 latest transactions that entered the mempool, newest first. */
    recent: () => get('/mempool/recent'),
    hashrate3d: () => get('/v1/mining/hashrate/3d'),
    difficultyAdjustment: () => get('/v1/difficulty-adjustment'),
  };
})();
