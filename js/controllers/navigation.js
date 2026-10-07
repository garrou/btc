// Navigation: which blocks are loaded and shown (live list, history, searched block), where the camera is, what the
// block row and the HUD display. Reads/writes the state; delegates drawing to the views and the scene to scene-sync.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});
  const S = BTC.config.scene;
  const state = BTC.state;
  const F = BTC.format;

  const ui = () => BTC.ui;
  const sync = () => BTC.sceneSync;
  let loadingOlder = false;

  // ----- views -----

  function refreshHud() {
    if (state.focusId === S.nextId) ui().hud.showNext(state.upcoming[0]);
    else {
      const b = state.blocks.find((x) => x.id === state.focusId);
      if (b) ui().hud.showBlock(b);
    }
  }

  function updateMoreButton() {
    if (loadingOlder) return;
    const oldest = state.blocks.at(-1);
    ui().blocksRow.setMore(oldest && oldest.height > 0
      ? { title: '+ Plus ancien', sub: `avant #${F.number(oldest.height)}` }
      : { hidden: true }); // nothing older than the genesis block
  }

  function renderRow(freshId = null) {
    ui().blocksRow.renderBlocks(state.blocks, { selectedId: state.selectedId, freshId });
    updateMoreButton();
  }

  // ----- camera -----

  function setFollow(on) { state.follow = on; ui().hud.setFollow(on); }

  /** Moves the camera to a slot ('next' or a block id). A manual choice (auto = false) turns "follow" off. */
  function focus(id, auto = false) {
    if (!sync().active()) return;
    if (!auto) setFollow(false);
    state.focusId = id;
    state.selectedId = id === S.nextId ? null : id;
    if (id === S.nextId && (state.sceneOffset > 0 || state.detached)) { showLive(S.nextId); return; }
    // move the 3D window when the block is outside of it (history)
    const offset = BTC.blocks.ensureVisible(state.blocks, id, state.sceneOffset, S.shown);
    if (offset !== state.sceneOffset) { state.sceneOffset = offset; sync().sync(); }
    sync().focus(id);
    ui().blocksRow.select(id);
    refreshHud();
  }

  /**
   * Back to the live window (latest blocks + next block). Coming back from a searched block (detached list)
   * reloads the latest blocks first. thenFocus: slot to select afterwards (default: the latest block).
   */
  async function showLive(thenFocus = null) {
    if (state.detached) {
      state.detached = false;
      state.blocks = [];
      state.sceneOffset = 0;
      renderRow();
      try { await refreshBlocks(); } catch (e) { console.warn('blocks', e); loadBlocks(1); return; }
    } else {
      state.sceneOffset = 0;
      sync().sync();
    }
    sync().publishNow();
    const target = thenFocus ?? state.blocks[0]?.id;
    if (target) focus(target, true);
  }

  /** The "follow the latest block" toggle changed. */
  function onFollow(on) {
    state.follow = on;
    if (!on || !sync().active() || !state.blocks.length) return;
    if (state.sceneOffset > 0 || state.detached) showLive(); else focus(state.blocks[0].id, true);
  }

  // ----- block list -----

  /** A new block was mined (WebSocket). */
  function addBlock(b) {
    state.tip = Math.max(state.tip, b.height);
    if (!state.detached && state.blocks.some((x) => x.id === b.id)) return;
    sync().resetProjection(); // the next block is recomputed, whatever we are looking at
    BTC.statsCtl.maybeRefresh(); // a new block moves the retarget progress
    if (state.detached) return; // browsing a searched block: the live list is reloaded when coming back
    state.blocks = BTC.blocks.merge(state.blocks, [b]);
    // follow: back to the latest blocks; otherwise keep the same window (indexes shifted by the new block), and keep the
    // selected block inside it
    if (state.follow) state.sceneOffset = 0; else if (state.sceneOffset > 0) state.sceneOffset++;
    state.sceneOffset = BTC.blocks.ensureVisible(state.blocks, state.focusId, state.sceneOffset, S.shown);
    renderRow(b.id);
    if (!sync().active()) return;
    sync().sync();
    if (state.follow) focus(b.id, true);
  }

  /** Merges the latest blocks into the state (startup, and backfill after a WebSocket reconnect). */
  async function refreshBlocks() {
    const list = await BTC.api.blocks();
    state.tip = Math.max(state.tip, BTC.blocks.tipOf(list));
    if (state.detached) return; // the live list is rebuilt when coming back
    const merged = BTC.blocks.merge(state.blocks, list);
    if (BTC.blocks.sameList(merged, state.blocks)) return; // nothing new
    const first = !state.blocks.length;
    const above = BTC.blocks.insertedAbove(state.blocks, merged);
    if (above > 0 && state.sceneOffset > 0) state.sceneOffset += above;
    state.blocks = merged;
    state.sceneOffset = BTC.blocks.ensureVisible(state.blocks, state.focusId, state.sceneOffset, S.shown);
    renderRow();
    if (!sync().active()) return;
    if (!first) sync().resetProjection();
    sync().sync();
    if (first || state.follow) focus(state.blocks[0].id, true);
  }

  /** refreshBlocks with retries and a growing delay while the API is unavailable. */
  function loadBlocks(attempt = 0) {
    refreshBlocks().catch((e) => {
      console.warn('blocks', e);
      setTimeout(() => loadBlocks(attempt + 1), Math.min(30000, 2000 * 2 ** attempt));
    });
  }

  /** "+ Plus ancien": loads one more page of older blocks. */
  async function loadOlder() {
    const oldest = state.blocks.at(-1);
    if (loadingOlder || !oldest || oldest.height <= 0) return;
    loadingOlder = true;
    ui().blocksRow.setMore({ disabled: true, title: 'Chargement…', sub: ' ' });
    try {
      const list = await BTC.api.blocksFrom(oldest.height - 1); // 15 blocks, newest first, starting at that height
      if (!Array.isArray(list) || !list.length) throw new Error('no blocks');
      if (state.blocks.at(-1)?.id !== oldest.id) return; // the list was replaced meanwhile (search, back to live): drop this page
      state.blocks = BTC.blocks.merge(state.blocks, list);
      loadingOlder = false;
      renderRow();
      ui().blocksRow.reveal(list[0].id);
    } catch (e) {
      console.warn('older blocks', e);
      loadingOlder = false;
      ui().blocksRow.setMore({ title: 'Réessayer', sub: 'chargement impossible' });
    } finally {
      loadingOlder = false;
      updateMoreButton();
    }
  }

  /**
   * Shows a block (by hash or height) in the 3D scene. A block outside the loaded history replaces the list by the
   * blocks around it ("detached" from the live list). token: the request token of controllers/details.js.
   * Rejects (with `.status` for HTTP errors) when the block does not exist.
   */
  async function goToBlock(query, token) {
    const details = BTC.details;
    if (!sync().active()) return details.openBlock(query.hash ?? await BTC.api.blockHash(query.height));
    const height = query.height ?? (await BTC.api.blockBasic(query.hash)).height;
    if (!details.isCurrent(token)) return;
    if (state.tip && height > state.tip) throw new Error('hauteur au-delà du dernier bloc');
    let target = state.blocks.find((b) => b.height === height);
    if (!target) {
      const list = await BTC.api.blocksFrom(Math.min(height + 2, state.tip || height + 2)); // 2 newer blocks + the target + older ones
      if (!details.isCurrent(token)) return;
      target = list.find((b) => b.height === height);
      if (!target) throw new Error('bloc introuvable');
      state.detached = true;
      state.blocks = list;
      state.sceneOffset = 0;
      renderRow();
      sync().sync();
    }
    ui().detail.close();
    focus(target.id); // manual choice: turns "follow" off and moves the 3D window if needed
  }

  BTC.nav = { focus, showLive, onFollow, addBlock, refreshBlocks, loadBlocks, loadOlder, goToBlock, renderRow, refreshHud };
})();
