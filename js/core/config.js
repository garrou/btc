// Shared constants of the engine (what is specific to a chain is in js/chains/<name>/chain.js, Explorer.chain.config).
// Every file of the app is a classic script that reads/extends the global `Explorer` namespace
// (no ES modules: the page must work when opened from disk and on any static host, without a build step).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});

  Explorer.config = Object.freeze({
    feed: {
      maxRows: 200,         // rows kept in the feed
      pollMs: 1000,         // the feed source returns only a few transactions per call (Bitcoin: ~10): poll it often so none are missed
      flushMs: 300,         // feed render interval (batches arrivals)
      maxBuffered: 1000,    // arrivals kept while the feed is paused
      seenMax: 20000,       // dedup memory: above this, the oldest ids are forgotten...
      seenKeep: 15000,      // ...down to this many
      rateWindowMs: 10000,  // window of the tx/s counter
    },
    scene: {
      nextId: 'next',       // id of the "next block" slot
      reach: 6,             // blocks on each side of the camera that exist in 3D: the chain slides with it, farther ones are lost in the fog
      detailRadius: 4,      // blocks within this many slots of the camera are loaded in detail (farther ones fade into the fog)
      cache: 48,            // mined blocks whose contents stay in memory: they never change, so each is downloaded once
      loads: 3,             // simultaneous block downloads (the block nearest to the camera goes first)
      loadTimeoutMs: 20000, // a download that takes longer frees its slot and is retried
      size: 40,             // side of a block's platform
      pitch: 60,            // distance between two blocks
      frameH: 16,           // height of the cage
      projectedThrottleMs: 2500, // minimum delay between two rebuilds of the projected block
      retryMs: 8000,        // retry delay while a block only has provisional data
      maxRetry: 8,
    },
    // Layout order of the towers: 'txid' = by transaction id (neutral, stable), 'api' = order given by the chain's API
    // (Bitcoin: already sorted by fee rate), 'size' = largest first (squarer shapes, reshuffles on every change)
    orders: ['txid', 'api', 'size'],
    defaultOrder: 'txid',
    // How the projected next block keeps its towers: 'stable' = they stay where they are and newcomers take free room,
    // 'compact' = the whole block is laid out again at every update (tighter, but the towers move)
    placements: ['stable', 'compact'],
    defaultPlacement: 'stable',
  });
})();
