// Solana blocks, as the engine sees them. A new block comes every 0.4 s (a "slot"); a browser cannot read them all, so the page
// shows ONE BLOCK OUT OF EVERY `sample` SLOTS (config.sample, 10 = a block every 4 s). Pure.
//
// What the engine calls a block's height is the number of its group of slots (slot / sample): consecutive integers, so the
// engine's rules about neighbours (the block below, "older blocks", reorganizations) work as they are. The number people know
// is the slot: blockNumber() in chain.js says it. previousblockhash is the hash of the previous block *shown*.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const S = (Explorer.solana = Explorer.solana || {});

  const sample = () => Explorer.chain.config.sample;
  const groupOf = (slot) => Math.floor(slot / sample());   // engine height of the block shown for this slot
  const firstSlotOf = (group) => group * sample();         // the first slot of a group (the block shown is the first one produced from it)

  /**
   * A block read with its signatures only: { blockhash, previousBlockhash, parentSlot, blockTime, blockHeight, signatures }.
   * slot: the slot it was produced in. previousId: id of the block shown before it (null when not known).
   */
  function normalize(slot, raw, previousId = null) {
    return {
      id: raw.blockhash,
      height: groupOf(slot),
      slot,
      previousblockhash: previousId,
      parentSlot: raw.parentSlot,
      parentHash: raw.previousBlockhash,
      timestamp: raw.blockTime ?? Math.floor(Date.now() / 1000),
      blockHeight: raw.blockHeight ?? null,
      tx_count: Array.isArray(raw.signatures) ? raw.signatures.length : 0,
    };
  }

  /** Links a list of blocks (newest first) to each other: each one's previousblockhash is the next one's id. The last one is left as it is. */
  function link(blocks) {
    blocks.forEach((b, i) => { if (blocks[i + 1]) b.previousblockhash = blocks[i + 1].id; });
    return blocks;
  }

  /** How busy a block looks, 0..1: its transactions against a busy block (config.txRef). Only a rough guide: the compute used is read with the details. */
  const fill = (b) => Math.min(1, b.tx_count / Explorer.chain.config.txRef);

  S.blocks = { groupOf, firstSlotOf, normalize, link, fill };
})();
