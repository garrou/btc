const API = 'https://mempool.space/api';
const WS_URL = 'wss://mempool.space/api/v1/ws';
const MAX_BLOCKS = 12;
const MAX_TXS = 200;       // lignes conservées dans le flux
const POLL_MS = 2000;      // /mempool/recent ne renvoie que ~10 tx : on l'interroge souvent pour ne rien rater
const FLUSH_MS = 300;      // fréquence d'affichage du flux (regroupe les arrivées)

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
  const first = i === 0; // le premier bloc projeté est le prochain bloc, affiché en 3D
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
  $('#upcoming').replaceChildren(...state.upcoming.slice(0, 1).map(upcomingCard)); // on s'arrête au prochain bloc
  if (state.focusId === NEXT_ID) updateHud();
}

function addBlock(b) {
  if (state.blocks.some((x) => x.id === b.id)) return;
  state.blocks = [b, ...state.blocks].sort((x, y) => y.height - x.height).slice(0, MAX_BLOCKS);
  renderBlocks(b.id);
  if (!scene3d) return;
  resetProjected(); // le prochain bloc est entièrement recalculé après chaque bloc miné
  syncScene();
  if ($('#follow').checked) focusSlot(b.id, true);
}

// ---------- scène 3D ----------
const SHOWN = 12;         // nombre de blocs minés affichés en 3D (en plus du prochain)
const DETAIL = 4;         // les plus récents (et le bloc sélectionné) sont détaillés ; les plus anciens sont une version simplifiée
const NEXT_ID = 'next';
const stage = $('.stage');
const scene3d = window.Block3D?.create($('#scene'), {
  tooltip: $('#tip3d'),
  describe: (t) => t.coinbase
    ? 'Coinbase (récompense du bloc)'
    : t.approx
      ? `${short(t.txid, 12, 8)}\n(taille et frais indisponibles)`
      : `${short(t.txid, 12, 8)}\n${t.rate.toFixed(1)} sat/vB · ${nf.format(t.vsize)} vB\nfrais ${nf.format(t.fee)} sats`,
  onPick: (t) => openTx(t.txid),
  onFocus: (id) => focusSlot(id),
});
if (!scene3d) stage.hidden = true; // Three.js non chargé (hors ligne / CDN bloqué)
else {
  $('#rotate').addEventListener('change', (e) => scene3d.setAutoRotate(e.target.checked));
  $('#hud-details').addEventListener('click', () => state.selectedId && openBlock(state.selectedId));
}

function setSceneMsg(msg) { $('#scene-msg').textContent = msg; }

// Contenu d'un bloc : l'endpoint « summary » donne tout en un appel ; sinon on se rabat sur les seuls txids.
async function loadBlockTxs(b) {
  const expected = b.tx_count || 0;
  try {
    const rows = await api(`/v1/block/${b.id}/summary`);
    // Un bloc tout juste miné peut avoir un résumé incomplet (parfois la seule coinbase) : le dessiner donnerait
    // une scène fausse (une tour géante). On le refuse et on réessaiera plus tard.
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
  txs.approx = true; // données provisoires : la scène les affiche, puis les remplace dès que le résumé est complet
  return txs;
}

// Blocs minés : une promesse par bloc (la même référence de tableau évite de reconstruire la scène)
const txCache = new Map();
const RETRY_MS = 8000, MAX_RETRY = 8;   // nouvel essai tant que le bloc n'a que des données provisoires
const retryTimers = new Map(), retryCount = new Map();
function scheduleRetry(b) {
  if (retryTimers.has(b.id) || (retryCount.get(b.id) || 0) >= MAX_RETRY) return;
  retryTimers.set(b.id, setTimeout(() => {
    retryTimers.delete(b.id);
    retryCount.set(b.id, (retryCount.get(b.id) || 0) + 1);
    if (!state.blocks.slice(0, SHOWN).some((x) => x.id === b.id)) return; // le bloc n'est plus affiché
    txCache.delete(b.id);
    loadSlot(b);
  }, RETRY_MS));
}
async function loadSlot(b) {
  if (!txCache.has(b.id)) txCache.set(b.id, loadBlockTxs(b));
  try {
    const txs = await txCache.get(b.id);
    scene3d.setTxs(b.id, txs);
    setSceneMsg('');
    if (txs.approx) scheduleRetry(b);
  } catch (e) {
    txCache.delete(b.id);
    console.warn('bloc', b.height, e);
    if (b.id === state.focusId) setSceneMsg('Chargement du bloc impossible pour le moment, nouvel essai…');
    scheduleRetry(b); // échec réseau / limite de débit : on réessaie plus tard
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
    // ancien bloc : pas de téléchargement des transactions, une forme simplifiée (relâche aussi la mémoire du détail)
    txCache.delete(b.id);
    scene3d.setTxs(b.id, null);
    scene3d.setSummary(b.id, { fill: (b.weight || 0) / 4e6, rate: b.extras?.medianFee });
  });
}

