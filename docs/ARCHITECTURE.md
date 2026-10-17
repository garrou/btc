# Architecture

Each page is split in two:

- the **engine**: everything that draws blocks and transactions in 3D, keeps the list of blocks, the feed and the camera.
  It knows nothing about any blockchain.
- a **chain**: one object that gives the engine its numbers, its words and its data. Everything specific to a chain lives
  in `js/chains/<name>/`. Four exist: Bitcoin (`bitcoin.html`), Ethereum (`ethereum.html`), Solana (`solana.html`), the XRP Ledger (`xrp.html`); `index.html` is the home page that
  links to them.

The engine talks to the chain only through `Explorer.chain`. The contract is written (and validated at startup) in
[`js/core/chain.js`](../js/core/chain.js). An engine file must not name a Bitcoin,
Ethereum or Solana module or unit (`Explorer.bitcoin`, `gwei`, `lamports`...): `grep -rn "Explorer.bitcoin\|gwei\|lamport" js --exclude-dir=chains` should find nothing outside comments.

## Where things are

```
js/
  core/          pure logic, no DOM, no network (treemap layout, colors, block list, feed buffer, formatting)
    chain.js     THE CONTRACT: what a chain must provide (Explorer.defineChain)
  state/         the single mutable state of the app
  scene/         the 3D view (Three.js): rendering only
  ui/            DOM views of the engine (block row, HUD, feed, dialog shell)
  controllers/   orchestration (navigation, scene-sync, feed, "latest request wins")
  net/           JSON-RPC over HTTP and WebSocket (shared by the chains that speak it: nodes tried in turn, batches, reconnection)
  app.js         entry point: creates the views and the scene, connects the chain, wires everything
  chains/<name>/ (bitcoin, ethereum, solana, xrp: the same four folders, each file is that chain's own)
    chain.js     the spec passed to Explorer.defineChain: numbers, words, data, live, hooks
    core/        pure logic of the chain (transactions, addresses, search classification...), no DOM, no network
    data/        where the data comes from (Bitcoin: mempool.space; Ethereum, Solana: a node, over JSON-RPC)
    ui/          the chain's screens (detail dialog content, statistics bar)
    controllers/ the chain's orchestration (detail requests, search, statistics; Bitcoin: tracked address)
css/             style.css (shared by every page, home page included), bitcoin.css, ethereum.css, solana.css, xrp.css (what only that chain's page needs)
index.html                                   home: the choice of a chain
bitcoin.html  ethereum.html  solana.html  xrp.html     one page per chain: same engine scripts, the chain's own scripts
img/                                         the logos of the chains (title, switch, home page)
```

All files are classic scripts sharing the global `Explorer` (no modules, no build): the page works when double-clicked.
`Explorer` holds the engine (`Explorer.chain`, `Explorer.ui`, `Explorer.state`...); each chain keeps its own modules under its name
(`Explorer.bitcoin.api`, `Explorer.ethereum.rpc`, `Explorer.solana.txs`...), so the engine and the chains never share a name.
The order of the `<script>` tags in each chain's page matters; it follows the layers above, and the chain is loaded
right after `core/config.js` because some engine files read `Explorer.chain` while loading.

## A short glossary of the 3D view

You do not need to know Three.js to read the engine; these are the ideas.

- **Slot**: the place of one block in the scene. Slots are laid out in a row along an axis, `pitch` units apart.
  The first slot is the **next block** (not mined yet, id `'next'`), then the latest mined block, then older ones.
- **Platform / cage**: a square plate (`size` units wide) with a frame around it. One per slot. A full block covers it.
- **Tower**: one transaction. Its **footprint** is proportional to its size (a block of `capacity.size` units covers the whole
  platform); its **height and color** come from its rate (price per unit of size), through the color scale of `chain.rates`.
  The coinbase (block reward) is drawn gold, in the corner.
- **Treemap** (`core/treemap.js`): the algorithm that decides which rectangle of the platform each tower gets, so that
  areas are proportional to sizes. Pure math. The **next block** uses an incremental variant so that towers
  stay where they are while newcomers take free room ("Stable" placement); "Compact" lays it out again each time.
- **InstancedMesh**: how thousands of towers are drawn cheaply, as one object with one position/color per tower.
  Only `scene/scene3d.js` knows about it.
- **Camera**: orbits around the focused slot (OrbitControls). Changing the focus slides the camera to another slot.
- **Window**: only the slots within `reach` of the camera exist in 3D; the row slides with the camera.
- **Detail radius**: slots within `detailRadius` of the camera show every tower; farther ones are a single **light shape**
  (its height and color from `chain.fill` and `chain.typicalRate`) that fades into the fog. They are loaded (and become
  detailed) when the camera comes close.
