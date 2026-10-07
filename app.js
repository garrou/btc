const API = 'https://mempool.space/api';
const WS_URL = 'wss://mempool.space/api/v1/ws';
const MAX_BLOCKS = 12;
const MAX_TXS = 200;       // rows kept in the feed
const POLL_MS = 2000;      // /mempool/recent only returns ~10 txs: poll it often so none are missed
const FLUSH_MS = 300;      // feed render interval (batches arrivals)

const $ = (s) => document.querySelector(s);

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) n.setAttribute(k, v);
  }
  n.append(...kids.flat().filter((c) => c != null && c !== false));
  return n;
}

const nf = new Intl.NumberFormat('fr-FR');
const short = (s, a = 10, b = 8) => (s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s);
const btc = (sats) => (sats / 1e8).toFixed(8).replace(/\.?0+$/, '') + ' BTC';
const date = (ts) => new Date(ts * 1000).toLocaleString('fr-FR');
function ago(ts) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

async function api(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  const type = res.headers.get('content-type') || '';
  return type.includes('json') ? res.json() : res.text();
}

const state = { blocks: [], upcoming: [], txs: [], seen: new Set(), selectedId: null, focusId: null };

function blockCard(b, fresh) {
  return el('button', { class: `block${fresh ? ' fresh' : ''}${b.id === state.selectedId ? ' selected' : ''}`,
      'data-id': b.id, style: `--fill:${Math.min(1, b.weight / 4e6)}`,
      onclick: () => (scene3d ? focusSlot(b.id) : openBlock(b.id)), ondblclick: () => openBlock(b.id) },
    el('b', {}, `#${nf.format(b.height)}`),
    el('span', {}, `${nf.format(b.tx_count)} tx`),
    el('span', {}, `${(b.size / 1e6).toFixed(2)} Mo`),
    el('span', {}, b.extras?.pool?.name ?? '—'),
    el('span', {}, ago(b.timestamp)));
}

function upcomingCard(m, i) {
  const [lo, hi] = m.feeRange ? [m.feeRange[0], m.feeRange.at(-1)] : [0, 0];
  const first = i === 0; // the first projected block is the next block, shown in 3D
  return el('div', { class: `block pending${first && state.focusId === NEXT_ID ? ' selected' : ''}${first ? ' clickable' : ''}`,
      style: `--fill:${Math.min(1, m.blockVSize / 1e6)}`, onclick: first ? () => focusSlot(NEXT_ID) : null },
    el('b', {}, 'Prochain'),
    el('span', {}, `${nf.format(m.nTx)} tx`),
    el('span', {}, `~${Math.round(m.medianFee)} sat/vB`),
    el('span', {}, `${Math.round(lo)}–${Math.round(hi)} sat/vB`),
    el('span', {}, `${btc(m.totalFees)} frais`));
}

function renderBlocks(freshId) {
  $('#blocks').replaceChildren(...state.blocks.map((b) => blockCard(b, b.id === freshId)));
}
function renderUpcoming() {
  $('#upcoming').replaceChildren(...state.upcoming.slice(0, 1).map(upcomingCard)); // stop at the next block
  if (state.focusId === NEXT_ID) updateHud();
}

function addBlock(b) {
  if (state.blocks.some((x) => x.id === b.id)) return;
  state.blocks = [b, ...state.blocks].sort((x, y) => y.height - x.height).slice(0, MAX_BLOCKS);
  renderBlocks(b.id);
  miners?.found(minerInfo(b));
  if (Date.now() - lastStats > 15000) refreshStats(); // a new block moves the retarget progress
  if (!scene3d) return;
  resetProjected(); // the next block is fully recomputed after every mined block
  syncScene();
  if ($('#follow').checked) focusSlot(b.id, true);
}

