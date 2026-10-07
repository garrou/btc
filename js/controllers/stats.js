// Refreshes the network statistics bar.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  let last = 0;

  async function refresh() {
    last = Date.now();
    const [hr, adj] = await Promise.allSettled([BTC.api.hashrate3d(), BTC.api.difficultyAdjustment()]);
    if (hr.status === 'fulfilled') BTC.ui.statsBar.renderHashrate(BTC.stats.fromHashrate(hr.value));
    else console.warn('hashrate', hr.reason);
    if (adj.status === 'fulfilled') BTC.ui.statsBar.renderAdjustment(BTC.stats.fromAdjustment(adj.value));
    else console.warn('difficulty adjustment', adj.reason);
  }

  /** Refreshes unless it was done very recently. */
  function maybeRefresh() { if (Date.now() - last > BTC.config.stats.minGapMs) refresh(); }

  BTC.statsCtl = { refresh, maybeRefresh };
})();
