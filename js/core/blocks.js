// Block list logic: merging, history window, selection. Pure (arrays in, arrays/numbers out).
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  /**
   * Merges block lists (dedup by id, incoming entries replace existing ones), newest first. The incoming blocks are the
   * best chain: a loaded block at the same height with another id is a stale one (a chain reorganization), dropped.
   */
  function merge(current, incoming) {
    const idAt = new Map(incoming.map((b) => [b.height, b.id]));
    const kept = current.filter((b) => !idAt.has(b.height) || idAt.get(b.height) === b.id);
    const byId = new Map([...kept, ...incoming].map((b) => [b.id, b]));
    return [...byId.values()].sort((x, y) => y.height - x.height);
  }

  const sameList = (a, b) => a.length === b.length && a.every((x, i) => x.id === b[i].id);

  /** Highest block height of a list (0 when empty). */
  const tipOf = (list) => list.reduce((m, b) => Math.max(m, b.height), 0);

  /**
   * Rank of the slot the camera is on: -1 for the next block (it sits just before the first mined one), the index in
   * `blocks` otherwise; an unknown id counts as the first block.
   */
  function rankOf(blocks, id, nextId = BTC.config.scene.nextId) {
    return id === nextId ? -1 : Math.max(0, blocks.findIndex((b) => b.id === id));
  }

  /**
   * The blocks that exist in 3D when the camera is on `id`: `reach` blocks on each side of it (fewer near the ends of the
   * list). The window slides with the camera, and a block never changes place in the world (see controllers/scene-sync.js).
   */
  function windowAround(blocks, id, reach) {
    const rank = rankOf(blocks, id);
    return blocks.slice(Math.max(0, rank - reach), rank + reach + 1);
  }

  /** Index in `blocks` of the first block of that window (0 = the latest blocks, and the next block is part of it). */
  const windowStart = (blocks, id, reach) => Math.max(0, rankOf(blocks, id) - reach);

  /**
   * Distance, in slots, between a block of the window and the slot the camera is on (null when the block is not in the
   * window). The next block sits just before the first mined one; an unknown focus counts as the first block.
   */
  function slotDistance(windowBlocks, id, focusId) {
    const i = windowBlocks.findIndex((b) => b.id === id);
    return i < 0 ? null : Math.abs(i - rankOf(windowBlocks, focusId));
  }

  /** Is this block of the window within `radius` slots of the camera? */
  function isNear(windowBlocks, id, focusId, radius) {
    const d = slotDistance(windowBlocks, id, focusId);
    return d !== null && d <= radius;
  }

  /**
   * Does the 3D scene draw this block in detail (every tx)? Yes for the blocks around the camera (farther ones fade into
   * the fog), and for any block of the window whose contents are already known: a mined block never changes, so what was
   * loaded once stays detailed for as long as the block is shown.
   */
  function wantsDetail(windowBlocks, id, focusId, radius, isKnown = () => false) {
    const d = slotDistance(windowBlocks, id, focusId);
    return d !== null && (d <= radius || isKnown(id));
  }

  /** Fill of a block as a percentage of the 4 MWU capacity. */
  const fillPercent = (b) => ((b.weight || 0) / BTC.config.scene.blockWeight) * 100;

  BTC.blocks = { merge, sameList, tipOf, windowAround, windowStart, slotDistance, isNear, wantsDetail, fillPercent };
})();
