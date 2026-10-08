// Keeps the 3D scene in sync with the app state: which blocks are shown, which ones are loaded in detail (and which
// are a light shape), and the projected next block. Talks to the scene, the API and the state; draws nothing itself.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});
  const S = BTC.config.scene;
  const state = BTC.state;

  let scene = null;
  const projection = BTC.projection.create();
  const cache = new Map();   // block id -> Promise<txs>: the same array reference avoids rebuilding the scene
  const status = new Map();  // block id -> 'loading' | 'error' (will retry) | 'failed' (gave up), until the block is displayed
  const light = new Set();   // ids of the blocks currently shown as a light shape (no per-tx detail)
  const retryTimers = new Map(), retryCount = new Map();
  let projTimer = 0, projShown = false;

  const windowBlocks = () => BTC.blocks.windowOf(state.blocks, state.sceneOffset, S.shown);
  const showsNext = () => state.sceneOffset === 0 && !state.detached; // the next block only makes sense next to the latest one
  const wantsDetail = (b) => BTC.blocks.wantsDetail(windowBlocks(), b.id, state.focusId, S.detail);

  /** The scene message always describes the block the camera is on. */
  function updateMessage() {
    const st = status.get(state.focusId);
    BTC.ui.hud.setMessage(st === 'loading' ? 'Loading block…'
      : st === 'error' ? "Can't load the block right now, retrying…"
        : st === 'failed' ? "Can't load the block. Click it to retry." : '');
  }

  function forget(id) { cache.delete(id); status.delete(id); }

  // ----- mined blocks -----

  /** Block contents: the "summary" gives everything in one call; otherwise fall back to the bare txids (provisional). */
  async function fetchTxs(b) {
    try {
      const rows = await BTC.api.blockSummary(b.id);
      // A freshly mined block may have an incomplete summary (sometimes only the coinbase): drawing it would give a
      // wrong scene (one giant tower). Reject it and retry later.
      if (BTC.txs.isCompleteSummary(rows, b.tx_count)) return BTC.txs.fromSummary(rows);
      console.warn(`block ${b.height} summary incomplete (${Array.isArray(rows) ? rows.length : '?'}/${b.tx_count || 0}), retrying later`);
    } catch (e) { console.warn('summary unavailable, falling back to /txids', e); }
    return BTC.txs.provisional(await BTC.api.blockTxids(b.id), b.extras?.medianFee);
  }

  /** Schedules a new attempt. Returns false when none is possible (already planned counts as true; retries exhausted is false). */
  function scheduleRetry(b) {
    if (retryTimers.has(b.id)) return true;
    if ((retryCount.get(b.id) || 0) >= S.maxRetry) return false;
    retryTimers.set(b.id, setTimeout(() => {
      retryTimers.delete(b.id);
      retryCount.set(b.id, (retryCount.get(b.id) || 0) + 1);
      if (!wantsDetail(b)) { status.delete(b.id); updateMessage(); return; } // no longer shown in detail: drop the retry
      cache.delete(b.id);
      load(b);
    }, S.retryMs));
    return true;
  }

  /** Loads the transactions of a block into its slot. */
  async function load(b) {
    if (!cache.has(b.id)) {
      cache.set(b.id, fetchTxs(b));
      status.set(b.id, 'loading');
      updateMessage();
    }
    try {
      const txs = await cache.get(b.id);
      if (!wantsDetail(b)) { forget(b.id); return; } // demoted/removed while loading: don't rebuild the detail
      scene.setTxs(b.id, txs);
      light.delete(b.id);
      status.delete(b.id);
      updateMessage();
      if (txs.approx) scheduleRetry(b); else retryCount.delete(b.id);
    } catch (e) {
      console.warn('block', b.height, e);
      cache.delete(b.id);
      // network failure / rate limit: retry later, then give up (a click on the block tries again)
      if (wantsDetail(b)) status.set(b.id, scheduleRetry(b) ? 'error' : 'failed'); else status.delete(b.id);
      updateMessage();
    }
  }

  /** Old block of the window: no download, a light shape (also frees the memory of its detail). */
  function demote(b) {
    if (light.has(b.id)) return; // already a light shape: nothing to rebuild
    forget(b.id);
    scene.setTxs(b.id, null);
    scene.setSummary(b.id, { fill: BTC.blocks.fillPercent(b) / 100, rate: b.extras?.medianFee });
    light.add(b.id);
  }

  /** Detailed blocks (the recent ones of the window, and the selected one) are loaded; the others become light shapes. */
  function applyDetail() {
    windowBlocks().forEach((b, i) => { if (i < S.detail || b.id === state.focusId) load(b); else demote(b); });
  }

  /** Makes the scene match the state: slots, links, detailed vs light blocks, and the projected block if it is shown. */
  function sync() {
    const shown = windowBlocks();
    scene.setSlots([
      ...(showsNext() ? [{ id: S.nextId, kind: 'next', label: 'NEXT' }] : []),
      ...shown.map((b) => ({ id: b.id, kind: 'mined', label: `#${BTC.format.number(b.height)}` })),
    ]);
    for (const id of [...cache.keys(), ...light, ...retryCount.keys()]) {
      if (!shown.some((b) => b.id === id)) { forget(id); light.delete(id); retryCount.delete(id); }
    }
    applyDetail();
    // the next block slot may have just been (re)created, empty: give it the projection we already know
    if (showsNext() && scene.txCount(S.nextId) === 0 && projection.hasData()) publishNow();
    updateMessage();
  }

  /** The camera moves to a slot: a light block gets its detail loaded, and the block it left may go back to a light shape. */
  function focus(id) {
    scene.focus(id);
    if (status.get(id) === 'failed') { status.delete(id); retryCount.delete(id); } // clicking a block that gave up tries again
    applyDetail();
    updateMessage();
  }

  // ----- projected next block -----

  function publish() {
    projTimer = 0;
    if (!projection.hasData() || !showsNext()) return; // kept for later: sync() re-publishes when the next block is shown again
    projShown = true;
    if (!projection.size()) { projection.takeFresh(); scene.setTxs(S.nextId, null); return; } // empty projection: clear stale towers
    const incoming = projection.takeFresh();
    scene.setTxs(S.nextId, projection.values(), incoming);
  }

  function publishNow() { clearTimeout(projTimer); projTimer = 0; publish(); }

  /** A `projected-block-transactions` message. Returns the txs that just entered the block (for the feed). */
  function onProjected(raw) {
    const res = projection.apply(raw);
    if (!res) return [];
    if (!projTimer) projTimer = setTimeout(publish, projShown ? S.projectedThrottleMs : 0); // throttles rebuilds
    return res.added;
  }

  /** A block was mined: the next block is fully recomputed (even while browsing the history). */
  function resetProjection() {
    projection.reset();
    projShown = false;
    clearTimeout(projTimer); projTimer = 0;
    if (scene) scene.setTxs(S.nextId, null);
    BTC.socket.trackNextBlock();
  }

  BTC.sceneSync = {
    init(sceneInstance) { scene = sceneInstance; },
    active: () => scene !== null,
    sync, focus, publishNow, onProjected, resetProjection,
    isProjected: (txid) => projection.has(txid),
    /** Transactions displayed by a slot (diagnostics). */
    txCount: (id) => (scene ? scene.txCount(id) : 0),
    stream(items) { if (scene && items.length) scene.stream(items); },
    setOrder(mode) { if (scene) scene.setOrder(mode); },
    setPlacement(mode) { if (scene) scene.setPlacement(mode); },
  };
})();
