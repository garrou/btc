// Network statistics from the mempool.space payloads. Pure: numbers in, a plain model out (formatting is the view's job).
// There is no public measurement of the network's power draw: consumption is an ESTIMATE = hashrate x an assumed
// average fleet efficiency (J/TH).
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  /** hashrate payload (/v1/mining/hashrate/3d) -> {hashrate (H/s), difficulty, powerGW, twhPerYear} (null when unknown). */
  function fromHashrate(hr, jPerTh = BTC.config.stats.jPerTh) {
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

  BTC.stats = { fromHashrate, fromAdjustment };
})();
