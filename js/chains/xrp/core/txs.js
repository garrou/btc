// XRP Ledger transactions: from the server's JSON to the rows the dialogs show and the towers the scene draws. Pure.
//   tower = { txid (the hash), vsize (ledger objects the transaction touched), rate (its fee in multiples of the reference
//             fee), color (its kind of transaction) } + what the tooltips say
// A transaction has no size and no price to bid with: the fee is the same for nearly everybody (10 drops, burned), so a tower's
// COLOR says what the transaction is (a payment, an order of the exchange, a trust line...), its FOOTPRINT how much of the
// ledger it touched (the AffectedNodes of its metadata), and its HEIGHT how far its fee is above the reference one (flat at
// the minimum, a spike when someone paid more).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const X = (Explorer.xrp = Explorer.xrp || {});

  const KINDS = X.kinds; // the kinds and their colors: chain.js (the legend needs them while it loads)

  const KIND_OF = {
    Payment: 'payment',
    OfferCreate: 'dex', OfferCancel: 'dex',
    TrustSet: 'trust',
  };
  const LABEL = {
    Payment: 'Payment', OfferCreate: 'Exchange order', OfferCancel: 'Order cancelled', TrustSet: 'Trust line set', AccountSet: 'Account settings',
    SetRegularKey: 'Regular key set', SignerListSet: 'Signer list set', EscrowCreate: 'Escrow created', EscrowFinish: 'Escrow finished',
    EscrowCancel: 'Escrow cancelled', PaymentChannelCreate: 'Channel created', PaymentChannelFund: 'Channel funded',
    PaymentChannelClaim: 'Channel claim', CheckCreate: 'Check created', CheckCash: 'Check cashed', CheckCancel: 'Check cancelled',
    DepositPreauth: 'Deposit preauthorization', TicketCreate: 'Ticket created', AccountDelete: 'Account deleted',
    NFTokenMint: 'NFT minted', NFTokenBurn: 'NFT burned', NFTokenCreateOffer: 'NFT offer created', NFTokenCancelOffer: 'NFT offer cancelled',
    NFTokenAcceptOffer: 'NFT offer accepted', AMMCreate: 'AMM pool created', AMMDeposit: 'AMM deposit', AMMWithdraw: 'AMM withdrawal',
    AMMVote: 'AMM vote', AMMBid: 'AMM auction bid', AMMDelete: 'AMM pool deleted', AMMClawback: 'AMM clawback', Clawback: 'Clawback',
    EnableAmendment: 'Amendment (network)', SetFee: 'Fee setting (network)', UNLModify: 'Validator list (network)',
  };

  /** The kind of a transaction: its type, unless it failed (a "tec" result still pays the fee, but changed nothing). */
  function kindOf(type, result) {
    if (typeof result === 'string' && result.startsWith('tec')) return 'failed';
    if (KIND_OF[type]) return KIND_OF[type];
    if (/^AMM/.test(type)) return 'amm';
    if (/^NFToken/.test(type)) return 'nft';
    return 'other';
  }
  const labelOf = (type) => LABEL[type] ?? type;

  /**
   * The parts of any shape a server gives a transaction: in a ledger the fields sit at the top and the metadata is `metaData`; in
   * an account's history they are in `tx` (older API) or `tx_json` (newer one) beside `meta`; a `tx` answer has both at the top.
   */
  function parts(entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.tx_json) return { tx: { ...entry.tx_json, hash: entry.hash ?? entry.tx_json.hash }, meta: entry.meta ?? entry.metaData, extra: entry };
    if (entry.tx) return { tx: entry.tx, meta: entry.meta ?? entry.metaData, extra: entry };
    return { tx: entry, meta: entry.meta ?? entry.metaData, extra: entry };
  }

  /** The amount a payment really moved: the metadata's delivered amount, else the amount asked for. */
  const movedOf = (tx, meta) => meta?.delivered_amount ?? meta?.DeliveredAmount ?? tx.DeliverMax ?? tx.Amount ?? null;

  /**
   * A transaction of a ledger (or of an account's history), as a row. Returns null for something that is not a transaction we can
   * read (one odd entry must not take the whole ledger with it).
   */
  function row(entry) {
    const p = parts(entry);
    if (!p || !p.tx || typeof p.tx.hash !== 'string' || typeof p.tx.TransactionType !== 'string') return null;
    const { tx, meta } = p;
    const result = meta?.TransactionResult ?? entry.TransactionResult ?? null;
    const fee = Number(tx.Fee ?? 0);
    const base = Explorer.chain.config.baseFee;
    const type = tx.TransactionType;
    const kind = kindOf(type, result);
    return {
      hash: tx.hash, type, kind, label: labelOf(type),
      account: tx.Account ?? null, destination: tx.Destination ?? null,
      fee, ratio: Math.max(1, fee / base),
      result, ok: result == null ? null : result === 'tesSUCCESS',
      nodes: Array.isArray(meta?.AffectedNodes) ? meta.AffectedNodes.length : 0,
      index: meta?.TransactionIndex ?? null,
      moved: type === 'Payment' ? movedOf(tx, meta) : null,
      tx, meta,
    };
  }

  /** The tower of a row: what the engine draws and the tooltips describe. */
  function towerOf(r) {
    return {
      txid: r.hash, vsize: Math.max(1, r.nodes), rate: r.ratio, color: KINDS[r.kind].color,
      type: r.type, kind: r.kind, label: r.label, ok: r.ok !== false, result: r.result, fee: r.fee, nodes: r.nodes,
      account: r.account, moved: r.moved,
    };
  }

  /** A line of the live feed: the same tower, with the rate it carries. */
  const feedItem = (r) => ({ txid: r.hash, vsize: Math.max(1, r.nodes), rate: r.ratio, fee: r.fee, label: r.label, moved: r.moved, kind: r.kind });

  /** Changes of XRP balance a transaction made, from its metadata: [{ account, drops (BigInt) }], the largest first. */
  function balanceChanges(meta) {
    const out = [];
    for (const node of meta?.AffectedNodes ?? []) {
      const n = node.ModifiedNode ?? node.CreatedNode ?? node.DeletedNode;
      if (!n || n.LedgerEntryType !== 'AccountRoot') continue;
      try {
        if (node.CreatedNode) out.push({ account: n.NewFields.Account, drops: BigInt(n.NewFields.Balance ?? 0) });
        else {
          const before = n.PreviousFields?.Balance, after = n.FinalFields?.Balance;
          if (before == null || after == null) continue;
          const d = BigInt(after) - BigInt(before);
          if (d !== 0n) out.push({ account: n.FinalFields.Account, drops: d });
        }
      } catch { /* an amount we cannot read: skipped */ }
    }
    const abs = (v) => (v < 0n ? -v : v);
    return out.sort((a, b) => (abs(b.drops) > abs(a.drops) ? 1 : abs(b.drops) < abs(a.drops) ? -1 : 0));
  }

  X.txs = { KINDS, kindOf, labelOf, parts, row, towerOf, feedItem, balanceChanges, movedOf };
})();
