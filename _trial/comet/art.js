// 描画。画像は持たず、すべてコードで描く。
// 座標はロジカル空間（W x H）で受け取る。変換は game.js 側で済ませてある。

const Art = (() => {

  // ---- 星空（3層パララックス）----
  const LAYERS = [
    { n: 90, depth: 0.10, r: [0.5, 1.0], a: [0.25, 0.45] },
    { n: 55, depth: 0.28, r: [0.8, 1.6], a: [0.35, 0.65] },
    { n: 26, depth: 0.55, r: [1.2, 2.4], a: [0.55, 0.95] },
  ];
  let stars = null;

  function initStars(W, H, rnd) {
    stars = LAYERS.map(L => {
      const a = [];
      for (let i = 0; i < L.n; i++) {
        a.push({
          x: rnd() * W, y: rnd() * H,
          r: L.r[0] + rnd() * (L.r[1] - L.r[0]),
          a: L.a[0] + rnd() * (L.a[1] - L.a[0]),
          tw: rnd() * Math.PI * 2,
        });
      }
      return { L, a };
    });
  }

  // ox/oy は累積スクロール量。彗星が速いほど大きく流れる。
  function stars_draw(g, W, H, ox, oy, t) {
    for (const { L, a } of stars) {
      const dx = ((-ox * L.depth) % W + W) % W;
      const dy = ((-oy * L.depth) % H + H) % H;
      for (const s of a) {
        const x = (s.x + dx) % W, y = (s.y + dy) % H;
        const tw = 0.75 + 0.25 * Math.sin(t * 1.6 + s.tw);
        g.globalAlpha = s.a * tw;
        g.fillStyle = '#cfe4ff';
        g.beginPath(); g.arc(x, y, s.r, 0, 6.2832); g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  // ---- 宙域の境界 ----
  function bounds(g, W, H, t) {
    const p = 0.35 + 0.1 * Math.sin(t * 1.2);
    g.save();
    g.strokeStyle = 'rgba(110,190,255,' + (0.10 + 0.04 * p) + ')';
    g.lineWidth = 2;
    g.setLineDash([14, 10]);
    g.lineDashOffset = -t * 18;
    g.strokeRect(1, 1, W - 2, H - 2);
    g.restore();
  }

  // ---- 彗星 ----
  // trail: 新しいものが末尾。{x,y}
  function comet(g, c, trail, len, speedN, burn) {
    const n = Math.min(len, trail.length);
    const head = trail.length - 1;
    g.save();
    g.globalCompositeOperation = 'lighter';

    // 尾。速度で長さ・太さ・色が変わる
    const hot = burn > 0 ? 1 : speedN;
    const cr = Math.round(120 + 135 * hot);
    const cg = Math.round(200 + 45 * hot);
    const cb = Math.round(255 - 55 * hot);
    for (let i = 0; i < n; i++) {
      const p = trail[head - n + 1 + i];
      if (!p) continue;
      const k = i / n;                 // 0=古い 1=新しい
      const r = c.r * (0.12 + 0.88 * k * k) * (0.9 + 0.5 * hot);
      g.globalAlpha = 0.030 + 0.16 * k * k * (0.6 + 0.6 * hot);
      g.fillStyle = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
      g.beginPath(); g.arc(p.x, p.y, r, 0, 6.2832); g.fill();
    }

    // 核
    g.globalAlpha = 1;
    const gr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r * 2.6);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.28, burn > 0 ? '#fff0b0' : '#dff2ff');
    gr.addColorStop(0.55, burn > 0 ? 'rgba(255,190,80,.45)' : 'rgba(120,200,255,.42)');
    gr.addColorStop(1, 'rgba(90,160,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(c.x, c.y, c.r * 2.6, 0, 6.2832); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(c.x, c.y, c.r * 0.62, 0, 6.2832); g.fill();
    g.restore();
  }

  // 燃焼中に散る火の粉
  function spark(g, p) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = p.life / p.max;
    g.fillStyle = p.col;
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.2832); g.fill();
    g.restore();
  }

  // ---- 隕石 ----
  const ROCK_COL = {
    rock:  ['#8a6a52', '#5c4436', '#3a2b23'],
    ice:   ['#bfeaff', '#7cc4e8', '#3f7ea0'],
    metal: ['#b9c2cc', '#7d8896', '#4a525c'],
  };

  function rock(g, e) {
    const c = ROCK_COL[e.kind] || ROCK_COL.rock;
    g.save();
    g.translate(e.x, e.y);
    g.rotate(e.rot);

    // 輪郭。生成時の seed でギザギザを決めている
    g.beginPath();
    for (let i = 0; i < e.shape.length; i++) {
      const a = i / e.shape.length * 6.2832;
      const r = e.r * e.shape[i];
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();

    const gr = g.createLinearGradient(-e.r, -e.r, e.r, e.r);
    gr.addColorStop(0, c[0]); gr.addColorStop(0.55, c[1]); gr.addColorStop(1, c[2]);
    g.fillStyle = gr;
    if (e.kind === 'ice') g.globalAlpha = 0.85;
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.stroke();

    // 金属はひびが見える（1回では砕けない）
    if (e.kind === 'metal' && e.hp < e.hpMax) {
      g.strokeStyle = 'rgba(255,230,180,.9)'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-e.r * 0.6, -e.r * 0.2); g.lineTo(-e.r * 0.1, e.r * 0.15);
      g.lineTo(e.r * 0.25, -e.r * 0.3); g.lineTo(e.r * 0.7, e.r * 0.1);
      g.stroke();
    }
    g.restore();

    // 氷は淡く光る
    if (e.kind === 'ice') {
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.22;
      g.fillStyle = '#9fe0ff';
      g.beginPath(); g.arc(e.x, e.y, e.r * 1.5, 0, 6.2832); g.fill();
      g.restore();
    }
  }

  // ---- 欠片 ----
  const SHARD_COL = { rock: '#ffcf8a', ice: '#9fe8ff', metal: '#d8e4ff', boss: '#ffd2f0' };
  function shard(g, s, t) {
    const col = SHARD_COL[s.kind] || SHARD_COL.rock;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const pul = 0.75 + 0.25 * Math.sin(t * 9 + s.ph);
    g.globalAlpha = 0.5 * pul;
    g.fillStyle = col;
    g.beginPath(); g.arc(s.x, s.y, s.r * 3.2, 0, 6.2832); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(s.x, s.y, s.r, 0, 6.2832); g.fill();
    g.restore();
  }

  // ---- 流星 ----
  function meteorWarn(g, m, t) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const p = 0.4 + 0.6 * Math.abs(Math.sin(t * 7));
    g.globalAlpha = 0.5 * p;
    g.strokeStyle = '#ffe9a8'; g.lineWidth = 2;
    g.setLineDash([16, 12]); g.lineDashOffset = -t * 90;
    g.beginPath(); g.moveTo(m.x0, m.y0); g.lineTo(m.x1, m.y1); g.stroke();
    g.restore();
  }

  function meteor(g, m) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const dx = m.x - m.px, dy = m.y - m.py;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    for (let i = 0; i < 26; i++) {
      const k = i / 26;
      const x = m.x - ux * k * 260, y = m.y - uy * k * 260;
      g.globalAlpha = 0.30 * (1 - k) * (1 - k);
      g.fillStyle = '#ffe6a0';
      g.beginPath(); g.arc(x, y, m.r * (1 - k * 0.7), 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#fffbe8';
    g.beginPath(); g.arc(m.x, m.y, m.r * 0.55, 0, 6.2832); g.fill();
    g.restore();
  }

  // ---- 目 ----
  // mood: 'normal' | 'angry' | 'hurt' | 'dead' | 'squint'
  function eyes(g, cx, cy, r, look, mood, t) {
    const gap = r * 0.42, ey = r * 0.05;
    for (let s = -1; s <= 1; s += 2) {
      const ex = cx + s * gap, y = cy + ey;
      const w = r * 0.30, h = r * 0.36;

      if (mood === 'dead') {                       // 目が回る
        g.strokeStyle = '#2b2118'; g.lineWidth = Math.max(2, r * 0.05);
        g.beginPath();
        for (let i = 0; i <= 26; i++) {
          const a = i / 26 * 6.2832 * 1.6;
          const rr = w * 0.9 * (i / 26);
          const x = ex + Math.cos(a + t * 6) * rr, yy = y + Math.sin(a + t * 6) * rr * 1.1;
          if (i === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
        }
        g.stroke();
        continue;
      }
      if (mood === 'hurt') {                       // × になる
        g.strokeStyle = '#2b2118'; g.lineWidth = Math.max(2, r * 0.06);
        g.beginPath();
        g.moveTo(ex - w * .7, y - h * .6); g.lineTo(ex + w * .7, y + h * .6);
        g.moveTo(ex + w * .7, y - h * .6); g.lineTo(ex - w * .7, y + h * .6);
        g.stroke();
        continue;
      }

      const squint = (mood === 'squint' || mood === 'angry') ? 0.55 : 1;
      // 白目
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(ex, y, w, h * squint, 0, 0, 6.2832); g.fill();
      // 黒目。彗星の方を向く
      const px = ex + look.x * w * 0.42, py = y + look.y * h * squint * 0.42;
      g.fillStyle = '#241b14';
      g.beginPath(); g.ellipse(px, py, w * 0.52, h * squint * 0.55, 0, 0, 6.2832); g.fill();
      g.fillStyle = 'rgba(255,255,255,.92)';
      g.beginPath(); g.arc(px - w * 0.18, py - h * squint * 0.22, w * 0.17, 0, 6.2832); g.fill();
      // 怒ると眉
      if (mood === 'angry') {
        g.strokeStyle = '#2b2118'; g.lineWidth = Math.max(2, r * 0.045);
        g.beginPath();
        g.moveTo(ex - s * w * 0.9, y - h * 0.95);
        g.lineTo(ex + s * w * 0.8, y - h * 0.55);
        g.stroke();
      }
    }
  }

  // ---- 惑星（ボス）----
  // b: {x,y,r,face,col,bands,ring,mood,hp,hpMax,shieldFlash}
  function planet(g, b, look, t) {
    const { x, y, r } = b;

    // 大気のオーラ。近づくと濃くなる
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 3; i >= 1; i--) {
      g.globalAlpha = 0.05 * b.aura;
      g.fillStyle = b.col.glow;
      g.beginPath(); g.arc(x, y, r * (1 + i * 0.30), 0, 6.2832); g.fill();
    }
    g.restore();

    // 環（後ろ半分）
    if (b.ring) ringHalf(g, b, true);

    // 本体
    g.save();
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.1, x, y, r);
    gr.addColorStop(0, b.col.hi);
    gr.addColorStop(0.6, b.col.mid);
    gr.addColorStop(1, b.col.lo);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();

    // 縞。自転に合わせて動く
    if (b.bands) {
      g.save();
      g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.clip();
      g.globalAlpha = 0.22;
      for (let i = 0; i < b.bands; i++) {
        const k = (i + 0.5) / b.bands;
        const yy = y - r + r * 2 * k;
        const hh = r * 2 / b.bands * (0.35 + 0.3 * Math.sin(i * 2.1));
        g.fillStyle = i % 2 ? b.col.hi : b.col.lo;
        g.beginPath();
        g.ellipse(x + Math.sin(b.face + i) * r * 0.10, yy, r * 1.05, hh, 0, 0, 6.2832);
        g.fill();
      }
      g.restore();
    }
    g.restore();

    // 顔（守っている側）。自転で盤面を回る
    const fx = x + Math.cos(b.face) * r * 0.38;
    const fy = y + Math.sin(b.face) * r * 0.38;
    eyes(g, fx, fy, r * 0.52, look, b.mood, t);

    // 環（手前半分）
    if (b.ring) ringHalf(g, b, false);

    // 守りの弧。ここに当てても通らない、が目で分かる
    if (b.mood !== 'dead') {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const fl = b.shieldFlash;
      g.globalAlpha = 0.18 + 0.55 * fl;
      g.strokeStyle = fl > 0.02 ? '#ffffff' : b.col.glow;
      g.lineWidth = r * 0.12;
      g.beginPath();
      g.arc(x, y, r * 1.10, b.face - b.arc, b.face + b.arc);
      g.stroke();
      g.restore();
    }
  }

  function ringHalf(g, b, back) {
    const { x, y, r } = b;
    g.save();
    g.translate(x, y);
    g.rotate(-0.34);
    g.beginPath();
    g.ellipse(0, 0, r * 1.95, r * 0.52, 0, back ? Math.PI : 0, back ? 6.2832 : Math.PI);
    g.lineWidth = r * 0.30;
    g.strokeStyle = b.col.ring || 'rgba(230,205,170,.75)';
    g.stroke();
    g.lineWidth = r * 0.10;
    g.strokeStyle = 'rgba(0,0,0,.25)';
    g.stroke();
    g.restore();
  }

  // ---- 衛星 ----
  function moon(g, m, look, t) {
    g.save();
    const gr = g.createRadialGradient(m.x - m.r * .3, m.y - m.r * .35, m.r * .1, m.x, m.y, m.r);
    gr.addColorStop(0, '#f6d98e'); gr.addColorStop(0.65, '#d79a45'); gr.addColorStop(1, '#8a5a24');
    g.fillStyle = gr;
    g.beginPath(); g.arc(m.x, m.y, m.r, 0, 6.2832); g.fill();
    g.restore();
    eyes(g, m.x, m.y, m.r * 0.78, look, m.hp < m.hpMax ? 'hurt' : 'normal', t);
  }

  // ---- 衝突の閃光 ----
  function flash(g, f) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const k = f.life / f.max;
    g.globalAlpha = k;
    const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (2 - k));
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.4, f.col);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(f.x, f.y, f.r * (2 - k), 0, 6.2832); g.fill();
    g.restore();
  }

  // ---- 破片（砕けた欠け。当たり判定なし）----
  function debris(g, d) {
    g.save();
    g.globalAlpha = Math.min(1, d.life / d.max);
    g.translate(d.x, d.y); g.rotate(d.rot);
    g.fillStyle = d.col;
    g.beginPath();
    g.moveTo(-d.r, -d.r * .6); g.lineTo(d.r * .8, -d.r);
    g.lineTo(d.r, d.r * .7); g.lineTo(-d.r * .6, d.r);
    g.closePath(); g.fill();
    g.restore();
  }

  return { initStars, stars: stars_draw, bounds, comet, spark, rock, shard,
           meteorWarn, meteor, planet, moon, flash, debris, eyes };
})();
