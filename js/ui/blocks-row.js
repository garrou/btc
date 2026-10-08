// The row of blocks under the 3D scene: the next block card, the mined block cards, the "load older" button.
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});
  const { $, el } = BTC.dom;
  const F = BTC.format;
  const cfg = BTC.config.scene;

  let handlers = {};

  function blockCard(b, selectedId, freshId) {
    return el('button', {
      class: `block${b.id === freshId ? ' fresh' : ''}${b.id === selectedId ? ' selected' : ''}`,
      'data-id': b.id,
      style: `--fill:${Math.min(1, b.weight / cfg.blockWeight)}`,
      onclick: () => handlers.onSelect(b.id),
      ondblclick: () => handlers.onOpen(b.id),
    },
      el('b', {}, `#${F.number(b.height)}`),
      el('span', {}, `${F.number(b.tx_count)} tx`),
      el('span', {}, `${(b.size / 1e6).toFixed(2)} MB`),
      el('span', {}, b.extras?.pool?.name ?? '—'),
      el('span', { class: 'ago', 'data-ts': b.timestamp }, F.ago(b.timestamp)));
  }

  function nextCard(m, selected) {
    const [lo, hi] = m.feeRange ? [m.feeRange[0], m.feeRange.at(-1)] : [0, 0];
    return el('button', {
      type: 'button',
      class: `block pending clickable${selected ? ' selected' : ''}`,
      style: `--fill:${Math.min(1, m.blockVSize / cfg.blockVsize)}`,
      onclick: () => handlers.onSelectNext(),
    },
      el('b', {}, 'Next'),
      el('span', {}, `${F.number(m.nTx)} tx`),
      el('span', {}, `median ${F.rate(m.medianFee)} sat/vB`),
      el('span', {}, `range ${F.rate(lo)}–${F.rate(hi)}`),
      el('span', {}, `${F.btc(m.totalFees)} fees`));
  }

  /** Scrolls the row horizontally (never the page) so that `card` is centered, or `offset` px from the left edge. */
  function scrollTo(card, offset = null) {
    const chain = $('.chain');
    if (!card || !chain) return;
    const left = offset != null ? card.offsetLeft - offset : card.offsetLeft - (chain.clientWidth - card.offsetWidth) / 2;
    chain.scrollTo({ left, behavior: 'smooth' });
  }

  BTC.ui.blocksRow = {
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
