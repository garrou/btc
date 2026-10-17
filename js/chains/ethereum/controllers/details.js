// Opening the detail dialog: fetches the data and hands it to the view. Only the latest request may update the dialog
// (an older, slower response never overwrites a newer one: see controllers/requests.js).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const E = (Explorer.ethereum = Explorer.ethereum || {});
  const { begin, isCurrent } = Explorer.requests;

  // These requests open the dialog (as "Loading…") before the response arrives: if the user has closed it meanwhile, a
  // late response must not open it again.
  const wanted = (token) => isCurrent(token) && Explorer.ui.dialog.isOpen();

  const rpc = () => E.rpc;
  const must = (x) => { if (x instanceof Error) throw x; return x; };

  // ----- tokens: name, symbol and decimals of a contract, read once -----
  const tokenCache = new Map();

  /** Reads name(), symbol() and decimals() of these contracts (one request). A contract that is not a token just gives nulls. */
  async function tokenInfo(addresses) {
    const todo = [...new Set(addresses)].filter((a) => !tokenCache.has(a));
    const results = new Map(addresses.filter((a) => tokenCache.has(a)).map((a) => [a, tokenCache.get(a)]));
    if (todo.length) {
      const S = E.abi.SEL;
      const calls = todo.flatMap((to) => [S.name, S.symbol, S.decimals].map((data) => ['eth_call', [{ to, data }, 'latest']]));
      const res = await rpc().batch(calls).catch(() => []);
      todo.forEach((a, i) => {
        const answers = res.slice(i * 3, i * 3 + 3);
        const [name, symbol, decimals] = answers.map((r) => (r instanceof Error ? null : r));
        const dec = decimals && decimals !== '0x' ? Number(E.abi.uint(decimals)) : null;
        const info = {
          name: E.abi.decodeText(name), symbol: E.abi.decodeText(symbol),
          decimals: dec != null && Number.isInteger(dec) && dec <= 77 ? dec : null, // a hostile contract may answer anything
        };
        // a call that failed (rate limit, timeout) is not remembered as "not a token": only real answers (even reverts) are
        const failed = answers.length < 3 || answers.some((r) => r instanceof Error && !r.rpc);
        if (failed) tokenCache.delete(a); else tokenCache.set(a, info);
        results.set(a, info);
      });
    }
    return new Map(addresses.map((a) => [a, results.get(a)]));
  }

  async function openTx(hash) {
    const token = begin();
    Explorer.ui.detail.loading();
    try {
      const [tx, receipt] = await rpc().batch([['eth_getTransactionByHash', [hash]], ['eth_getTransactionReceipt', [hash]]]);
      if (!must(tx)) throw Object.assign(new Error('no such transaction'), { status: 404 });
      const rec = receipt instanceof Error ? null : receipt;
      const header = rec ? await rpc().call('eth_getBlockByHash', [rec.blockHash, false]) : null;
      const block = header ? E.blocks.normalize(header) : null;
      const all = E.abi.transfers(rec?.logs);
      const shown = all.slice(0, Explorer.chain.config.logsShown);
      const tokens = await tokenInfo([...new Set(shown.map((t) => t.token))]).catch(() => new Map());
      if (!wanted(token)) return;
      Explorer.ui.detail.tx({ r: E.txs.row(tx, rec, block), tx, receipt: rec, block, transfers: shown, moreTransfers: all.length > shown.length, tokens });
    } catch (e) {
      if (wanted(token)) Explorer.ui.detail.message(e.status === 404 ? 'Transaction not found.' : `Could not load the transaction (${e.message})`);
    }
  }

  async function openBlock(id) {
    const token = begin();
    Explorer.ui.detail.loading();
    try {
      const { block, rows } = await E.data.rowsOf({ id });
      if (!wanted(token)) return;
      Explorer.ui.detail.block({ block, rows: rows.slice(0, 25) });
    } catch (e) {
      if (wanted(token)) Explorer.ui.detail.message(e.status === 404 ? 'Block not found.' : `Could not load the block (${e.message})`);
    }
  }

  /** An account: balance, number of transactions sent, code (a contract?), and what the mempool sample knows about it. */
  /** checksumOk: false when the user typed the address with a wrong checksum (the page warns). */
  async function openAddress(address, ens = null, checksumOk = true) {
    const token = begin();
    Explorer.ui.detail.loading();
    try {
      const [balance, nonce, code] = (await rpc().batch([
        ['eth_getBalance', [address, 'latest']], ['eth_getTransactionCount', [address, 'latest']], ['eth_getCode', [address, 'latest']],
      ])).map(must);
      const codeSize = code && code !== '0x' ? (code.length - 2) / 2 : 0;
      const delegate = codeSize === 23 && code.startsWith('0xef0100') ? `0x${code.slice(8)}` : null; // EIP-7702: a wallet that delegates to a contract
      const tokenOf = codeSize && !delegate ? (await tokenInfo([address]).catch(() => new Map())).get(address) : null;
      if (!wanted(token)) return;
      Explorer.ui.detail.address({
        address, ens, balance: E.format.big(balance), nonce: Number(E.format.big(nonce)), codeSize: delegate ? 0 : codeSize, delegate,
        token: tokenOf && (tokenOf.symbol || tokenOf.name) ? tokenOf : null,
        pending: E.live.pool.involving(address), checksumOk,
      });
    } catch (e) {
      if (wanted(token)) Explorer.ui.detail.message(`Address lookup failed (${e.message})`);
    }
  }

  /** An ENS name (name.eth): found through the ENS registry, then its resolver. Plain names only. */
  async function resolveName(name) {
    const node = `0x${E.abi.namehash(name)}`;
    const registry = Explorer.chain.config.ensRegistry;
    const resolverWord = await rpc().call('eth_call', [{ to: registry, data: E.abi.SEL.resolver + node.slice(2) }, 'latest']);
    const resolver = E.abi.addressOf(resolverWord);
    if (!resolver) return null;
    return E.abi.addressOf(await rpc().call('eth_call', [{ to: resolver, data: E.abi.SEL.addr + node.slice(2) }, 'latest']));
  }

  E.details = { openTx, openBlock, openAddress, resolveName, tokenInfo };
})();
