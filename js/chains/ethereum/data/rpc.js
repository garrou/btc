// The JSON-RPC client of the Ethereum nodes listed in Explorer.chain.config.rpc (the protocol part is js/net/jsonrpc.js).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const E = (Explorer.ethereum = Explorer.ethereum || {});

  E.rpc = Explorer.jsonrpc.create({ urls: () => Explorer.chain.config.rpc, timeoutMs: () => Explorer.chain.config.rpcTimeoutMs });
})();
