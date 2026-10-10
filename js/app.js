// Entry point: creates the views and the optional 3D scene, connects the data sources, wires everything together.
// Layers (script order in index.html): core/ (pure logic) -> data/ (API, WebSocket) -> state/ -> scene/ (Three.js)
// -> ui/ (DOM views) -> controllers/ (orchestration) -> this file.
(() => {
  'use strict';
  const BTC = window.BTC;
  const { $ } = BTC.dom;
  const F = BTC.format;
  const { nextId } = BTC.config.scene;
  const { state, nav, details } = BTC;
  const ui = BTC.ui;

  // ----- 3D scene (optional: needs Three.js and WebGL) -----
  let scene = null;
  try {
    scene = BTC.scene3d?.create($('#scene'), {
      tooltip: $('#tip3d'),
      describe: (t) => (t.coinbase
        ? 'Coinbase (block reward)'
        : t.approx
          ? `${F.short(t.txid, 12, 8)}\n(size and fee unavailable)`
          : `${F.short(t.txid, 12, 8)}\n${t.rate.toFixed(1)} sat/vB · ${F.number(t.vsize)} vB\nfee ${F.number(t.fee)} sats`),
      onPick: (t) => details.openTx(t.txid),
      onFocus: (id) => nav.focus(id),
    }) ?? null;
  } catch (e) { console.warn('3D scene unavailable (no WebGL?)', e); scene = null; }

  // ----- views -----
  ui.detail.init({ onOpenTx: details.openTx, onOpenBlock: details.openBlock, onOpenAddress: details.openAddress, onMoreTxs: details.moreAddressTxs });
  ui.feed.init({ onOpenTx: details.openTx });
  ui.blocksRow.init({
    onSelect: (id) => (scene ? nav.focus(id) : details.openBlock(id)), // without 3D, a click opens the details
    onOpen: details.openBlock,
    onSelectNext: () => nav.focus(nextId),
    onLoadOlder: nav.loadOlder,
  });
  const prefs = ui.hud.init({
    onFollow: nav.onFollow,
    onOrder: (mode) => BTC.sceneSync.setOrder(mode),
    onPlacement: (mode) => BTC.sceneSync.setPlacement(mode),
    onDetails: () => state.selectedId && details.openBlock(state.selectedId),
  });
  if (scene) {
    BTC.sceneSync.init(scene);
    BTC.sceneSync.setOrder(prefs.order);
    BTC.sceneSync.setPlacement(prefs.placement);
  } else ui.hud.hideStage();

  // ----- search -----
  $('#search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#q').value.trim();
    if (q) BTC.searchCtl.run(q);
  });

  // ----- data sources -----
  BTC.socket.connect({
    onStatus: ui.hud.setStatus,
    onOpen: () => nav.refreshBlocks().catch((e) => console.warn('blocks', e)), // backfill the blocks mined while offline
    onBlock: nav.addBlock,
    onUpcoming(list) {
      state.upcoming = list;
      ui.blocksRow.renderUpcoming(list, state.focusId === nextId);
      if (state.focusId === nextId) nav.refreshHud();
    },
    onProjected(raw) { if (scene) BTC.feedCtl.ingest(BTC.sceneSync.onProjected(raw)); },
    onTransactions: (txs) => BTC.feedCtl.ingest(txs.map(BTC.txs.normalizeProjected)),
    onTxids: (ids) => BTC.feedCtl.ingest(ids.map((txid) => ({ txid }))),
  });

  nav.loadBlocks();
  BTC.statsCtl.refresh();
  setInterval(BTC.statsCtl.refresh, BTC.config.stats.refreshMs);
  BTC.feedCtl.poll();
  setInterval(BTC.feedCtl.poll, BTC.config.feed.pollMs);
  setInterval(BTC.feedCtl.flush, BTC.config.feed.flushMs);
  setInterval(ui.blocksRow.refreshAgo, 30000);
  document.addEventListener('visibilitychange', () => { // back to the tab: catch up now rather than at the next tick
    if (document.hidden) return;
    ui.blocksRow.refreshAgo();
    BTC.statsCtl.maybeRefresh();
    BTC.feedCtl.poll();
  });
})();
