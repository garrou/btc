// Mining schematic: mining pools race to find a hash below the target. Symbolic, not real hashing:
//   - each pool is a lane; its dots are hash attempts, emitted at a rate proportional to its share of the hashrate
//   - a dot that reaches the gate is a rejected hash (hash >= target); the winner is a gold dot that passes through
//   - only real blocks are shown: when a block is announced, its real pool wins (nothing is simulated or extrapolated)
(() => {
  const PALETTE = ['#f7931a', '#4cc9f0', '#7ddc4a', '#c77dff', '#ff3d6e', '#f2d33c', '#22c9a6', '#e07a5f'];
  const OTHERS_COLOR = '#6b7390';
  const MAX_ROWS = 8;               // top pools shown individually, the rest are grouped in "Autres"
  const DOTS_PER_S = 90;            // total dots per second (symbolic)
  const FLIGHT_S = 1.4;             // flight time of the winning dot
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const hexChars = '0123456789abcdef';
  const hex = (n) => { let s = ''; for (let i = 0; i < n; i++) s += hexChars[(Math.random() * 16) | 0]; return s; };
  const nf = new Intl.NumberFormat('fr-FR');
  const sup = (n) => String(n).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
  const shortHash = (h) => `${h.slice(0, 22)}…${h.slice(-6)}`;

  function create(root) {
    const canvas = root.querySelector('canvas');
    if (!canvas || !canvas.getContext) return null;
    const ctx = canvas.getContext('2d');
    const $ = (sel) => root.querySelector(sel);
    const el = { target: $('[data-m=target]'), hashes: $('[data-m=hashes]'), unit: $('[data-m=unit]'),
      attempt: $('[data-m=attempt]'), banner: $('[data-m=banner]'), chain: $('[data-m=chain]') };

    let W = 0, H = 0, rows = [], hashrate = 0, zeros = 19, visible = true;
    let dots = [], sparks = [], gateFlash = 0, hashes = 0, tickAcc = 0;

    // ----- pools -----
    // list: [{ name, share }] (any scale). Top MAX_ROWS pools + "Autres".
    function setPools(list) {
      const sorted = list.filter((p) => p.share > 0).sort((a, b) => b.share - a.share);
      const total = sorted.reduce((s, p) => s + p.share, 0);
      if (!total) return;
      const top = sorted.slice(0, MAX_ROWS), rest = sorted.slice(MAX_ROWS);
      rows = top.map((p, i) => ({ name: p.name, share: p.share / total, color: PALETTE[i % PALETTE.length], glow: 0, acc: Math.random() }));
      const others = rest.reduce((s, p) => s + p.share, 0) / total;
      if (others > 0) rows.push({ name: 'Autres', share: others, color: OTHERS_COLOR, glow: 0, acc: Math.random(), others: true });
    }
    function rowFor(name) {
      const n = (name || '').toLowerCase();
      return rows.find((r) => r.name.toLowerCase() === n) || rows.find((r) => r.others) || rows[0];
    }

    // ----- layout -----
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const geom = () => {
      const narrow = W < 640;
      const labelW = narrow ? 96 : 168, blockW = narrow ? 34 : 56;
      const top = 8, rh = rows.length ? (H - top - 8) / rows.length : 0;
      return { narrow, labelW, gateX: W - blockW - 14, blockX: W - blockW - 4, blockW, top, rh };
    };

    // ----- events -----
    function spawnWinner(info, row) {
      dots.push({ row, off: 0, x: -1, v: 0, win: true, info, t: 0 });
    }
    function trigger(info) { // a block is found
      if (!rows.length) { showFound(info); return; }
      const row = rowFor(info.pool);
      if (reduceMotion || !visible) { showFound(info, row); return; }
      spawnWinner(info, row);
    }
    function showFound(info, row) {
      gateFlash = 1;
      if (row) row.glow = 1;
      el.banner.innerHTML = '';
      const b = document.createElement('b'); b.textContent = `✔ ${info.pool} a trouvé le bloc #${nf.format(info.height)}`;
      const s = document.createElement('span');
      s.textContent = ` · nonce ${info.nonce != null ? nf.format(info.nonce) : '—'}`;
      const c = document.createElement('code'); c.textContent = info.hash;
      el.banner.append(b, s, c);
      addChainItem(info, row);
    }
    function addChainItem(info, row) {
      const d = document.createElement('div');
      d.className = 'm-block';
      d.style.setProperty('--c', (row || rowFor(info.pool) || { color: OTHERS_COLOR }).color);
      const h = document.createElement('b'); h.textContent = `#${nf.format(info.height)}`;
      const p = document.createElement('span'); p.textContent = info.pool;
      const code = document.createElement('code'); code.textContent = shortHash(info.hash);
      d.append(h, p, code);
      el.chain.prepend(d);
      while (el.chain.children.length > 6) el.chain.lastElementChild.remove();
    }
    function setTargetFromHash(hash) {
      const z = (hash.match(/^0*/) || [''])[0].length;
      if (z > 0) zeros = z;
    }
    // real block from the app
    function found(info) {
      if (info.hash) setTargetFromHash(info.hash);
      trigger(info);
    }
    // recent real blocks, shown without animation (oldest first)
    function seed(list) {
      for (const info of list) { addChainItem(info); if (info.hash) setTargetFromHash(info.hash); }
    }

    // ----- drawing -----
    function draw(dt) {
      ctx.clearRect(0, 0, W, H);
      if (!rows.length) {
        ctx.fillStyle = '#8a91a6'; ctx.font = '14px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Chargement de la répartition des mineurs…', W / 2, H / 2);
        return;
      }
      const g = geom();
      // lanes + labels
      rows.forEach((r, i) => {
        const y = g.top + i * g.rh;
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(g.labelW, y + 2, g.gateX - g.labelW, g.rh - 4);
        if (r.glow > 0) { ctx.fillStyle = r.color; ctx.globalAlpha = 0.25 * r.glow; ctx.fillRect(g.labelW, y + 2, g.gateX - g.labelW, g.rh - 4); ctx.globalAlpha = 1; r.glow = Math.max(0, r.glow - dt * 0.8); }
        ctx.fillStyle = r.color; ctx.fillRect(0, y + 4, 3, g.rh - 8);
        ctx.fillStyle = '#e6e8ef'; ctx.font = `${g.narrow ? 11 : 12.5}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const pct = `${(r.share * 100).toFixed(1).replace('.', ',')} %`;
        const pw = ctx.measureText(pct).width;
        let name = r.name; const maxW = g.labelW - 14 - pw - 6;
        while (name.length > 3 && ctx.measureText(name).width > maxW) name = name.slice(0, -2) + '…';
        ctx.fillText(name, 10, y + g.rh / 2 - 3);
        ctx.fillStyle = '#8a91a6'; ctx.textAlign = 'right'; ctx.fillText(pct, g.labelW - 8, y + g.rh / 2 - 3);
        ctx.fillStyle = r.color; ctx.globalAlpha = 0.7; ctx.fillRect(10, y + g.rh / 2 + 6, (g.labelW - 20) * Math.min(1, r.share / rows[0].share), 2.5); ctx.globalAlpha = 1;
      });
      // gate (target)
      ctx.fillStyle = `rgba(247,147,26,${0.55 + 0.45 * gateFlash})`; ctx.fillRect(g.gateX - 1, g.top, 2, H - g.top - 8);
      if (gateFlash > 0) {
        const grd = ctx.createLinearGradient(g.gateX - 40, 0, g.gateX + 10, 0);
        grd.addColorStop(0, 'rgba(255,215,106,0)'); grd.addColorStop(1, `rgba(255,215,106,${0.5 * gateFlash})`);
        ctx.fillStyle = grd; ctx.fillRect(g.gateX - 40, g.top, 50, H - g.top - 8);
        gateFlash = Math.max(0, gateFlash - dt * 1.6);
      }
      // block box on the right
      ctx.strokeStyle = `rgba(247,147,26,${0.5 + 0.5 * gateFlash})`; ctx.lineWidth = 1.5;
      const bh = Math.min(g.blockW, 56), by = H / 2 - bh / 2;
      ctx.strokeRect(g.blockX - g.blockW + 4 + (g.blockW - bh) / 2, by, bh, bh);
      ctx.fillStyle = '#f7931a'; ctx.font = `${g.narrow ? 16 : 22}px system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('₿', g.blockX - g.blockW / 2 + 4, H / 2);
      // dots
      const yOf = (d) => g.top + d.row_i * g.rh + g.rh / 2 + d.off * g.rh * 0.6;
      for (const d of dots) {
        d.row_i = rows.indexOf(d.row);
        if (d.row_i < 0) { d.dead = true; continue; }
        const y = yOf(d);
        if (d.win) {
          const p = d.t / FLIGHT_S, x = g.labelW + (g.gateX + 6 - g.labelW) * p;
          ctx.fillStyle = '#ffd76a'; ctx.shadowColor = '#f7931a'; ctx.shadowBlur = 14;
          ctx.fillRect(x - 4, y - 4, 8, 8); ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = d.row.color; ctx.globalAlpha = 0.75; ctx.fillRect(d.x, y - 1.5, 3, 3); ctx.globalAlpha = 1;
        }
      }
      // sparks (rejected hashes bouncing off the gate)
      for (const s of sparks) { ctx.fillStyle = s.color; ctx.globalAlpha = Math.max(0, s.life * 1.6); ctx.fillRect(s.x, s.y, 2, 2); }
      ctx.globalAlpha = 1;
    }

    // ----- simulation step -----
    function step(dt) {
      if (rows.length) {
        const g = geom();
        const scale = reduceMotion ? 0.2 : 1;
        rows.forEach((r) => {
          r.acc += Math.max(0.7, DOTS_PER_S * r.share) * scale * dt;
          while (r.acc >= 1) { r.acc -= 1; dots.push({ row: r, off: Math.random() - 0.5, x: g.labelW + 2, v: 110 + Math.random() * 120 }); }
        });
        for (const d of dots) {
          if (d.win) {
            d.t += dt;
            if (d.t >= FLIGHT_S) { d.dead = true; showFound(d.info, d.row); }
          } else {
            d.x += d.v * dt;
            if (d.x >= g.gateX) { // rejected
              d.dead = true;
              if (sparks.length < 120) sparks.push({ x: g.gateX, y: g.top + Math.max(0, rows.indexOf(d.row)) * g.rh + g.rh / 2 + d.off * g.rh * 0.6, vx: -30 - Math.random() * 50, vy: (Math.random() - 0.5) * 90, life: 0.6, color: d.row.color });
            }
          }
        }
        dots = dots.filter((d) => !d.dead);
        for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
        sparks = sparks.filter((s) => s.life > 0);
      }
      // counters (real time: hashes tried since the page opened, at the current network hashrate)
      hashes += hashrate * dt;
      tickAcc += dt;
      if (tickAcc > 0.12) {
        tickAcc = 0;
        el.attempt.textContent = hex(14) + '…';
        el.hashes.textContent = hashrate ? `≈ ${(hashes / 10 ** Math.floor(Math.log10(Math.max(1, hashes)))).toFixed(2).replace('.', ',')} × 10${sup(Math.floor(Math.log10(Math.max(1, hashes))))}` : '—';
      }
    }

    let last = performance.now();
    (function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!visible || document.hidden || !W) return;
      step(dt); draw(dt);
    })(last);

    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(canvas);
    resize();

    el.target.textContent = `hash < ${'0'.repeat(zeros)}…`;
    setInterval(() => { el.target.textContent = `hash < ${'0'.repeat(zeros)}…`; }, 2000);

    return {
      setPools,
      setHashrate(h) {
        hashrate = h || 0;
        // one dot stands for roughly this many hashes per second (power of ten)
        const per = hashrate / DOTS_PER_S;
        if (per > 0) el.unit.textContent = `≈ 10${sup(Math.round(Math.log10(per)))} hashes/s`;
      },
      found, seed,
    };
  }

  window.MinersViz = { create };
})();
