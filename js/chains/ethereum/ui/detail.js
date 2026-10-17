// What the detail dialog shows for Ethereum: a transaction, a block, an address. Views only: the data is fetched by
// controllers/details.js; the dialog itself (opening, closing, "Loading…") is the engine's: ui/dialog.js.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const E = (Explorer.ethereum = Explorer.ethereum || {});
  const { el } = Explorer.dom;
  const F = Explorer.format;
  const X = () => E.format;
  const show = (...nodes) => Explorer.ui.dialog.show(...nodes);

  let handlers = {};

  const fields = (rows) => el('dl', {}, rows.filter(Boolean).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  const mono = (text) => el('span', { class: 'mono' }, text);
  const link = (text, onclick, extra = '') => el('button', { class: `link${extra}`, onclick }, text);
  const pct = (a, b) => `${F.fixed((a / (b || 1)) * 100)}%`;

  /** An address that opens its page; the checksummed spelling, with a name next to it when we know one. */
  function addr(a, { short = false, you = false } = {}) {
    if (!a) return mono('—');
    const text = E.address.checksum(a);
    const name = E.address.nameOf(a);
    return el('span', {}, link(short ? F.short(text, 8, 6) : text, () => handlers.onOpenAddress(a), ' mono'), name ? el('em', { class: 'eth-name' }, ` ${name}`) : null);
  }

  const blockLink = (b) => link(`#${F.number(b.height)}`, () => handlers.onOpenBlock(b.id));
  const statusPill = (ok) => (ok == null
    ? el('span', { class: 'eth-status wait' }, 'Included') // a receipt from before the status field existed (2017): success is not told
    : el('span', { class: `eth-status ${ok ? 'ok' : 'bad'}` }, ok ? 'Success' : 'Failed (reverted)'));

  /** The amount a token movement carries, with the token's symbol and decimals when we could read them. */
  function tokenAmount(t, tokens) {
    if (t.tokenId != null) return `NFT #${t.tokenId.toString().length > 12 ? `${t.tokenId.toString().slice(0, 12)}…` : t.tokenId}`;
    const info = tokens.get(t.token);
    const text = info && info.decimals != null ? X().units(t.value, info.decimals, 6) : `${F.number(t.value.toString())} (raw)`;
    return `${text} ${info?.symbol ?? ''}`.trim();
  }

  function transfersList(transfers, tokens, extra) {
    if (!transfers.length) return null;
    return el('div', {},
      el('h3', {}, `Token movements (${transfers.length}${extra ? '+' : ''})`),
      el('ul', { class: 'eth-transfers' }, transfers.map((t) => el('li', {},
        el('b', {}, tokenAmount(t, tokens)),
        el('span', {}, addr(t.from, { short: true }), ' → ', addr(t.to, { short: true })),
        el('small', { class: 'muted mono', title: t.token }, tokens.get(t.token)?.name ?? F.short(t.token, 8, 6))))));
  }

  /** One transaction of a block: a line of who sent what to whom, and what it paid. */
  function txCard(r) {
    const what = r.created ? 'Contract creation' : E.txs.labelOf(r.kind, r.selector);
    return el('div', { class: 'tx-card' },
      link(r.hash, () => handlers.onOpenTx(r.hash), ' mono'),
      el('div', { class: 'tx-meta' },
        el('span', {}, what, r.ok === false ? el('span', { class: 'eth-status bad' }, ' failed') : null),
        el('b', { class: 'amt' }, `${X().gwei(r.price)} gwei · ${X().gas(r.gasUsed ?? r.gasLimit)} gas`)),
      el('div', { class: 'eth-flow' }, addr(r.from, { short: true }), el('span', { class: 'eth-arrow' }, '→'), r.to ? addr(r.to, { short: true }) : mono(r.created ? `new ${F.short(r.created, 8, 6)}` : '—'),
        el('span', { class: 'amt' }, r.valueWei > 0n ? X().eth(r.valueWei, 5) : '')));
  }

  Explorer.ui.detail = {
    /** handlers: onOpenTx(hash), onOpenBlock(id), onOpenAddress(address) */
    init(h) { handlers = h; },
    loading() { Explorer.ui.dialog.loading(); },
    message(text) { Explorer.ui.dialog.message(text); },

    /**
     * v: { r (core/txs.row), tx (raw), receipt|null, block (normalized)|null, transfers, moreTransfers, tokens: Map, pending: pool entry|null }
     */
    tx(v) {
      const { r, tx, receipt, block } = v;
      const x = X();
      const fee = E.txs.feeWei(r);
      const burnt = block?.baseFeeWei != null && r.gasUsed != null ? block.baseFeeWei * BigInt(r.gasUsed) : null;
      const input = tx.input && tx.input !== '0x' ? (tx.input.length - 2) / 2 : 0;
      const sel = r.selector && E.txs.SELECTORS[r.selector];
      show(el('h2', {}, 'Transaction'), fields([
        ['Hash', mono(r.hash)],
        ['Status', receipt
          ? el('span', {}, statusPill(r.ok), ' in block ', blockLink(block ?? { id: receipt.blockHash, height: Number(x.big(receipt.blockNumber)) }), block ? ` · ${F.date(block.timestamp)}` : '')
          : el('span', {}, el('span', { class: 'eth-status wait' }, 'Pending'), ' waiting in the mempool')],
        ['From', addr(r.from)],
        ['To', r.to ? addr(r.to) : el('span', {}, 'Contract creation', r.created ? el('span', {}, ' → ', addr(r.created)) : '')],
        ['Value', x.eth(r.valueWei, 9)],
        ['Action', E.txs.labelOf(r.kind, r.selector) + (sel ? ` · ${sel[0]}()` : '')],
        r.gasUsed != null
          ? ['Fee', el('span', {}, x.eth(fee, 9), burnt != null ? el('small', { class: 'muted' }, ` · ${x.eth(burnt, 9)} burned, ${x.eth(fee - burnt, 9)} tip`) : '')]
          : ['Max fee', `${x.eth(r.maxFee * BigInt(r.gasLimit), 9)} (${x.gwei(x.weiToGwei(r.maxFee))} gwei × gas limit)`],
        r.gasUsed != null ? ['Gas price', el('span', {}, `${x.gwei(r.price)} gwei`, block?.baseFee != null ? el('small', { class: 'muted' }, ` · base ${x.gwei(block.baseFee)}, tip ${x.gwei(Math.max(0, r.price - block.baseFee))}`) : '')] : null,
        ['Gas', r.gasUsed != null ? `${F.number(r.gasUsed)} used of ${F.number(r.gasLimit)} (${pct(r.gasUsed, r.gasLimit)})` : `${F.number(r.gasLimit)} limit`],
        ['Type', E.txs.TYPE_NAMES[r.type] ?? `Type ${r.type}`],
        ['Nonce', F.number(r.nonce)],
        r.blobs ? ['Blobs', F.number(r.blobs)] : null,
        input ? ['Input data', `${F.number(input)} bytes${r.selector ? ` · ${r.selector}` : ''}`] : null,
      ]), transfersList(v.transfers, v.tokens, v.moreTransfers));
    },

    /** v: { block (normalized), rows (the first ones), total } */
    block(v) {
      const b = v.block, x = X();
      show(el('h2', {}, `Block #${F.number(b.height)}`), fields([
        ['Hash', mono(b.id)],
        ['Date', `${F.date(b.timestamp)} (${F.ago(b.timestamp)})`],
        ['Transactions', F.number(b.tx_count)],
        ['Gas used', `${F.number(b.gasUsed)} (${pct(b.gasUsed, b.gasLimit)} of ${x.gas(b.gasLimit)} · target 50%)`],
        b.baseFee != null ? ['Base fee', `${x.gwei(b.baseFee)} gwei · next block ${x.gwei(x.weiToGwei(E.blocks.nextBaseFee(b.baseFeeWei, b.gasUsed, b.gasLimit)))}`] : null,
        ['Burned', `${b.burnt.toFixed(5)} ETH`],
        ['Built by', b.builder ?? 'unknown'],
        ['Fee recipient', addr(b.miner)],
        ['Size', `${F.fixed(b.size / 1024, 1)} KB`],
        b.blobGasUsed ? ['Blob gas', F.number(b.blobGasUsed)] : null,
        b.withdrawals != null ? ['Withdrawals', F.number(b.withdrawals)] : null,
        b.previousblockhash ? ['Previous block', link(F.short(b.previousblockhash, 16, 8), () => handlers.onOpenBlock(b.previousblockhash), ' mono')] : null,
      ]), el('h3', {}, `First transactions (${v.rows.length} / ${F.number(b.tx_count)})`), v.rows.map(txCard));
    },

    /**
     * v: { address, balance (wei), nonce, codeSize, delegate (EIP-7702: the contract a wallet delegates to)|null, token: { name, symbol, decimals }|null, ens: name|null,
     *      pending: pool entries, checksumOk }
     */
    address(v) {
      const x = X();
      show(el('h2', {}, 'Address'), fields([
        ['Address', mono(E.address.checksum(v.address))],
        v.ens ? ['Name', v.ens] : null,
        E.address.nameOf(v.address) ? ['Known as', E.address.nameOf(v.address)] : null,
        ['Balance', x.eth(v.balance, 9)],
        ['Type', v.codeSize ? `Contract (${F.number(v.codeSize)} bytes of code)` : 'Externally owned account (a wallet)'],
        v.delegate ? ['Delegates to', addr(v.delegate)] : null,
        v.token ? ['Token', `${v.token.name ?? '?'}${v.token.symbol ? ` (${v.token.symbol})` : ''}${v.token.decimals != null ? ` · ${v.token.decimals} decimals` : ''}`] : null,
        ['Transactions sent', F.number(v.nonce)],
      ]),
      v.checksumOk ? null : el('p', { class: 'eth-warn' }, 'The capital letters do not match the address checksum: check it for a typo.'),
      v.pending.length
        ? el('div', {}, el('h3', {}, `Pending (${v.pending.length})`), v.pending.slice(0, 10).map((p) => txCard({
          hash: p.hash, from: p.from, to: p.to, valueWei: p.valueWei, kind: p.kind, selector: p.selector, ok: null,
          price: x.weiToGwei(p.maxFee), gasLimit: p.gas, gasUsed: null, created: null,
        })))
        : null,
      el('p', { class: 'muted' }, 'An Ethereum node does not list the transactions of an address (that takes an indexer such as Etherscan): this page shows what the node knows.'));
    },
  };
})();
