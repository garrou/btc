// Ethereum addresses: validity and the mixed-case checksum (EIP-55). Pure.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const E = (Explorer.ethereum = Explorer.ethereum || {});

  const isAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(s);

  /** The address as wallets write it: letters upper- or lower-case according to the hash of the address (EIP-55). */
  function checksum(address) {
    const lower = address.slice(2).toLowerCase();
    const hash = E.keccak.hex(lower);
    return `0x${[...lower].map((c, i) => (parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c)).join('')}`;
  }

  /** False only when the address mixes cases and the mix is not the checksum: a typo. All lower or all upper cannot be checked. */
  function checksumOk(address) {
    const body = address.slice(2);
    return body === body.toLowerCase() || body === body.toUpperCase() || checksum(address) === `0x${body}`;
  }

  const ZERO = '0x0000000000000000000000000000000000000000';
  /** Well known addresses worth a name next to them (the burn address, the deposit contract...). */
  const KNOWN = {
    [ZERO]: 'Null address (burn)',
    '0x000000000000000000000000000000000000dead': 'Dead address (burn)',
    '0x00000000219ab540356cbb839cbe05303d7705fa': 'Beacon deposit contract (staking)',
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH (wrapped ether)',
  };
  const nameOf = (address) => KNOWN[address.toLowerCase()] ?? null;

  E.address = { isAddress, checksum, checksumOk, nameOf, ZERO };
})();
