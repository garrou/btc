// Refreshes the statistics bar: the base fee, how full the blocks are, what they burn, how far finality is.
// Most of it is computed from the blocks the page already holds; only finality asks the node.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const E = (Explorer.ethereum = Explorer.ethereum || {});
  const F = Explorer.format;
  const X = () => E.format;

  const SLOT_S = 12;       // seconds per block
  const WINDOW = 15;       // blocks the averages cover
  let finalized = null;    // number of the latest finalized block
  let dayAt = 0, dayRunning = false;

  const sum = (list, f) => list.reduce((s, b) => s + f(b), 0);

  /** Redraws the bar from the latest blocks and the guess of the next block. */
  function refresh() {
    const blocks = Explorer.nav.liveBlocks().slice(0, WINDOW); // the latest blocks, even while the view shows an old searched block
    const last = blocks[0];
    if (!last) return;
    refreshDay(); // only does something when the last estimate is older than dayMs
    const x = X();

    // the base fee of the next block: known from the last one (EIP-1559), and it is what the guess uses
    const nextWei = last.baseFeeWei != null ? E.blocks.nextBaseFee(last.baseFeeWei, last.gasUsed, last.gasLimit) : null;
    if (nextWei != null) {
      const change = last.baseFee > 0 ? (x.weiToGwei(nextWei) / last.baseFee - 1) * 100 : 0;
      Explorer.ui.statsBar.renderBase({
        value: x.gwei(x.weiToGwei(nextWei)), unit: 'gwei', trend: change > 0.05 ? 'down' : change < -0.05 ? 'up' : '' /* a rising fee is bad news: red */,
        sub: `next block · ${F.signed(change)}% vs the last (max ±12.5%)`,
      });
    }

    const fill = (last.gasUsed / last.gasLimit) * 100;
    const avg = (sum(blocks, (b) => b.gasUsed / b.gasLimit) / blocks.length) * 100;
    Explorer.ui.statsBar.renderUsage({
      value: F.fixed(fill), bar: fill,
      sub: `last ${blocks.length}: ${F.fixed(avg)}% · target 50% (above it the fee rises)`,
    });

    const burnt = sum(blocks, (b) => b.burnt);
    Explorer.ui.statsBar.renderBurn({
      value: F.fixed(last.burnt, 3),
      sub: `${F.fixed(burnt, 2)} ETH over the last ${blocks.length} blocks`,
    });

    if (finalized != null) {
      const behind = Math.max(0, Explorer.state.tip - finalized);
      Explorer.ui.statsBar.renderFinality({
        value: `#${F.number(finalized)}`,
        sub: `${F.number(behind)} blocks behind · ≈ ${F.duration(behind * SLOT_S * 1000)} to be final`,
      });
    }
  }

  /** The latest finalized block: it can no longer be reverted (about 2 epochs, 13 min, behind the head). */
  async function refreshFinality() {
    try {
      const b = await E.rpc.call('eth_getBlockByNumber', ['finalized', false]);
      if (b) { finalized = Number(E.format.big(b.number)); refresh(); }
    } catch (e) { console.warn('finality', e); }
  }

  /**
   * The transactions of a day, estimated: the number of transactions of `daySamples` blocks spread over the last 24 hours, times
   * the blocks of the day. Counting them all would take 7,200 requests; the blocks vary little, so a sample is within a few percent.
   */
  function dayEstimate(counts, blocksSpan, secondsSpan) {
    const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
    return mean * blocksSpan * (86400 / secondsSpan);
  }

  async function refreshDay() {
    const cfg = Explorer.chain.config.stats;
    if (dayRunning || document.hidden || Date.now() - dayAt < cfg.dayMs) return;
    const tip = Explorer.nav.liveBlocks()[0];
    if (!tip) return;
    dayRunning = true;
    try {
      const span = Math.round(86400 / SLOT_S);                 // blocks in a day (7,200)
      const from = Math.max(1, tip.height - span);
      const heights = Array.from({ length: cfg.daySamples }, (_, i) => tip.height - Math.round((i * (tip.height - from)) / cfg.daySamples));
      const hex = (n) => E.data.hex(n);
      const res = await E.rpc.batch([['eth_getBlockByNumber', [hex(from), false]], ...heights.map((h) => ['eth_getBlockTransactionCountByNumber', [hex(h)]])]);
      const [oldest, ...counts] = res;
      const ok = counts.filter((c) => c && !(c instanceof Error)).map((c) => Number(X().big(c)));
      if (!ok.length || !oldest || oldest instanceof Error) throw new Error('the node did not answer');
      const seconds = tip.timestamp - Number(X().big(oldest.timestamp));
      const blocks = tip.height - from;
      if (!(seconds > 0)) throw new Error('no time span');
      const est = dayEstimate(ok, blocks, seconds);
      Explorer.ui.statsBar.renderDay({
        value: `≈ ${F.number(Math.round(est / 1000) * 1000)}`,
        sub: `estimated from ${F.number(ok.length)} of the last ${F.number(blocks)} blocks · ${F.fixed(seconds / 3600, 1)} h`,
      });
      dayAt = Date.now();
    } catch (e) { console.warn('transactions per day', e); } finally { dayRunning = false; }
  }

  function start() {
    refresh();
    refreshFinality();
    setInterval(refresh, Explorer.chain.config.stats.refreshMs);
    setInterval(refreshFinality, Explorer.chain.config.stats.finalityMs);
  }

  E.statsCtl = { refresh, refreshFinality, refreshDay, dayEstimate, start };
})();
