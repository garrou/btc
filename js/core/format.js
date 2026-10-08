// Pure formatting helpers (English locale). No DOM.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  const nf = new Intl.NumberFormat('en-US');

  /** Number with a fixed count of decimals, e.g. fixed(1234.5, 1) -> "1,234.5". */
  const fixed = (n, d = 1) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  BTC.format = {
    number: (n) => nf.format(n),
    fixed,
    /** "abcdefghij…12345678" for long strings (hashes, ids). */
    short: (s, head = 10, tail = 8) => (s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s),
    /** Amount in satoshis as "0.5 BTC" (trailing zeros trimmed). */
    btc: (sats) => (sats / 1e8).toFixed(8).replace(/\.?0+$/, '') + ' BTC',
    date: (ts) => new Date(ts * 1000).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' }),
    /** "3 min ago" for a unix timestamp (seconds). */
    ago(ts, nowMs = Date.now()) {
      const s = Math.max(0, Math.floor(nowMs / 1000 - ts));
      if (s < 60) return `${s} s ago`;
      if (s < 3600) return `${Math.floor(s / 60)} min ago`;
      if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
      return `${Math.floor(s / 86400)} d ago`;
    },
    /** Duration in milliseconds as "12 min", "5 h" or "3.2 d". */
    duration(ms) {
      const min = Math.max(0, ms) / 60000;
      if (min < 90) return `${Math.round(min)} min`;
      if (min < 48 * 60) return `${Math.round(min / 60)} h`;
      return `${fixed(min / 1440, 1)} d`;
    },
    /** Sign prefix for a signed percentage / delta. */
    signed: (n, d = 1) => `${n >= 0 ? '+' : ''}${fixed(n, d)}`,
  };
})();
