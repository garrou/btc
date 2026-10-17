// Solana, as the engine sees it (see the contract in js/core/chain.js): its numbers, its words, its data, its screens.
//
// How Solana maps to the engine's ideas:
//   block        one block out of every `sample` slots. Solana makes a block every 0.4 s; showing them all is more data than a
//                public node lets a browser read, so the page shows one in 10 (a block every 4 s). The number people know is the slot
//   tower        a transaction: its footprint is its COMPUTE UNITS (estimated: the light read of a block does not give them, see
//                core/txs.js), its height and color the PRIORITY FEE it paid, in lamports (the fee minus the base fee; see core/txs.js). The base fee (5000 lamports per
//                signature) is the same for everybody; the priority fee is what people bid to be first. Most of a block is
//                validators' votes: flat, dark, and numerous
//   next block   none: Solana has no mempool a page can read, so there is no "next" slot and no pending transaction
// There is no tracked address panel: the page draws one block in ten, so most transactions of an address would never be in a
// drawn block (a node does list the signatures of an address, see docs/ARCHITECTURE.md).
//
// Loaded before the engine files that read Explorer.chain at load time (core/colors.js).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const S = (Explorer.solana = Explorer.solana || {});
  const F = () => Explorer.format;
  const X = () => S.format;

  Explorer.defineChain({
    id: 'solana',
    name: 'Solana',

    // Constants only the Solana files read (Explorer.chain.config.*)
    config: {
      // public JSON-RPC nodes (HTTP) and their WebSockets, tried in this order; change them to use your own node
      rpc: ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'],
      ws: ['wss://solana-rpc.publicnode.com', 'wss://api.mainnet-beta.solana.com'],
      rpcTimeoutMs: 25000,
      maxTxVersion: 1,                                // newest transaction version asked of the node at first (a node that wants more says so, see data/rpc.js)
      sample: 10,                                     // one block out of this many slots is shown (a slot lasts about 0.4 s)
      pageSize: 15,                                   // blocks per request of the block list
      txRef: 3000,                                    // a busy block, in transactions: what the card's fill bar is relative to
      maxCatchUp: 4,                                  // blocks the page may be behind before it asks the engine to reload the list
      wsStaleMs: 15000,                               // a WebSocket that says nothing for this long is dropped and opened again (a slot every 0.4 s)
      pollMs: 5000,                                   // looking at the head slot when the WebSocket is down
      feedPerBlock: 12,                               // transactions of each new block that go to the feed
      stats: { refreshMs: 15000, localMs: 2000, dayMs: 600000 }, // the statistics bar: asked of the node / redrawn from what is held; the transactions of a day recounted every dayMs
      historyShown: 12,                               // transactions listed on an address page
      logLines: 40,                                   // lines of the program log shown on a transaction page
    },

    // Solana purple (the first color of the logo; the second, green, ends the color scale)
    theme: { accent: 0x9945ff },

    nextBlock: false,

    // ----- numbers -----
    capacity: { size: 60e6 },                         // compute units in a full block (the limit has been rising: 48M, 50M, 60M...)
    // Priority fees run from nothing (most transactions) to 10,000,000 lamports (0.01 SOL) and more (the bots that bid to be first),
    // on a logarithmic scale; tower heights follow the position on it. The scale goes like the logo: deep violet, Solana purple,
    // blue, then green for the highest bids. (Here the "rate" is the fee a transaction paid, not a price per unit of size.)
    rates: {
      unit: 'lamports of priority fee', min: 100, max: 1e7, heightScale: 'position',
      stops: [[100, 0x241552], [1e3, 0x4a2aa8], [1e4, 0x9945ff], [1e5, 0x4d7bff], [1e6, 0x00c2ff], [3e6, 0x14f195], [1e7, 0xe6ff8a]],
      ticks: [100, 1e3, 1e4, 1e5, 1e6, 1e7],
      label: (r) => X().price(r),
    },
    fill: (b) => S.blocks.fill(b),
    typicalRate: () => undefined,

    // ----- words -----
    blockNumber: (b) => F().number(b.slot),

    blockCard: (b) => ({
      title: `#${F().number(b.slot)}`,
      lines: [`${F().number(b.tx_count)} tx`, b.blockHeight != null ? `height ${F().number(b.blockHeight)}` : '—'],
      fill: S.blocks.fill(b),
    }),

    blockLine: (b) => `${F().number(b.tx_count)} transactions · block height ${b.blockHeight != null ? F().number(b.blockHeight) : '—'} · one block in ${Explorer.chain.config.sample} slots · ${F().date(b.timestamp)}`,

    // t: a tower of the newest block (see core/txs.js)
    feedRow: (t) => ({
      amount: t.moved > 0 ? X().sol(t.moved, 4) : '—',
      rate: t.priority > 0 ? `${X().price(t.priority)} lamports priority` : 'no priority fee',
    }),

    describeTower(t) {
      const f = F(), x = X();
      const lines = [
        f.short(t.txid, 12, 8),
        `${t.label}${t.ok ? '' : ' · FAILED'}`,
        `fee ${x.sol(t.fee, 6)}${t.priority > 0 ? ` · ${x.price(t.priority)} lamports priority` : ' · no priority fee'}`,
        `≈ ${x.cu(t.vsize)} compute units (estimated)`,
        t.moved > 0 ? `moves ${x.sol(t.moved, 5)}` : null,
      ];
      return lines.filter(Boolean).join('\n');
    },

    // ----- data (JSON-RPC: chains/solana/data/blocks.js) -----
    data: {
      latestBlocks: () => S.data.latestBlocks(),
      blocksFrom: (group) => S.data.blocksFrom(group),
      heightOf: (hash) => S.data.heightOf(hash),
      hashOf: (group) => S.data.hashOf(group),
      blockTowers: (b) => S.data.blockTowers(b),
      recentTxs: () => S.data.recentTxs(),
    },

    // ----- live (WebSocket: chains/solana/data/live.js) -----
    live: {
      connect: (h) => S.live.connect(h),
    },

    // ----- hooks: the Solana-only screens and features -----
    openTx: (sig) => S.details.openTx(sig),
    openBlock: (id) => S.details.openBlock(id),
    search: (text) => S.searchCtl.run(text),
    onBlock: () => S.statsCtl.refreshLocal(),
    onVisible: () => { S.statsCtl.refreshLocal(); S.statsCtl.refresh(); },

    start() {
      const d = S.details;
      Explorer.ui.detail.init({ onOpenTx: d.openTx, onOpenSlot: d.openSlot, onOpenAddress: d.openAddress });
      S.statsCtl.start();
    },
  });
})();
