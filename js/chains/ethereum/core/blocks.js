// Ethereum blocks: the engine's block model plus the Ethereum extras, the base fee rule (EIP-1559), who built the block. Pure.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const E = (Explorer.ethereum = Explorer.ethereum || {});
  const { big, weiToGwei } = E.format;

  const ELASTICITY = 2n;     // a block can hold up to 2x its gas target
  const CHANGE_DENOM = 8n;   // the base fee moves by at most 1/8 (12.5 %) per block

  /**
   * The base fee of the block after `parent` (EIP-1559). Wei in, wei out.
   * The target is half the gas limit: a block above it raises the fee, a block below it lowers it.
   */
  function nextBaseFee(baseFeeWei, gasUsed, gasLimit) {
    const base = big(baseFeeWei), used = BigInt(gasUsed), target = BigInt(gasLimit) / ELASTICITY;
    if (target === 0n || used === target) return base;
    if (used > target) {
      const delta = (base * (used - target)) / target / CHANGE_DENOM;
      return base + (delta > 1n ? delta : 1n);
    }
    return base - (base * (target - used)) / target / CHANGE_DENOM;
  }

  /** The builder's name when the extra data of a block spells one ("beaverbuild.org"), else null. */
  function builderOf(extraDataHex) {
    const bytes = extraDataHex && extraDataHex.length > 2 ? E.keccak.fromHex(extraDataHex) : new Uint8Array(0);
    if (!bytes.length) return null;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/[\u0000-\u001f\u007f]/g, '').trim();
    const printable = [...text].filter((c) => /[\p{L}\p{N}\p{P}\p{S} ]/u.test(c) && c !== '�').length;
    return text.length >= 3 && printable / bytes.length >= 0.7 ? text.slice(0, 32) : null;
  }

  /**
   * A block from eth_getBlockBy*: the engine's { id, height, previousblockhash, timestamp } plus what the cards and the
   * details say. The transactions can be hashes or objects: only their number is read here.
   */
  function normalize(r) {
    const gasUsed = Number(big(r.gasUsed)), gasLimit = Number(big(r.gasLimit));
    const baseFeeWei = r.baseFeePerGas != null ? big(r.baseFeePerGas) : null;
    return {
      id: r.hash,
      height: Number(big(r.number)),
      previousblockhash: r.parentHash,
      timestamp: Number(big(r.timestamp)),
      tx_count: r.transactions.length,
      gasUsed,
      gasLimit,
      baseFeeWei,                                       // null before the London fork
      baseFee: baseFeeWei == null ? null : weiToGwei(baseFeeWei),
      burnt: baseFeeWei == null ? 0 : Number(baseFeeWei * BigInt(gasUsed)) / 1e18, // ETH destroyed by the block
      miner: r.miner.toLowerCase(),
      builder: builderOf(r.extraData),
      extraData: r.extraData,
      size: Number(big(r.size)),
      blobGasUsed: r.blobGasUsed != null ? Number(big(r.blobGasUsed)) : null,
      withdrawals: Array.isArray(r.withdrawals) ? r.withdrawals.length : null,
      txHashes: typeof r.transactions[0] === 'string' ? r.transactions : null,
    };
  }

  E.blocks = { nextBaseFee, builderOf, normalize };
})();
