// Just enough of the contract ABI (the way calls and results are encoded) to read a token's name and a transfer: and the
// ENS lookups. Pure. Everything is hex strings.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const E = (Explorer.ethereum = Explorer.ethereum || {});

  const strip = (hex) => hex.replace(/^0x/, '');
  const word = (hex, i) => strip(hex).slice(i * 64, i * 64 + 64);

  // function selectors: the first 4 bytes of the hash of the signature
  const SEL = { name: '0x06fdde03', symbol: '0x95d89b41', decimals: '0x313ce567', resolver: '0x0178b8bf', addr: '0x3b3b57de' };
  // event Transfer(address indexed from, address indexed to, uint256 value): topic 0 of the log. ERC-721 has the same
  // signature with the token id indexed too (4 topics instead of 3).
  const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

  /** A 32-byte word holding an address -> "0x..." (lower case); null for the zero address or a malformed word. */
  function addressOf(w) {
    const body = strip(w);
    if (body.length < 40) return null;
    const a = `0x${body.slice(-40)}`.toLowerCase();
    return /^0x0{40}$/.test(a) ? null : a;
  }

  const uint = (hex) => (strip(hex) ? BigInt(`0x${strip(hex)}`) : 0n);

  /** The result of name() / symbol(): either a dynamic string (offset, length, bytes) or a bytes32 (old tokens such as MKR). */
  function decodeText(hex) {
    const body = strip(hex ?? '');
    if (!body) return null;
    try {
      if (body.length === 64) return textOf(body);
      const offset = Number(BigInt(`0x${word(body, 0)}`)) * 2;
      const len = Number(BigInt(`0x${body.slice(offset, offset + 64)}`));
      if (len > 256) return null;
      return textOf(body.slice(offset + 64, offset + 64 + len * 2));
    } catch { return null; }
  }
  function textOf(hexBytes) {
    const text = new TextDecoder().decode(E.keccak.fromHex(hexBytes)).replace(/\u0000+$/g, '').replace(/[\u0000-\u001f]/g, '');
    return text || null;
  }

  /** namehash of an ENS name (EIP-137): hex, no 0x. Only plain ASCII names are supported (no Unicode normalization). */
  function namehash(name) {
    let node = new Uint8Array(32);
    for (const label of name.split('.').reverse()) {
      if (!label) continue;
      const both = new Uint8Array(64);
      both.set(node);
      both.set(E.keccak.bytes(label), 32);
      node = E.keccak.bytes(both);
    }
    return E.keccak.toHex(node);
  }

  /**
   * The token movements in a receipt's logs: [{ token, from, to, value (BigInt, ERC-20) | tokenId (BigInt, ERC-721) }].
   * Logs of another kind are skipped.
   */
  function transfers(logs) {
    const out = [];
    for (const l of logs ?? []) {
      if (!l.topics || l.topics[0] !== TRANSFER_TOPIC) continue;
      if (l.topics.length === 3) out.push({ token: l.address.toLowerCase(), from: addressOf(l.topics[1]), to: addressOf(l.topics[2]), value: uint(l.data) });
      else if (l.topics.length === 4) out.push({ token: l.address.toLowerCase(), from: addressOf(l.topics[1]), to: addressOf(l.topics[2]), tokenId: uint(l.topics[3]) });
    }
    return out;
  }

  E.abi = { SEL, TRANSFER_TOPIC, addressOf, decodeText, namehash, transfers, uint };
})();
