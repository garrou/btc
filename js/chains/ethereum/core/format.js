// How Ethereum amounts, prices and gas are written. Pure. Amounts are BigInts in wei (1 ETH = 1e18 wei: far beyond what a
// Number holds exactly); prices are Numbers in gwei (1 gwei = 1e9 wei = 1e-9 ETH).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const E = (Explorer.ethereum = Explorer.ethereum || {});

  /** A "0x..." quantity (or a Number, or nothing) -> BigInt. */
  const big = (q) => {
    if (typeof q === 'bigint') return q;
    if (q == null || q === '0x' || q === '') return 0n;
    return BigInt(q);
  };

  /** BigInt with decimals -> "1,234.5678": at most maxFrac decimals (truncated), trailing zeros trimmed. */
  function units(value, decimals, maxFrac) {
    const neg = value < 0n, v = neg ? -value : value;
    const base = 10n ** BigInt(decimals);
    const whole = v / base;
    let frac = (v % base).toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '');
    return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${frac ? `.${frac}` : ''}`;
  }

  /** Wei -> "0.5 ETH". A tiny, non-zero amount reads "<0.000001 ETH" rather than "0 ETH". */
  function eth(wei, maxFrac = 6) {
    const v = big(wei);
    if (v !== 0n && (v < 0n ? -v : v) < 10n ** BigInt(18 - maxFrac)) return `${v < 0n ? '-' : ''}<0.${'0'.repeat(maxFrac - 1)}1 ETH`;
    return `${units(v, 18, maxFrac)} ETH`;
  }

  /** Change of a balance, in wei, as "+0.5 ETH" / "-0.1 ETH". */
  const ethSigned = (wei, maxFrac = 6) => `${big(wei) < 0n ? '' : '+'}${eth(wei, maxFrac)}`;

  /** Price in gwei with the decimals it needs: "0.031", "1.25", "12.4", "130". */
  function gwei(g) {
    if (!Number.isFinite(g)) return '—';
    if (g === 0) return '0';
    const a = Math.abs(g);
    if (a < 0.001) return '<0.001';
    if (a < 0.1) return g.toFixed(3);
    if (a < 10) return g.toFixed(2);
    if (a < 100) return g.toFixed(1);
    return g.toFixed(0);
  }

  /** Wei (BigInt) -> gwei as a Number. */
  const weiToGwei = (wei) => Number(big(wei)) / 1e9;

  /** Gas: "21,000", and "12.3M" for millions. */
  const gas = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : Explorer.format.number(n));

  E.format = { big, units, eth, ethSigned, gwei, weiToGwei, gas };
})();
