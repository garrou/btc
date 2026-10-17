// The search box: a height or a block hash shows the block in the 3D scene; a transaction id or an address opens its detail.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  Explorer.bitcoin = Explorer.bitcoin || {};

  async function run(query) {
    const token = Explorer.requests.begin(); // a newer search or detail request wins
    try {
      const q = Explorer.bitcoin.search.classify(query);
      if (q.type === 'height') return await Explorer.nav.goToBlock({ height: q.height }, token);
      if (q.type === 'hash') {
        // try the likeliest kind first; only a 404 moves on to the other kind, any other error is reported as is
        for (const kind of q.blockFirst ? ['block', 'tx'] : ['tx', 'block']) {
          try {
            if (kind === 'block') return await Explorer.nav.goToBlock({ hash: q.hash }, token);
            const tx = await Explorer.bitcoin.api.tx(q.hash);
            if (Explorer.requests.isCurrent(token)) Explorer.ui.detail.tx(tx);
            return;
          } catch (e) {
            if (e.status !== 404) throw e;
          }
        }
        throw new Error('no block or transaction with this id');
      }
      if (q.type === 'address') return await Explorer.bitcoin.details.openAddress(q.address);
      Explorer.ui.detail.message('Not recognized: enter a height, a block hash, a txid (64 hex) or an address.');
    } catch (e) {
      if (Explorer.requests.isCurrent(token)) Explorer.ui.detail.message(`Not found (${e.message})`);
    }
  }

  Explorer.bitcoin.searchCtl = { run };
})();
