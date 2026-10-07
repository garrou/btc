// The live transaction feed: several sources feed the same stream (deduplicated by txid):
//   1. /mempool/recent (polled every second)
//   2. transactions entering the next block (WebSocket, track-mempool-block)
//   3. if the server sends them: 'transactions' / 'mempool-txids' (formats not verified live)
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  const feed = BTC.feed.create();

  /** New transactions: queued for the list, and shown as falling cubes in the scene (unless the projected block animates them). */
  function ingest(list) {
    const stream = feed.push(list, (txid) => BTC.sceneSync.isProjected(txid));
    BTC.sceneSync.stream(stream);
  }

  /** Renders the pending transactions (unless paused) and the counter. */
  function flush() {
    BTC.ui.feed.setCounter(feed.stats());
    if (BTC.ui.feed.isPaused()) return;
    const batch = feed.drain();
    if (batch.length) BTC.ui.feed.prepend(batch);
  }

  async function poll() {
    try {
      ingest((await BTC.api.recent()).slice().reverse()); // oldest first: the newest ends on top
    } catch (e) { console.warn('recent', e); }
  }

  BTC.feedCtl = { ingest, flush, poll };
})();
