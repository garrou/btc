// What the detail dialog shows for Solana: a transaction, a block (a slot), an account. Views only: the data is fetched by
// controllers/details.js; the dialog itself (opening, closing, "Loading…") is the engine's: ui/dialog.js.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const S = (Explorer.solana = Explorer.solana || {});
  const { el } = Explorer.dom;
  const F = Explorer.format;
  const X = () => S.format;
  const show = (...nodes) => Explorer.ui.dialog.show(...nodes);

  let handlers = {};

  const fields = (rows) => el('dl', {}, rows.filter(Boolean).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  const mono = (text) => el('span', { class: 'mono' }, text);
  const link = (text, onclick, extra = '') => el('button', { class: `link${extra}`, onclick }, text);
  const pct = (a, b) => `${F.fixed((a / (b || 1)) * 100)}%`;

  /** An account address that opens its page; a known program (System, Token, Jupiter...) is named. */
  function addr(a, { short = false } = {}) {
    if (!a) return mono('—');
    const name = S.programs.nameOf(a);
    return el('span', {}, link(short ? F.short(a, 8, 6) : a, () => handlers.onOpenAddress(a), ' mono'), name ? el('em', { class: 'sol-name' }, ` ${name}`) : null);
  }

  const slotLink = (slot) => link(`#${F.number(slot)}`, () => handlers.onOpenSlot(slot));
  const status = (ok, err) => el('span', { class: `sol-status ${ok ? 'ok' : 'bad'}` }, ok ? 'Success' : `Failed${err ? ` (${typeof err === 'string' ? err : JSON.stringify(err)})` : ''}`);

  /** A transaction of a block, in a line or two. */
  function txCard(r) {
    return el('div', { class: 'tx-card' },
      link(r.sig, () => handlers.onOpenTx(r.sig), ' mono'),
      el('div', { class: 'tx-meta' },
        el('span', {}, r.label, r.ok ? null : el('span', { class: 'sol-status bad' }, 'failed')),
        el('b', { class: 'amt' }, r.priority > 0 ? `${X().price(r.priority)} lamports priority` : 'no priority fee')),
      el('div', { class: 'sol-flow' }, addr(r.payer, { short: true }),
        el('span', { class: 'amt' }, `fee ${X().sol(r.fee)}${r.priority > 0 ? ` (${X().sol(r.priority)} priority)` : ''} · ≈ ${X().cu(r.cu)} CU`)));
  }

  /** Rows of "address — amount" (balance changes). */
  function changes(title, items) {
    if (!items.length) return null;
    return el('div', {}, el('h3', {}, title), el('ul', { class: 'sol-changes' }, items.map((c) => el('li', {}, c.who, el('span', { class: `amt ${c.down ? 'down' : 'up'}` }, c.text)))));
  }

  /** Size of an account's data: parsed accounts say it, the others carry it base64-encoded as [data, 'base64']. */
  const dataSize = (a) => (a.data?.space != null ? a.data.space : Array.isArray(a.data) ? Math.floor((a.data[0].length * 3) / 4) : 0);

  Explorer.ui.detail = {
    /** handlers: onOpenTx(signature), onOpenSlot(slot), onOpenAddress(address) */
    init(h) { handlers = h; },
    loading() { Explorer.ui.dialog.loading(); },
    message(text) { Explorer.ui.dialog.message(text); },

    /** v: { signature, tx (getTransaction, jsonParsed), slot, blockTime } */
    tx(v) {
      const { tx } = v, meta = tx.meta ?? {}, msg = tx.transaction.message, x = X();
      const keys = msg.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
      const nSigs = tx.transaction.signatures.length;
      const fee = meta.fee ?? 0, priority = Math.max(0, fee - S.txs.BASE_FEE * nSigs);
      const budget = S.txs.computeBudget(msg.instructions);
      const kind = S.programs.kindOf(keys);
      const sol = S.txs.balanceChanges(meta, keys).slice(0, 8).map((c) => ({ who: addr(c.address, { short: true }), text: x.solSigned(c.change, 6), down: c.change < 0 }));
      const tokens = S.txs.tokenChanges(meta).slice(0, 8).map((c) => ({
        who: el('span', {}, addr(c.owner, { short: true }), el('small', { class: 'muted mono', title: c.mint }, ` token ${F.short(c.mint, 6, 4)}`)),
        text: `${c.change < 0n ? '' : '+'}${x.units(c.change, c.decimals)}`, down: c.change < 0n,
      }));
      show(el('h2', {}, 'Transaction'), fields([
        ['Signature', mono(v.signature)],
        ['Status', status(!meta.err, meta.err)],
        ['Block', el('span', {}, slotLink(v.slot), v.blockTime ? ` · ${F.date(v.blockTime)}` : '')],
        ['Fee payer', addr(keys[0])],
        ['Action', S.programs.labelOf(kind, keys)],
        ['Fee', el('span', {}, x.sol(fee, 9), el('small', { class: 'muted' }, ` · ${x.sol(S.txs.BASE_FEE * nSigs, 9)} base${priority ? `, ${x.sol(priority, 9)} priority` : ''}`))],
        ['Compute', `${meta.computeUnitsConsumed != null ? F.number(meta.computeUnitsConsumed) : '?'} units used${budget.limit != null ? ` of ${F.number(budget.limit)} asked` : ''}${budget.price ? ` · priced ${F.number(budget.price)} µlamports per unit` : ''}`],
        ['Signatures', F.number(nSigs)],
        ['Accounts', F.number(keys.length)],
        tx.version != null ? ['Version', String(tx.version)] : null,
      ]),
      el('h3', {}, `Instructions (${msg.instructions.length})`),
      el('ul', { class: 'sol-ix' }, msg.instructions.map((ix) => {
        const d = S.txs.describeInstruction(ix);
        return el('li', {}, el('b', {}, d.program), el('span', { class: 'muted' }, ` ${d.action}`), d.text ? el('small', { class: 'mono' }, d.text) : null);
      })),
      changes('SOL balance changes', sol), changes('Token balance changes', tokens),
      meta.logMessages?.length
        ? el('details', { class: 'sol-logs' }, el('summary', {}, `Program log (${meta.logMessages.length} lines)`), el('pre', {}, meta.logMessages.slice(0, Explorer.chain.config.logLines).join('\n') + (meta.logMessages.length > Explorer.chain.config.logLines ? '\n…' : '')))
        : null);
    },

    /** v: { block, rows (every transaction of the block, in block order) } */
    block(v) {
      const b = v.block, rows = v.rows, x = X();
      const votes = rows.filter((r) => r.kind === 'vote').length;
      const failed = rows.filter((r) => !r.ok).length;
      const paying = rows.filter((r) => r.priority > 0).length;
      const cu = rows.reduce((s, r) => s + (r.cu ?? 0), 0);
      const fees = rows.reduce((s, r) => s + r.fee, 0), tips = rows.reduce((s, r) => s + r.priority, 0);
      const top = rows.filter((r) => r.kind !== 'vote').sort((a, c) => c.priority - a.priority).slice(0, 15);
      show(el('h2', {}, `Slot #${F.number(b.slot)}`), fields([
        ['Blockhash', mono(b.id)],
        ['Date', `${F.date(b.timestamp)} (${F.ago(b.timestamp)})`],
        b.blockHeight != null ? ['Block height', F.number(b.blockHeight)] : null,
        ['Parent', el('span', {}, `slot `, slotLink(b.parentSlot))],
        ['Transactions', `${F.number(rows.length)} · ${F.number(votes)} votes (${pct(votes, rows.length)}) · ${F.number(failed)} failed (${pct(failed, rows.length)})`],
        ['Compute', `≈ ${F.number(cu)} units estimated (${pct(cu, Explorer.chain.capacity.size)} of ${x.cu(Explorer.chain.capacity.size)}): the light read of a block does not give the real figure, a transaction page does`],
        ['Fees', `${x.sol(fees, 6)} · ${x.sol(tips, 6)} of it priority fees paid by ${F.number(paying)} transactions`],
      ]),
      el('h3', {}, `Highest priority fees (${top.length})`), top.map(txCard));
    },

    /** v: { address, lamports, account (getAccountInfo value, null when the account does not exist), history|null, historyError } */
    address(v) {
      const x = X(), a = v.account, parsed = a?.data?.parsed;
      const info = parsed?.info ?? {};
      show(el('h2', {}, 'Account'), fields([
        ['Address', el('span', {}, mono(v.address), S.programs.nameOf(v.address) ? el('em', { class: 'sol-name' }, ` ${S.programs.nameOf(v.address)}`) : null)],
        ['Balance', x.sol(v.lamports, 9)],
        ['Type', !a ? 'Does not exist on chain (no SOL, never funded)' : a.executable ? 'Program (executable)' : parsed?.type === 'mint' ? 'Token mint' : parsed?.type === 'account' ? 'Token account' : a.owner === S.programs.SYSTEM ? 'Wallet (owned by the System program)' : 'Data account'],
        a ? ['Owner program', addr(a.owner)] : null,
        a ? ['Data size', `${F.number(dataSize(a))} bytes`] : null,
        parsed?.type === 'account' ? ['Holds', `${info.tokenAmount?.uiAmountString ?? '?'} of token ${F.short(info.mint ?? '?', 8, 6)}`] : null,
        parsed?.type === 'account' ? ['Token owner', addr(info.owner)] : null,
        parsed?.type === 'mint' ? ['Supply', `${x.units(BigInt(info.supply ?? 0), info.decimals ?? 0, 2)} (${info.decimals} decimals)`] : null,
      ]),
      el('h3', {}, v.history ? `Latest transactions (${v.history.length})` : 'Latest transactions'),
      v.history && !v.history.length ? el('p', { class: 'muted' }, 'No transaction yet.') : null,
      v.history ? el('ul', { class: 'sol-history' }, v.history.map((h) => el('li', {},
        link(F.short(h.signature, 14, 8), () => handlers.onOpenTx(h.signature), ' mono'),
        status(!h.err, null),
        el('span', { class: 'muted' }, `slot ${F.number(h.slot)}${h.blockTime ? ` · ${F.ago(h.blockTime)}` : ''}`)))) : el('p', { class: 'muted' }, `Couldn't load the transactions${v.historyError ? ` (${v.historyError})` : ''}.`));
    },
  };
})();
