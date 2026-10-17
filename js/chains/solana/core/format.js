// How Solana amounts, prices and compute are written. Pure.
// 1 SOL = 1e9 lamports. Balances stay Numbers: a Number holds a lamport exactly up to ~9 million SOL, beyond that the
// last digits are rounded (which no screen of this page shows).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const S = (Explorer.solana = Explorer.solana || {});

  /** Lamports -> "1.5 SOL": at most maxFrac decimals, trailing zeros trimmed; a tiny non-zero amount reads "<0.000001 SOL". */
  function sol(lamports, maxFrac = 6) {
    if (lamports == null || !Number.isFinite(lamports)) return '—';
    const v = lamports / 1e9, a = Math.abs(v);
    if (a !== 0 && a < 10 ** -maxFrac) return `${v < 0 ? '-' : ''}<${(10 ** -maxFrac).toFixed(maxFrac)} SOL`;
    const text = a.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: maxFrac });
    return `${v < 0 ? '-' : ''}${text} SOL`;
  }

  const solSigned = (lamports, maxFrac = 6) => `${lamports < 0 ? '' : '+'}${sol(lamports, maxFrac)}`;

  /** A priority fee in lamports, short: "850", "12k", "3.4M". */
  function price(r) {
    if (!Number.isFinite(r)) return '—';
    if (r < 1) return '0';
    if (r < 1000) return String(Math.round(r));
    if (r < 1e6) return `${+(r / 1e3).toFixed(r < 1e4 ? 1 : 0)}k`;
    return `${+(r / 1e6).toFixed(1)}M`;
  }

  /** Compute units: "150,000", and "48.2M" for millions. */
  const cu = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : Explorer.format.number(n));

  /** A BigInt with decimals -> "1,234.5678" (at most maxFrac decimals, trailing zeros trimmed): token amounts without float errors. */
  function units(value, decimals, maxFrac = 6) {
    const neg = value < 0n, v = neg ? -value : value;
    const base = 10n ** BigInt(decimals);
    const frac = (v % base).toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '');
    return `${neg ? '-' : ''}${(v / base).toLocaleString('en-US')}${frac ? `.${frac}` : ''}`;
  }

  S.format = { sol, solSigned, price, cu, units };
})();
