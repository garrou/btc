// What the node pushes (Explorer.chain.live), over WebSocket: new blocks, and the transactions entering the mempool.
//   newHeads                  a block was mined
//   newPendingTransactions    a transaction entered the mempool (a hash; the page then asks for the transaction itself)
// From the pending transactions the page keeps a pool (core/mempool.js) and guesses the next block (see projectNow).
// If the WebSocket is down, new blocks are looked for by polling.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const E = (Explorer.ethereum = Explorer.ethereum || {});
  const cfg = () => Explorer.chain.config;

  const pool = E.mempool.create(Explorer.chain.config.pool);
  let handlers = {};
  let connected = false;
  let heads = null, pendingSub = null;     // subscription ids
  let tipHeight = 0, gasLimit = cfg().gasLimit;
  const queued = new Set();                // hashes announced, not fetched yet
  let feedBatch = [];                      // pending transactions for the feed, not delivered yet
  let packedIds = null;                    // ids of the towers of the last projection sent
  let needSnapshot = true, dirty = false;
  let blockChain = Promise.resolve();      // blocks are handled one after the other, in order
  const mined = new Set();                 // hashes of the transactions of the latest blocks: one announced or fetched late is not pending any more
  let fetching = false;                    // a batch of pending transactions is being fetched

  // ----- blocks -----

  /** The base fee of the next block and the room it has are known from the latest block seen. */
  function noteTip(block) {
    if (block.height < tipHeight) return;
    if (tipHeight && block.height > tipHeight + 1) { // blocks were missed (socket down, a failed read): what they mined is still in the pool
      pool.clear();
      needSnapshot = true;
    }
    tipHeight = block.height;
    gasLimit = block.gasLimit;
    if (block.baseFeeWei != null) pool.setBase(E.blocks.nextBaseFee(block.baseFeeWei, block.gasUsed, block.gasLimit));
    dirty = true;
  }

  /** A new head: fetch the block with its transactions (kept for the scene), drop what it mined from the pool, tell the engine. */
  function onHead(head) {
    blockChain = blockChain.then(async () => {
      try {
        const { block, rows } = await E.data.rowsOf({ id: head.hash });
        if (block.height >= tipHeight) pool.dropMined(rows);
        rows.forEach((r) => mined.add(r.hash));
        if (mined.size > 6000) for (const h of [...mined].slice(0, mined.size - 4000)) mined.delete(h); // about 30 blocks
        noteTip(block);
        needSnapshot = true;
        handlers.onBlock?.(block);
      } catch (e) {
        console.warn('new block', e);
        pool.clear(); // what this block mined cannot be told apart from what still waits: the pool fills up again
        needSnapshot = true;
        dirty = true;
        setTimeout(() => handlers.onOpen?.(), 2000); // let the engine backfill the list
      }
    });
  }

  // ----- pending transactions -----

  function ingest(tx) {
    if (!tx || !tx.hash || tx.blockNumber || mined.has(tx.hash)) return; // already mined
    if (!tipHeight) return; // no block seen yet: the base fee is unknown, a price would be the maximum fee, not what it would pay
    const p = E.txs.pending(tx);
    if (pool.add(p) === 'dup') return;
    feedBatch.push(E.txs.feedItem(p, pool.base()));
    dirty = true;
  }

  function onAnnounced(result) {
    if (typeof result === 'string') {
      if (!pool.has(result) && !mined.has(result)) queued.add(result);
      if (queued.size > 1000) for (const h of [...queued].slice(0, 500)) queued.delete(h); // overloaded: keep the newest
    } else ingest(result); // a node that sends the whole transaction
  }

  async function fetchQueued() {
    const take = Math.max(1, Math.round((cfg().pending.fetchPerSec * cfg().pending.tickMs) / 1000));
    const hashes = fetching ? [] : [...queued].slice(-take); // the newest; none while the previous batch is still out (a slow node must not pile up requests)
    hashes.forEach((h) => queued.delete(h));
    if (hashes.length) {
      fetching = true;
      try { (await E.rpc.batch(hashes.map((h) => ['eth_getTransactionByHash', [h]]))).forEach((tx) => { if (tx && !(tx instanceof Error)) ingest(tx); }); }
      catch (e) { console.warn('pending transactions', e); }
      finally { fetching = false; }
    }
    if (feedBatch.length) { const out = feedBatch; feedBatch = []; handlers.onTransactions?.(out); }
  }

  // ----- the next block -----

  /** The guess of the next block: the best paying pending transactions that fit, sent as a snapshot or as changes since the last one. */
  function projectNow() {
    if (!dirty && !needSnapshot) return;
    dirty = false;
    pool.prune(Date.now());
    const packed = pool.pack(gasLimit);
    const ids = new Set(packed.towers.map((t) => t.txid));
    if (needSnapshot || !packedIds) {
      handlers.onProjected?.({ snapshot: packed.towers });
      needSnapshot = false;
    } else {
      const added = packed.towers.filter((t) => !packedIds.has(t.txid));
      const removed = [...packedIds].filter((id) => !ids.has(id));
      if (added.length || removed.length) handlers.onProjected?.({ added, removed });
    }
    packedIds = ids;
    const baseWei = pool.base();
    handlers.onUpcoming?.([{
      nTx: packed.nTx, gas: packed.gas, gasLimit, waiting: packed.waiting,
      baseFee: baseWei == null ? null : E.format.weiToGwei(baseWei),
      medianPrice: E.mempool.median(packed.prices),
      priceRange: packed.prices.length ? [packed.prices[0], packed.prices.at(-1)] : null,
      tips: Number(packed.tips) / 1e18,
    }]);
  }

  /** The engine asks for the next block again (after every mined block): a full snapshot. */
  function trackNext() {
    needSnapshot = true;
    projectNow();
  }

  // ----- the connection -----

  function onOpen(send, ctl) {
    heads = pendingSub = null;
    send({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['newHeads'] });
    send({ jsonrpc: '2.0', id: 2, method: 'eth_subscribe', params: ['newPendingTransactions', true] }); // whole transactions, if the node can
  }

  function onMessage(msg, ctl) {
    if (msg.id === 1) {
      if (msg.error) return ctl.close();
      heads = msg.result;
      ctl.ready();
      connected = true;
      handlers.onStatus?.(true);
      handlers.onOpen?.();
      trackNext();
    } else if (msg.id === 2) {
      if (msg.error) ctl.send({ jsonrpc: '2.0', id: 3, method: 'eth_subscribe', params: ['newPendingTransactions'] }); // hashes only
      else pendingSub = msg.result;
    } else if (msg.id === 3) {
      if (!msg.error) pendingSub = msg.result;
    } else if (msg.method === 'eth_subscription' && msg.params) {
      const { subscription, result } = msg.params;
      if (subscription === heads) onHead(result);
      else if (subscription === pendingSub) onAnnounced(result);
    }
  }

  function onClose() {
    if (connected) handlers.onStatus?.(false);
    connected = false;
  }

  /** No WebSocket: look for a new block now and then. */
  async function poll() {
    if (connected || document.hidden) return;
    try {
      const n = Number(E.format.big(await E.rpc.call('eth_blockNumber')));
      if (tipHeight && n > tipHeight) {
        const head = await E.rpc.call('eth_getBlockByNumber', [E.data.hex(n), false]);
        if (head) onHead(head);
      }
    } catch (e) { console.warn('poll', e); }
  }

  E.live = {
    pool, noteTip,
    connect(h) {
      handlers = h;
      Explorer.jsonrpc.socket({ urls: () => cfg().ws, staleMs: cfg().wsStaleMs, onOpen, onMessage, onClose });
      setInterval(fetchQueued, cfg().pending.tickMs);
      setInterval(projectNow, cfg().projectMs);
      setInterval(poll, cfg().pollMs);
    },
    trackNext,
  };
})();
