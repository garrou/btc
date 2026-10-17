// What the node pushes (Explorer.chain.live), over WebSocket: the slots. Each time a group of slots has started (and its first block is confirmed), the page
// reads that block and tells the engine (a block "is mined" every `sample` slots, see core/blocks.js). Solana has no
// mempool the page can read: there is no next block and no pending transaction.
// If the WebSocket is down, the head slot is read by polling.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const S = (Explorer.solana = Explorer.solana || {});
  const cfg = () => Explorer.chain.config;

  let handlers = {};
  let connected = false;
  let latestSlot = 0;       // newest slot heard of
  let last = null;          // newest block told to the engine
  let busy = false;
  let lastBackfill = 0;

  const LAG = S.data.LAG; // slots to wait after the start of a group before reading its block: it has to be produced and confirmed

  /** The newest block seen (from the list the engine loads): where the stream goes on from. */
  function noteTip(block, slot) {
    if (!last || block.height > last.height) last = block;
    latestSlot = Math.max(latestSlot, slot ?? block.slot);
  }

  /** Reads and delivers the blocks of every group that is over, one after the other. */
  async function advance() {
    if (busy || !last) return;
    busy = true;
    try {
      for (;;) {
        const g = last.height + 1, start = S.blocks.firstSlotOf(g);
        if (latestSlot < start + LAG) break; // the first slots of the group are not confirmed yet
        if (latestSlot >= S.blocks.firstSlotOf(last.height + cfg().maxCatchUp) + LAG) { // far behind (a sleeping tab): the engine reloads the list
          if (Date.now() - lastBackfill > 5000) { lastBackfill = Date.now(); handlers.onOpen?.(); }
          break;
        }
        const slots = await S.rpc.call('getBlocks', [start, Math.min(latestSlot, start + cfg().sample - 1), { commitment: 'confirmed' }]);
        if (!slots.length) break;
        const raw = await S.rpc.block(slots[0], 'signatures');
        if (!raw) break;
        const block = S.blocks.normalize(slots[0], raw, last.id);
        S.data.remember([block]);
        if (block.height > last.height) last = block; // the list may have been reloaded (noteTip) while this block was read
        else break;
        handlers.onBlock?.(block);
      }
    } catch (e) {
      console.warn('new block', e);
    } finally { busy = false; }
  }

  function onSlot(slot) {
    if (slot <= latestSlot) return;
    latestSlot = slot;
    advance();
  }

  function onOpen(send) {
    send({ jsonrpc: '2.0', id: 1, method: 'slotSubscribe', params: [] });
  }

  function onMessage(msg, ctl) {
    if (msg.id === 1) {
      if (msg.error) return ctl.close();
      ctl.ready();
      connected = true;
      handlers.onStatus?.(true);
      handlers.onOpen?.();
    } else if (msg.method === 'slotNotification' && msg.params?.result) {
      onSlot(Number(msg.params.result.slot));
    }
  }

  function onClose() {
    if (connected) handlers.onStatus?.(false);
    connected = false;
  }

  /** No WebSocket: ask for the head slot now and then. */
  async function poll() {
    if (connected || document.hidden) return;
    try { onSlot(Number(await S.rpc.call('getSlot', [{ commitment: 'confirmed' }]))); } catch (e) { console.warn('poll', e); }
  }

  S.live = {
    noteTip,
    headSlot: () => latestSlot, // the newest slot heard of (the blocks shown are a few slots behind)
    connect(h) {
      handlers = h;
      Explorer.jsonrpc.socket({ urls: () => cfg().ws, staleMs: cfg().wsStaleMs, onOpen, onMessage, onClose });
      setInterval(poll, cfg().pollMs);
    },
    trackNext() {}, // nothing to track: there is no next block
  };
})();
