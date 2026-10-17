// Keeps the 3D scene in sync with the app state: which blocks are shown, which ones are loaded in detail (and which
// are a light shape), and the projected next block. Talks to the scene, the API and the state; draws nothing itself.
// A mined block never changes: its contents are downloaded once and kept, so browsing the history never loses detail.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const S = Explorer.config.scene;
  const state = Explorer.state;

  let scene = null;
  const projection = Explorer.chain.createPending(); // the towers of the next block, as the chain describes them
  // block id -> { promise, txs }: the contents of a block (txs is set once they are here), the most recently used last.
  // Complete contents are kept (up to S.cache blocks); the same array reference avoids rebuilding the scene.
  const cache = new Map();
  const status = new Map();  // block id -> 'loading' | 'error' (will retry) | 'failed' (gave up), until the block is displayed
  const light = new Set();   // ids of the blocks currently shown as a light shape (no per-tx detail)
  const retryTimers = new Map(), retryCount = new Map();
  const queue = [];          // downloads waiting for a free slot
  let running = 0;           // downloads in progress
  let projTimer = 0, projShown = false;

  // The blocks that exist in 3D: a window that slides with the camera (it is centered on the focused slot).
  const windowStart = () => Explorer.blocks.windowStart(state.blocks, state.focusId, S.reach);
  const windowBlocks = () => Explorer.blocks.windowAround(state.blocks, state.focusId, S.reach);
  const hasNext = () => Explorer.chain.nextBlock !== false; // a chain without a mempool has no next block to draw
  const showsNext = () => hasNext() && !state.detached && windowStart() === 0; // the next block only makes sense next to the latest one
  const known = (id) => { const e = cache.get(id); return !!(e && e.txs && !e.txs.approx); }; // complete contents in memory
  const near = (b) => Explorer.blocks.isNear(windowBlocks(), b.id, state.focusId, S.detailRadius);
  const wantsDetail = (b) => Explorer.blocks.wantsDetail(windowBlocks(), b.id, state.focusId, S.detailRadius, known);
  const distance = (b) => Explorer.blocks.slotDistance(windowBlocks(), b.id, state.focusId) ?? Infinity; // Infinity: not in the window

  /** The scene message always describes the block the camera is on. */
  function updateMessage() {
    const st = status.get(state.focusId);
    Explorer.ui.hud.setMessage(st === 'loading' ? 'Loading block…'
      : st === 'error' ? "Can't load the block right now, retrying…"
        : st === 'failed' ? "Can't load the block. Click it to retry." : '');
  }

  /** Keeps at most S.cache blocks in memory: the least recently used go first, never one that is displayed. */
  function trim() {
    const shown = new Set(windowBlocks().map((b) => b.id));
    for (const id of [...cache.keys()]) {
      if (cache.size <= S.cache) break;
      if (!shown.has(id)) cache.delete(id);
    }
  }

  // ----- mined blocks -----

  /** Starts the waiting downloads while slots are free: the block nearest to the camera first; one no longer near is dropped. */
  function pump() {
    while (running < S.loads && queue.length) {
      let best = 0;
      queue.forEach((q, i) => { if (distance(q.b) < distance(queue[best].b)) best = i; });
      const { b, resolve, reject } = queue.splice(best, 1)[0];
      if (!near(b)) { resolve(null); continue; } // the camera moved away before its turn: not worth a download
      running++;
      let timer;
      const timeout = new Promise((_, fail) => { timer = setTimeout(() => fail(new Error('timeout')), S.loadTimeoutMs); });
      Promise.race([Promise.resolve().then(() => Explorer.chain.data.blockTowers(b)), timeout]) // a chain function that throws rejects, it does not leave `running` stuck
        .then(resolve, reject).finally(() => { clearTimeout(timer); running--; pump(); });
    }
  }

  /**
   * Downloads the contents of a block, S.loads at a time. The entry keeps them as soon as they are here, even if nobody
   * waits for them any more (the camera moved on): they are not lost, a mined block does not change.
   */
  function download(b) {
    const entry = { txs: null };
    // pump() waits for the end of the current task: all the blocks asked at once are queued before the nearest one is chosen
    entry.promise = new Promise((resolve, reject) => { queue.push({ b, resolve, reject }); queueMicrotask(pump); }).then((txs) => {
      if (txs) entry.txs = txs;
      else if (cache.get(b.id) === entry) cache.delete(b.id); // skipped: starts afresh when the camera comes back
      return txs;
    });
    return entry;
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

  /** Light shape of a block: a solid block as high as it is full, colored by its median fee. */
  function simplify(b) {
    scene.setSummary(b.id, { fill: Explorer.chain.fill(b), rate: Explorer.chain.typicalRate(b) });
    light.add(b.id);
  }

  /** Draws the contents of a block in its slot: at once when they are known, otherwise after downloading them. */
  async function load(b) {
    let entry = cache.get(b.id);
    if (entry) { cache.delete(b.id); cache.set(b.id, entry); } // most recently used
    else { entry = download(b); cache.set(b.id, entry); trim(); }
    if (!entry.txs) { // not here yet: a light shape stands in until the detail arrives
      if (!status.has(b.id)) status.set(b.id, 'loading');
      if (scene.txCount(b.id) === 0 && !light.has(b.id)) simplify(b);
      updateMessage();
    }
    try {
      const txs = await entry.promise;
      if (!txs || !wantsDetail(b)) { status.delete(b.id); updateMessage(); return; } // skipped, or the camera moved away: nothing to draw (known contents stay cached)
      scene.setTxs(b.id, txs);
      light.delete(b.id);
      status.delete(b.id);
      updateMessage();
      if (txs.approx) scheduleRetry(b); else retryCount.delete(b.id);
    } catch (e) {
      console.warn('block', b.height, e);
      if (cache.get(b.id) === entry) cache.delete(b.id);
      // network failure / rate limit: retry later, then give up (a click on the block tries again)
      if (wantsDetail(b)) status.set(b.id, scheduleRetry(b) ? 'error' : 'failed'); else status.delete(b.id);
      updateMessage();
    }
  }

  /** Block of the window out of the camera's reach and not known yet: a light shape, nothing is downloaded. */
  function demote(b) {
    if (light.has(b.id)) return; // already a light shape: nothing to rebuild
    status.delete(b.id);
    const entry = cache.get(b.id);
    if (entry && entry.txs && entry.txs.approx) { cache.delete(b.id); retryCount.delete(b.id); } // provisional data: starts afresh when the camera comes back
    scene.setTxs(b.id, null); // frees the GPU detail
    simplify(b);
  }

  /** Blocks near the camera, and the ones already known, are drawn in detail (downloaded if needed); the others are light shapes. */
  function applyDetail() {
    windowBlocks().forEach((b) => { if (wantsDetail(b)) load(b); else demote(b); });
  }

  /**
   * Makes the scene match the state: slots, links, detailed vs light blocks, and the projected block if it is shown.
   * fresh: id of the block that has just been mined (it slides out of the next block's place).
   */
  function sync(fresh = null) {
    const shown = windowBlocks();
    // Every block keeps its place in the world: the chain is laid out by rank in the list, not by rank in the window, so
    // the window can slide along without anything moving (the next block, when the chain is live, sits at 0).
    const first = (state.detached || !hasNext() ? 0 : 1) + windowStart();
    scene.setSlots([
      ...(showsNext() ? [{ id: S.nextId, kind: 'next', label: 'NEXT', pos: 0 }] : []),
      ...shown.map((b, i) => ({
        id: b.id, kind: 'mined', label: `#${Explorer.chain.blockNumber(b)}`, prev: b.previousblockhash, pos: first + i,
        ...(b.id === fresh && showsNext() ? { from: 0, fresh: true } : {}),
      })),
    ]);
    const shownIds = new Set(shown.map((b) => b.id));
    for (const id of [...cache.keys(), ...light, ...retryCount.keys(), ...status.keys()]) {
      if (shownIds.has(id)) continue;
      status.delete(id); light.delete(id); retryCount.delete(id); // no longer displayed; its known contents stay in the cache
      const entry = cache.get(id);
      if (entry && entry.txs && entry.txs.approx) cache.delete(id); // provisional data is not worth keeping
    }
    trim();
    applyDetail();
    // the next block slot may have just been (re)created, empty: give it the projection we already know
    if (showsNext() && scene.txCount(S.nextId) === 0 && projection.hasData()) publishNow();
    updateMessage();
  }

  /** The camera moves to a slot: the blocks around it get their detail (downloaded if needed, nearest first). */
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

  /** News about the next block's contents (opaque: given to the chain's createPending().apply). Returns the txs that just entered the block (for the feed). */
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
    Explorer.chain.live.trackNext?.();
  }

  Explorer.sceneSync = {
    init(sceneInstance) { scene = sceneInstance; },
    active: () => scene !== null,
    sync, focus, publishNow, onProjected, resetProjection,
    isProjected: (txid) => projection.has(txid),
    /** Whether the projected next block is known yet (before that, `isProjected` says nothing). */
    hasProjection: () => projection.hasData(),
    /** Tracked wallet: { txids, blocks, dim } makes its towers glow (see scene3d.setHighlight); null stops. */
    setHighlight(tracked) { if (scene) scene.setHighlight(tracked); },
    /** Txids of the tracked towers that are currently drawn. */
    litTxids: () => (scene ? scene.litTxids() : new Set()),
    /** Transactions displayed by a slot (diagnostics). */
    txCount: (id) => (scene ? scene.txCount(id) : 0),
    stream(items) { if (scene && items.length) scene.stream(items); },
    setOrder(mode) { if (scene) scene.setOrder(mode); },
    setPlacement(mode) { if (scene) scene.setPlacement(mode); },
  };
})();
