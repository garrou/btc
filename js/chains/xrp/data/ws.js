// The line to the XRP Ledger servers: ONE WebSocket for everything. Commands go out as {id, command, ...} and come back as
// {id, type: 'response', status, result} (or an error); the ledgers that close are pushed as {type: 'ledgerClosed'}.
// One socket for both calls and events means the page needs no HTTP request (and no cross-origin permission from the servers).
// Network only: nothing about what the commands mean.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const X = (Explorer.xrp = Explorer.xrp || {});
  const cfg = () => Explorer.chain.config;

  const NOT_FOUND = new Set(['lgrNotFound', 'ledgerNotFound', 'txnNotFound', 'actNotFound', 'entryNotFound', 'objectNotFound']);

  let ctl = null, open = false, nextId = 1, handlers = {};
  const waiting = new Map(); // id -> { resolve, reject, timer, msg, sent }

  function failure(msg) {
    const err = new Error(msg.error_message || msg.error || 'request failed');
    err.code = msg.error;                               // the server's word for it: "txnNotFound", "actMalformed"...
    if (NOT_FOUND.has(msg.error)) err.status = 404;     // the convention of the contract: an unknown block or transaction
    err.rpc = true;
    return err;
  }

  /**
   * One command: resolves with the `result`, rejects with an Error (`.status` 404 when the thing does not exist). A command asked
   * while the socket is down waits for it to come back, up to the timeout.
   */
  function call(command, params = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const msg = { id, command, ...params };
      const timer = setTimeout(() => { waiting.delete(id); reject(new Error('timeout')); }, cfg().rpcTimeoutMs);
      const entry = { resolve, reject, timer, msg, sent: false };
      waiting.set(id, entry);
      if (open && ctl) { ctl.send(msg); entry.sent = true; }
    });
  }

  function onOpen(send, c) {
    ctl = c;
    open = true;
    for (const e of waiting.values()) if (!e.sent) { send(e.msg); e.sent = true; } // asked while the socket was down
    const id = nextId++;
    const timer = setTimeout(() => { waiting.delete(id); c.close(); }, cfg().rpcTimeoutMs); // a server that does not answer the subscription is replaced
    waiting.set(id, {
      timer, sent: true,
      resolve: (result) => { c.ready(); handlers.onSubscribed?.(result); },
      reject: () => c.close(),
    });
    send({ id, command: 'subscribe', streams: ['ledger'] });
  }

  function onMessage(msg) {
    if (msg.type === 'response' && waiting.has(msg.id)) {
      const e = waiting.get(msg.id);
      waiting.delete(msg.id);
      clearTimeout(e.timer);
      if (msg.status === 'error' || msg.error) e.reject(failure(msg)); else e.resolve(msg.result ?? msg);
    } else if (msg.type === 'ledgerClosed') handlers.onLedger?.(msg);
  }

  function onClose() {
    open = false;
    for (const [id, e] of waiting) { // what was on its way is lost; what was not sent yet waits for the next connection
      if (!e.sent) continue;
      waiting.delete(id);
      clearTimeout(e.timer);
      e.reject(new Error('connection lost'));
    }
    handlers.onClose?.();
  }

  X.ws = {
    call,
    /** handlers: onSubscribed(result) the subscription is accepted, onLedger(msg) a ledger closed, onClose(). */
    start(h) {
      handlers = h;
      return Explorer.jsonrpc.socket({ urls: () => cfg().ws, staleMs: cfg().wsStaleMs, onOpen, onMessage, onClose });
    },
  };
})();
