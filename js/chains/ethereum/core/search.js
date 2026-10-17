// What the search box text means for Ethereum. Pure.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const E = (Explorer.ethereum = Explorer.ethereum || {});

  /**
   * -> { type: 'height', height } | { type: 'hash', hash } (a block or a transaction: both are 32 bytes, the page tries the
   * transaction first) | { type: 'address', address } | { type: 'name', name } (ENS, *.eth) | { type: 'unknown' }
   */
  function classify(text) {
    const q = text.trim().replace(/^#/, '');
    if (/^[\d,]+$/.test(q) && /\d/.test(q)) {
      const height = Number(q.replace(/,/g, ''));
      return Number.isSafeInteger(height) ? { type: 'height', height } : { type: 'unknown' };
    }
    if (/^(0x)?[0-9a-f]{64}$/i.test(q)) return { type: 'hash', hash: `0x${q.replace(/^0x/i, '').toLowerCase()}` };
    if (/^0x[0-9a-f]{40}$/i.test(q)) return { type: 'address', address: q.toLowerCase(), checksumOk: E.address.checksumOk(q) };
    if (/^([a-z0-9-]+\.)+eth$/i.test(q)) return { type: 'name', name: q.toLowerCase() };
    return { type: 'unknown' };
  }

  E.search = { classify };
})();
