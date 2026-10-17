// How XRP Ledger amounts, currencies and times are written. Pure.
// 1 XRP = 1,000,000 drops. Amounts come as strings (drops, or the value of an issued currency): a balance can reach 1e17 drops,
// more than a Number holds exactly, so drops go through BigInt.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const X = (Explorer.xrp = Explorer.xrp || {});

  const RIPPLE_EPOCH = 946684800; // the ledger counts seconds from 2000-01-01; Unix time from 1970-01-01

  /** Seconds since 2000-01-01 (the ledger's clock) -> Unix seconds. */
  const unixTime = (rippleTime) => Number(rippleTime) + RIPPLE_EPOCH;

  /** Drops -> "1.5 XRP": at most maxFrac decimals, trailing zeros trimmed; a tiny non-zero amount reads "<0.000001 XRP". */
  function xrp(drops, maxFrac = 6) {
    let v;
    try { v = BigInt(drops); } catch { return '—'; }
    const neg = v < 0n, a = neg ? -v : v;
    const whole = a / 1000000n, frac = (a % 1000000n).toString().padStart(6, '0').slice(0, maxFrac).replace(/0+$/, '');
    if (a !== 0n && whole === 0n && !frac) return `${neg ? '-' : ''}<${(10 ** -maxFrac).toFixed(maxFrac)} XRP`;
    return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${frac ? `.${frac}` : ''} XRP`;
  }

  /** A signed change in drops: "+1.5 XRP" / "-0.000012 XRP". */
  const xrpSigned = (drops, maxFrac = 6) => `${BigInt(drops) < 0n ? '' : '+'}${xrp(drops, maxFrac)}`;

  /**
   * An issued currency code: 3 characters ("USD") or 40 hex digits. A hex code that spells readable ASCII ("RLUSD" padded with
   * zeros) is shown as that text; any other is shown as its first and last digits.
   */
  function currency(code) {
    if (typeof code !== 'string') return '?';
    if (code.length !== 40) return code;
    if (!/^[0-9A-Fa-f]{40}$/.test(code)) return code;
    const bytes = code.match(/../g).map((h) => parseInt(h, 16));
    while (bytes.length && bytes[bytes.length - 1] === 0) bytes.pop();
    if (bytes.length && bytes.length <= 20 && bytes.every((b) => b >= 0x21 && b <= 0x7e)) return String.fromCharCode(...bytes);
    return `${code.slice(0, 6)}…${code.slice(-4)}`;
  }

  /** A decimal string of an issued currency, shortened: "57.74637157157556" -> "57.746372". */
  function iouValue(value, maxFrac = 6) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    if (n !== 0 && Math.abs(n) < 10 ** -maxFrac) return n.toExponential(2);
    return n.toLocaleString('en-US', { maximumFractionDigits: maxFrac });
  }

  /** Any amount of a transaction: a string is drops of XRP, an object is an issued currency ({currency, issuer, value}) or an MPT. */
  function amount(a, maxFrac = 6) {
    if (a == null) return '—';
    if (typeof a === 'string') return xrp(a, maxFrac);
    if (a.value != null && a.currency) return `${iouValue(a.value, maxFrac)} ${currency(a.currency)}`;
    if (a.value != null) return `${iouValue(a.value, maxFrac)} (token)`;
    return '—';
  }

  /** The label of a rate (a fee in multiples of the reference fee): "×1.2". */
  const times = (r) => `×${+Number(r).toFixed(r < 10 ? 1 : 0)}`;

  X.format = { RIPPLE_EPOCH, unixTime, xrp, xrpSigned, currency, iouValue, amount, times };
})();
