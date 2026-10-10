// Bitcoin addresses: recognizing one in the search box, and reading what the explorer API says about it. Pure.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  // Format only: the checksum is verified by the API (it answers 400 for a mistyped address).
  const LEGACY = /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/; // Base58Check: P2PKH ("1…") and P2SH ("3…")
  const SEGWIT = /^bc1[02-9ac-hj-np-z]{11,71}$/;      // Bech32 / Bech32m (BIP 173 / 350): witness version + 2 to 40 bytes + checksum
  const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';  // the position of a character in this alphabet is its value (the witness version, right after "bc1")

  /**
   * The mainnet address written in `text` (a "bitcoin:" payment link, BIP 21, is accepted too), or null. Bech32 is case
   * insensitive but must not mix cases: QR codes use upper case, the API wants lower case.
   */
  function parse(text) {
    const s = String(text).trim().replace(/^bitcoin:/i, '').replace(/\?.*$/, '');
    if (LEGACY.test(s)) return s;
    const lower = s.toLowerCase();
    return (s === lower || s === s.toUpperCase()) && SEGWIT.test(lower) ? lower : null;
  }

  /** What kind of address it is, from its format. */
  function kind(address) {
    if (address.startsWith('1')) return 'Legacy (P2PKH)';
    if (address.startsWith('3')) return 'Script hash (P2SH)';
    if (!address.startsWith('bc1')) return 'Unknown format';
    const version = BECH32.indexOf(address[3]);
    if (version === 0 && address.length === 42) return 'Native SegWit (P2WPKH)';
    if (version === 0 && address.length === 62) return 'Native SegWit script (P2WSH)';
    if (version === 1 && address.length === 62) return 'Taproot (P2TR)';
    return `SegWit (witness version ${version})`;
  }

  const num = (v) => Number(v) || 0;

  /**
   * Totals of an address from /address/:a, in sats. chain_stats counts what is in mined blocks, mempool_stats what waits
   * for a block. balance = everything ever paid to the address minus everything ever spent from it.
   */
  function summary(raw) {
    const c = raw.chain_stats ?? {}, m = raw.mempool_stats ?? {};
    return {
      balance: num(c.funded_txo_sum) - num(c.spent_txo_sum),   // confirmed
      pending: num(m.funded_txo_sum) - num(m.spent_txo_sum),   // net change once the unconfirmed transactions are mined
      received: num(c.funded_txo_sum),
      sent: num(c.spent_txo_sum),
      unspent: num(c.funded_txo_count) - num(c.spent_txo_count), // confirmed outputs that can still be spent
      confirmedTxs: num(c.tx_count),
      pendingTxs: num(m.tx_count),
    };
  }

  /** What a transaction does to an address, in sats: what it pays to it minus what it spends from it (negative = money leaves). */
  function delta(tx, address) {
    let sum = 0;
    for (const o of tx.vout) if (o.scriptpubkey_address === address) sum += o.value || 0;
    for (const i of tx.vin) if (i.prevout && i.prevout.scriptpubkey_address === address) sum -= i.prevout.value || 0;
    return sum;
  }

  /**
   * Paging: /address/:a/txs gives the unconfirmed transactions then the latest 25 confirmed ones; the next confirmed
   * ones are asked after the last confirmed transaction already received.
   */
  function lastConfirmed(txs) {
    for (let i = txs.length - 1; i >= 0; i--) if (txs[i].status?.confirmed) return txs[i].txid;
    return null;
  }

  /** Whether older confirmed transactions exist beyond the ones loaded. */
  function hasMore(totals, txs) {
    return txs.filter((t) => t.status?.confirmed).length < totals.confirmedTxs;
  }

  /** The transactions of `page` not in `txs` yet (a transaction that was mined between two requests can come twice). */
  function fresh(txs, page) {
    const known = new Set(txs.map((t) => t.txid));
    return page.filter((t) => !known.has(t.txid));
  }

  BTC.address = { parse, kind, summary, delta, lastConfirmed, hasMore, fresh };
})();
