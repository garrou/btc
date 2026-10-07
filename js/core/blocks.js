// Block list logic: merging, history window, selection. Pure (arrays in, arrays/numbers out).
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  /** Merges block lists (dedup by id, incoming entries replace existing ones), newest first. */
  function merge(current, incoming) {
    const byId = new Map([...current, ...incoming].map((b) => [b.id, b]));
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

  /** Does the 3D scene want the full detail (every tx) of this block? Recent blocks of the window, and the selected one. */
  function wantsDetail(windowBlocks, id, focusId, detailCount) {
    const i = windowBlocks.findIndex((b) => b.id === id);
    return i >= 0 && (i < detailCount || id === focusId);
  }

  /** Fill of a block as a percentage of the 4 MWU capacity. */
  const fillPercent = (b) => ((b.weight || 0) / BTC.config.scene.blockWeight) * 100;

  BTC.blocks = { merge, sameList, tipOf, insertedAbove, windowOf, ensureVisible, wantsDetail, fillPercent };
})();
