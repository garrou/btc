// What the engine asks the network for, in Ethereum words (Explorer.chain.data): blocks, their transactions as towers.
// Reads the node through data/rpc.js. A mined block never changes: its contents are kept (a few dozen blocks).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const E = (Explorer.ethereum = Explorer.ethereum || {});

  const hex = (n) => `0x${n.toString(16)}`;

  function notFound(what) {
    const err = new Error(`${what} not found`);
    err.status = 404; // the convention of the contract: an unknown block or transaction
    return err;
  }

  /** The blocks of these heights (newest first), without their transactions. A height above the chain is skipped. */
  async function headers(heights) {
    const res = await E.rpc.batch(heights.map((n) => ['eth_getBlockByNumber', [hex(n), false]]));
    const blocks = res.map((r) => (r && !(r instanceof Error) ? E.blocks.normalize(r) : null));
    if (blocks.every((b) => b === null)) throw res.find((r) => r instanceof Error) ?? notFound('block'); // nothing at all: a failure to retry, not an empty list
    return blocks.filter(Boolean);
  }

  const range = (top) => Array.from({ length: Explorer.chain.config.pageSize }, (_, i) => top - i).filter((n) => n >= 0);

  async function latestBlocks() {
    const tip = Number(E.format.big(await E.rpc.call('eth_blockNumber')));
    const blocks = await headers(range(tip));
    if (blocks.length) E.live.noteTip(blocks[0]);
    return blocks;
  }

  async function blocksFrom(height) { return headers(range(height)); }

  async function heightOf(hash) {
    const b = await E.rpc.call('eth_getBlockByHash', [hash, false]);
    if (!b) throw notFound('block');
    return Number(E.format.big(b.number));
  }

  async function hashOf(height) {
    const b = await E.rpc.call('eth_getBlockByNumber', [hex(height), false]);
    if (!b) throw notFound('block');
    return b.hash;
  }

  // ----- the transactions of a block -----
  const cache = new Map(); // block id -> Promise<{ block, rows }>, most recently used last
  const KEEP = 40;

  async function load(id) {
    const [full, receipts] = await E.rpc.batch([['eth_getBlockByHash', [id, true]], ['eth_getBlockReceipts', [id]]]);
    if (full instanceof Error) throw full;
    if (!full) throw notFound('block');
    const block = E.blocks.normalize(full);
    const byHash = Array.isArray(receipts) ? new Map(receipts.map((r) => [r.transactionHash, r])) : null;
    let rows, estimated = false;
    if (byHash && full.transactions.every((tx) => byHash.has(tx.hash))) {
      rows = full.transactions.map((tx) => E.txs.row(tx, byHash.get(tx.hash), block));
    } else {
      estimated = true;
      // a node without eth_getBlockReceipts: the gas used by each transaction is estimated from its gas limit
      console.warn('block receipts unavailable, gas used is estimated', receipts instanceof Error ? receipts.message : '');
      rows = E.txs.estimateGas(full.transactions.map((tx) => E.txs.row(tx, null, block)), block.gasUsed);
    }
    return { block, rows, estimated };
  }

  /** The block (normalized) and its transactions (rows, in block order). b: anything with an `id` (the hash). Cached. */
  function rowsOf(b) {
    let p = cache.get(b.id);
    if (p) { cache.delete(b.id); cache.set(b.id, p); return p; }
    p = load(b.id);
    const forget = () => { if (cache.get(b.id) === p) cache.delete(b.id); };
    p.then((res) => { if (res.estimated) forget(); }, forget); // gas estimated without the receipts is not kept: the next read asks the node again
    cache.set(b.id, p);
    while (cache.size > KEEP) cache.delete(cache.keys().next().value);
    return p;
  }

  /** The towers of a mined block: one per transaction, as large as the gas it used, as high as the gas price it paid. */
  async function blockTowers(b) {
    const { rows, estimated } = await rowsOf(b);
    const towers = rows.map(E.txs.towerOf);
    if (estimated) towers.approx = true; // sizes are gas limits, not gas used: the engine asks again later (the node may have the receipts by then)
    return towers;
  }

  E.data = {
    latestBlocks, blocksFrom, heightOf, hashOf, blockTowers, rowsOf, notFound, hex,
    // No REST list of the mempool exists: the feed comes from the WebSocket (data/live.js)
    recentTxs: async () => [],
  };
})();
