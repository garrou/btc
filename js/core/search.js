// Classification of the search box input. Pure.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  /**
   * "765458"      -> {type: 'height', height}
   * 64 hex digits -> {type: 'hash', blockFirst}  (a block hash starts with many zeros: try it as a block first)
   * otherwise     -> {type: 'invalid'}
   */
  function classify(query) {
    const q = String(query).trim();
    // a 64-digit string is a hash even if it only contains decimal digits: test it before the height
    if (/^[0-9a-fA-F]{64}$/.test(q)) return { type: 'hash', hash: q, blockFirst: q.startsWith('00000000') };
    if (/^\d+$/.test(q)) return { type: 'height', height: Number(q) };
    return { type: 'invalid' };
  }

  BTC.search = { classify };
})();