- **Highlight**: a way to light some towers and dim the others (used for the tracked address). The scene reports changes
  through `onHighlight`.
- **Arrivals**: a transaction entering the mempool falls from the sky into the next block as the very tower it will be.

## Data flow

```
chain.live.connect  --onBlock-->      nav.addBlock --> state.blocks --> blocks row + scene-sync --> scene
                    --onProjected-->  scene-sync: chain.createPending().apply(raw) --> towers of the next block
                    --onTransactions> feed
chain.data.blockTowers(block) --> scene-sync --> scene (a mined block, downloaded once, cached)
chain.data.latestBlocks / blocksFrom / heightOf / hashOf --> navigation (list, history, search by height or hash)
user: click a tower / block, "Block details", search box --> chain.openTx / openBlock / search --> the chain's screens
```

Provisional data: if a mined block's towers are not known precisely yet (`approx`), the engine draws what it has and asks
`blockTowers` again later (`scene-sync.js`, retries).

## The four chains

| | Bitcoin | Ethereum | Solana | XRP Ledger |
|---|---|---|---|---|
| tower (a transaction) | footprint = size (vB), height & color = fee rate (sat/vB) | footprint = gas used, height & color = gas price (gwei) | footprint = compute units (**estimated**), height & color = priority fee paid (lamports) | footprint = ledger objects touched, **color = kind of transaction**, height = fee above the reference fee |
| full block | 1 Mvb | the gas limit (60M) | compute units (60M) | none: a scale tuned to ordinary ledgers (2,000 objects) |
| a block | every ~10 min | every 12 s | every 0.4 s: the page shows **one in 10** (a block every 4 s), see `core/blocks.js` | a ledger every 3 to 5 s, final once validated (no forks): every one is shown |
| next block | the mempool's projection, pushed by the server | a guess built from the pending transactions the page has seen (best tip first) | none: no mempool can be read (`nextBlock: false`) | none (`nextBlock: false`) |
| data | mempool.space REST + WebSocket | a node: JSON-RPC + WebSocket (`eth_subscribe`) | a node: JSON-RPC + WebSocket (`slotSubscribe`) | a server: **one WebSocket** for the commands and the ledgers that close (`subscribe` to `ledger`) |
| accent | orange | Ethereum blue | Solana purple (the scale ends in the logo's green) | XRP blue |
| address page | totals + transactions | balance, nonce, contract or wallet, token name, ENS | balance, owner program, token holdings, latest transactions | balance, objects owned, latest transactions |
| tracked address in 3D ("Show in 3D") | yes | **no** | **no** | not yet (`account_tx` would allow it) |

The statistics bar of each chain ends with **Transactions / day**. How it is counted depends on what the chain lets a page read:

| | How | Exact? |
|---|---|---|
| Bitcoin | the sum of `tx_count` of the blocks mined in the last 24 h (the blocks held, then pages of 15 older ones: about 10 requests, every 10 minutes) | yes, to the block |
| Ethereum | `eth_getBlockTransactionCountByNumber` for 48 blocks spread over the last 7,200, scaled to the day | an estimate, a few percent |
| Solana | `getRecentPerformanceSamples`: the node keeps about 12 hours of one-minute samples; the rate over them, scaled to 24 h. The figure leaves the votes out when the node tells them apart (`numNonVoteTransactions`) | an extrapolation of 12 hours |
| XRP Ledger | `ledger` for 36 ledgers spread over the last ~21,600, scaled to the day | an estimate, a few percent |

Why no tracked address on Ethereum and Solana. On Bitcoin the page lights up the towers of an address: it can, because the
mempool.space API lists every transaction of an address. A plain Ethereum node cannot (it takes an indexer such as Etherscan,
which needs a key). A Solana node does list the signatures of an address, but the page only draws one block in ten, so most of
the transactions of an address would never be in a drawn block: lighting them up would show nothing.

What is Ethereum-specific and worth knowing: the base fee of the next block is computed from the last block (EIP-1559, `core/blocks.js`);
the gas a transaction really used comes from the receipts (`eth_getBlockReceipts`), estimated from the gas limits when a node
lacks that call; the next block is only a guess since a public node announces the transactions it sees, not the whole mempool.

What is Solana-specific: most transactions of a block are validators' votes (flat dark towers); the base fee is the same for
everybody (5000 lamports per signature), so the height of a tower is the priority fee, what people bid to be first (the fee paid minus 5000 per signature: a transaction that verifies signatures with a precompile program pays more, and shows a small false priority).
The footprint is an estimate: the light read of a block (`accounts` detail) gives fee, accounts and balances but not the compute
units each transaction used (only the full read does, several times heavier), so they are guessed from the accounts a transaction
touches (`estimateCU` in `core/txs.js`). The real figure is on the page of the transaction.
A Solana node refuses a block that holds a transaction newer than the version the client says it supports (error -32015, it names
the version to use); `data/rpc.js` takes that number and asks again, so a new version of the format does not blank the page.

What is XRP-specific: a transaction has no size and no price to bid with (the fee is 10 drops for nearly everybody, and burned), so
the colors of the towers say **what a transaction is** (a payment, an order of the built-in exchange, a trust line, an AMM pool, an
NFT, anything else; red when it was charged its fee but did nothing, a result `tec...`). The chain gives each tower its own `color`
and a `legend` of kinds (see `legend` in `js/core/chain.js`). The footprint is the number of ledger objects the transaction touched
(the `AffectedNodes` of its metadata); the height is the fee in multiples of the reference fee, flat for almost all and a spike for
the rare one that paid more. The page needs no HTTP request: the commands (`ledger`, `tx`, `account_info`, `account_tx`, `fee`) travel
over the same WebSocket as the ledgers that close (`data/ws.js`), which also avoids asking the servers for cross-origin permission.
The ledger clock counts seconds from 2000-01-01 (`unixTime` in `core/format.js`).

Default nodes are public ones (`config.rpc` and `config.ws` in each `chain.js`): they may rate-limit, and their operators see
the IP address of the visitor and the addresses and transactions he looks up. Use your own node by changing those lists.

## Adding a chain

1. Create `js/chains/<name>/chain.js` calling `Explorer.defineChain({...})`. The call lists every missing or mistyped field of
   the contract in one error, so you can start from an empty object and fill it in.
2. Implement the data side: `data.*` (REST-like requests), `live.connect` (push events, in the shapes the contract describes)
   and `createPending` (the towers of the pending block). Turn the chain's raw formats into the tower model
   `{ txid, vsize, rate, coinbase?, approx? }` and the block model `{ id, height, previousblockhash, timestamp }`.
3. Write its words: `blockCard`, `nextCard`, `blockLine`, `nextLine`, `feedRow`, `describeTower`.
4. Optionally provide hooks (`openTx`, `openBlock`, `search`, `onBlock`, `onVisible`, `onHighlight`, `start`) for its own
   detail screens, search and statistics. A chain without a hook simply has no such feature.
5. Optionally state its look and shape: `theme.accent`, `rates.heightScale`, `rates.label`, `blockNumber`, `legend` (and a `color` on each tower) when colors are kinds rather than prices, and `nextBlock: false`
   if there is no pending block to show (see the list of optional parts in `js/core/chain.js`).
6. Make a page: copy `ethereum.html` (the simplest) and load the new chain's scripts instead; add the chain to the switch of the
   other pages (a logo in `img/`) and a card to `index.html`. No build step: scripts only.
   A chain that speaks JSON-RPC can use `Explorer.jsonrpc.create` / `Explorer.jsonrpc.socket` from `js/net/jsonrpc.js`.
7. Try it: open the page; a fake node that answers the same JSON is enough to see every screen if the real ones are unreachable.

## Running

Nothing to install or build, and Node is not needed: open `index.html` (or a chain's page) in a browser.

## Known limitations

- **One chain per page.** `Explorer.chain` is a single global; two chains in one page are not supported.
- **Page chrome belongs to the page.** The titles, the statistics bar and the labels are in each chain's own `.html`.
- **The chains' live data was written against mocked nodes.** The public nodes cannot be reached from the environment this was
  built in: every screen and every flow was tested against a fake node that answers the standard JSON-RPC, not against the real
  ones. If a public node answers differently (a call it does not offer, a stricter rate limit), the first symptom is a warning
  in the console and a missing block or screen: see `data/` of the chain.
- **Historical names.** In the tower model, `vsize` means "size in capacity units" and `rate` "price per unit";
  the names come from Bitcoin (virtual size, sat/vB) and were kept to avoid a risky mass rename.
- **A chain with no proof-of-work** (Ethereum, Solana, the XRP Ledger...) needs decisions the contract does not make for you: what a "block"
  and a "slot" are, what the size of a transaction is (gas?), and what the next block shows. See `core/chain.js`.