// ---------- 3D scene ----------
const SHOWN = 12;         // number of mined blocks shown in 3D (besides the next one)
const DETAIL = 4;         // the most recent (and the selected) blocks are detailed; older ones are a simplified shape
const NEXT_ID = 'next';
const stage = $('.stage');
let scene3d = null;
try { scene3d = window.Block3D?.create($('#scene'), {
  tooltip: $('#tip3d'),
  describe: (t) => t.coinbase
    ? 'Coinbase (récompense du bloc)'
    : t.approx
      ? `${short(t.txid, 12, 8)}\n(taille et frais indisponibles)`
      : `${short(t.txid, 12, 8)}\n${t.rate.toFixed(1)} sat/vB · ${nf.format(t.vsize)} vB\nfrais ${nf.format(t.fee)} sats`,
  onPick: (t) => openTx(t.txid),
  onFocus: (id) => focusSlot(id),
}) ?? null; } catch (e) { console.warn('3D scene unavailable (no WebGL?)', e); scene3d = null; }
if (!scene3d) stage.hidden = true; // Three.js not loaded (offline / CDN blocked)
else {
  $('#rotate').addEventListener('change', (e) => scene3d.setAutoRotate(e.target.checked));
  $('#hud-details').addEventListener('click', () => state.selectedId && openBlock(state.selectedId));
}

function setSceneMsg(msg) { $('#scene-msg').textContent = msg; }

// Block contents: the "summary" endpoint returns everything in one call; otherwise fall back to txids only.
async function loadBlockTxs(b) {
  const expected = b.tx_count || 0;
  try {
    const rows = await api(`/v1/block/${b.id}/summary`);
    // A freshly mined block may have an incomplete summary (sometimes only the coinbase): drawing it would give
    // a wrong scene (one giant tower). Reject it and retry later.
    if (Array.isArray(rows) && rows.length && rows.length >= expected * 0.95) {
      return rows.map((r, i) => {
        const vsize = r.vsize || 1;
        return { txid: r.txid, vsize, fee: r.fee || 0, rate: r.rate ?? (r.fee || 0) / vsize, coinbase: i === 0 };
      });
    }
    console.warn(`résumé du bloc ${b.height} incomplet (${Array.isArray(rows) ? rows.length : '?'}/${expected}), nouvel essai plus tard`);
  } catch (e) { console.warn('summary indisponible, repli sur /txids', e); }
  const ids = await api(`/block/${b.id}/txids`);
  const rate = b.extras?.medianFee ?? 5;
  const txs = ids.map((txid, i) => ({ txid, vsize: 1, fee: 0, rate, coinbase: i === 0, approx: true }));
  txs.approx = true; // provisional data: the scene shows it, then replaces it as soon as the summary is complete
  return txs;
}

// Mined blocks: one promise per block (the same array reference avoids rebuilding the scene)
const txCache = new Map();
const RETRY_MS = 8000, MAX_RETRY = 8;   // retry while the block only has provisional data
const retryTimers = new Map(), retryCount = new Map();
// Does the 3D scene currently want the full detail of this block? (recent, or selected)
function wantsDetail(b) {
  const i = state.blocks.findIndex((x) => x.id === b.id);
  return i >= 0 && i < SHOWN && (i < DETAIL || b.id === state.focusId);
}
function scheduleRetry(b) {
  if (retryTimers.has(b.id) || (retryCount.get(b.id) || 0) >= MAX_RETRY) return;
  retryTimers.set(b.id, setTimeout(() => {
    retryTimers.delete(b.id);
    retryCount.set(b.id, (retryCount.get(b.id) || 0) + 1);
    if (!wantsDetail(b)) return; // the block is no longer shown in detail
    txCache.delete(b.id);
    loadSlot(b);
  }, RETRY_MS));
}
async function loadSlot(b) {
  if (!txCache.has(b.id)) txCache.set(b.id, loadBlockTxs(b));
  try {
    const txs = await txCache.get(b.id);
    if (!wantsDetail(b)) { txCache.delete(b.id); return; } // demoted/removed while loading: don't rebuild the detail
    scene3d.setTxs(b.id, txs);
    setSceneMsg('');
    if (txs.approx) scheduleRetry(b);
  } catch (e) {
    txCache.delete(b.id);
    console.warn('bloc', b.height, e);
    if (b.id === state.focusId) setSceneMsg('Chargement du bloc impossible pour le moment, nouvel essai…');
    scheduleRetry(b); // network failure / rate limit: retry later
  }
}

