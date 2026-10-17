// Classification of the search box input. Pure.
//   "107719394"      -> { type: 'ledger', index }      a ledger index (commas allowed)
//   64 hex digits    -> { type: 'hash', hash }         a transaction or a ledger (the hash is written in capitals)
//   "rhub8VR..."     -> { type: 'account', address }   a classic address: starts with r, 25 to 35 characters of XRP's alphabet
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const X = (Explorer.xrp = Explorer.xrp || {});

  function classify(query) {
    const q = String(query).trim();
    if (/^[0-9a-fA-F]{64}$/.test(q)) return { type: 'hash', hash: q.toUpperCase() };
    if (/^\d{1,3}(,\d{3})+$|^\d+$/.test(q)) return { type: 'ledger', index: Number(q.replace(/,/g, '')) };
    if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(q)) return { type: 'account', address: q };
    return { type: 'invalid' };
  }

  X.search = { classify };
})();
