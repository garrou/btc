// Live transaction feed model: dedup, bounded buffer, arrival rate. Pure state (time is passed in).
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  function create(cfg = BTC.config.feed) {
    const seen = new Set();
    const buffer = [];   // arrivals waiting to be displayed (oldest first)
    const stamps = [];   // arrival times (ms), for the tx/s rate
    let total = 0;

    return {
      /**
       * Adds txs ({txid, fee?, vsize?, value?}); already seen ones are ignored.
       * Returns the [{rate}] of the new txs for which `isAnimatedElsewhere(txid)` is false (they get the falling-cube effect).
       */
      push(list, isAnimatedElsewhere = () => false, now = Date.now()) {
        const stream = [];
        for (const t of list) {
          if (!t || !t.txid || seen.has(t.txid)) continue;
          if (!isAnimatedElsewhere(t.txid)) stream.push({ rate: BTC.txs.feeRate(t) });
          seen.add(t.txid);
          total++;
          stamps.push(now);
          buffer.push(t);
        }
        if (buffer.length > cfg.maxBuffered) buffer.splice(0, buffer.length - cfg.maxBuffered); // long pause: keep the most recent
        if (seen.size > cfg.seenMax) { // bounded memory: forget the oldest ids first (a Set iterates in insertion order)
          let drop = seen.size - cfg.seenKeep;
          for (const id of seen) { if (drop-- <= 0) break; seen.delete(id); }
        }
        return stream;
      },
      /** Takes the pending arrivals, newest first. */
      drain: () => buffer.splice(0).reverse(),
      /** {total, rate}: number of txs seen, and txs per second over the recent window. */
      stats(now = Date.now()) {
        while (stamps.length && now - stamps[0] > cfg.rateWindowMs) stamps.shift();
        return { total, rate: stamps.length / (cfg.rateWindowMs / 1000) };
      },
    };
  }

  BTC.feed = { create };
})();
