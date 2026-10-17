// Fee-rate -> color / tower height. Pure math, no Three.js: colors are plain [r, g, b] arrays (0..1, may exceed 1:
// values above 1 make the bloom pass "glow"). The scale itself (lowest and highest rate, color stops) is the chain's:
// Explorer.chain.rates, so Explorer.defineChain() must have run before this file.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});

  // Rates run from MIN_RATE to MAX_RATE (above: same color and height). The towers and the legend are drawn from the
  // same stops, on a logarithmic scale.
  const { min: MIN_RATE, max: MAX_RATE, stops: STOPS } = Explorer.chain.rates;
  const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  const STOPS_RGB = STOPS.map(([rate, hex]) => [rate, rgb(hex)]);

  /** Gradient color of a rate (the chain's price per unit of size), brighter for higher rates. */
  function rate(r) {
    const v = Math.min(MAX_RATE, Math.max(MIN_RATE, r));
    let i = 0;
    while (i < STOPS_RGB.length - 2 && v > STOPS_RGB[i + 1][0]) i++;
    const [a, ca] = STOPS_RGB[i], [b, cb] = STOPS_RGB[i + 1];
    const t = Math.min(1, Math.max(0, (Math.log(v) - Math.log(a)) / (Math.log(b) - Math.log(a))));
    const brightness = 0.75 + Math.min(0.55, Math.log10(v + 1) * 0.3);
    return ca.map((c, k) => (c + (cb[k] - c) * t) * brightness);
  }

  /** Position (0..1) of a fee rate on the logarithmic scale of the colors: where the legend draws it. */
  const position = (r) => (Math.log10(Math.min(MAX_RATE, Math.max(MIN_RATE, r))) - Math.log10(MIN_RATE)) / (Math.log10(MAX_RATE) - Math.log10(MIN_RATE));

  /**
   * Tower height for a fee rate, saturating at MAX_RATE. 'log1p' (default): log(1 + rate), flat for small rates;
   * 'position': proportional to the position on the color scale, so a chain whose rates are all small still gets towers of
   * every height (see rates.heightScale in core/chain.js).
   */
  const towerHeight = Explorer.chain.rates.heightScale === 'position'
    ? (r) => 0.6 + 12 * position(r)
    : (r) => 0.6 + 12 * (Math.log(1 + Math.min(r, MAX_RATE)) / Math.log(1 + MAX_RATE));

  Explorer.colors = {
    rate,
    fromHex: (hex) => rgb(hex).map((c) => c * 1.1), // a color the chain chose for a tower (see `color` in core/chain.js), as bright as the scale's
    towerHeight,
    position,
    MIN_RATE,
    MAX_RATE,
    stops: STOPS.map(([r, hex]) => ({ rate: r, hex })),
    COINBASE: rgb(0xffd76a).map((c) => c * 1.5),
    NEXT_BLOCK_HEX: 0x4cc9f0,
    MINED_BLOCK_HEX: Explorer.chain.theme.accent,
  };
})();
