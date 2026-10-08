// The search box: a height or a block hash shows the block in the 3D scene; a transaction id opens its detail.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  async function run(query) {
    const details = BTC.details;
    const token = details.begin(); // a newer search or detail request wins
    try {
      const q = BTC.search.classify(query);
      if (q.type === 'height') return await BTC.nav.goToBlock({ height: q.height }, token);
      if (q.type === 'hash') {
        // try the likeliest kind first; only a 404 moves on to the other kind, any other error is reported as is
        for (const kind of q.blockFirst ? ['block', 'tx'] : ['tx', 'block']) {
          try {
            if (kind === 'block') return await BTC.nav.goToBlock({ hash: q.hash }, token);
            const tx = await BTC.api.tx(q.hash);
            if (details.isCurrent(token)) BTC.ui.detail.tx(tx);
            return;
          } catch (e) {
            if (e.status !== 404) throw e;
          }
        }
        throw new Error('no block or transaction with this id');
      }
      BTC.ui.detail.message('Not recognized: enter a height, a block hash or a txid (64 hex).');
    } catch (e) {
      if (details.isCurrent(token)) BTC.ui.detail.message(`Not found (${e.message})`);
    }
  }

  BTC.searchCtl = { run };
})();
