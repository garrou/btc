// Refreshes the network statistics bar.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  Explorer.bitcoin = Explorer.bitcoin || {};

  let last = 0, running = false, dayAt = 0, dayRunning = false;

  async function refresh() {
    if (running || document.hidden) return; // a slow API must not pile up requests; nobody looks at a hidden tab
    running = true;
    last = Date.now();
    try {
      const [hr, adj] = await Promise.allSettled([Explorer.bitcoin.api.hashrate3d(), Explorer.bitcoin.api.difficultyAdjustment()]);
      if (hr.status === 'fulfilled') Explorer.ui.statsBar.renderHashrate(Explorer.bitcoin.stats.fromHashrate(hr.value));
      else console.warn('hashrate', hr.reason);
      if (adj.status === 'fulfilled') Explorer.ui.statsBar.renderAdjustment(Explorer.bitcoin.stats.fromAdjustment(adj.value));
      else console.warn('difficulty adjustment', adj.reason);
    } finally { running = false; }
    refreshDay();
  }

  /** Counts the transactions of the last 24 hours: the blocks the page holds, and as many older pages as it takes to reach back a day. */
  async function refreshDay() {
    const cfg = Explorer.chain.config.stats;
    if (dayRunning || document.hidden || Date.now() - dayAt < cfg.dayRefreshMs) return;
    const held = Explorer.nav.liveBlocks();
    if (!held.length) return;
    dayRunning = true;
    try {
      const now = Math.floor(Date.now() / 1000), blocks = held.slice();
      for (let pages = 0; blocks.at(-1).timestamp > now - 86400 && blocks.at(-1).height > 0 && pages < cfg.dayPagesMax; pages++) {
        const older = await Explorer.bitcoin.api.blocksFrom(blocks.at(-1).height - 1);
        if (!Array.isArray(older) || !older.length) break;
        blocks.push(...older);
      }
      const day = Explorer.bitcoin.stats.txPerDay(blocks, now);
      Explorer.ui.statsBar.renderDay({
        value: Explorer.format.number(day.count),
        sub: `last 24 h · ${Explorer.format.number(day.blocks)} blocks${day.complete ? '' : ' (not a whole day yet)'}`,
      });
      if (day.complete) dayAt = Date.now(); // an incomplete count is tried again at the next refresh
    } catch (e) { console.warn('transactions per day', e); } finally { dayRunning = false; }
  }

  /** Refreshes unless it was done very recently. */
  function maybeRefresh() { if (Date.now() - last > Explorer.chain.config.stats.minGapMs) refresh(); }

  Explorer.bitcoin.statsCtl = { refresh, maybeRefresh, refreshDay };
})();
