// Entry point: creates the views and the optional 3D scene, connects the data sources, wires everything together.
// It is the engine's: everything specific to a blockchain goes through Explorer.chain (js/core/chain.js).
// Layers (script order in each chain's page): core/ (pure logic) -> state/ -> scene/ (Three.js) -> ui/ (DOM views)
// -> controllers/ (orchestration) -> this file; the chain's own files (js/chains/<name>/) load between them.
(() => {
  'use strict';
  const Explorer = window.Explorer;
  const { $ } = Explorer.dom;
  const { nextId } = Explorer.config.scene;
  const { state, nav } = Explorer;
  const chain = Explorer.chain;
  document.documentElement.style.setProperty('--accent', `#${chain.theme.accent.toString(16).padStart(6, '0')}`); // the chain's color
  const ui = Explorer.ui;

  // ----- 3D scene (optional: needs Three.js and WebGL) -----
  let scene = null;
  try {
    scene = Explorer.scene3d?.create($('#scene'), {
      tooltip: $('#tip3d'),
      describe: chain.describeTower, // tooltip text: the chain's words
      onPick: (t) => chain.openTx(t.txid),
      onFocus: (id) => nav.focus(id),
      onHighlight: () => chain.onHighlight(),
    }) ?? null;
  } catch (e) { console.warn('3D scene unavailable (no WebGL?)', e); scene = null; }

  // ----- views -----
  ui.dialog.init();
  ui.feed.init({ onOpenTx: chain.openTx });
  ui.blocksRow.init({
    onSelect: (id) => (scene ? nav.focus(id) : chain.openBlock(id)), // without 3D, a click opens the details
    onOpen: chain.openBlock,
    onSelectNext: () => nav.focus(nextId),
    onLoadOlder: nav.loadOlder,
  });
  const prefs = ui.hud.init({
    onFollow: nav.onFollow,
    onOrder: (mode) => Explorer.sceneSync.setOrder(mode),
    onPlacement: (mode) => Explorer.sceneSync.setPlacement(mode),
    onDetails: () => state.selectedId && chain.openBlock(state.selectedId),
  });
  if (scene) {
    Explorer.sceneSync.init(scene);
    Explorer.sceneSync.setOrder(prefs.order);
    Explorer.sceneSync.setPlacement(prefs.placement);
  } else {
    const reason = typeof THREE === 'undefined' || !THREE.OrbitControls ? 'Three.js did not load (offline?)' : 'WebGL is not available';
    console.warn('3D view off:', reason);
    ui.hud.hideStage(reason);
  }

  // ----- search -----
  $('#search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#q').value.trim();
    if (q) chain.search(q);
  });

  // ----- data sources -----
  try {
    chain.live.connect({
      onStatus: ui.hud.setStatus,
      onOpen: () => nav.refreshBlocks().catch((e) => console.warn('blocks', e)), // backfill the blocks mined while offline
      onBlock(b) { nav.addBlock(b); chain.onBlock(b); },
      onUpcoming(list) {
        state.upcoming = list;
        ui.blocksRow.renderUpcoming(list, state.focusId === nextId);
        if (state.focusId === nextId) nav.refreshHud();
      },
      onProjected(raw) { if (scene) Explorer.feedCtl.ingest(Explorer.sceneSync.onProjected(raw)); },
      onTransactions: Explorer.feedCtl.ingest,
      onTxids: Explorer.feedCtl.ingest,
    });
  } catch (e) { // a chain whose live connection cannot even start (bad URL...) must not stop the rest of the page
    console.error('live connection', e);
    ui.hud.setStatus(false);
  }

  nav.loadBlocks();
  chain.start({ scene }); // the chain's own screens and timers
  Explorer.feedCtl.poll();
  setInterval(Explorer.feedCtl.poll, Explorer.config.feed.pollMs);
  setInterval(Explorer.feedCtl.flush, Explorer.config.feed.flushMs);
  setInterval(ui.blocksRow.refreshAgo, 5000); // "x s ago" has a one-second grain under a minute
  document.addEventListener('visibilitychange', () => { // back to the tab: catch up now rather than at the next tick
    if (document.hidden) return;
    ui.blocksRow.refreshAgo();
    chain.onVisible();
    Explorer.feedCtl.poll();
  });
})();
