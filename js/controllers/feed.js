// The live transaction feed: several sources feed the same stream (deduplicated by txid):
//   1. the chain's list of recent transactions (polled every second)
//   2. transactions entering the next block (pushed by the chain: live.onProjected)
//   3. transactions the chain pushes as they enter the mempool (live.onTransactions / onTxids)
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});

  const feed = Explorer.feed.create();

  /** New transactions: queued for the list, and shown as falling cubes in the scene (unless the projected block animates them). */
  function ingest(list) {
    const stream = feed.push(list, (txid) => Explorer.sceneSync.isProjected(txid));
    Explorer.sceneSync.stream(stream);
  }

  /** Renders the pending transactions (unless paused) and the counter. */
  function flush() {
    Explorer.ui.feed.setCounter(feed.stats());
    if (Explorer.ui.feed.isPaused()) return;
    const batch = feed.drain();
    if (batch.length) Explorer.ui.feed.prepend(batch);
  }

  let polling = false;
  async function poll() {
    if (polling || document.hidden) return; // a slow API must not pile up requests; nobody looks at a hidden tab
    polling = true;
    try {
      ingest((await Explorer.chain.data.recentTxs()).slice().reverse()); // oldest first: the newest ends on top
    } catch (e) { console.warn('recent', e); } finally { polling = false; }
  }

  Explorer.feedCtl = { ingest, flush, poll };
})();
