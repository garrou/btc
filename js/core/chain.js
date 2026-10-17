// The contract between the engine and a blockchain.
//
// The ENGINE is everything that draws blocks, towers and the camera, keeps the list of blocks, the feed and the scene
// in sync: core/, scene/, state/, ui/, controllers/, net/ (JSON-RPC client) and app.js. It knows nothing about any blockchain.
// A CHAIN is one object, registered with Explorer.defineChain(spec) before the engine's own scripts run: it gives the engine
// its numbers (how big is a block, which fee rates are cheap or expensive), its words (what a block card says) and,
// later in this contract, where its data comes from. The engine only ever reads them from Explorer.chain.
// Everything that is specific to one chain lives in its own folder: js/chains/<name>/ (Bitcoin: js/chains/bitcoin/).
//
// The block model the engine reads (whatever the chain): { id, height, previousblockhash, timestamp }; any other field
// of a block is only read by the chain's own functions below (cards, lines, fill...).
// The tower model the engine draws (whatever the chain): { txid, vsize, rate, coinbase?, approx? }
//   vsize: size in "capacity units" (virtual bytes for Bitcoin, gas for Ethereum...); the name is historical
//   rate:  price per unit of size (sat/vB for Bitcoin, gwei per gas...); it gives the tower its color and height. It need not be
//          a price per unit: Solana uses the priority fee the transaction paid, whatever its size
//   coinbase: the block reward transaction (drawn gold, in the corner), approx: size unknown (provisional data)
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});

  // What a chain MUST provide: [path in the object, expected typeof, what the engine uses it for].
  const REQUIRED = [
    ['id', 'string', 'short identifier, e.g. "bitcoin"'],
    ['name', 'string', 'display name'],
    ['config', 'object', "the chain's own constants (endpoints, polling delays...): read by the chain's own files only"],
    ['capacity.size', 'number', 'size of a full block, in the unit of tower sizes: a tower covers size / capacity.size of the platform'],
    ['rates.unit', 'string', 'label of the price per unit of size, shown with the legend'],
    ['rates.min', 'number', 'lowest rate of the color scale'],
    ['rates.max', 'number', 'rate from which color and height stop growing'],
    ['rates.stops', 'object', 'color scale: [[rate, 0xRRGGBB], ...] from min to max'],
    ['rates.ticks', 'object', 'rates labeled under the legend bar'],
    ['fill', 'function', '(block) => how full the block is, 0..1'],
    ['typicalRate', 'function', '(block) => a typical rate of the block (e.g. its median fee) or undefined: colors the light shape of a far block'],
    ['blockCard', 'function', '(block) => { title, lines: [text...], fill } : the card of the row of blocks (the "x ago" line is added by the engine)'],
    ['nextCard', 'function', '(pendingInfo) => { title, lines, fill } : the card of the next block'],
    ['blockLine', 'function', '(block) => text under the title of the 3D view when a block is selected'],
    ['nextLine', 'function', '(pendingInfo | undefined) => text under the title when the next block is selected'],
    ['feedRow', 'function', '(pendingTx) => { amount, rate } : texts of a row of the live transaction feed'],
    ['describeTower', 'function', '(tower) => tooltip text of a tower'],
    // data: what the engine asks the network for (promises; an unknown block rejects with error.status = 404)
    ['data.latestBlocks', 'function', '() => Promise<block[]>: the latest blocks, newest first (one page)'],
    ['data.blocksFrom', 'function', '(height) => Promise<block[]>: a page of blocks going down from that height, newest first'],
    ['data.heightOf', 'function', '(hash) => Promise<number>: the height of a block'],
    ['data.hashOf', 'function', '(height) => Promise<string>: the id of the block at that height'],
    ['data.blockTowers', 'function', '(block) => Promise<tower[]>: its transactions as towers; an array flagged `approx = true` when sizes are not known yet (the engine asks again later)'],
    ['data.recentTxs', 'function', '() => Promise<pendingTx[]>: transactions that just entered the mempool, newest first. pendingTx: { txid, fee?, vsize?, value? }'],
    // live: what the chain pushes (the engine passes the handlers, the chain calls them)
    ['live.connect', 'function', '(handlers) => void. handlers: onStatus(bool) connected or not, onOpen() (re)connected, onBlock(block) a block was mined, onUpcoming(list) the pending blocks (opaque to the engine, given back to nextCard / nextLine), onProjected(raw) news about the contents of the next block (given back to createPending().apply), onTransactions(pendingTx[]) and onTxids(pendingTx[]) transactions that entered the mempool'],
    ['live.trackNext', 'function', '() => void: asks the server again for the contents of the next block (needed after every mined block)'],
    ['createPending', 'function', '() => the holder of the next block\'s towers: { apply(raw) -> {added: tower[]} | null, hasData(), has(txid), size(), values(): tower[], takeFresh(): txid[], reset() }'],
  ];

  // Optional hooks: the features that depend on the chain's own data and screens. A chain that has no such feature leaves
  // the hook out and the engine does nothing (these are the defaults).
  //   openTx(txid), openBlock(id)  the user clicked a tower / a block card (double-click) / "Block details": show its detail
  //   search(text)                 the user submitted the search box: the chain decides what the text means
  //   onBlock(block)               a block was mined (called after the engine has added it to its list)
  //   onVisible()                  the tab is visible again: catch up now rather than at the next timer tick
  //   onHighlight()                the engine lit other towers in the scene (see scene3d's highlight)
  //   start({ scene })             once, when the page is ready: build the chain's own screens, start its own timers.
  //                                scene: the 3D scene, or null when the browser has no WebGL
  //   theme.accent                 0xRRGGBB: the page's accent (title, outlines, the mined blocks in 3D). Default: a neutral grey-blue
  //   rates.label(rate)            how a rate reads on the legend ("10k"). Default: the number as it is
  //   rates.heightScale            how a tower's height follows its rate. 'log1p' (default) is log(1 + rate): it separates the
  //                                high rates well, which suits rates that are mostly above 1. 'position' spreads the heights
  //                                over the whole color scale (min..max, logarithmic): for rates that live far below 1
  //   nextBlock                    false: the chain has no pending block to show (no mempool to read): the scene has no "next"
  //                                slot, and live.onProjected / onUpcoming are never called: nextCard, nextLine, live.trackNext
  //                                and createPending can be left out
  //   legend                       { items: [{ label, color: 0xRRGGBB }], note }: the colors of the towers are kinds, not rates
  //                                (a chain with no price to color by). The tower then carries its own `color`; its
  //                                `rate` still gives its height. The legend shows a swatch for each kind instead of the gradient
  //   blockNumber(block)           how the number of a block reads ("21,500,000"). Default: its height, with thousands separators.
  //                                A chain whose engine height is not the number people know (Solana: a block is a slot) says it here
  const DEFAULTS = {
    theme: { accent: 0x8aa4d6 },
    nextBlock: true,
    createPending: () => ({ apply: () => null, hasData: () => false, has: () => false, size: () => 0, values: () => [], takeFresh: () => [], reset() {} }),
    blockNumber: (b) => Explorer.format.number(b.height),
    openTx() {},
    openBlock() {},
    search() {},
    onBlock() {},
    onVisible() {},
    onHighlight() {},
    start() {},
  };

  // The optional parts have a type too, when a chain gives them: [path, expected typeof]
  const OPTIONAL = [['theme.accent', 'number'], ['nextBlock', 'boolean'], ['blockNumber', 'function'], ['openTx', 'function'], ['openBlock', 'function'],
    ['search', 'function'], ['onBlock', 'function'], ['onVisible', 'function'], ['onHighlight', 'function'], ['start', 'function'],
    ['rates.label', 'function'], ['rates.heightScale', 'string'], ['legend', 'object']];

  const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

  // What a chain without a next block (nextBlock: false) does not have to provide
  const NEXT_ONLY = new Set(['nextCard', 'nextLine', 'live.trackNext', 'createPending']);

  /** Throws one Error listing everything a chain spec lacks (or has with the wrong type). */
  function validate(spec) {
    const needed = spec.nextBlock === false ? REQUIRED.filter(([path]) => !NEXT_ONLY.has(path)) : REQUIRED;
    const problems = needed.filter(([path, type]) => typeof get(spec, path) !== type)
      .map(([path, type, why]) => `  - ${path} (${type}): ${why}`);
    for (const [path, type] of OPTIONAL) {
      const v = get(spec, path);
      if (v !== undefined && typeof v !== type) problems.push(`  - ${path} (${type}) is optional, but it is a ${typeof v}`);
    }
    const { min, max } = spec.rates || {};
    if (typeof min === 'number' && typeof max === 'number' && !(min > 0 && max > min)) problems.push('  - rates: 0 < min < max (the scales are logarithmic)');
    const size = spec.capacity && spec.capacity.size;
    if (typeof size === 'number' && !(size > 0 && Number.isFinite(size))) problems.push('  - capacity.size: a positive number');
    const stops = spec.rates && spec.rates.stops;
    if (Array.isArray(stops)) {
      const wellFormed = stops.every((s) => Array.isArray(s) && typeof s[0] === 'number' && typeof s[1] === 'number');
      if (!wellFormed || stops.length < 2 || stops[0][0] !== min || stops.at(-1)[0] !== max || stops.some((s, i) => i && s[0] <= stops[i - 1][0])) {
        problems.push('  - rates.stops: [[rate, 0xRRGGBB], ...], at least two, rising, the first at rates.min and the last at rates.max');
      }
    }
    if (problems.length) throw new Error(`Chain "${spec.id ?? '?'}" does not fit the engine contract (js/core/chain.js):\n${problems.join('\n')}`);
  }

  /** Registers the chain the page works with (Explorer.chain). */
  Explorer.defineChain = (spec) => {
    validate(spec);
    const given = Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined)); // an explicit `undefined` keeps the default
    Explorer.chain = { ...DEFAULTS, ...given, theme: { ...DEFAULTS.theme, ...given.theme } };
    return Explorer.chain;
  };
})();
