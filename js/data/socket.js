// WebSocket client for mempool.space: connection, subscriptions, reconnection with backoff. Dispatches parsed messages.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  let ws = null, retry = 0, handlers = {};

  const send = (obj) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); };

  function open() {
    ws = new WebSocket(BTC.config.ws);
    ws.onopen = () => {
      retry = 0;
      handlers.onStatus?.(true);
      send({ action: 'want', data: ['blocks', 'mempool-blocks', 'mempool-txids'] });
      trackNextBlock();
      handlers.onOpen?.();
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; } // ignore malformed frames
      if (msg.block) handlers.onBlock?.(msg.block);
      if (msg['mempool-blocks']) handlers.onUpcoming?.(msg['mempool-blocks']);
      if (msg['projected-block-transactions']) handlers.onProjected?.(msg['projected-block-transactions']);
      if (Array.isArray(msg.transactions)) handlers.onTransactions?.(msg.transactions);
      if (msg['mempool-txids']?.added) handlers.onTxids?.(msg['mempool-txids'].added);
    };
    ws.onclose = () => {
      handlers.onStatus?.(false);
      setTimeout(open, Math.min(30000, 1000 * 2 ** retry++));
    };
    ws.onerror = () => ws.close();
  }

  /** (Re)subscribes to the contents of the next block (needed again after every mined block). */
  function trackNextBlock() { send({ 'track-mempool-block': 0 }); }

  BTC.socket = {
    /** handlers: onStatus(bool), onOpen(), onBlock(block), onUpcoming(list), onProjected(raw), onTransactions(list), onTxids(ids) */
    connect(h) { handlers = h; open(); },
    trackNextBlock,
  };
})();
