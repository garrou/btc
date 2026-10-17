// Bitcoin's way of writing amounts and fee rates. Pure. It extends the engine's Explorer.format (core/format.js).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const { fixed } = Explorer.format;

  /** Amount in satoshis as "0.5 BTC" (trailing zeros trimmed). */
  const btc = (sats) => (sats / 1e8).toFixed(8).replace(/\.?0+$/, '') + ' BTC';

  Object.assign(Explorer.format, {
    btc,
    /** Change of a balance, in satoshis, as "+0.5 BTC" / "-0.1 BTC". */
    btcSigned: (sats) => `${sats < 0 ? '-' : '+'}${btc(Math.abs(sats))}`,
    /** Fee rate in sat/vB with the decimals it needs: "0.96" below 1 (the relay floor is 0.1), "2.4" below 10, "27" above. */
    rate(r) {
      if (!Number.isFinite(r)) return '—';
      if (r === 0) return '0';
      if (r < 0.01) return '<0.01';
      if (r < 1) return fixed(r, 2);
      return r < 10 ? fixed(r, 1) : fixed(r, 0);
    },
  });
})();
