// The row of blocks under the 3D scene: the next block card, the mined block cards, the "load older" button.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const { $, el } = Explorer.dom;
  const F = Explorer.format;
  const cfg = Explorer.config.scene;

  let handlers = {};

  // What a card says (title, lines, how full the block is) is the chain's: Explorer.chain.blockCard / nextCard. The
  // "x ago" line is the engine's (every block has a timestamp).
  function blockCard(b, selectedId, freshId) {
    const card = Explorer.chain.blockCard(b);
    return el('button', {
      class: `block${b.id === freshId ? ' fresh' : ''}${b.id === selectedId ? ' selected' : ''}`,
      'data-id': b.id,
      style: `--fill:${card.fill}`,
      onclick: () => handlers.onSelect(b.id),
      ondblclick: () => handlers.onOpen(b.id),
    },
      el('b', {}, card.title),
      card.lines.map((line) => el('span', {}, line)),
      el('span', { class: 'ago', 'data-ts': b.timestamp }, F.ago(b.timestamp)));
  }

  function nextCard(m, selected) {
    const card = Explorer.chain.nextCard(m);
    return el('button', {
      type: 'button',
      class: `block pending clickable${selected ? ' selected' : ''}`,
      style: `--fill:${card.fill}`,
      onclick: () => handlers.onSelectNext(),
    },
      el('b', {}, card.title),
      card.lines.map((line) => el('span', {}, line)));
  }

  const EDGE = 72; // the ends of the row fade out: a card must stay clear of them

  /**
   * Scrolls the row horizontally (never the page) so that `card` is in view: not at all when it already is, otherwise
   * just enough to bring it to the nearest edge (the row is not re-centered at every selection). With `offset`, the
   * card goes `offset` px from the left edge.
   */
  function scrollTo(card, offset = null) {
    const chain = $('.chain');
    if (!card || !chain) return;
    const lowest = card.offsetLeft + card.offsetWidth + EDGE - chain.clientWidth; // from here the card is clear of the right edge...
    const highest = card.offsetLeft - EDGE;                                       // ...up to here (clear of the left edge)
    const left = offset != null ? card.offsetLeft - offset : Math.min(Math.max(chain.scrollLeft, lowest), highest);
    chain.scrollTo({ left, behavior: 'smooth' });
  }

  Explorer.ui.blocksRow = {
    /** handlers: onSelect(blockId), onOpen(blockId) (double click), onSelectNext(), onLoadOlder() */
    init(h) {
      handlers = h;
      $('#more-blocks').addEventListener('click', () => handlers.onLoadOlder());
    },
    renderBlocks(blocks, { selectedId = null, freshId = null } = {}) {
      $('#blocks').replaceChildren(...blocks.map((b) => blockCard(b, selectedId, freshId)));
    },
    /** upcoming: the projected blocks from the mempool; only the first one (the next block) is shown. */
    renderUpcoming(upcoming, selected) {
      $('#upcoming').replaceChildren(...upcoming.slice(0, 1).map((m) => nextCard(m, selected)));
    },
    /** Refreshes the "x ago" of the cards without rebuilding them. */
    refreshAgo() { document.querySelectorAll('#blocks .ago').forEach((n) => { n.textContent = F.ago(Number(n.dataset.ts)); }); },
    /** Highlights the card of the selected slot and brings it into view. */
    select(id) {
      document.querySelectorAll('#blocks .block').forEach((n) => n.classList.toggle('selected', n.dataset.id === id));
      document.querySelector('#upcoming .block')?.classList.toggle('selected', id === cfg.nextId);
      scrollTo(document.querySelector('#blocks .block.selected, #upcoming .block.selected'));
    },
    /** Brings the card of a block near the left edge (after loading older blocks). */
    reveal(id) { scrollTo($(`#blocks .block[data-id="${id}"]`), 40); },
    /** State of the "load older" button: { hidden, disabled, title, sub }. */
    setMore({ hidden = false, disabled = false, title = '', sub = '' }) {
      const btn = $('#more-blocks');
      btn.hidden = hidden;
      btn.disabled = disabled;
      btn.replaceChildren(el('b', {}, title), el('span', {}, sub));
    },
  };
})();
