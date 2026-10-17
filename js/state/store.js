// The single mutable state of the app. Plain data: logic lives in core/ (pure) and controllers/ (orchestration).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});

  Explorer.state = {
    blocks: [],        // loaded blocks, newest first (the latest ones, or a window around a searched block when detached)
    upcoming: [],      // projected blocks from the mempool
    detached: false,   // true while browsing around a searched block: `blocks` is no longer the live list
    liveBlocks: [],    // the live list while detached (kept up to date by new blocks): what statistics should read, see Explorer.nav.liveBlocks()
    tip: 0,            // height of the latest known block
    follow: true,      // keep the camera on the latest block
    focusId: null,     // slot the camera is on ('next' or a block id)
    selectedId: null,  // block selected for the "details" button
    wallet: null,      // the address a chain tracks, if it can (Bitcoin): { address, txs: its transactions, confirmedTotal, busy, failed }
  };
})();
