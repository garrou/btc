// What the search box text means for Solana. Pure.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const S = (Explorer.solana = Explorer.solana || {});

  /**
   * -> { type: 'slot', slot } | { type: 'signature', signature } | { type: 'account', address } (any 32-byte key: a wallet, a
   * program, a token mint) | { type: 'unknown' }. A block hash looks like an account: the node cannot find a block by its hash.
   */
  function classify(text) {
    const q = text.trim().replace(/^#/, '');
    if (/^[\d,]+$/.test(q) && /\d/.test(q)) {
      const slot = Number(q.replace(/,/g, ''));
      return Number.isSafeInteger(slot) ? { type: 'slot', slot } : { type: 'unknown' };
    }
    const kind = S.base58.kindOf(q);
    if (kind === 'signature') return { type: 'signature', signature: q };
    if (kind === 'key') return { type: 'account', address: q };
    return { type: 'unknown' };
  }

  S.search = { classify };
})();
