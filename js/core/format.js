// Pure formatting helpers (French locale). No DOM.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  const nf = new Intl.NumberFormat('fr-FR');

  /** Number with a fixed count of decimals, e.g. fixed(1234.5, 1) -> "1 234,5". */
  const fixed = (n, d = 1) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

  BTC.format = {
    number: (n) => nf.format(n),
    fixed,
    /** "abcdefghij…12345678" for long strings (hashes, ids). */
    short: (s, head = 10, tail = 8) => (s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s),
    /** Amount in satoshis as "0.5 BTC" (trailing zeros trimmed). */
    btc: (sats) => (sats / 1e8).toFixed(8).replace(/\.?0+$/, '') + ' BTC',
    date: (ts) => new Date(ts * 1000).toLocaleString('fr-FR'),
    /** "il y a 3 min" for a unix timestamp (seconds). */
    ago(ts, nowMs = Date.now()) {
      const s = Math.max(0, Math.floor(nowMs / 1000 - ts));
      if (s < 60) return `il y a ${s} s`;
      if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
      if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
      return `il y a ${Math.floor(s / 86400)} j`;
    },
    /** Duration in milliseconds as "12 min", "5 h" or "3,2 j". */
    duration(ms) {
      const min = Math.max(0, ms) / 60000;
      if (min < 90) return `${Math.round(min)} min`;
      if (min < 48 * 60) return `${Math.round(min / 60)} h`;
      return `${fixed(min / 1440, 1)} j`;
    },
    /** Sign prefix for a signed percentage / delta. */
    signed: (n, d = 1) => `${n >= 0 ? '+' : ''}${fixed(n, d)}`,
  };
})();
