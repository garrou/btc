// Base58 (the alphabet Solana writes keys and signatures in), just enough to tell what a string could be. Pure.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const S = (Explorer.solana = Explorer.solana || {});

  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const INDEX = new Map([...ALPHABET].map((c, i) => [c, BigInt(i)]));

  /** The bytes a base58 string stands for; null when it has a character outside the alphabet. */
  function decode(text) {
    let n = 0n;
    for (const c of text) {
      const d = INDEX.get(c);
      if (d === undefined) return null;
      n = n * 58n + d;
    }
    const bytes = [];
    while (n > 0n) { bytes.push(Number(n & 0xffn)); n >>= 8n; }
    for (const c of text) { if (c !== '1') break; bytes.push(0); } // each leading "1" is a zero byte
    return Uint8Array.from(bytes.reverse());
  }

  /** What a base58 string is by its length: 'key' (32 bytes: an account, a program, a block hash), 'signature' (64 bytes) or null. */
  function kindOf(text) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,90}$/.test(text)) return null;
    const bytes = decode(text);
    if (!bytes) return null;
    return bytes.length === 32 ? 'key' : bytes.length === 64 ? 'signature' : null;
  }

  S.base58 = { decode, kindOf };
})();
