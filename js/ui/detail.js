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
  const addrLine = (addr, sats) => el('li', {}, mono(addr ?? 'OP_RETURN / non standard'), el('span', {}, F.btc(sats)));
  const moreRow = (n) => el('li', { class: 'more' }, `… et ${F.number(n)} autre${n > 1 ? 's' : ''} (non affichée${n > 1 ? 's' : ''})`);
  const limited = (rows) => [...rows.slice(0, MAX_IO_ROWS), ...(rows.length > MAX_IO_ROWS ? [moreRow(rows.length - MAX_IO_ROWS)] : [])];

  function txCard(tx, linked = true) {
    const inputs = tx.vin.map((i) => (i.is_coinbase ? addrLine('Coinbase (nouveaux BTC)', 0) : addrLine(i.prevout?.scriptpubkey_address, i.prevout?.value ?? 0)));
    const outputs = tx.vout.map((o) => addrLine(o.scriptpubkey_address, o.value));
    const inTotal = BTC.txs.inputTotal(tx);
    const id = linked ? link(tx.txid, () => handlers.onOpenTx(tx.txid), ' mono') : mono(tx.txid);
    return el('div', { class: 'tx-card' }, id,
      el('div', { class: 'io' },
        el('div', {}, el('b', {}, `Entrées (${tx.vin.length})`),
          el('span', { class: 'io-total' }, inTotal ? `${inTotal.partial ? '≥ ' : ''}${F.btc(inTotal.sum)}` : 'nouveaux BTC'),
          el('ul', {}, limited(inputs))),
        el('div', {}, el('b', {}, `Sorties (${tx.vout.length})`),
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
    loading() { show(el('p', { class: 'muted' }, 'Chargement…')); },
    message(text) { show(el('p', {}, text)); },

    /** tx: full transaction from /tx/:txid */
    tx(tx) {
      const st = tx.status, inTotal = BTC.txs.inputTotal(tx), rate = BTC.txs.fullFeeRate(tx);
      show(el('h2', {}, 'Transaction'), fields([
        ['Txid', mono(tx.txid)],
        ['Statut', st.confirmed
          ? el('span', {}, 'Confirmée dans le bloc ', link(`#${F.number(st.block_height)}`, () => handlers.onOpenBlock(st.block_hash)), ` · ${F.date(st.block_time)}`)
          : 'Non confirmée (mempool)'],
        ...(inTotal ? [['Total dépensé (entrées)', `${inTotal.partial ? '≥ ' : ''}${F.btc(inTotal.sum)}`]] : []),
        ['Total envoyé (sorties)', F.btc(BTC.txs.outputTotal(tx))],
        ['Frais', tx.fee != null ? `${F.number(tx.fee)} sats${rate != null ? ` (${rate.toFixed(1)} sat/vB)` : ''}` : '—'],
        ['Taille', `${F.number(tx.size)} o · ${F.number(Math.ceil(tx.weight / 4))} vB`],
      ]), txCard(tx, false));
    },

    /** b: block with its mining extras (/v1/block/:hash), txs: its first transactions */
    block(b, txs) {
      const x = b.extras;
      show(el('h2', {}, `Bloc #${F.number(b.height)}`), fields([
        ['Hash', mono(b.id)],
        ['Date', `${F.date(b.timestamp)} (${F.ago(b.timestamp)})`],
        ['Transactions', F.number(b.tx_count)],
        ['Taille', `${(b.size / 1e6).toFixed(2)} Mo · ${(b.weight / 1e6).toFixed(2)} MWU`],
        ['Remplissage', `${F.fixed(BTC.blocks.fillPercent(b))} % de la capacité (4 MWU)`],
        ['Mineur', x?.pool?.name ?? '—'],
        ['Frais médian', x?.medianFee != null ? `${x.medianFee.toFixed(1)} sat/vB` : '—'],
        ...(x?.totalFees != null ? [['Frais totaux', F.btc(x.totalFees)]] : []),
        ...(b.previousblockhash ? [['Bloc précédent', link(F.short(b.previousblockhash, 16, 8), () => handlers.onOpenBlock(b.previousblockhash), ' mono')]] : []), // absent for the genesis block
      ]), el('h3', {}, `Premières transactions (${txs.length} / ${F.number(b.tx_count)})`), txs.map((t) => txCard(t)));
    },
  };
})();
