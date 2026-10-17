// What the server pushes (Explorer.chain.live), over the WebSocket: each time a ledger closes, the page reads it and tells the
// engine. A validated ledger is final (no forks), so a ledger is told once and never replaced. There is no mempool the page can read:
// no next block and no pending transaction. Without the WebSocket the page has no data at all (it is the only line to the server).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const X = (Explorer.xrp = Explorer.xrp || {});
  const cfg = () => Explorer.chain.config;

  let handlers = {};
  let connected = false;
  let last = null;          // newest ledger told to the engine
  let headIndex = 0;        // newest ledger index heard of
  let busy = false;
  let lastBackfill = 0;

  /** The newest ledger seen (from the list the engine loads): where the stream goes on from. */
  function noteTip(block) {
    if (!last || block.height > last.height) last = block;
    headIndex = Math.max(headIndex, block.height);
  }

  /** Reads and delivers the ledgers that closed since the last one, in order. */
  async function advance() {
    if (busy || !last) return;
    busy = true;
    try {
      while (headIndex > last.height) {
        if (headIndex - last.height > cfg().maxCatchUp) { // far behind (a sleeping tab): the engine reloads the list
          if (Date.now() - lastBackfill > 5000) { lastBackfill = Date.now(); handlers.onOpen?.(); }
          break;
        }
        const block = await X.data.light({ ledger_index: last.height + 1 });
        if (block.height > last.height) last = block; else break; // the list may have been reloaded (noteTip) while this one was read
        handlers.onBlock?.(block);
      }
    } catch (e) {
      console.warn('new ledger', e);
    } finally { busy = false; }
  }

  function onLedger(msg) {
    const index = Number(msg.ledger_index);
    if (!Number.isFinite(index) || index <= headIndex) return;
    headIndex = index;
    advance();
  }

  X.live = {
    noteTip,
    headIndex: () => headIndex, // the newest ledger index heard of
    connect(h) {
      handlers = h;
      X.ws.start({
        onSubscribed(result) {
          connected = true;
          h.onStatus?.(true);
          const index = Number(result?.ledger_index);
          if (Number.isFinite(index)) headIndex = Math.max(headIndex, index);
          h.onOpen?.();
        },
        onLedger,
        onClose() {
          if (connected) h.onStatus?.(false);
          connected = false;
        },
      });
    },
    trackNext() {}, // nothing to track: there is no next block
  };
})();
