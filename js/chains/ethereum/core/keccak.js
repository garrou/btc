// Keccak-256 (the hash Ethereum uses: NOT the standardized SHA3-256, the padding differs). Pure.
// Needed for address checksums (EIP-55) and ENS names. 64-bit lanes are BigInts: slow-ish, but only a few hashes are
// computed at a time (a page of addresses, a name).
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const E = (Explorer.ethereum = Explorer.ethereum || {});

  const MASK = (1n << 64n) - 1n;
  const rotl = (x, n) => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK);

  // Round constants and rotation offsets, generated from their definition in the Keccak reference (a linear feedback
  // shift register for the constants, a walk on the 5x5 grid for the offsets): checked once against known hashes (empty input, the ENS names).
  const RC = [];
  for (let round = 0; round < 24; round++) {
    let rc = 0n;
    for (let j = 0; j < 7; j++) {
      const t = j + 7 * round;
      let r = 1; // LFSR x^8 + x^6 + x^5 + x^4 + 1, bit t
      for (let i = 0; i < t % 255; i++) { r <<= 1; if (r & 0x100) r ^= 0x171; }
      if (r & 1) rc |= 1n << BigInt((1 << j) - 1);
    }
    RC.push(rc);
  }
  const ROT = Array.from({ length: 25 }, () => 0);
  for (let t = 0, x = 1, y = 0; t < 24; t++) {
    ROT[x + 5 * y] = (((t + 1) * (t + 2)) / 2) % 64;
    [x, y] = [y, (2 * x + 3 * y) % 5];
  }

  function permute(s) {
    const c = new Array(5), b = new Array(25);
    for (let round = 0; round < 24; round++) {
      for (let x = 0; x < 5; x++) c[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
      for (let x = 0; x < 5; x++) {
        const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
        for (let y = 0; y < 25; y += 5) s[x + y] ^= d;
      }
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], ROT[x + 5 * y]);
      for (let y = 0; y < 25; y += 5) for (let x = 0; x < 5; x++) s[x + y] = b[x + y] ^ (~b[((x + 1) % 5) + y] & MASK & b[((x + 2) % 5) + y]);
      s[0] ^= RC[round];
    }
  }

  const RATE = 136; // bytes absorbed per block (1600 - 2 * 256 bits)

  /** bytes: Uint8Array | string (UTF-8) -> Uint8Array(32) */
  function keccak256Bytes(input) {
    const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    const padded = new Uint8Array(Math.ceil((data.length + 1) / RATE) * RATE);
    padded.set(data);
    padded[data.length] ^= 0x01;
    padded[padded.length - 1] ^= 0x80;
    const s = new Array(25).fill(0n);
    for (let off = 0; off < padded.length; off += RATE) {
      for (let i = 0; i < RATE / 8; i++) {
        let lane = 0n;
        for (let k = 7; k >= 0; k--) lane = (lane << 8n) | BigInt(padded[off + i * 8 + k]);
        s[i] ^= lane;
      }
      permute(s);
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = Number((s[i >> 3] >> BigInt(8 * (i & 7))) & 0xffn);
    return out;
  }

  const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const fromHex = (hex) => Uint8Array.from(hex.replace(/^0x/, '').match(/../g) ?? [], (h) => parseInt(h, 16));

  E.keccak = {
    /** Hex (no 0x) of the Keccak-256 of a string (UTF-8) or of bytes. */
    hex: (input) => toHex(keccak256Bytes(input)),
    bytes: keccak256Bytes,
    toHex,
    fromHex,
  };
})();