function syncScene() {
  const shown = state.blocks.slice(0, SHOWN);
  scene3d.setSlots([
    { id: NEXT_ID, kind: 'next', label: 'PROCHAIN' },
    ...shown.map((b) => ({ id: b.id, kind: 'mined', label: `#${nf.format(b.height)}` })),
  ]);
  for (const id of [...txCache.keys()]) if (!shown.some((b) => b.id === id)) txCache.delete(id);
  shown.forEach((b, i) => {
    if (i < DETAIL || b.id === state.focusId) return loadSlot(b);
    // old block: no transaction download, just a simplified shape (also frees the detail memory)
    txCache.delete(b.id);
    scene3d.setTxs(b.id, null);
    scene3d.setSummary(b.id, { fill: (b.weight || 0) / 4e6, rate: b.extras?.medianFee });
  });
}

// Next block: projected contents pushed by the WebSocket (track-mempool-block).
// Format not verified live: accept either [txid, fee, vsize, value] arrays or objects.
let proj = null, projTimer = 0, projShown = false;
const projFresh = new Set(); // txids that entered the next block since the last 3D update (arrival animation)
function normTx(r) {
  const o = Array.isArray(r) ? { txid: r[0], fee: r[1], vsize: r[2], value: r[3] } : r;
  const vsize = o.vsize || 1, fee = o.fee || 0;
  return { txid: o.txid, vsize, fee, value: o.value, rate: o.rate ?? fee / vsize, coinbase: false };
}
function applyProjected(pb) {
  if (Array.isArray(pb.blockTransactions)) proj = new Map(pb.blockTransactions.map(normTx).map((t) => [t.txid, t]));
  else if (pb.delta && proj) {
    (pb.delta.removed || []).forEach((id) => proj.delete(id));
    const added = (pb.delta.added || []).map(normTx);
    added.forEach((t) => { proj.set(t.txid, t); projFresh.add(t.txid); });
    pushTxs(added);
  } else return;
  if (!projTimer) projTimer = setTimeout(pushProjected, projShown ? 2500 : 0); // throttles rebuilds
}
function pushProjected() {
  projTimer = 0;
  if (!scene3d || !proj) return;
  projShown = true;
  if (!proj.size) { projFresh.clear(); scene3d.setTxs(NEXT_ID, null); return; } // empty projection: clear stale towers
  const incoming = [...projFresh].filter((id) => proj.has(id));
  projFresh.clear();
  scene3d.setTxs(NEXT_ID, [...proj.values()], incoming);
}
function resetProjected() {
  proj = null; projShown = false; projFresh.clear();
  clearTimeout(projTimer); projTimer = 0;
  scene3d.setTxs(NEXT_ID, null);
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ 'track-mempool-block': 0 }));
}

function updateHud() {
  const id = state.focusId;
  if (id === NEXT_ID) {
    const m = state.upcoming[0];
    $('#hud-title').textContent = 'Prochain bloc';
    $('#hud-sub').textContent = m
      ? `projection · ${nf.format(m.nTx)} tx · ~${Math.round(m.medianFee)} sat/vB`
      : 'projection du mempool';
  } else {
    const b = state.blocks.find((x) => x.id === id);
    if (!b) return;
    $('#hud-title').textContent = `Bloc #${nf.format(b.height)}`;
    $('#hud-sub').textContent = `${nf.format(b.tx_count)} tx · ${b.extras?.pool?.name ?? 'mineur inconnu'} · ${date(b.timestamp)}`;
  }
  $('#hud-details').hidden = id === NEXT_ID;
}

