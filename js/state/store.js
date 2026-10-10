// The single mutable state of the app. Plain data: logic lives in core/ (pure) and controllers/ (orchestration).
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  BTC.state = {
    blocks: [],        // loaded blocks, newest first (the latest ones, or a window around a searched block when detached)
    upcoming: [],      // projected blocks from the mempool
    detached: false,   // true while browsing around a searched block: `blocks` is no longer the live list
    tip: 0,            // height of the latest known block
    follow: true,      // keep the camera on the latest block
    focusId: null,     // slot the camera is on ('next' or a block id)
    selectedId: null,  // block selected for the "details" button
  };
})();
