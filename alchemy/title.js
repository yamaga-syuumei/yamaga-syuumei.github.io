// タイトルの景色。夕暮れの街に魔法のお店が建っていて、煙突から色の付いた煙が上がる。
//
//  * 勇者の帯と同じく、低解像度のキャンバスに描いて CSS で引き伸ばす（image-rendering: pixelated）。
//  * 家並みと星の位置は幅から決まる。窓の明かりと煙と光の粒だけが動く。
//  * ときどき勇者の一行が店の前を通る。絵は sprites.js。
//  * タイトルが出ている間だけ動かす。
//
//  TITLE.attach(canvas) / TITLE.start() / TITLE.stop()
window.TITLE = (function () {
  'use strict';

  const SP = window.SPRITES;
  let cv = null, g = null, W = 320, H = 180, cssW = 0, cssH = 0;
  let on = false, raf = 0, last = 0, t = 0;
  let town = [], stars = [], smoke = [], motes = [];
  let party = { x: -60, wait: 3, f: 0, ft: 0 };
  const cache = new Map();

  function attach(c) { cv = c; g = cv.getContext('2d'); }

  function start() {
    if (on || !cv) return;
    on = true; last = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    on = false;
    cancelAnimationFrame(raf);
  }

  // 1ドットは2画素以上。高さがおよそ200ドットになるように決める
  function fit() {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (r.width === cssW && r.height === cssH) return true;
    cssW = r.width; cssH = r.height;
    const s = Math.max(2, Math.round(cssH / 200));
    W = Math.ceil(cssW / s); H = Math.ceil(cssH / s);
    cv.width = W; cv.height = H;
    g.imageSmoothingEnabled = false;
    build();
    return true;
  }

  // 決まった乱数。幅が同じなら同じ景色になる
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  const GY = () => H - 30;        // 地面の高さ
  const CX = () => Math.round(W * .74);   // 真ん中はメニューが来るので、店は右に寄せる

  // 家並みと星を作る。店の前後は空けておく
  function build() {
    const r = rng(7);
    town = [];
    let x = -6;
    while (x < W + 6) {
      const w = 12 + Math.floor(r() * 16), h = 14 + Math.floor(r() * 22);
      if (Math.abs(x + w / 2 - CX()) > 48) {
        const wins = [];
        for (let i = 0; i < 4; i++) if (r() < .6) wins.push({ x: 2 + Math.floor(r() * (w - 5)), y: 3 + Math.floor(r() * (h - 6)), ph: r() * 9 });
        town.push({ x, w, h, roof: r() < .5 ? 'peak' : 'flat', wins });
      }
      x += w + Math.floor(r() * 4);
    }
    stars = [];
    for (let i = 0; i < Math.round(W * .35); i++) stars.push({ x: Math.floor(r() * W), y: Math.floor(r() * (GY() - 60)), ph: r() * 6.3, b: r() });
  }

  function frame(now) {
    if (!on) return;
    raf = requestAnimationFrame(frame);
    if (!last) last = now;
    const dt = Math.min(100, now - last);
    last = now;
    if (!fit()) return;
    step(dt);
    draw();
  }

  // ---------------------------------------------------------------- 動き
  const SMOKE_COLS = ['#c9a8ff', '#f0c46a', '#7cf0c0', '#ff9ac0'];
  function step(dt) {
    const k = dt / 1000;
    t += k;
    // 煙。煙突から出て、ふくらみながら昇って風に流れる
    if (Math.random() < k * 6) {
      smoke.push({ x: CX() + 21, y: GY() - 86, r: 1.5, vx: 2 + Math.random() * 3, vy: -9 - Math.random() * 4, t: 0,
        life: 4 + Math.random() * 2, col: SMOKE_COLS[(Math.random() * SMOKE_COLS.length) | 0] });
    }
    smoke = smoke.filter((p) => {
      p.t += k; p.x += (p.vx + Math.sin(p.t * 1.6) * 3) * k; p.y += p.vy * k; p.r += k * 1.6;
      return p.t < p.life;
    });
    // 光の粒
    if (motes.length < W / 6 && Math.random() < k * 8) {
      motes.push({ x: Math.random() * W, y: GY() + 4, vy: -6 - Math.random() * 8, ph: Math.random() * 6.3, t: 0, life: 6 + Math.random() * 6,
        col: Math.random() < .6 ? '#f0c46a' : '#c9a8ff' });
    }
    motes = motes.filter((m) => { m.t += k; m.y += m.vy * k; m.x += Math.sin(m.t + m.ph) * 4 * k; return m.t < m.life && m.y > -4; });
    // 勇者の一行。しばらく待ってから左から右へ通り抜ける
    if (party.wait > 0) { party.wait -= k; if (party.wait <= 0) party.x = -50; }
    else {
      party.x += 16 * k;
      party.ft += dt; if (party.ft > 140) { party.ft = 0; party.f = (party.f + 1) % 4; }
      if (party.x > W + 10) party.wait = 10 + Math.random() * 8;
    }
  }

  // ---------------------------------------------------------------- 描く
  function px(x, y, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
  function rect(x, y, w, h, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); }

  function glowAt(x, y, r, col, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, hexA(col, a)); gr.addColorStop(1, hexA(col, 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  }

  function mix(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const c = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
    return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
  }

  // 空。上は夜の紺、地平は夕焼け。帯の境目は市松で混ぜる
  const SKY = ['#0d0a26', '#1c1442', '#33205a', '#5a2f70', '#8a4472', '#c46a6a', '#e89a72'];
  function drawSky() {
    const gy = GY(), n = SKY.length;
    for (let i = 0; i < n; i++) {
      const y0 = Math.floor(gy * i / n), y1 = Math.floor(gy * (i + 1) / n);
      rect(0, y0, W, y1 - y0, SKY[i]);
      if (i > 0) { g.fillStyle = SKY[i - 1]; for (let x = y0 & 1; x < W; x += 2) g.fillRect(x, y0, 1, 1); }
    }
    for (const s of stars) {
      const a = .5 + .5 * Math.sin(t * (1 + s.b * 2) + s.ph);
      if (a > .35) px(s.x, s.y, s.b > .8 ? '#ffe8a0' : a > .8 ? '#ffffff' : '#b9a8d8');
    }
    // 月
    const mx = Math.round(W * .82), my = 26;
    glowAt(mx, my, 26, '#f4f0d0', .22);
    g.fillStyle = '#f4f0d8';
    for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) if (x * x + y * y <= 50) g.fillRect(mx + x, my + y, 1, 1);
    rect(mx - 3, my - 2, 2, 2, '#dcd6b8'); rect(mx + 2, my + 2, 3, 2, '#dcd6b8'); rect(mx - 1, my + 4, 1, 1, '#dcd6b8');
  }

  function ridge(base, amp, period, col, seed) {
    g.fillStyle = col;
    for (let x = 0; x < W; x++) {
      const u = x / period;
      const h = Math.sin(u * 2.1 + seed) * .5 + Math.sin(u * 5.3 + seed * 2) * .3 + Math.sin(u * 11.7 + seed) * .2;
      const top = Math.round(base - amp * (h * .5 + .5));
      g.fillRect(x, top, 1, GY() - top);
    }
  }

  function drawTown() {
    const gy = GY();
    for (const b of town) {
      const top = gy - b.h;
      rect(b.x, top, b.w, b.h, '#1a1230');
      if (b.roof === 'peak') {
        const half = Math.ceil(b.w / 2);
        for (let i = 0; i < half; i++) rect(b.x + i, top - Math.min(i, half - i) * .8 - 1, 1, Math.min(i, half - i) * .8 + 1, '#1a1230');
        for (let i = half; i < b.w; i++) rect(b.x + i, top - (b.w - i) * .8 - 1, 1, (b.w - i) * .8 + 1, '#1a1230');
      }
      for (const w of b.wins) {
        const lit = Math.sin(t * .4 + w.ph) > -.6;
        rect(b.x + w.x, top + w.y, 2, 2, lit ? '#ffcf6a' : '#2a2040');
      }
    }
  }

  // 魔法のお店。石の土台、板張りの壁、紫の三角屋根、丸窓、明かりの漏れる扉と窓、看板
  function drawShop() {
    const gy = GY(), cx = CX();
    const L = cx - 34, R = cx + 34, wallTop = gy - 40;
    // 足元の明かり
    glowAt(cx, gy + 2, 46, '#ffc070', .28);
    // 壁
    rect(L, wallTop, R - L, 40, '#6a4a3a');
    for (let y = wallTop + 4; y < gy; y += 5) rect(L, y, R - L, 1, '#553a2e');
    for (let x = L + 9; x < R; x += 17) rect(x, wallTop, 1, 40, '#4a3226');
    rect(L, wallTop, 2, 40, '#3a261c'); rect(R - 2, wallTop, 2, 40, '#3a261c');
    // 石の土台
    rect(L - 2, gy - 6, R - L + 4, 6, '#55506c');
    for (let x = L; x < R; x += 6) { rect(x, gy - 6, 1, 6, '#3e3a52'); rect(x + 3, gy - 3, 1, 3, '#3e3a52'); }
    rect(L - 2, gy - 6, R - L + 4, 1, '#6e6a88');
    // 煙突。根元は屋根の下まで伸ばし、あとから描く屋根で隠す
    rect(cx + 18, gy - 86, 8, 36, '#5e5470'); rect(cx + 17, gy - 88, 10, 3, '#7a7090');
    // 屋根。両端に張り出す
    const rl = L - 8, rr = R + 8, peak = gy - 78;
    for (let x = rl; x < rr; x++) {
      const d = Math.min(x - rl, rr - 1 - x);
      const top = Math.max(peak, wallTop - Math.round(d * .9));
      rect(x, top, 1, wallTop - top + 2, '#4e3478');
      for (let y = top + 3; y < wallTop + 1; y += 4) if (((x + (y >> 2)) & 3) !== 0) px(x, y, '#6a4c98');
      px(x, top, '#8a6ac0');
    }
    rect(rl, wallTop + 1, rr - rl, 2, '#2a1a44');
    // 屋根の丸窓。紫に脈打つ
    const ow = 0.6 + 0.4 * Math.sin(t * 2.2);
    glowAt(cx, gy - 56, 14, '#b48cff', .35 * ow);
    g.fillStyle = '#2a1a44';
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (x * x + y * y <= 36) g.fillRect(cx + x, gy - 56 + y, 1, 1);
    g.fillStyle = mix('#8a6ac0', '#e8d8ff', ow);
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 17) g.fillRect(cx + x, gy - 56 + y, 1, 1);
    rect(cx, gy - 60, 1, 9, '#2a1a44'); rect(cx - 4, gy - 56, 9, 1, '#2a1a44');
    // 窓。棚に薬瓶が並ぶ
    [[L + 6, '#ff8a8a'], [R - 20, '#7cd0ff']].forEach(([x, c2], i) => {
      const fl = .85 + .15 * Math.sin(t * 3 + i * 2);
      glowAt(x + 7, gy - 22, 16, '#ffc070', .3 * fl);
      rect(x - 1, gy - 30, 16, 14, '#3a261c');
      rect(x, gy - 29, 14, 12, mix('#ffb860', '#ffe0a0', fl));
      rect(x, gy - 22, 14, 1, '#6a4a3a');
      [c2, '#c9a8ff', '#7cf0c0', '#f0c46a'].forEach((pc, j) => { rect(x + 2 + j * 3, gy - 25, 2, 3, pc); px(x + 2 + j * 3, gy - 26, '#4a3226'); });
      rect(x + 7, gy - 29, 1, 7, '#4a3226');
    });
    // 扉。少し開いていて、中の明かりが漏れる
    glowAt(cx, gy - 9, 14, '#ffd080', .4);
    rect(cx - 7, gy - 22, 14, 16, '#3a261c');
    rect(cx - 6, gy - 21, 12, 15, '#ffcf7a');
    rect(cx - 6, gy - 21, 8, 15, '#5a3a26');
    rect(cx - 6, gy - 14, 8, 1, '#4a2e1e');
    px(cx, gy - 13, '#f0c46a');
    rect(cx - 8, gy - 23, 16, 2, '#4a3226');
    // 看板。金の板に薬瓶の印
    const sx = cx - 15, sy = wallTop - 6;
    rect(sx + 3, sy - 3, 1, 3, '#2a1a12'); rect(sx + 26, sy - 3, 1, 3, '#2a1a12');
    rect(sx, sy, 30, 9, '#2a1a12'); rect(sx + 1, sy + 1, 28, 7, '#c9a24a'); rect(sx + 1, sy + 1, 28, 1, '#f0d48a');
    rect(sx + 13, sy + 2, 3, 2, '#5a3a8a'); rect(sx + 12, sy + 4, 5, 3, '#7a5aaa'); px(sx + 13, sy + 4, '#e8d8ff');
    // 両脇の街灯
    [cx - 56, cx + 56].forEach((lx, i) => {
      const fl = .8 + .2 * Math.sin(t * 7 + i * 3) * Math.sin(t * 3.1 + i);
      glowAt(lx, gy - 22, 22, '#ffd080', .32 * fl);
      rect(lx, gy - 20, 1, 20, '#241c34'); rect(lx - 1, gy - 1, 3, 1, '#241c34');
      rect(lx - 2, gy - 25, 5, 5, '#241c34'); rect(lx - 1, gy - 24, 3, 3, mix('#ffb040', '#fff0b0', fl));
      rect(lx - 2, gy - 26, 5, 1, '#3a2e50');
    });
  }

  function drawGround() {
    const gy = GY(), cx = CX();
    rect(0, gy, W, H - gy, '#2a2240');
    rect(0, gy, W, 1, '#4a3e66');
    for (let y = gy + 2; y < H; y += 4) {
      const off = ((y >> 2) & 1) * 3;
      for (let x = off; x < W; x += 6) rect(x, y, 4, 2, '#342a4e');
    }
    // 店の前の石畳は明かりを受けて明るい
    for (let y = gy + 1; y < H; y++) {
      const w = 10 + (y - gy) * 1.6;
      g.fillStyle = 'rgba(255,200,120,' + (.16 * (1 - (y - gy) / (H - gy))).toFixed(3) + ')';
      g.fillRect(Math.round(cx - w), y, Math.round(w * 2), 1);
    }
  }

  function sheet(rows, key) {
    let c = cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = rows[0].length; c.height = rows.length;
    const x = c.getContext('2d');
    for (let y = 0; y < rows.length; y++) for (let i = 0; i < rows[y].length; i++) {
      const ch = rows[y][i];
      if (ch === '.') continue;
      x.fillStyle = SP.pal[ch] || '#ff00ff';
      x.fillRect(i, y, 1, 1);
    }
    cache.set(key, c);
    return c;
  }

  function drawParty() {
    if (!SP || party.wait > 0) return;
    const gy = GY(), x = Math.round(party.x), f = party.f;
    const put = (who, fr, dx) => {
      const rows = SP[who].walk[fr];
      g.drawImage(sheet(rows, who + fr), x + dx, gy - rows.length + 3);
    };
    put('priest', (f + 1) % 4, -38);
    put('mage', (f + 2) % 4, -19);
    put('hero', f, 0);
  }

  function draw() {
    drawSky();
    ridge(GY() - 34, 22, 70, '#2a1c4a', 1.3);
    ridge(GY() - 18, 12, 40, '#221838', 4.1);
    drawTown();
    for (const p of smoke) {
      const a = Math.max(0, 1 - p.t / p.life) * .7;
      g.fillStyle = hexA(p.col, a);
      const r = Math.round(p.r);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) g.fillRect(Math.round(p.x) + x, Math.round(p.y) + y, 1, 1);
    }
    drawGround();
    drawShop();
    drawParty();
    for (const m of motes) {
      const a = Math.min(1, m.t) * Math.max(0, 1 - m.t / m.life) * (.6 + .4 * Math.sin(t * 4 + m.ph));
      g.globalAlpha = a;
      px(m.x, m.y, m.col);
      g.globalAlpha = a * .4;
      px(m.x - 1, m.y, m.col); px(m.x + 1, m.y, m.col); px(m.x, m.y - 1, m.col); px(m.x, m.y + 1, m.col);
      g.globalAlpha = 1;
    }
  }

  return { attach, start, stop };
})();