function focusSlot(id, auto = false) {
  if (!scene3d) return;
  if (!auto) $('#follow').checked = false; // a manual choice turns following off
  state.focusId = id;
  state.selectedId = id === NEXT_ID ? null : id;
  scene3d.focus(id);
  const fb = state.blocks.find((x) => x.id === id);
  if (fb && !txCache.has(id)) { setSceneMsg('Chargement du bloc…'); loadSlot(fb); } // simplified old block: load its detail
  document.querySelectorAll('#blocks .block').forEach((n) => n.classList.toggle('selected', n.dataset.id === id));
  document.querySelector('#upcoming .block')?.classList.toggle('selected', id === NEXT_ID);
  const card = document.querySelector('#blocks .block.selected, #upcoming .block.selected'), chain = document.querySelector('.chain');
  if (card && chain) chain.scrollTo({ left: card.offsetLeft - (chain.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' }); // without scrolling the page
  updateHud();
}

// ---------- rendering: transaction feed ----------
// Several sources feed the same stream (deduplicated by txid):
//   1. /mempool/recent (polled every 2 s)
//   2. transactions entering the next block (WebSocket, track-mempool-block)
//   3. if the server sends them: 'transactions' / 'mempool-txids' (formats not verified live)
const txBuffer = [];                 // arrivals waiting to be displayed (oldest first)
const arrivals = [];                 // recent timestamps, used for the rate
let txTotal = 0;

function pushTxs(list) {
  const fresh = [];
  for (const t of list) {
    if (!t || !t.txid || state.seen.has(t.txid)) continue;
    if (!(proj && proj.has(t.txid))) fresh.push({ rate: t.vsize && t.fee != null ? t.fee / t.vsize : undefined }); // those in the projected block have their own animation
    state.seen.add(t.txid);
    txTotal++;
    arrivals.push(Date.now());
    txBuffer.push(t);
  }
  if (scene3d && fresh.length) scene3d.stream(fresh);
  if (txBuffer.length > 1000) txBuffer.splice(0, txBuffer.length - 1000); // long pause: keep only the most recent
  if (state.seen.size > 20000) { // bounded memory: forget the oldest ids first (a Set iterates in insertion order)
    let drop = state.seen.size - 15000;
    for (const id of state.seen) { if (drop-- <= 0) break; state.seen.delete(id); }
  }
}

function txRow(t) {
  const rate = t.vsize ? `${Math.round((t.fee || 0) / t.vsize)} sat/vB` : '—';
  return el('li', { class: 'fresh', 'data-id': t.txid, onclick: () => openTx(t.txid) },
    el('span', { class: 'mono' }, t.txid),
    el('span', {}, t.value != null ? btc(t.value) : '—'),
    el('span', { class: 'muted' }, rate));
}

function flushTxs() {
  const now = Date.now();
  while (arrivals.length && now - arrivals[0] > 10000) arrivals.shift();
  const rate = arrivals.length / 10;
  $('#txcount').textContent = `${nf.format(txTotal)} vues · ≈ ${rate.toFixed(1).replace('.', ',')} tx/s${$('#pause').checked ? ' · en pause' : ''}`;
  if ($('#pause').checked || !txBuffer.length) return;
  const batch = txBuffer.splice(0).reverse();      // newest on top
  state.txs = [...batch, ...state.txs].slice(0, MAX_TXS);
  const list = $('#txs');
  list.prepend(...batch.slice(0, MAX_TXS).map(txRow)); // incremental rendering: only add the new rows
  while (list.children.length > MAX_TXS) list.lastElementChild.remove();
}

async function pollRecent() {
  try {
    const list = await api('/mempool/recent'); // last ~10 txs that entered the mempool, newest first
    pushTxs(list.slice().reverse());
  } catch (e) { console.warn('recent', e); }
}

// ---------- WebSocket ----------
let ws, retry = 0;
function setStatus(on) {
  const s = $('#status');
  s.textContent = on ? 'en direct' : 'hors ligne';
  s.className = `pill ${on ? 'on' : 'off'}`;
}

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    retry = 0;
    setStatus(true);
    refreshBlocks().catch((e) => console.warn('blocks', e)); // backfill blocks mined while offline
    ws.send(JSON.stringify({ action: 'want', data: ['blocks', 'mempool-blocks', 'mempool-txids'] }));
    ws.send(JSON.stringify({ 'track-mempool-block': 0 })); // next block contents, for the 3D scene
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.block) { addBlock(msg.block); }
    if (msg['mempool-blocks']) { state.upcoming = msg['mempool-blocks']; renderUpcoming(); }
    if (msg['projected-block-transactions'] && scene3d) applyProjected(msg['projected-block-transactions']);
    if (Array.isArray(msg.transactions)) pushTxs(msg.transactions.map(normTx));
    if (msg['mempool-txids']?.added) pushTxs(msg['mempool-txids'].added.map((txid) => ({ txid })));
  };
  ws.onclose = () => {
    setStatus(false);
    setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
  };
  ws.onerror = () => ws.close();
}

