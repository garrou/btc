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

  /** Number of blocks inserted above the previous newest block when `previous` became `merged`. */
  function insertedAbove(previous, merged) {
    if (!previous.length) return 0;
    return Math.max(0, merged.findIndex((b) => b.id === previous[0].id));
  }

  /** The blocks shown in 3D: a window over the loaded history (offset 0 = the latest blocks). */
  const windowOf = (blocks, offset, size) => blocks.slice(offset, offset + size);

  /**
   * Window offset that keeps block `id` visible: unchanged when it is already inside the window, otherwise a window
   * where the block is the 3rd one (2 newer blocks on its left). Ids not in the list (e.g. the next block) change nothing.
   */
  function ensureVisible(blocks, id, offset, size) {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx < 0) return offset;
    return idx < offset || idx >= offset + size ? Math.max(0, idx - 2) : offset;
  }

  /**
   * Distance, in slots, between a block of the window and the slot the camera is on (null when the block is not in the
   * window). The next block sits just before the first mined one; an unknown focus counts as the first block.
   */
  function slotDistance(windowBlocks, id, focusId, nextId = BTC.config.scene.nextId) {
    const i = windowBlocks.findIndex((b) => b.id === id);
    if (i < 0) return null;
    const f = focusId === nextId ? -1 : Math.max(0, windowBlocks.findIndex((b) => b.id === focusId));
    return Math.abs(i - f);
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

  BTC.blocks = { merge, sameList, tipOf, insertedAbove, windowOf, ensureVisible, slotDistance, isNear, wantsDetail, fillPercent };
})();