// Prochain bloc : contenu projeté poussé par le WebSocket (track-mempool-block).
// Format non vérifié en direct : on accepte des tableaux [txid, fee, vsize, value] ou des objets.
let proj = null, projTimer = 0, projShown = false;
const projFresh = new Set(); // txids entrés dans le prochain bloc depuis la dernière mise à jour 3D (animation d'arrivée)
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
  if (!projTimer) projTimer = setTimeout(pushProjected, projShown ? 2500 : 0); // limite les reconstructions
}
function pushProjected() {
  projTimer = 0;
  if (!scene3d || !proj || !proj.size) return;
  projShown = true;
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
  if (!auto) $('#follow').checked = false; // un choix manuel désactive le suivi
  state.focusId = id;
  state.selectedId = id === NEXT_ID ? null : id;
  scene3d.focus(id);
  const fb = state.blocks.find((x) => x.id === id);
  if (fb && !txCache.has(id)) { setSceneMsg('Chargement du bloc…'); loadSlot(fb); } // ancien bloc simplifié : on charge son détail
  document.querySelectorAll('#blocks .block').forEach((n) => n.classList.toggle('selected', n.dataset.id === id));
  document.querySelector('#upcoming .block')?.classList.toggle('selected', id === NEXT_ID);
  const card = document.querySelector('#blocks .block.selected, #upcoming .block.selected'), chain = document.querySelector('.chain');
  if (card && chain) chain.scrollTo({ left: card.offsetLeft - (chain.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' }); // sans bouger la page
  updateHud();
}

// ---------- rendu : flux de transactions ----------
// Plusieurs sources alimentent le même flux (dédoublonné par txid) :
//   1. /mempool/recent (interrogé toutes les 2 s)
//   2. les transactions qui entrent dans le prochain bloc (WebSocket, track-mempool-block)
//   3. si le serveur les envoie : 'transactions' / 'mempool-txids' (formats non vérifiés en direct)
const txBuffer = [];                 // arrivées en attente d'affichage (la plus ancienne en premier)
const arrivals = [];                 // horodatages récents, pour le débit
let txTotal = 0;

function pushTxs(list) {
  const fresh = [];
  for (const t of list) {
    if (!t || !t.txid || state.seen.has(t.txid)) continue;
    if (!(proj && proj.has(t.txid))) fresh.push({ rate: t.vsize && t.fee != null ? t.fee / t.vsize : undefined }); // celles du bloc projeté ont leur propre animation
    state.seen.add(t.txid);
    txTotal++;
    arrivals.push(Date.now());
    txBuffer.push(t);
  }
  if (scene3d && fresh.length) scene3d.stream(fresh);
  if (txBuffer.length > 1000) txBuffer.splice(0, txBuffer.length - 1000); // pause prolongée : on garde les plus récentes
  if (state.seen.size > 20000) { // mémoire bornée : on ne garde que ce qui est affiché
    state.seen = new Set([...state.txs.map((t) => t.txid), ...txBuffer.map((t) => t.txid)]);
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
  const batch = txBuffer.splice(0).reverse();      // la plus récente en haut
  state.txs = [...batch, ...state.txs].slice(0, MAX_TXS);
  const list = $('#txs');
  list.prepend(...batch.slice(0, MAX_TXS).map(txRow)); // rendu incrémental : on n'ajoute que les nouvelles lignes
  while (list.children.length > MAX_TXS) list.lastElementChild.remove();
}

async function pollRecent() {
  try {
    const list = await api('/mempool/recent'); // ~10 dernières tx entrées dans le mempool, la plus récente en premier
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
    ws.send(JSON.stringify({ action: 'want', data: ['blocks', 'mempool-blocks', 'mempool-txids'] }));
    ws.send(JSON.stringify({ 'track-mempool-block': 0 })); // contenu du prochain bloc, pour la 3D
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

// ---------- détails ----------
const dialog = $('#detail');
const body = $('#detail-body');
$('#close').onclick = () => dialog.close();
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

function show(...nodes) {
  body.replaceChildren(...nodes.flat()); // aplatit les tableaux (ex. liste de transactions)
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

async function openTx(txid) {
  show(el('p', { class: 'muted' }, 'Chargement…'));
  try {
    const tx = await api(`/tx/${txid}`);
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
  } catch (e) { show(el('p', {}, `Transaction introuvable (${e.message})`)); }
}

async function openBlock(hash) {
  show(el('p', { class: 'muted' }, 'Chargement…'));
  try {
    const [b, txs] = await Promise.all([api(`/block/${hash}`), api(`/block/${hash}/txs`)]);
    show(el('h2', {}, `Bloc #${nf.format(b.height)}`), fields([
      ['Hash', el('span', { class: 'mono' }, b.id)],
      ['Date', `${date(b.timestamp)} (${ago(b.timestamp)})`],
      ['Transactions', nf.format(b.tx_count)],
      ['Taille', `${(b.size / 1e6).toFixed(2)} Mo · ${(b.weight / 1e6).toFixed(2)} MWU`],
      ['Mineur', b.extras?.pool?.name ?? '—'],
      ['Frais médian', b.extras ? `${b.extras.medianFee.toFixed(1)} sat/vB` : '—'],
      ['Bloc précédent', el('button', { class: 'link mono', onclick: () => openBlock(b.previousblockhash) }, short(b.previousblockhash, 16, 8))],
    ]), el('h3', {}, `Premières transactions (${txs.length} / ${nf.format(b.tx_count)})`), txs.map((t) => txCard(t)));
  } catch (e) { show(el('p', {}, `Bloc introuvable (${e.message})`)); }
}

// ---------- recherche ----------
$('#search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (!q) return;
  try {
    if (/^\d+$/.test(q)) return openBlock(await api(`/block-height/${q}`));
    if (/^[0-9a-fA-F]{64}$/.test(q)) {
      // un hash de bloc commence par de nombreux zéros
      const blockFirst = q.startsWith('00000000');
      const [a, b] = blockFirst ? [openBlock, openTx] : [openTx, openBlock];
      try { await api(blockFirst ? `/block/${q}` : `/tx/${q}`); return a(q); } catch { return b(q); }
    }
    show(el('p', {}, 'Entrée non reconnue : hauteur, hash de bloc (64 hex) ou txid.'));
  } catch (err) { show(el('p', {}, `Introuvable (${err.message})`)); }
});

// ---------- démarrage ----------
async function init() {
  try {
    state.blocks = (await api('/v1/blocks')).slice(0, MAX_BLOCKS);
    renderBlocks();
    if (scene3d && state.blocks.length) {
      setSceneMsg('Chargement des transactions…');
      syncScene();
      focusSlot(state.blocks[0].id, true);
    }
  } catch (e) { console.warn('blocks', e); }
  connect();
  pollRecent();
  setInterval(pollRecent, POLL_MS);
  setInterval(flushTxs, FLUSH_MS);
  setInterval(() => { renderBlocks(); }, 30000); // rafraîchit les « il y a … »
}
init();
