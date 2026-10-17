// The programs (Solana's smart contracts) worth a name, and what a transaction is likely doing from the programs it names.
// A block read with `accounts` detail lists every account of a transaction, programs included, but not its instructions:
// so "likely": a transaction that names the Jupiter program is a swap, one that names only the token program a token transfer.
(() => {
  'use strict';
  const Explorer = (window.Explorer = window.Explorer || {});
  const S = (Explorer.solana = Explorer.solana || {});

  const VOTE = 'Vote111111111111111111111111111111111111111';
  const SYSTEM = '11111111111111111111111111111111';
  // address -> [name, group]. group: 'dex' (a swap), 'token', 'system', 'stake', 'vote', 'budget' (ignored), 'other'
  const PROGRAMS = {
    [VOTE]: ['Vote', 'vote'],
    [SYSTEM]: ['System', 'system'],
    ComputeBudget111111111111111111111111111111: ['Compute Budget', 'budget'],
    TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: ['Token', 'token'],
    TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: ['Token-2022', 'token'],
    ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: ['Associated Token', 'token'],
    Stake11111111111111111111111111111111111111: ['Stake', 'stake'],
    MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: ['Memo', 'other'],
    Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo: ['Memo (v1)', 'other'],
    JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: ['Jupiter', 'dex'],
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': ['Raydium', 'dex'],
    whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: ['Orca', 'dex'],
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': ['Pump.fun', 'dex'],
    LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: ['Meteora', 'dex'],
  };

  /** The known programs a list of account addresses contains: [{ address, name, group }]. */
  const programsIn = (addresses) => addresses.filter((a) => PROGRAMS[a]).map((address) => ({ address, name: PROGRAMS[address][0], group: PROGRAMS[address][1] }));

  /**
   * 'vote' | 'swap' | 'token' | 'transfer' | 'stake' | 'program' : what the transaction likely is. A transaction naming
   * a program we do not know is a 'program' call.
   */
  function kindOf(addresses) {
    const known = programsIn(addresses);
    const groups = new Set(known.map((p) => p.group));
    if (groups.has('vote')) return 'vote';
    if (groups.has('dex')) return 'swap';
    if (groups.has('stake')) return 'stake';
    if (groups.has('token')) return 'token';
    // only the system program (and the compute budget): a plain SOL transfer, if the accounts are few; else something we cannot name
    if (groups.has('system') && addresses.length <= 4 + (groups.has('budget') ? 1 : 0)) return 'transfer';
    return 'program';
  }

  const LABELS = { vote: 'Validator vote', swap: 'Swap', token: 'Token transfer', transfer: 'SOL transfer', stake: 'Staking', program: 'Program call' };
  /** The words for a kind, with the DEX's name for a swap when the accounts name one. */
  function labelOf(kind, addresses = []) {
    if (kind === 'swap') {
      const dex = programsIn(addresses).find((p) => p.group === 'dex');
      return dex ? `Swap (${dex.name})` : 'Swap';
    }
    return LABELS[kind] ?? 'Transaction';
  }

  S.programs = { VOTE, SYSTEM, PROGRAMS, programsIn, kindOf, labelOf, nameOf: (a) => PROGRAMS[a]?.[0] ?? null };
})();
