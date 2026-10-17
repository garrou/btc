// The XRP Ledger, as the engine sees it (see the contract in js/core/chain.js): its numbers, its words, its data, its screens.
//
// How the XRP Ledger maps to the engine's ideas:
//   block        a ledger. One closes every 3 to 5 seconds and, once validated, is final: no forks, so every ledger is shown
//   tower        a transaction. Its COLOR says what it is (a payment, an order of the exchange, a trust line, an AMM pool, an
//                NFT...; red when it failed), its footprint how many ledger objects it touched (the AffectedNodes of its metadata),
//                its height how far its fee is above the reference fee. The fee is 10 drops for nearly everybody, so towers are
//                flat; a spike is someone who paid more. See core/txs.js
//   full block   there is no limit to a ledger's size, only a number of transactions the servers expect before the fee rises
//                (about 2,000). capacity.size is a scale tuned to ordinary ledgers (about 100 transactions of 6 objects each)
//   next block   none: no mempool can be read, so there is no "next" slot and no pending transaction
// The page talks to the servers over ONE WebSocket (data/ws.js), which carries the commands as well as the ledgers that close.
//
// Loaded before the engine files that read Explorer.chain at load time (core/colors.js).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const X = (Explorer.xrp = Explorer.xrp || {});
  const F = () => Explorer.format;
  const XF = () => X.format;

  // The kinds of transaction, with the color of each: here because the legend below needs them while this file loads (core/txs.js
  // uses them to color the towers). `failed` is not a type: a transaction charged its fee that did nothing (result "tec...").
  const KINDS = X.kinds = {
    payment: { label: 'Payment', color: 0x00aae4 },
    dex: { label: 'Exchange order', color: 0xf7b955 },
    trust: { label: 'Trust line', color: 0x8bd450 },
    amm: { label: 'AMM pool', color: 0xc77dff },
    nft: { label: 'NFT', color: 0xff6b9a },
    other: { label: 'Other', color: 0x9aa3b5 },
    failed: { label: 'Failed', color: 0xe5484d },
  };

  Explorer.defineChain({
    id: 'xrp',
    name: 'XRP Ledger',

    // Constants only the XRP files read (Explorer.chain.config.*)
    config: {
      // public servers (WebSocket), tried in this order; change them to use your own
      ws: ['wss://xrplcluster.com', 'wss://s1.ripple.com', 'wss://s2.ripple.com'],
      rpcTimeoutMs: 20000,
      baseFee: 10,                                    // the reference fee, in drops: a tower's rate is its fee in multiples of it
      pageSize: 15,                                   // ledgers per request of the list
      txRef: 300,                                     // a busy ledger, in transactions: what the card's fill bar is relative to
      maxCatchUp: 4,                                  // ledgers the page may be behind before it asks the engine to reload the list
      wsStaleMs: 25000,                               // a WebSocket that says nothing for this long is dropped and opened again (a ledger every ~4 s)
      feedPerBlock: 12,                               // transactions of each new ledger that go to the feed
      stats: { refreshMs: 15000, localMs: 2000, dayMs: 600000, daySamples: 36 }, // the statistics bar: asked of the server / redrawn from what is held; the transactions of a day estimated every dayMs from daySamples ledgers
      historyShown: 12,                               // transactions listed on an account page
    },

    // The blue of the XRP Ledger (on the dark page)
    theme: { accent: 0x00aae4 },

    nextBlock: false,

    // ----- numbers -----
    capacity: { size: 2000 },                         // ledger objects touched by a ledger that fills the platform (see above)
    // The rate is the fee in multiples of the reference fee: 1 for almost everybody, up to 1000 for the rare very high bid.
    // Heights follow log(1 + rate): flat at the minimum, a spike when someone paid more. (The colors say the kind of
    // transaction, see `legend`: these stops only color the light shape of a far ledger.)
    rates: {
      unit: '× the reference fee', min: 1, max: 1000, heightScale: 'log1p',
      stops: [[1, 0x1f4a5e], [10, 0x00aae4], [100, 0xffd166], [1000, 0xff5c8a]],
      ticks: [1, 10, 100, 1000],
      label: (r) => XF().times(r),
    },
    legend: {
      items: Object.values(KINDS).map(({ label, color }) => ({ label, color })),
    },
    fill: (b) => X.blocks.fill(b),
    typicalRate: () => undefined,

    // ----- words -----
    blockCard: (b) => ({
      title: `#${F().number(b.height)}`,
      lines: [`${F().number(b.tx_count)} tx`, b.closedIn != null ? `closed after ${b.closedIn} s` : '—'],
      fill: X.blocks.fill(b),
    }),

    blockLine: (b) => `${F().number(b.tx_count)} transactions${b.closedIn != null ? ` · closed ${b.closedIn} s after the previous ledger` : ''} · ${F().date(b.timestamp)}`,

    // t: a feed item of the newest ledger (see core/txs.js)
    feedRow: (t) => ({
      amount: t.moved != null ? XF().amount(t.moved, 4) : t.label,
      rate: `${t.label} · fee ${XF().times(t.rate)}`,
    }),

    describeTower(t) {
      const f = F(), x = XF();
      const lines = [
        f.short(t.txid, 12, 8),
        `${t.label}${t.ok ? '' : ` · FAILED (${t.result})`}`,
        `fee ${f.number(t.fee)} drops (${x.times(t.rate)} the reference fee)`,
        `touches ${f.number(t.nodes)} ledger objects`,
        t.moved != null ? `moves ${x.amount(t.moved, 5)}` : null,
      ];
      return lines.filter(Boolean).join('\n');
    },

    // ----- data (WebSocket commands: chains/xrp/data/blocks.js) -----
    data: {
      latestBlocks: () => X.data.latestBlocks(),
      blocksFrom: (height) => X.data.blocksFrom(height),
      heightOf: (hash) => X.data.heightOf(hash),
      hashOf: (height) => X.data.hashOf(height),
      blockTowers: (b) => X.data.blockTowers(b),
      recentTxs: () => X.data.recentTxs(),
    },

    // ----- live (WebSocket: chains/xrp/data/live.js) -----
    live: {
      connect: (h) => X.live.connect(h),
    },

    // ----- hooks: the XRP-only screens and features -----
    openTx: (hash) => X.details.openTx(hash),
    openBlock: (id) => X.details.openLedger(id),
    search: (text) => X.searchCtl.run(text),
    onBlock: () => X.statsCtl.refreshLocal(),
    onVisible: () => { X.statsCtl.refreshLocal(); X.statsCtl.refresh(); },

    start() {
      const d = X.details;
      Explorer.ui.detail.init({ onOpenTx: d.openTx, onOpenLedger: d.openLedger, onOpenAccount: d.openAddress });
      X.statsCtl.start();
    },
  });
})();
