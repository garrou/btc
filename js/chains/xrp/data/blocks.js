// What the engine asks the network for, in XRP Ledger words (Explorer.chain.data): ledgers, their transactions as towers.
// Reads the server through data/ws.js.
//
// Two reads of a ledger: with only the hashes of its transactions (light: the list of ledgers and their number of
// transactions), and with every transaction and its metadata (full, 100 KB or more: for the ledgers the scene draws).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const X = (Explorer.xrp = Explorer.xrp || {});
  const cfg = () => Explorer.chain.config;

  function notFound(what) {
    const err = new Error(`${what} not found`);
    err.status = 404; // the convention of the contract: an unknown block or transaction
    return err;
  }

  const light = (by) => X.ws.call('ledger', { ...by, transactions: true, expand: false }).then(X.blocks.normalize);

  /** The ledgers of these indexes (newest first). One that is missing is skipped; none at all is a failure to retry. */
  async function ledgers(indexes) {
    const res = await Promise.allSettled(indexes.map((i) => light({ ledger_index: i })));
    const blocks = res.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (!blocks.length) throw res.find((r) => r.status === 'rejected')?.reason ?? notFound('ledger');
    return blocks;
  }

  const range = (top) => Array.from({ length: cfg().pageSize }, (_, i) => top - i).filter((n) => n >= 0);

  async function latestBlocks() {
    const head = await light({ ledger_index: 'validated' });
    const rest = head.height > 0 ? await ledgers(range(head.height - 1).slice(0, cfg().pageSize - 1)).catch(() => []) : [];
    const blocks = [head, ...rest];
    X.live.noteTip(head);
    return blocks;
  }

  const blocksFrom = (height) => ledgers(range(height));

  async function heightOf(hash) {
    const l = await X.ws.call('ledger', { ledger_hash: hash });
    return Number(l.ledger_index ?? l.ledger?.ledger_index);
  }

  async function hashOf(height) {
    const l = await X.ws.call('ledger', { ledger_index: height });
    return l.ledger_hash ?? l.ledger?.ledger_hash;
  }

  // ----- the transactions of a ledger -----
  const cache = new Map(); // ledger hash -> Promise<{ block, rows }>, most recently used last
  const KEEP = 12;
  let latest = null;       // { height, rows } of the newest ledger whose transactions were read: the feed's source

  async function load(id) {
    const res = await X.ws.call('ledger', { ledger_hash: id, transactions: true, expand: true });
    const block = X.blocks.normalize(res);
    const list = res.ledger?.transactions ?? [];
    const rows = list.map(X.txs.row).filter(Boolean);
    if (!latest || block.height >= latest.height) latest = { height: block.height, rows };
    return { block, rows };
  }

  /** A ledger with every transaction as a row (in ledger order). b: anything with an `id` (the hash). Cached. */
  function rowsOf(b) {
    let p = cache.get(b.id);
    if (p) { cache.delete(b.id); cache.set(b.id, p); return p; }
    p = load(b.id);
    p.catch(() => { if (cache.get(b.id) === p) cache.delete(b.id); });
    cache.set(b.id, p);
    while (cache.size > KEEP) cache.delete(cache.keys().next().value);
    return p;
  }

  /** The towers of a ledger: one per transaction, as large as the ledger objects it touched, colored by what it is. */
  async function blockTowers(b) {
    const { rows } = await rowsOf(b);
    return rows.map(X.txs.towerOf);
  }

  X.data = {
    latestBlocks, blocksFrom, heightOf, hashOf, blockTowers, rowsOf, notFound, light,
    /** The transactions (rows) of the newest ledger read in detail, or null. */
    latestRows: () => (latest ? latest.rows : null),
    // No mempool to read: the feed shows the transactions of the newest ledger read (see chain.js)
    recentTxs: async () => {
      if (!latest && !Explorer.sceneSync.active()) { // without 3D nothing else reads a ledger in detail: do it for the newest one
        const newest = Explorer.nav.liveBlocks()[0];
        if (newest) await rowsOf(newest).catch(() => null);
      }
      return latest ? latest.rows.slice(0, cfg().feedPerBlock).map(X.txs.feedItem) : [];
    },
  };
})();