// ---------- details ----------
const dialog = $('#detail');
const body = $('#detail-body');
$('#close').onclick = () => dialog.close();
dialog.addEventListener('click', (e) => { // close on backdrop click only (not on the dialog's own padding)
  if (e.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
});

function show(...nodes) {
  body.replaceChildren(...nodes.flat()); // flatten arrays (e.g. a list of transactions)
  if (!dialog.open) dialog.showModal();
}

const fields = (rows) => el('dl', {}, rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
const addrLine = (addr, sats) => el('li', {}, el('span', { class: 'mono' }, addr ?? 'OP_RETURN / non standard'), el('span', {}, btc(sats)));

function txCard(tx, linked = true) {
  const inputs = tx.vin.map((i) => i.is_coinbase ? addrLine('Coinbase (nouveaux BTC)', 0) : addrLine(i.prevout?.scriptpubkey_address, i.prevout?.value ?? 0));
  const outputs = tx.vout.map((o) => addrLine(o.scriptpubkey_address, o.value));
  const id = linked
    ? el('button', { class: 'link mono', onclick: () => openTx(tx.txid) }, tx.txid)
    : el('span', { class: 'mono' }, tx.txid);
  return el('div', { class: 'tx-card' }, id,
    el('div', { class: 'io' },
      el('div', {}, el('b', {}, `Entrées (${tx.vin.length})`), el('ul', {}, inputs.slice(0, 20))),
      el('div', {}, el('b', {}, `Sorties (${tx.vout.length})`), el('ul', {}, outputs.slice(0, 20)))));
}

let detailSeq = 0; // only the latest detail request may update the dialog
async function openTx(txid) {
  const mine = ++detailSeq;
  show(el('p', { class: 'muted' }, 'Chargement…'));
  try {
    const tx = await api(`/tx/${txid}`);
    if (mine !== detailSeq) return;
    const st = tx.status;
    const out = tx.vout.reduce((s, o) => s + o.value, 0);
    show(el('h2', {}, 'Transaction'), fields([
      ['Txid', el('span', { class: 'mono' }, tx.txid)],
      ['Statut', st.confirmed
        ? el('span', {}, 'Confirmée dans le bloc ', el('button', { class: 'link', onclick: () => openBlock(st.block_hash) }, `#${nf.format(st.block_height)}`), ` · ${date(st.block_time)}`)
        : 'Non confirmée (mempool)'],
      ['Montant sorti', btc(out)],
      ['Frais', tx.fee != null ? `${nf.format(tx.fee)} sats (${(tx.fee / (tx.weight / 4)).toFixed(1)} sat/vB)` : '—'],
      ['Taille', `${nf.format(tx.size)} o · ${nf.format(Math.ceil(tx.weight / 4))} vB`],
    ]), txCard(tx, false));
  } catch (e) { if (mine === detailSeq) show(el('p', {}, `Transaction introuvable (${e.message})`)); }
}

async function openBlock(hash) {
  const mine = ++detailSeq;
  show(el('p', { class: 'muted' }, 'Chargement…'));
  try {
    const [b, txs] = await Promise.all([api(`/block/${hash}`), api(`/block/${hash}/txs`)]);
    if (mine !== detailSeq) return;
    show(el('h2', {}, `Bloc #${nf.format(b.height)}`), fields([
      ['Hash', el('span', { class: 'mono' }, b.id)],
      ['Date', `${date(b.timestamp)} (${ago(b.timestamp)})`],
      ['Transactions', nf.format(b.tx_count)],
      ['Taille', `${(b.size / 1e6).toFixed(2)} Mo · ${(b.weight / 1e6).toFixed(2)} MWU`],
      ['Mineur', b.extras?.pool?.name ?? '—'],
      ['Frais médian', b.extras ? `${b.extras.medianFee.toFixed(1)} sat/vB` : '—'],
      ...(b.previousblockhash ? [['Bloc précédent', el('button', { class: 'link mono', onclick: () => openBlock(b.previousblockhash) }, short(b.previousblockhash, 16, 8))]] : []), // absent for the genesis block
    ]), el('h3', {}, `Premières transactions (${txs.length} / ${nf.format(b.tx_count)})`), txs.map((t) => txCard(t)));
  } catch (e) { if (mine === detailSeq) show(el('p', {}, `Bloc introuvable (${e.message})`)); }
}

// ---------- search ----------
$('#search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (!q) return;
  try {
    if (/^\d+$/.test(q)) return openBlock(await api(`/block-height/${q}`));
    if (/^[0-9a-fA-F]{64}$/.test(q)) {
      // a block hash starts with many zeros
      const blockFirst = q.startsWith('00000000');
      const [a, b] = blockFirst ? [openBlock, openTx] : [openTx, openBlock];
      try { await api(blockFirst ? `/block/${q}` : `/tx/${q}`); return a(q); } catch { return b(q); }
    }
    show(el('p', {}, 'Entrée non reconnue : hauteur, hash de bloc (64 hex) ou txid.'));
  } catch (err) { show(el('p', {}, `Introuvable (${err.message})`)); }
});

// ---------- network stats ----------
// Hashrate/difficulty come from mempool.space. There is no public measurement of the network's power draw:
// consumption is an ESTIMATE = hashrate x an assumed average fleet efficiency (J/TH).
const J_PER_TH = 25;
const fr = (n, d = 1) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function duration(ms) {
  const min = Math.max(0, ms) / 60000;
  if (min < 90) return `${Math.round(min)} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${fr(min / 1440, 1)} j`;
}
function setStat(id, html) { $(`#${id}`).innerHTML = html; }

async function refreshStats() {
  lastStats = Date.now();
  const [hr, adj] = await Promise.allSettled([api('/v1/mining/hashrate/3d'), api('/v1/difficulty-adjustment')]);
  if (hr.status === 'fulfilled') {
    const series = (hr.value.hashrates || []).map((p) => num(p.avgHashrate)).filter((v) => v != null);
    const hashrate = num(hr.value.currentHashrate) ?? series.at(-1) ?? null; // H/s
    const difficulty = num(hr.value.currentDifficulty) ?? num(hr.value.difficulty?.at?.(-1)?.difficulty);
    if (hashrate) {
      const gw = (hashrate / 1e12) * J_PER_TH / 1e9; // TH/s x J/TH = W
      miners?.setHashrate(hashrate);
      setStat('st-hash', `${fr(hashrate / 1e18)}<em>EH/s</em>`);
      setStat('st-power', `≈ ${fr(gw)}<em>GW</em>`);
      setStat('st-power-sub', `≈ ${fr(gw * 8.76, 0)} TWh/an · estimation à ${J_PER_TH} J/TH`);
      $('#st-power-box').title = `Estimation : hashrate × ${J_PER_TH} J/TH (efficacité moyenne supposée du parc de machines).`;
    }
    if (difficulty) setStat('st-diff', `${fr(difficulty / 1e12, 2)}<em>T</em>`);
    if (series.length > 1) {
      const lo = Math.min(...series), hi = Math.max(...series), span = hi - lo || 1;
      $('#st-spark polyline').setAttribute('points', series.map((v, i) => `${(i / (series.length - 1)) * 100},${22 - ((v - lo) / span) * 20}`).join(' '));
    }
  } else console.warn('hashrate', hr.reason);
  if (adj.status === 'fulfilled') {
    const a = adj.value, change = num(a.difficultyChange), pct = num(a.progressPercent);
    if (change != null) {
      const el = $('#st-adj');
      el.className = change >= 0 ? 'up' : 'down';
      el.innerHTML = `${change >= 0 ? '+' : ''}${fr(change)}<em>%</em>`;
    }
    const left = num(a.remainingTime), blocks = num(a.remainingBlocks);
    if (left != null && blocks != null) setStat('st-adj-sub', `dans ~${duration(left)} · ${nf.format(blocks)} blocs`);
    if (pct != null) $('#st-adj-bar').style.width = `${Math.min(100, Math.max(0, pct))}%`;
    const prev = num(a.previousRetarget);
    if (prev != null) setStat('st-diff-sub', `dernier ajustement ${prev >= 0 ? '+' : ''}${fr(prev)} %`);
  } else console.warn('difficulty adjustment', adj.reason);
}
let lastStats = 0;

// ---------- miners schematic ----------
const miners = window.MinersViz?.create($('#miners'));
if (!miners) $('#miners').hidden = true;
const minerInfo = (b) => ({ pool: b.extras?.pool?.name ?? 'Inconnu', height: b.height, hash: b.id, nonce: b.nonce });

// Pool shares over the last 24 h (number of blocks found per pool)
async function refreshPools() {
  try {
    const res = await api('/v1/mining/pools/24h');
    const list = (res.pools || []).map((p) => ({ name: p.name, share: p.blockCount })).filter((p) => p.share > 0);
    if (!list.length) throw new Error('no pools');
    miners?.setPools(list);
    setTimeout(refreshPools, 10 * 60000);
  } catch (e) {
    console.warn('pools', e);
    setTimeout(refreshPools, 30000);
  }
}

// ---------- startup ----------
// Merge the latest blocks into the state (startup, and backfill after a WebSocket reconnect).
async function refreshBlocks() {
  const list = await api('/v1/blocks');
  const byId = new Map([...list, ...state.blocks].map((b) => [b.id, b]));
  const merged = [...byId.values()].sort((x, y) => y.height - x.height).slice(0, MAX_BLOCKS);
  if (merged.length === state.blocks.length && merged.every((b, i) => b.id === state.blocks[i].id)) return; // nothing new
  const first = !state.blocks.length;
  state.blocks = merged;
  renderBlocks();
  if (first) miners?.seed(merged.slice(0, 4).reverse().map(minerInfo)); // recent blocks, without animation
  if (!scene3d) return;
  if (first) setSceneMsg('Chargement des transactions…'); else resetProjected();
  syncScene();
  if (first || $('#follow').checked) focusSlot(state.blocks[0].id, true);
}
function loadBlocks(attempt = 0) { // retries with a growing delay if the API is unavailable at startup
  refreshBlocks().catch((e) => {
    console.warn('blocks', e);
    setTimeout(() => loadBlocks(attempt + 1), Math.min(30000, 2000 * 2 ** attempt));
  });
}

async function init() {
  loadBlocks();
  refreshStats();
  setInterval(refreshStats, 60000);
  if (miners) refreshPools();
  connect();
  pollRecent();
  setInterval(pollRecent, POLL_MS);
  setInterval(flushTxs, FLUSH_MS);
  setInterval(() => { renderBlocks(); }, 30000); // refresh the "x ago" labels
}
init();
