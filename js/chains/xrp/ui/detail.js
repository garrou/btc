// What the detail dialog shows for the XRP Ledger: a transaction, a ledger, an account. Views only: the data is fetched by
// controllers/details.js; the dialog itself (opening, closing, "Loading…") is the engine's: ui/dialog.js.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const X = (Explorer.xrp = Explorer.xrp || {});
  const { el } = Explorer.dom;
  const F = Explorer.format;
  const show = (...nodes) => Explorer.ui.dialog.show(...nodes);

  let handlers = {};

  const fields = (rows) => el('dl', {}, rows.filter(Boolean).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  const mono = (text) => el('span', { class: 'mono' }, text);
  const link = (text, onclick, extra = '') => el('button', { class: `link${extra}`, onclick }, text);
  const pct = (a, b) => `${F.fixed((a / (b || 1)) * 100)}%`;

  /** An account address that opens its page. */
  const addr = (a, { short = false } = {}) => (a ? link(short ? F.short(a, 8, 6) : a, () => handlers.onOpenAccount(a), ' mono') : mono('—'));
  const ledgerLink = (index, hash) => link(`#${F.number(index)}`, () => handlers.onOpenLedger(hash ?? index));
  const status = (result) => el('span', { class: `xrp-status ${result === 'tesSUCCESS' ? 'ok' : result?.startsWith('tec') ? 'bad' : 'wait'}` }, result ?? 'unknown');
  const kindDot = (kind) => el('i', { class: 'kind-dot', style: `background:#${X.txs.KINDS[kind].color.toString(16).padStart(6, '0')}` });

  /** A transaction of a ledger, in a line or two. */
  function txCard(r) {
    return el('div', { class: 'tx-card' },
      link(r.hash, () => handlers.onOpenTx(r.hash), ' mono'),
      el('div', { class: 'tx-meta' },
        el('span', {}, kindDot(r.kind), r.label, r.ok === false ? el('span', { class: 'xrp-status bad' }, r.result) : null),
        el('b', { class: 'amt' }, r.moved != null ? X.format.amount(r.moved, 4) : `${F.number(r.nodes)} objects`)),
      el('div', { class: 'xrp-flow' }, addr(r.account, { short: true }), r.destination ? el('span', {}, '→ ', addr(r.destination, { short: true })) : null,
        el('span', { class: 'amt' }, `fee ${F.number(r.fee)} drops (${X.format.times(r.ratio)}) · ${F.number(r.nodes)} objects`)));
  }

  /** Rows of "account — change" (balance changes). */
  function changes(title, items) {
    if (!items.length) return null;
    return el('div', {}, el('h3', {}, title), el('ul', { class: 'xrp-changes' }, items.map((c) => el('li', {}, addr(c.account, { short: true }),
      el('span', { class: `amt ${c.drops < 0n ? 'down' : 'up'}` }, X.format.xrpSigned(c.drops))))));
  }

  /** What an exchange order says: it sells `TakerGets` for `TakerPays`. */
  const orderText = (tx) => `sells ${X.format.amount(tx.TakerGets)} for ${X.format.amount(tx.TakerPays)}`;

  Explorer.ui.detail = {
    /** handlers: onOpenTx(hash), onOpenLedger(hash or index), onOpenAccount(address) */
    init(h) { handlers = h; },
    loading() { Explorer.ui.dialog.loading(); },
    message(text) { Explorer.ui.dialog.message(text); },

    /** v: { r (core/txs.row), ledgerIndex, date (Unix seconds)|null, validated } */
    tx(v) {
      const { r } = v, tx = r.tx, f = X.format;
      const changed = X.txs.balanceChanges(r.meta);
      show(el('h2', {}, 'Transaction'), fields([
        ['Hash', mono(r.hash)],
        ['Type', el('span', {}, kindDot(r.kind), r.label, r.label !== r.type ? el('em', { class: 'xrp-name' }, ` ${r.type}`) : null)],
        ['Result', status(r.result)],
        ['Ledger', v.ledgerIndex != null ? el('span', {}, ledgerLink(v.ledgerIndex), v.date ? ` · ${F.date(v.date)} (${F.ago(v.date)})` : '', v.validated === false ? ' · not validated yet' : '') : 'Not in a ledger yet'],
        ['Account', addr(r.account)],
        r.destination ? ['Destination', addr(r.destination)] : null,
        r.type === 'Payment' ? ['Amount', r.moved != null ? f.amount(r.moved) : '—'] : null,
        r.type === 'Payment' && tx.SendMax ? ['Send at most', f.amount(tx.SendMax)] : null,
        r.type === 'OfferCreate' ? ['Order', orderText(tx)] : null,
        r.type === 'TrustSet' && tx.LimitAmount ? ['Trust limit', f.amount(tx.LimitAmount)] : null,
        ['Fee', `${F.number(r.fee)} drops = ${f.xrp(r.fee)} (${f.times(r.ratio)} the reference fee), burned`],
        ['Sequence', tx.Sequence != null ? F.number(tx.Sequence) : '—'],
        tx.DestinationTag != null ? ['Destination tag', F.number(tx.DestinationTag)] : null,
        ['Position', r.index != null ? `#${F.number(r.index)} in its ledger` : '—'],
        ['Ledger objects touched', F.number(r.nodes)],
      ]), changes('XRP balance changes', changed));
    },

    /** v: { block, rows (every transaction of the ledger, in ledger order) } */
    block(v) {
      const b = v.block, rows = v.rows, f = X.format;
      const count = (k) => rows.filter((r) => r.kind === k).length;
      const kinds = Object.keys(X.txs.KINDS).map((k) => [k, count(k)]).filter(([, n]) => n);
      const nodes = rows.reduce((s, r) => s + r.nodes, 0), fees = rows.reduce((s, r) => s + r.fee, 0);
      const top = rows.slice().sort((a, c) => c.nodes - a.nodes).slice(0, 15);
      show(el('h2', {}, `Ledger #${F.number(b.height)}`), fields([
        ['Hash', mono(b.id)],
        ['Closed', `${F.date(b.timestamp)} (${F.ago(b.timestamp)})${b.closedIn != null ? ` · ${b.closedIn} s after the previous one` : ''}`],
        b.previousblockhash ? ['Parent', ledgerLink(b.height - 1, b.previousblockhash)] : null,
        ['Transactions', `${F.number(rows.length)} · ${F.number(count('failed'))} failed (${pct(count('failed'), rows.length)})`],
        ['By kind', el('span', { class: 'xrp-kinds' }, kinds.map(([k, n]) => el('span', {}, kindDot(k), `${X.txs.KINDS[k].label} ${F.number(n)}`)))],
        ['Ledger objects touched', `${F.number(nodes)} (${pct(nodes, Explorer.chain.capacity.size)} of the ${F.number(Explorer.chain.capacity.size)} the platform stands for)`],
        ['Fees burned', f.xrp(fees)],
        b.totalCoins ? ['XRP in existence', f.xrp(b.totalCoins, 0)] : null,
      ]),
      el('h3', {}, `Largest by ledger objects touched (${top.length})`), top.map(txCard));
    },

    /** v: { address, data (account_data)|null, history|null (rows), historyError } */
    address(v) {
      const f = X.format, a = v.data;
      show(el('h2', {}, 'Account'), fields([
        ['Address', mono(v.address)],
        ['Balance', a ? f.xrp(a.Balance) : 'Does not exist on chain (never funded)'],
        a ? ['Objects owned', F.number(a.OwnerCount ?? 0)] : null,
        a ? ['Next sequence', F.number(a.Sequence ?? 0)] : null,
        a && a.Domain ? ['Domain', mono(a.Domain)] : null,
        a && a.RegularKey ? ['Regular key', addr(a.RegularKey, { short: true })] : null,
      ]),
      el('h3', {}, v.history ? `Latest transactions (${v.history.length})` : 'Latest transactions'),
      v.history && !v.history.length ? el('p', { class: 'muted' }, 'No transaction yet.') : null,
      v.history ? el('ul', { class: 'xrp-history' }, v.history.map((h) => el('li', {},
        link(F.short(h.hash, 14, 8), () => handlers.onOpenTx(h.hash), ' mono'),
        el('span', {}, kindDot(h.kind), h.label),
        status(h.result),
        el('span', { class: 'muted' }, h.ledger != null ? `ledger ${F.number(h.ledger)}${h.date ? ` · ${F.ago(h.date)}` : ''}` : '')))) : el('p', { class: 'muted' }, `Couldn't load the transactions${v.historyError ? ` (${v.historyError})` : ''}.`));
    },
  };
})();
