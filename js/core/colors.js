// Fee-rate -> color / tower height. Pure math, no Three.js: colors are plain [r, g, b] arrays (0..1, may exceed 1:
// values above 1 make the bloom pass "glow").
(() => {
  'use strict';
  const BTC = (window.BTC = window.BTC || {});

  // Fee rates (sat/vB) run from the lowest relay fee, 0.1, to MAX_RATE (above: same color and height). The towers and the
  // legend are drawn from the same stops, on a logarithmic scale.
  const MIN_RATE = 0.1, MAX_RATE = 300;
  const STOPS = [[MIN_RATE, 0x5a3d99], [1, 0x2d3a9e], [4, 0x1f8fe0], [10, 0x22c9a6], [25, 0x7ddc4a], [60, 0xf2d33c], [120, 0xf7931a], [MAX_RATE, 0xff3d6e]];
  const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  const STOPS_RGB = STOPS.map(([rate, hex]) => [rate, rgb(hex)]);

  /** Gradient color of a fee rate (sat/vB), brighter for higher rates. */
  function rate(r) {
    const v = Math.min(MAX_RATE, Math.max(MIN_RATE, r));
    let i = 0;
    while (i < STOPS_RGB.length - 2 && v > STOPS_RGB[i + 1][0]) i++;
    const [a, ca] = STOPS_RGB[i], [b, cb] = STOPS_RGB[i + 1];
    const t = Math.min(1, Math.max(0, (Math.log(v) - Math.log(a)) / (Math.log(b) - Math.log(a))));
    const brightness = 0.75 + Math.min(0.55, Math.log10(v + 1) * 0.3);
    return ca.map((c, k) => (c + (cb[k] - c) * t) * brightness);
  }

  /** Tower height for a fee rate: logarithmic, saturating at MAX_RATE. */
  const towerHeight = (r) => 0.6 + 12 * (Math.log(1 + Math.min(r, MAX_RATE)) / Math.log(1 + MAX_RATE));

  /** Position (0..1) of a fee rate on the logarithmic scale of the colors: where the legend draws it. */
  const position = (r) => (Math.log10(Math.min(MAX_RATE, Math.max(MIN_RATE, r))) - Math.log10(MIN_RATE)) / (Math.log10(MAX_RATE) - Math.log10(MIN_RATE));

  BTC.colors = {
    rate,
    towerHeight,
    position,
    MIN_RATE,
    MAX_RATE,
    stops: STOPS.map(([r, hex]) => ({ rate: r, hex })),
    COINBASE: rgb(0xffd76a).map((c) => c * 1.5),
    NEXT_BLOCK_HEX: 0x4cc9f0,
    MINED_BLOCK_HEX: 0xf7931a,
  };
})();
