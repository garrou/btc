// The detail dialog: renders blocks and transactions. Views only: data is fetched by controllers/details.js.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});
  const { $, el } = BTC.dom;
  const F = BTC.format;
  const MAX_IO_ROWS = 20; // inputs / outputs shown per transaction

  const dialog = $('#detail');
  const body = $('#detail-body');
  let handlers = {};

  function show(...nodes) {
    body.replaceChildren(...nodes.flat()); // flatten arrays (e.g. a list of transactions)
    if (!dialog.open) {
      dialog.showModal();
      dialog.focus(); // showModal() focuses the close button, which then shows a focus ring on top of its hover border
    }
  }

  const fields = (rows) => el('dl', {}, rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  const mono = (text) => el('span', { class: 'mono' }, text);
  const link = (text, onclick, extra = '') => el('button', { class: `link${extra}`, onclick }, text);
  // An output without address: a data carrier (OP_RETURN), a bare public key, bare multisig or a non-standard script.
  const NO_ADDRESS = { op_return: 'OP_RETURN (data)', p2pk: 'P2PK (no address)', multisig: 'Bare multisig (no address)', unknown: 'Non-standard script' };
  const owner = (address, type) => address ?? NO_ADDRESS[type] ?? `No address${type ? ` (${type})` : ''}`;
  const addrLine = (label, sats) => el('li', {}, mono(label), el('span', {}, sats == null ? '—' : F.btc(sats)));
  const moreRow = (n) => el('li', { class: 'more' }, `… and ${F.number(n)} more (not shown)`);
  const limited = (rows) => [...rows.slice(0, MAX_IO_ROWS), ...(rows.length > MAX_IO_ROWS ? [moreRow(rows.length - MAX_IO_ROWS)] : [])];

  function txCard(tx, linked = true) {
    const inputs = tx.vin.map((i) => (i.is_coinbase ? addrLine('Coinbase (new coins)', null)
      : i.prevout ? addrLine(owner(i.prevout.scriptpubkey_address, i.prevout.scriptpubkey_type), i.prevout.value) : addrLine('Unknown input', null)));
    const outputs = tx.vout.map((o) => addrLine(owner(o.scriptpubkey_address, o.scriptpubkey_type), o.value));
    const inTotal = BTC.txs.inputTotal(tx);
    const id = linked ? link(tx.txid, () => handlers.onOpenTx(tx.txid), ' mono') : mono(tx.txid);
    return el('div', { class: 'tx-card' }, id,
      el('div', { class: 'io' },
        el('div', {}, el('b', {}, `Inputs (${tx.vin.length})`),
          el('span', { class: 'io-total' }, inTotal ? `${inTotal.partial ? '≥ ' : ''}${F.btc(inTotal.sum)}` : 'new coins'),
          el('ul', {}, limited(inputs))),
        el('div', {}, el('b', {}, `Outputs (${tx.vout.length})`),
          el('span', { class: 'io-total' }, F.btc(BTC.txs.outputTotal(tx))),
          el('ul', {}, limited(outputs)))));
  }

  BTC.ui.detail = {
    /** handlers: onOpenTx(txid), onOpenBlock(hash) */
    init(h) {
      handlers = h;
      $('#close').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', (e) => { // close on backdrop click only (not on the dialog's own padding)
        if (e.target !== dialog) return;
        const r = dialog.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
      });
    },
    close() { if (dialog.open) dialog.close(); },
    loading() { show(el('p', { class: 'muted' }, 'Loading…')); },
    message(text) { show(el('p', {}, text)); },

    /** tx: full transaction from /tx/:txid */
    tx(tx) {
      const st = tx.status, inTotal = BTC.txs.inputTotal(tx), rate = BTC.txs.fullFeeRate(tx);
      show(el('h2', {}, 'Transaction'), fields([
        ['Txid', mono(tx.txid)],
        ['Status', st.confirmed
          ? el('span', {}, 'Confirmed in block ', link(`#${F.number(st.block_height)}`, () => handlers.onOpenBlock(st.block_hash)), ` · ${F.date(st.block_time)}`)
          : 'Unconfirmed (mempool)'],
        ...(inTotal ? [['Total input', `${inTotal.partial ? '≥ ' : ''}${F.btc(inTotal.sum)}`]] : []),
        ['Total output', F.btc(BTC.txs.outputTotal(tx))],
        ['Fee', tx.fee != null ? `${F.number(tx.fee)} sats${rate != null ? ` (${rate.toFixed(1)} sat/vB)` : ''}` : '—'],
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
        ['Fill', `${F.fixed(BTC.blocks.fillPercent(b))}% of capacity (4 MWU)`],
        ['Miner', x?.pool?.name ?? '—'],
        ['Median fee', x?.medianFee != null ? `${x.medianFee.toFixed(1)} sat/vB` : '—'],
        ...(x?.totalFees != null ? [['Total fees', F.btc(x.totalFees)]] : []),
        ...(b.previousblockhash ? [['Previous block', link(F.short(b.previousblockhash, 16, 8), () => handlers.onOpenBlock(b.previousblockhash), ' mono')]] : []), // absent for the genesis block
      ]), el('h3', {}, `First transactions (${txs.length} / ${F.number(b.tx_count)})`), txs.map((t) => txCard(t)));
    },
  };
})();
