// The tracked wallet: the transactions of one address, drawn in the 3D scene (their towers glow, a beacon rises from each)
// and listed in a panel over it. The list is reloaded every `wallet.pollMs` and after every block, so a transaction that was
// just sent (or mined) shows up by itself.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  Explorer.bitcoin = Explorer.bitcoin || {};
  const S = Explorer.config.scene;
  const C = Explorer.chain.config.wallet;
  const state = Explorer.state;
  const F = Explorer.format;

  const ui = () => Explorer.ui;
  const sync = () => Explorer.sceneSync;

  let timer = 0;              // next reload
  let dim = true;             // "dim the other transactions": a preference of the panel
  let frame = 0;              // pending animation frame of a refresh of the lit marks
  let byTxid = new Map();     // txid -> entry of the tracked wallet (tooltip of the scene)

  const entriesOf = (w) => Explorer.bitcoin.wallet.entries(w.txs, w.address);

  /** What an unconfirmed transaction waits for (shown under its line). */
  function pendingNote(e) {
    if (!sync().hasProjection()) return 'checking the next block…';
    if (sync().isProjected(e.txid)) return 'in the next block';
    const lowest = state.upcoming[0]?.feeRange?.[0];
    return e.rate != null && lowest != null && e.rate < lowest
      ? `not in the next block: it takes at least ${F.rate(lowest)} sat/vB, this one pays ${F.rate(e.rate)}`
      : 'not in the next block yet';
  }

  const notesOf = (list) => new Map(list.filter((e) => e.pending).map((e) => [e.txid, pendingNote(e)]));

  /** Draws the panel. */
  function render() {
    const w = state.wallet;
    if (!w) return;
    const list = entriesOf(w);
    ui().tracker.render({
      address: w.address, entries: list, lit: sync().litTxids(), notes: notesOf(list), reach: Explorer.bitcoin.wallet.reach(w.txs),
      more: Explorer.bitcoin.wallet.hasOlder(w.txs, w.confirmedTotal), busy: w.busy, failed: w.failed, dim,
    });
  }

  /** Makes the scene and the panel match the tracked wallet (or its absence). */
  function apply() {
    const w = state.wallet;
    if (!w) {
      byTxid = new Map();
      sync().setHighlight(null);
      ui().tracker.hide();
      return;
    }
    const list = entriesOf(w);
    byTxid = new Map(list.map((e) => [e.txid, e]));
    sync().setHighlight({ txids: new Set(byTxid.keys()), blocks: new Set(list.filter((e) => !e.pending).map((e) => e.hash)), dim });
    render();
  }

  /** The scene draws or removes towers: the panel shows which transactions are lit (many calls at once are merged). */
  function onSceneChange() {
    if (!state.wallet || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const w = state.wallet;
      if (w) ui().tracker.refreshLit(sync().litTxids(), notesOf(entriesOf(w)));
    });
  }

  function schedule(ms) {
    clearTimeout(timer);
    if (!state.wallet) return;
    timer = setTimeout(() => (document.hidden ? schedule(C.pollMs) : refresh()), ms);
  }

  /** Reloads the first page of the address (unconfirmed transactions + the newest confirmed ones) and its totals. */
  async function refresh() {
    const w = state.wallet;
    if (!w || w.busy) return;
    w.busy = true;
    ui().tracker.setBusy(true);
    try {
      const [totals, fresh] = await Promise.all([Explorer.bitcoin.api.address(w.address), Explorer.bitcoin.api.addressTxs(w.address)]);
      if (state.wallet !== w) return; // stopped or replaced meanwhile
      w.confirmedTotal = Explorer.bitcoin.address.summary(totals).confirmedTxs;
      w.txs = Explorer.bitcoin.wallet.merge(w.txs, fresh, { total: w.confirmedTotal });
      w.failed = false;
    } catch (e) {
      console.warn('wallet', e);
      if (state.wallet === w) w.failed = true;
    } finally {
      if (state.wallet === w) { w.busy = false; apply(); schedule(C.pollMs); }
    }
  }

  /** "Load older": the next page of confirmed transactions. */
  async function loadOlder() {
    const w = state.wallet;
    const last = w && Explorer.bitcoin.address.lastConfirmed(w.txs);
    if (!w || w.busy || !last) return;
    w.busy = true;
    ui().tracker.setBusy(true);
    try {
      const page = Explorer.bitcoin.address.fresh(w.txs, await Explorer.bitcoin.api.addressTxsAfter(w.address, last));
      if (state.wallet !== w) return;
      w.txs.push(...page);
      if (!page.length) w.confirmedTotal = w.txs.filter((t) => t.status?.confirmed).length; // nothing older after all: stop offering it
      w.failed = false;
    } catch (e) {
      console.warn('wallet older', e);
      if (state.wallet === w) w.failed = true;
    } finally {
      if (state.wallet === w) { w.busy = false; apply(); schedule(C.pollMs); } // a refresh that came due during this request was skipped: start the countdown again
    }
  }

  /** Brings the camera to the block of a transaction (the next block for an unconfirmed one). */
  async function jump(e) {
    if (!sync().active()) return;
    if (e.pending) { Explorer.nav.focus(S.nextId); return; }
    if (state.blocks.some((b) => b.id === e.hash)) { Explorer.nav.focus(e.hash); return; }
    try { // a block outside the loaded list: like a search for it
      await Explorer.nav.goToBlock({ hash: e.hash }, Explorer.requests.begin());
    } catch (err) {
      console.warn('wallet jump', err);
      ui().hud.setMessage("Couldn't open this block right now.");
    }
  }

  /**
   * Starts tracking an address with the transactions its page already holds. The camera goes to the newest transaction that
   * is within reach (the next block for an unconfirmed one), otherwise to the newest one.
   */
  function track(address, txs, summary) {
    state.wallet = { address, txs: [...txs], confirmedTotal: summary.confirmedTxs, busy: false, failed: false };
    apply();
    schedule(C.pollMs);
    const list = entriesOf(state.wallet);
    const first = list.find((e) => e.pending || state.blocks.some((b) => b.id === e.hash)) ?? list[0];
    if (first) jump(first);
    ui().tracker.reveal();
  }

  function clear() {
    clearTimeout(timer);
    state.wallet = null;
    apply();
  }

  Explorer.bitcoin.walletCtl = {
    track, clear, refresh, loadOlder, jump, onSceneChange,
    /** A block was mined: the address index catches up in a moment, then the list is reloaded. */
    onBlock() { if (state.wallet) schedule(C.afterBlockMs); },
    /** Back to the tab: reload now rather than at the next tick. */
    catchUp() { if (state.wallet) schedule(0); },
    setDim(on) { dim = on; if (state.wallet) apply(); },
    /** The line of the tracked wallet for a transaction (undefined when it is not one of its). */
    entryOf: (txid) => byTxid.get(txid),
  };
})();
