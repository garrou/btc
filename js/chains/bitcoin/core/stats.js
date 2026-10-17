// Network statistics from the mempool.space payloads. Pure: numbers in, a plain model out (formatting is the view's job).
// There is no public measurement of the network's power draw: consumption is an ESTIMATE = hashrate x an assumed
// average fleet efficiency (J/TH).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  Explorer.bitcoin = Explorer.bitcoin || {};

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  /** hashrate payload (/v1/mining/hashrate/3d) -> {hashrate (H/s), difficulty, powerGW, twhPerYear} (null when unknown). */
  function fromHashrate(hr, jPerTh = Explorer.chain.config.stats.jPerTh) {
    const series = (hr.hashrates || []).map((p) => num(p.avgHashrate)).filter((v) => v != null);
    const hashrate = num(hr.currentHashrate) ?? series.at(-1) ?? null;
    const difficulty = num(hr.currentDifficulty) ?? num(hr.difficulty?.at?.(-1)?.difficulty);
    const powerGW = hashrate ? ((hashrate / 1e12) * jPerTh) / 1e9 : null; // TH/s x J/TH = W
    return { hashrate, difficulty, powerGW, twhPerYear: powerGW != null ? powerGW * 8.76 : null, jPerTh };
  }

  /** difficulty adjustment payload -> {change (%), progress (%), remainingMs, remainingBlocks, previous (%)}. */
  function fromAdjustment(a) {
    return {
      change: num(a.difficultyChange),
      progress: num(a.progressPercent),
      remainingMs: num(a.remainingTime),
      remainingBlocks: num(a.remainingBlocks),
      previous: num(a.previousRetarget),
    };
  }

  /**
   * The transactions of the last 24 hours, from the blocks (newest first, with `timestamp` and `tx_count`): the sum over the blocks
   * mined in the last 86,400 s before `nowSec`. complete: false when the blocks do not reach back a whole day (the figure is then low).
   */
  function txPerDay(blocks, nowSec) {
    const since = nowSec - 86400, day = blocks.filter((b) => b.timestamp > since);
    return { count: day.reduce((s, b) => s + (b.tx_count || 0), 0), blocks: day.length, complete: blocks.some((b) => b.timestamp <= since) };
  }

  Explorer.bitcoin.stats = { fromHashrate, fromAdjustment, txPerDay };
})();
