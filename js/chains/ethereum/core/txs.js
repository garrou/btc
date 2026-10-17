// Ethereum transactions: from the node's JSON to the rows the dialogs show and the towers the scene draws. Pure.
//   row   = everything we know about one transaction (BigInts for money, Numbers for gas and gwei)
//   tower = what the engine draws: { txid, vsize (gas), rate (gwei per gas), ... } (js/core/chain.js)
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const E = (Explorer.ethereum = Explorer.ethereum || {});
  const { big, weiToGwei } = E.format;

  // The first 4 bytes of a call say which function it is. A short list of the best known, to say more than "contract call".
  // [short name, what it is]
  const SELECTORS = {
    '0xa9059cbb': ['transfer', 'Token transfer'],
    '0x23b872dd': ['transferFrom', 'Token transfer'],
    '0x095ea7b3': ['approve', 'Token approval'],
    '0x38ed1739': ['swapExactTokensForTokens', 'Swap'],
    '0x8803dbee': ['swapTokensForExactTokens', 'Swap'],
    '0x7ff36ab5': ['swapExactETHForTokens', 'Swap'],
    '0xfb3bdb41': ['swapETHForExactTokens', 'Swap'],
    '0x18cbafe5': ['swapExactTokensForETH', 'Swap'],
    '0x5c11d795': ['swapExactTokensForTokensSupportingFeeOnTransferTokens', 'Swap'],
    '0x3593564c': ['execute', 'Swap (Universal Router)'],
    '0x24856bc3': ['execute', 'Swap (Universal Router)'],
    '0xe8e33700': ['addLiquidity', 'Add liquidity'],
    '0xf305d719': ['addLiquidityETH', 'Add liquidity'],
    '0xd0e30db0': ['deposit', 'Wrap ETH / deposit'],
    '0x2e1a7d4d': ['withdraw', 'Unwrap ETH / withdraw'],
    '0x3ccfd60b': ['withdraw', 'Withdraw'],
    '0x4e71d92d': ['claim', 'Claim'],
    '0x1249c58b': ['mint', 'Mint'],
    '0x40c10f19': ['mint', 'Mint'],
    '0x42842e0e': ['safeTransferFrom', 'NFT transfer'],
    '0xb88d4fde': ['safeTransferFrom', 'NFT transfer'],
    '0xf242432a': ['safeTransferFrom', 'NFT transfer'],
    '0x2eb2c2d6': ['safeBatchTransferFrom', 'NFT transfer'],
    '0xa22cb465': ['setApprovalForAll', 'NFT approval'],
    '0xac9650d8': ['multicall', 'Multicall'],
    '0x5ae401dc': ['multicall', 'Multicall'],
    '0x6a761202': ['execTransaction', 'Multisig (Safe)'],
    '0xf2fde38b': ['transferOwnership', 'Ownership transfer'],
  };

  const selectorOf = (input) => (input && input.length >= 10 ? input.slice(0, 10).toLowerCase() : null);

  /** 'create' (no recipient), 'blob' (carries blobs), 'transfer' (plain ETH, no data), 'call' (a contract is called). */
  function kindOf(tx) {
    if (tx.to == null) return 'create';
    if (Number(big(tx.type ?? 0)) === 3) return 'blob';
    return !tx.input || tx.input === '0x' ? 'transfer' : 'call';
  }

  /** What a transaction does, in a few words: "ETH transfer", "Swap", "Token transfer", "Contract call (0x1234abcd)"... */
  function labelOf(kind, selector) {
    if (kind === 'create') return 'Contract creation';
    if (kind === 'blob') return 'Blob transaction (rollup data)';
    if (kind === 'transfer') return 'ETH transfer';
    return SELECTORS[selector]?.[1] ?? (selector ? `Contract call (${selector})` : 'Contract call');
  }

  const TYPE_NAMES = { 0: 'Legacy', 1: 'Access list (EIP-2930)', 2: 'EIP-1559', 3: 'Blob (EIP-4844)', 4: 'Set code (EIP-7702)' };

  /** What one gas costs a transaction (wei) in a block with that base fee: the base fee plus the tip it offers, capped by its max fee. */
  function effectivePrice(tx, baseFeeWei) {
    if (tx.maxFeePerGas == null || baseFeeWei == null) return big(tx.gasPrice);
    const maxFee = big(tx.maxFeePerGas);
    const room = maxFee - baseFeeWei;
    const tip = room < big(tx.maxPriorityFeePerGas) ? room : big(tx.maxPriorityFeePerGas);
    return baseFeeWei + (tip > 0n ? tip : 0n);
  }

  /**
   * One transaction of a block. receipt: its receipt, or null when unknown (then the gas used is estimated, see
   * estimateGas). block: the normalized block (its base fee prices the transaction when the receipt is missing).
   */
  function row(tx, receipt, block) {
    const selector = selectorOf(tx.input);
    const kind = kindOf(tx);
    const priceWei = receipt?.effectiveGasPrice != null ? big(receipt.effectiveGasPrice) : effectivePrice(tx, block?.baseFeeWei ?? null);
    const gasUsed = receipt ? Number(big(receipt.gasUsed)) : null;
    return {
      hash: tx.hash,
      from: tx.from.toLowerCase(),         // nodes do not all spell addresses the same way: lower case everywhere
      to: tx.to ? tx.to.toLowerCase() : null,
      valueWei: big(tx.value),
      nonce: Number(big(tx.nonce)),
      type: Number(big(tx.type ?? 0)),
      index: tx.transactionIndex != null ? Number(big(tx.transactionIndex)) : null,
      gasLimit: Number(big(tx.gas)),
      gasUsed,
      estimated: gasUsed == null,
      priceWei,
      price: weiToGwei(priceWei),
      maxFee: big(tx.maxFeePerGas ?? tx.gasPrice),
      ok: receipt && receipt.status != null ? big(receipt.status) === 1n : null, // no status in a receipt before Byzantium (block 4,370,000)
      created: receipt?.contractAddress ?? null,
      selector,
      kind,
      blobs: Array.isArray(tx.blobVersionedHashes) ? tx.blobVersionedHashes.length : 0,
    };
  }

  /**
   * Without receipts the gas actually used is unknown: spread the block's gasUsed over its transactions in proportion to
   * their gas limit (exact for plain transfers, a fair guess for the rest). Returns the rows, filled in.
   */
  function estimateGas(rows, blockGasUsed) {
    const limits = rows.reduce((s, r) => s + r.gasLimit, 0) || 1;
    rows.forEach((r) => { r.gasUsed = Math.max(1, Math.round((r.gasLimit * blockGasUsed) / limits)); });
    return rows;
  }

  const feeWei = (r) => (r.gasUsed == null ? null : r.priceWei * BigInt(r.gasUsed));

  /** The tower of a mined transaction. */
  function towerOf(r) {
    return {
      txid: r.hash, vsize: r.gasUsed ?? r.gasLimit, rate: r.price,
      from: r.from, to: r.to, valueWei: r.valueWei, feeWei: feeWei(r), kind: r.kind, selector: r.selector, ok: r.ok,
    };
  }

  /** A transaction waiting in the mempool (eth_getTransactionByHash / newPendingTransactions) -> pool entry. */
  function pending(tx, now = Date.now()) {
    const legacy = tx.maxFeePerGas == null;
    const selector = selectorOf(tx.input);
    return {
      hash: tx.hash, from: tx.from.toLowerCase(), to: tx.to ? tx.to.toLowerCase() : null, valueWei: big(tx.value), nonce: Number(big(tx.nonce)),
      gas: Number(big(tx.gas)), type: Number(big(tx.type ?? 0)),
      maxFee: legacy ? big(tx.gasPrice) : big(tx.maxFeePerGas),
      maxPriority: legacy ? big(tx.gasPrice) : big(tx.maxPriorityFeePerGas),
      selector, kind: kindOf(tx), seen: now,
    };
  }

  /** What a pending transaction would pay per gas (wei) at that base fee; null when it cannot be included (max fee below it). */
  function pendingPrice(p, baseWei) {
    if (baseWei == null) return p.maxFee;
    if (p.maxFee < baseWei) return null;
    const room = p.maxFee - baseWei;
    return baseWei + (p.maxPriority < room ? p.maxPriority : room);
  }

  /** The tower of a pending transaction, priced at the base fee of the next block. */
  function pendingTower(p, baseWei) {
    const wei = pendingPrice(p, baseWei) ?? p.maxFee;
    return {
      txid: p.hash, vsize: p.gas, rate: weiToGwei(wei), fee: weiToGwei(wei) * p.gas, // fee / vsize = the price in gwei, as in a feed item
      from: p.from, to: p.to, valueWei: p.valueWei, feeWei: wei * BigInt(p.gas), kind: p.kind, selector: p.selector, ok: null,
      approx: false, pending: true,
    };
  }

  /** The line of the live feed for a pending transaction ({ txid, fee, vsize, valueWei }: fee / vsize is the price in gwei). */
  function feedItem(p, baseWei) {
    const gwei = weiToGwei(pendingPrice(p, baseWei) ?? p.maxFee);
    return { txid: p.hash, vsize: p.gas, fee: gwei * p.gas, valueWei: p.valueWei };
  }

  E.txs = { SELECTORS, TYPE_NAMES, selectorOf, kindOf, labelOf, effectivePrice, row, estimateGas, feeWei, towerOf, pending, pendingPrice, pendingTower, feedItem };
})();
