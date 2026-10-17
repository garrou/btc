// What the detail dialog shows for Bitcoin: blocks, transactions, addresses. Views only: data is fetched by controllers/details.js;
// the dialog itself (opening, closing, "Loading…") is the engine's: ui/dialog.js.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const { el } = Explorer.dom;
  const F = Explorer.format;
  const MAX_IO_ROWS = 20; // inputs / outputs shown per transaction

  let handlers = {};
  let page = null; // the address page being shown (null when the dialog shows something else); see address() / moreTxs()

  function show(...nodes) {
    page = null; // whatever the dialog showed is replaced
    Explorer.ui.dialog.show(...nodes);
  }

  const fields = (rows) => el('dl', {}, rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  const mono = (text) => el('span', { class: 'mono' }, text);
  const link = (text, onclick, extra = '') => el('button', { class: `link${extra}`, onclick }, text);
  // An output without address: a data carrier (OP_RETURN), a bare public key, bare multisig or a non-standard script.
  const NO_ADDRESS = { op_return: 'OP_RETURN (data)', p2pk: 'P2PK (no address)', multisig: 'Bare multisig (no address)', unknown: 'Non-standard script' };
  const owner = (type) => NO_ADDRESS[type] ?? `No address${type ? ` (${type})` : ''}`;
  const moreRow = (n) => el('li', { class: 'more' }, `… and ${F.number(n)} more (not shown)`);
  const limited = (rows) => [...rows.slice(0, MAX_IO_ROWS), ...(rows.length > MAX_IO_ROWS ? [moreRow(rows.length - MAX_IO_ROWS)] : [])];

  /** One input or output: who it belongs to (an address opens its page, except the one being viewed) and how much. */
  function ioLine(address, type, sats, me) {
    const mine = address != null && address === me;
    const who = !address ? mono(owner(type))
      : mine ? mono(address)
        : link(address, () => handlers.onOpenAddress(address), ' mono');
    return el('li', mine ? { class: 'mine' } : {}, who, el('span', {}, sats == null ? '—' : F.btc(sats)));
  }

  /** The line above a transaction of an address page: when it was mined and what it did to the address's balance. */
  function txBalance(tx, address) {
    const st = tx.status, net = Explorer.bitcoin.address.delta(tx, address);
    return el('div', { class: 'tx-meta' },
      st.confirmed
        ? el('span', {}, 'Block ', link(`#${F.number(st.block_height)}`, () => handlers.onOpenBlock(st.block_hash)), ` · ${F.date(st.block_time)}`)
        : el('span', { class: 'pending' }, 'Unconfirmed (mempool)'),
      el('b', { class: `amt ${net < 0 ? 'down' : 'up'}` }, F.btcSigned(net)));
  }

  /** me: the address whose page is shown, if any (its lines are highlighted and the card tells what the tx did to it). */
  function txCard(tx, linked = true, me = null) {
    const inputs = tx.vin.map((i) => (i.is_coinbase ? el('li', {}, mono('Coinbase (new coins)'), el('span', {}, '—'))
      : i.prevout ? ioLine(i.prevout.scriptpubkey_address, i.prevout.scriptpubkey_type, i.prevout.value, me)
        : el('li', {}, mono('Unknown input'), el('span', {}, '—'))));
    const outputs = tx.vout.map((o) => ioLine(o.scriptpubkey_address, o.scriptpubkey_type, o.value, me));
    const inTotal = Explorer.bitcoin.txs.inputTotal(tx);
    const id = linked ? link(tx.txid, () => handlers.onOpenTx(tx.txid), ' mono') : mono(tx.txid);
    return el('div', { class: 'tx-card' }, id, me ? txBalance(tx, me) : null,
      el('div', { class: 'io' },
        el('div', {}, el('b', {}, `Inputs (${tx.vin.length})`),
          el('span', { class: 'io-total' }, inTotal ? `${inTotal.partial ? '≥ ' : ''}${F.btc(inTotal.sum)}` : 'new coins'),
          el('ul', {}, limited(inputs))),
        el('div', {}, el('b', {}, `Outputs (${tx.vout.length})`),
          el('span', { class: 'io-total' }, F.btc(Explorer.bitcoin.txs.outputTotal(tx))),
          el('ul', {}, limited(outputs)))));
  }

  const txsTitle = (loaded, total) => `Transactions (${F.number(loaded)} / ${F.number(total)})`;

  Explorer.ui.detail = {
    /**
     * handlers: onOpenTx(txid), onOpenBlock(hash), onOpenAddress(address), onMoreTxs() (older transactions of the address),
     * onShowInScene() (the address page offers to show its transactions in the 3D scene; absent without 3D)
     */
    init(h) { handlers = h; },
    loading() { page = null; Explorer.ui.dialog.loading(); },
    message(text) { page = null; Explorer.ui.dialog.message(text); },

    /** tx: full transaction from /tx/:txid */
    tx(tx) {
      const st = tx.status, inTotal = Explorer.bitcoin.txs.inputTotal(tx), rate = Explorer.bitcoin.txs.fullFeeRate(tx);
      show(el('h2', {}, 'Transaction'), fields([
        ['Txid', mono(tx.txid)],
        ['Status', st.confirmed
          ? el('span', {}, 'Confirmed in block ', link(`#${F.number(st.block_height)}`, () => handlers.onOpenBlock(st.block_hash)), ` · ${F.date(st.block_time)}`)
          : 'Unconfirmed (mempool)'],
        ...(inTotal ? [['Total input', `${inTotal.partial ? '≥ ' : ''}${F.btc(inTotal.sum)}`]] : []),
        ['Total output', F.btc(Explorer.bitcoin.txs.outputTotal(tx))],
        ['Fee', tx.vin?.[0]?.is_coinbase ? 'None (new coins)' : tx.fee != null ? `${F.number(tx.fee)} sats${rate != null ? ` (${rate.toFixed(1)} sat/vB)` : ''}` : '—'],
        ['Size', `${F.number(tx.size)} B · ${F.number(Math.ceil(tx.weight / 4))} vB`],
      ]), txCard(tx, false));
    },

    /** b: block with its mining extras (/v1/block/:hash), txs: its first transactions */
    block(b, txs) {
      const x = b.extras;
      show(el('h2', {}, `Block #${F.number(b.height)}`), fields([
        ['Hash', mono(b.id)],
        ['Date', `${F.date(b.timestamp)} (${F.ago(b.timestamp)})`],
        ['Transactions', F.number(b.tx_count)],
        ['Size', `${(b.size / 1e6).toFixed(2)} MB · ${(b.weight / 1e6).toFixed(2)} MWU`],
        ['Fill', `${F.fixed(Explorer.chain.fill(b) * 100)}% of capacity (4 MWU)`],
        ['Miner', x?.pool?.name ?? '—'],
        ['Median fee', x?.medianFee != null ? `${x.medianFee.toFixed(1)} sat/vB` : '—'],
        ...(x?.totalFees != null ? [['Total fees', F.btc(x.totalFees)]] : []),
        ...(b.previousblockhash ? [['Previous block', link(F.short(b.previousblockhash, 16, 8), () => handlers.onOpenBlock(b.previousblockhash), ' mono')]] : []), // absent for the genesis block
      ]), el('h3', {}, `First transactions (${txs.length} / ${F.number(b.tx_count)})`), txs.map((t) => txCard(t)));
    },

    /**
     * a: totals of the address (core/address.summary). txs: its latest transactions, or null when the list could not be
     * loaded (error: why). more: whether older transactions can be loaded.
     */
    address(a, txs, more, error) {
      const total = a.confirmedTxs + a.pendingTxs;
      const list = el('div', {}, (txs ?? []).map((t) => txCard(t, true, a.address)));
      const title = el('h3', {}, txs ? txsTitle(txs.length, total) : 'Transactions');
      const button = el('button', { type: 'button', class: 'addr-more', hidden: more ? null : '', onclick: () => {
        button.disabled = true;
        button.textContent = 'Loading…';
        handlers.onMoreTxs();
      } }, 'Load more');
      const scene = handlers.onShowInScene && txs && txs.length
        ? el('button', { type: 'button', class: 'show3d', title: 'Light up these transactions in the 3D scene', onclick: () => handlers.onShowInScene() }, 'Show in 3D')
        : null;
      show(el('h2', {}, 'Address'), fields([
        ['Address', mono(a.address)],
        ['Type', Explorer.bitcoin.address.kind(a.address)],
        ['Balance', F.btc(a.balance)],
        ...(a.pendingTxs ? [['Unconfirmed', `${F.btcSigned(a.pending)} (${F.number(a.pendingTxs)} transaction${a.pendingTxs > 1 ? 's' : ''} waiting for a block)`]] : []),
        ['Total received', F.btc(a.received)],
        ['Total sent', F.btc(a.sent)],
        ['Unspent outputs', F.number(a.unspent)],
      ]), scene, title,
      txs && !txs.length ? el('p', { class: 'muted' }, 'No transactions yet.') : null,
      txs ? null : el('p', { class: 'muted' }, `Couldn't load the transactions${error ? ` (${error})` : ''}.`),
      list, button);
      page = { list, title, button, address: a.address, total, loaded: txs ? txs.length : 0 };
    },

    /** Adds older transactions to the address page. more: whether even older ones can still be loaded. */
    moreTxs(txs, more) {
      if (!page || !page.list.isConnected) return; // the dialog shows something else now
      page.list.append(...txs.map((t) => txCard(t, true, page.address)));
      page.loaded += txs.length;
      page.title.textContent = txsTitle(page.loaded, page.total);
      page.button.disabled = false;
      page.button.textContent = 'Load more';
      page.button.hidden = !more;
    },

    /** Loading older transactions failed: the button offers to try again. */
    moreFailed() {
      if (!page || !page.list.isConnected) return;
      page.button.disabled = false;
      page.button.textContent = 'Loading failed. Retry';
    },
  };
})();
