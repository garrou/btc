// The JSON-RPC client of the Solana nodes listed in Explorer.chain.config.rpc (the protocol part is js/net/jsonrpc.js), and the two
// reads that depend on the transaction version.
//
// Solana transactions have versions (legacy, 0, and now 1...). A node refuses to give a block or a transaction that is of a
// version newer than the one the client says it supports (maxSupportedTransactionVersion), with error -32015 and the number to
// use: "...try again with \"maxSupportedTransactionVersion\": 1". The page starts from config.maxTxVersion and, when a node
// asks for more, takes that number, remembers it and asks again: a new version of the format does not break the page.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const S = (Explorer.solana = Explorer.solana || {});

  const rpc = Explorer.jsonrpc.create({ urls: () => Explorer.chain.config.rpc, timeoutMs: () => Explorer.chain.config.rpcTimeoutMs });

  let version = null; // the version supported so far (starts at config.maxTxVersion)
  const current = () => (version ??= Explorer.chain.config.maxTxVersion);

  /** The version a node asks for in a -32015 error, or null when the error is something else. */
  function versionAsked(e) {
    if (!(e instanceof Error) || e.code !== -32015) return null;
    const m = /maxSupportedTransactionVersion\D+(\d+)/.exec(e.message);
    return m ? Number(m[1]) : null;
  }

  /** Calls made with the version in force; the failures that ask for a newer version are made again with it (once). */
  async function withVersion(calls) { // calls: [[method, (version) => params]] -> results, or Errors
    const used = current(); // the version these calls are made with: a refusal is judged against it, not against the shared value another call may have raised since
    const run = (list) => rpc.batch(list.map(([method, params]) => [method, params(current())]));
    let res = await run(calls);
    const asked = Math.max(0, ...res.map((r) => versionAsked(r) ?? 0));
    if (asked > used) {
      version = Math.max(current(), asked);
      const again = res.map((r, i) => (versionAsked(r) != null ? i : -1)).filter((i) => i >= 0);
      const redone = await run(again.map((i) => calls[i]));
      res = res.slice();
      again.forEach((i, k) => { res[i] = redone[k]; });
    }
    return res;
  }

  const blockOptions = (details) => (v) => [{ rewards: false, commitment: 'confirmed', maxSupportedTransactionVersion: v, transactionDetails: details }];

  S.rpc = {
    ...rpc,
    /** Blocks by slot, with the details 'signatures' | 'accounts' | 'none': an array of results, or Errors. */
    blocks: (slots, details) => withVersion(slots.map((slot) => ['getBlock', (v) => [slot, ...blockOptions(details)(v)]])),
    /** One block (rejects on an error). */
    async block(slot, details) {
      const [res] = await S.rpc.blocks([slot], details);
      if (res instanceof Error) throw res;
      return res;
    },
    /** A transaction read in full and parsed (rejects on an error); null when the node does not have it. */
    async transaction(signature) {
      const [res] = await withVersion([['getTransaction', (v) => [signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: v }]]]);
      if (res instanceof Error) throw res;
      return res;
    },
  };
})();
