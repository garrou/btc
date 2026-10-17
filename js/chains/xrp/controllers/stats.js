// Refreshes the statistics bar: where the chain is (ledger), how many transactions per second, what the ledgers are made of, what a
// transaction costs now. Part is asked of the server (the fee), part is computed from the ledgers the page holds.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const X = (Explorer.xrp = Explorer.xrp || {});
  const F = Explorer.format;

  let fee = null;
  let dayAt = 0, dayRunning = false;

  /** Redraws what comes from the ledgers the page holds (cheap, no request). */
  function refreshLocal() {
    const blocks = Explorer.nav.liveBlocks();
    const last = blocks[0];
    const head = X.live.headIndex() || last?.height;
    if (head) Explorer.ui.statsBar.renderLedger({ value: F.number(head), sub: last ? `closed ${last.closedIn != null ? `after ${last.closedIn} s · ` : ''}${F.number(last.tx_count)} tx` : ' ' });
    if (blocks.length > 1) {
      const span = blocks[0].timestamp - blocks.at(-1).timestamp;
      const txs = blocks.slice(0, -1).reduce((s, b) => s + b.tx_count, 0); // the oldest one only marks the start of the span
      if (span > 0) Explorer.ui.statsBar.renderTps({ value: F.fixed(txs / span, 1), sub: `last ${blocks.length - 1} ledgers · a ledger every ~${F.fixed(span / (blocks.length - 1), 1)} s` });
    }
    const rows = X.data.latestRows();
    if (rows && rows.length) {
      const share = (pred) => (rows.filter(pred).length / rows.length) * 100;
      Explorer.ui.statsBar.renderMix({
        value: F.fixed(share((r) => r.type === 'Payment'), 0),
        sub: `${F.fixed(share((r) => r.kind === 'dex'), 0)}% exchange orders · ${F.fixed(share((r) => r.kind === 'failed'))}% failed`,
      });
    }
    if (fee) Explorer.ui.statsBar.renderFee(fee);
    refreshDay(); // only does something when the last estimate is older than dayMs (and once there are ledgers to measure the pace on)
  }

  /** Asks the server: what a transaction costs now, and how full the queue is. */
  async function refresh() {
    try {
      const r = await X.ws.call('fee');
      const d = r.drops ?? {}, open = Number(d.open_ledger_fee), base = Number(d.base_fee);
      fee = {
        value: F.number(open),
        sub: `reference ${F.number(base)} drops · queue ${F.number(r.current_queue_size ?? 0)} of ${F.number(r.max_queue_size ?? 0)}`,
      };
    } catch (e) { console.warn('fee', e); }
    refreshLocal();
  }

  /**
   * The transactions of a day, estimated: the transactions of `daySamples` ledgers spread over the last 24 hours, times the ledgers
   * of the day (86,400 s over the average time between two ledgers, measured on the ledgers held).
   */
  function dayEstimate(counts, closeSeconds) {
    const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
    return mean * (86400 / closeSeconds);
  }

  async function refreshDay() {
    const cfg = Explorer.chain.config.stats;
    if (dayRunning || document.hidden || Date.now() - dayAt < cfg.dayMs) return;
    const blocks = Explorer.nav.liveBlocks();
    if (blocks.length < 2) return;
    dayRunning = true;
    try {
      const closeSeconds = (blocks[0].timestamp - blocks.at(-1).timestamp) / (blocks.length - 1);
      if (!(closeSeconds > 0)) throw new Error('no close time');
      const perDay = Math.round(86400 / closeSeconds), top = blocks[0].height;
      const indexes = Array.from({ length: cfg.daySamples }, (_, i) => top - Math.round((i * perDay) / cfg.daySamples));
      const res = await Promise.allSettled(indexes.map((i) => X.data.light({ ledger_index: i })));
      const counts = res.filter((r) => r.status === 'fulfilled').map((r) => r.value.tx_count);
      if (counts.length < Math.ceil(cfg.daySamples / 2)) throw new Error('too few ledgers could be read');
      Explorer.ui.statsBar.renderDay({
        value: `≈ ${F.number(Math.round(dayEstimate(counts, closeSeconds) / 1000) * 1000)}`,
        sub: `estimated from ${F.number(counts.length)} of the last ${F.number(perDay)} ledgers`,
      });
      dayAt = Date.now();
    } catch (e) { console.warn('transactions per day', e); } finally { dayRunning = false; }
  }

  function start() {
    refreshLocal();
    refresh();
    setInterval(refreshLocal, Explorer.chain.config.stats.localMs);
    setInterval(refresh, Explorer.chain.config.stats.refreshMs);
  }

  X.statsCtl = { refresh, refreshLocal, refreshDay, dayEstimate, start };
})();
