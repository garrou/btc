// The pool of pending transactions the page has seen, and the guess of the next block built from it. Pure (time is passed in).
// A public node does not give the mempool: the page sees the transactions its node announces, so this is a sample.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const E = (Explorer.ethereum = Explorer.ethereum || {});
  const { weiToGwei } = E.format;

  function create({ max = 4000, ttlMs = 20 * 60e3 } = {}) {
    const byHash = new Map();
    const bySlot = new Map();   // "from:nonce" -> hash: a sender has one transaction per nonce, a newer one replaces it
    const bySender = new Map(); // from -> Set(hash)
    let baseWei = null;         // base fee of the next block

    const slot = (p) => `${p.from}:${p.nonce}`;

    function remove(hash) {
      const p = byHash.get(hash);
      if (!p) return false;
      byHash.delete(hash);
      if (bySlot.get(slot(p)) === hash) bySlot.delete(slot(p));
      const set = bySender.get(p.from);
      if (set) { set.delete(hash); if (!set.size) bySender.delete(p.from); }
      return true;
    }

    const tipOf = (p) => {
      const price = E.txs.pendingPrice(p, baseWei);
      return price === null ? null : (baseWei == null ? price : price - baseWei);
    };

    return {
      setBase(wei) { baseWei = wei; },
      base: () => baseWei,
      has: (hash) => byHash.has(hash),
      get: (hash) => byHash.get(hash),
      size: () => byHash.size,

      /** Adds a pending transaction. Returns 'dup' (already here), 'replaced' (it took the place of the same sender's same nonce) or 'new'. */
      add(p) {
        if (byHash.has(p.hash)) return 'dup';
        const old = bySlot.get(slot(p));
        if (old) {
          const o = byHash.get(old);
          if (p.maxFee <= o.maxFee && p.maxPriority <= o.maxPriority) return 'dup'; // not a bump: the older version of the transaction, announced late
          remove(old);
        }
        byHash.set(p.hash, p);
        bySlot.set(slot(p), p.hash);
        if (!bySender.has(p.from)) bySender.set(p.from, new Set());
        bySender.get(p.from).add(p.hash);
        if (byHash.size > max) { // full: the cheapest and oldest go first
          let worst = null;
          for (const q of byHash.values()) if (!worst || q.maxFee < worst.maxFee || (q.maxFee === worst.maxFee && q.seen < worst.seen)) worst = q;
          remove(worst.hash);
          if (worst.hash === p.hash) return 'dup'; // the newcomer was the cheapest: it is not kept
        }
        return old ? 'replaced' : 'new';
      },

      remove,

      /** Forgets everything (blocks were missed: what they mined cannot be told apart from what still waits). */
      clear() { byHash.clear(); bySlot.clear(); bySender.clear(); },

      /** A block was mined: its transactions leave the pool, and so does anything the same senders sent with a nonce they have used up. */
      dropMined(rows) {
        let dropped = 0;
        for (const r of rows) {
          if (remove(r.hash)) dropped++;
          for (const hash of [...(bySender.get(r.from) ?? [])]) {
            if (byHash.get(hash).nonce <= r.nonce && remove(hash)) dropped++;
          }
        }
        return dropped;
      },

      /** Forgets what has waited too long (dropped by the network without a trace). */
      prune(now) {
        for (const p of [...byHash.values()]) if (now - p.seen > ttlMs) remove(p.hash);
      },

      /** The pending transactions of an address (sent or received), newest first. */
      involving(address) {
        const a = address.toLowerCase();
        return [...byHash.values()].filter((p) => p.from === a || p.to === a).sort((x, y) => y.seen - x.seen);
      },

      /**
       * The block a builder would likely make: the transactions that can pay the base fee, best tip first, as many as fit in
       * `gasLimit`. Returns { towers (in that order), nTx, gas, prices: sorted gwei list, tips: total tips in wei }.
       */
      pack(gasLimit) {
        const ready = [];
        for (const p of byHash.values()) {
          const tip = tipOf(p);
          if (tip !== null) ready.push([tip, p]);
        }
        ready.sort((a, b) => (a[0] === b[0] ? a[1].seen - b[1].seen : a[0] > b[0] ? -1 : 1));
        const towers = [], prices = [];
        let gas = 0, tips = 0n;
        for (const [tip, p] of ready) {
          if (gasLimit - gas < 21000) break;
          if (gas + p.gas > gasLimit) continue; // too big for what is left: a smaller one may still fit
          const t = E.txs.pendingTower(p, baseWei);
          towers.push(t);
          prices.push(t.rate);
          gas += p.gas;
          tips += tip * BigInt(p.gas);
        }
        return { towers, nTx: towers.length, gas, prices: prices.slice().sort((a, b) => a - b), tips, waiting: byHash.size - towers.length };
      },
    };
  }

  /** Median of a sorted list (undefined when empty). */
  const median = (sorted) => (sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : undefined);

  E.mempool = { create, median, weiToGwei };
})();
