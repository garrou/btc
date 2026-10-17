// The search box: a ledger index shows its ledger (in the 3D scene when it is one of those held, else the scene moves to it); a
// 64-digit hash is a transaction or a ledger; an address (starts with r) opens the account.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const X = (Explorer.xrp = Explorer.xrp || {});

  async function run(query) {
    const token = Explorer.requests.begin(); // a newer search or detail request wins
    try {
      const q = X.search.classify(query);
      if (q.type === 'ledger') return await Explorer.nav.goToBlock({ height: q.index }, token);
      if (q.type === 'hash') {
        // a transaction hash and a ledger hash look the same: ask for the transaction first
        try { await X.ws.call('tx', { transaction: q.hash, binary: false }); } catch (e) {
          if (e.status !== 404) throw e;
          if (!Explorer.requests.isCurrent(token)) return;
          try { return await Explorer.nav.goToBlock({ hash: q.hash }, token); }
          catch (e2) { throw e2.status === 404 ? new Error('no transaction or ledger with this hash') : e2; }
        }
        if (!Explorer.requests.isCurrent(token)) return;
        return await X.details.openTx(q.hash);
      }
      if (q.type === 'account') return await X.details.openAddress(q.address);
      Explorer.ui.detail.message('Not recognized: enter a ledger index, a transaction or ledger hash (64 hex digits) or an address (starts with r).');
    } catch (e) {
      if (Explorer.requests.isCurrent(token)) Explorer.ui.detail.message(`Not found (${e.message})`);
    }
  }

  X.searchCtl = { run };
})();
