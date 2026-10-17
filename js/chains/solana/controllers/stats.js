// Refreshes the statistics bar: where the chain is (slot), how many transactions per second, what the blocks are made of,
// where the epoch is. Part is asked of the node (rate, epoch), part is computed from the blocks the page holds.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const S = (Explorer.solana = Explorer.solana || {});
  const F = Explorer.format;

  let epoch = null, perf = null;
  let dayAt = 0, dayRunning = false;

  /** Redraws what comes from the blocks the page holds (cheap, no request). */
  function refreshLocal() {
    const x = S.format;
    const head = S.live.headSlot() || Explorer.nav.liveBlocks()[0]?.slot; // the head of the chain, not the (older) block shown or searched
    if (head) Explorer.ui.statsBar.renderSlot({ value: F.number(head), sub: `a block every ~0.4 s · one in ${Explorer.chain.config.sample} shown` });
    const rows = S.data.latestRows();
    if (rows && rows.length) {
      const share = (pred) => (rows.filter(pred).length / rows.length) * 100;
      const cu = rows.reduce((s, r) => s + (r.cu ?? 0), 0);
      Explorer.ui.statsBar.renderMix({
        value: F.fixed(share((r) => r.kind === 'vote'), 0),
        sub: `votes · ${F.fixed(share((r) => !r.ok))}% failed · ${F.fixed(share((r) => r.priority > 0))}% pay a priority fee · ≈ ${x.cu(cu)} CU`,
      });
    }
    if (perf) Explorer.ui.statsBar.renderTps(perf);
    if (epoch) Explorer.ui.statsBar.renderEpoch(epoch);
  }

  /**
   * The transactions of a day, from the performance samples the node keeps (one per minute, about 12 hours at most): the rate
   * over all of them, scaled to 24 hours. Votes (most of Solana's transactions) are left out of the figure when the node tells them apart.
   */
  function dayFromSamples(samples) {
    const secs = samples.reduce((s, x) => s + (x.samplePeriodSecs || 60), 0);
    const total = samples.reduce((s, x) => s + (x.numTransactions || 0), 0);
    const hasVotes = samples.every((x) => typeof x.numNonVoteTransactions === 'number');
    const user = hasVotes ? samples.reduce((s, x) => s + x.numNonVoteTransactions, 0) : null;
    const perDay = (n) => (n / secs) * 86400;
    return { hours: secs / 3600, total: perDay(total), user: user != null ? perDay(user) : null };
  }

  async function refreshDay() {
    if (dayRunning || document.hidden || Date.now() - dayAt < Explorer.chain.config.stats.dayMs) return;
    dayRunning = true;
    try {
      const samples = await S.rpc.call('getRecentPerformanceSamples', [720]);
      if (!Array.isArray(samples) || !samples.length) throw new Error('no samples');
      const d = dayFromSamples(samples), round = (n) => Math.round(n / 1000) * 1000;
      Explorer.ui.statsBar.renderDay({
        value: `≈ ${F.number(round(d.user ?? d.total))}`,
        sub: d.user != null ? `${F.number(round(d.total))} with the votes · from the last ${F.fixed(d.hours, 1)} h` : `votes included · from the last ${F.fixed(d.hours, 1)} h`,
      });
      dayAt = Date.now();
    } catch (e) { console.warn('transactions per day', e); } finally { dayRunning = false; }
  }

  /** Asks the node: the transaction rate over the last minute, the epoch. */
  async function refresh() {
    const [samples, info] = await Promise.allSettled([S.rpc.call('getRecentPerformanceSamples', [1]), S.rpc.call('getEpochInfo', [{ commitment: 'confirmed' }])]);
    if (samples.status === 'fulfilled' && samples.value?.[0]) {
      const s = samples.value[0], secs = s.samplePeriodSecs || 60;
      const all = s.numTransactions / secs, user = s.numNonVoteTransactions != null ? s.numNonVoteTransactions / secs : null;
      perf = { value: F.number(Math.round(all)), sub: user != null ? `${F.number(Math.round(user))} without the validators' votes` : 'transactions per second, last minute' };
    } else console.warn('performance', samples.reason);
    if (info.status === 'fulfilled' && info.value) {
      const e = info.value, progress = (e.slotIndex / e.slotsInEpoch) * 100;
      const msLeft = (e.slotsInEpoch - e.slotIndex) * 400;
      epoch = { value: `#${F.number(e.epoch)}`, bar: progress, sub: `${F.fixed(progress)}% · ends in ~${F.duration(msLeft)}` };
    } else console.warn('epoch', info.reason);
    refreshLocal();
    refreshDay(); // only does something when the last count is older than dayMs
  }

  function start() {
    refreshLocal();
    refresh();
    setInterval(refreshLocal, Explorer.chain.config.stats.localMs);
    setInterval(refresh, Explorer.chain.config.stats.refreshMs);
  }

  S.statsCtl = { refresh, refreshLocal, refreshDay, dayFromSamples, start };
})();
