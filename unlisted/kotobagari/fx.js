// 見た目の演出。背景（段階で変わる）、粒子、画面の揺れ、光、語録の大表示。
// motion（0〜1）で量と強さをまとめて弱める。0 でも最小限の動きは残す。

const Fx = (() => {
  let bg, bgc, fx, fxc, shakeEl, flashEl, popEl;
  let W = 0, H = 0, dpr = 1;
  let motion = 1, tier = 0, e = 0, time = 0;
  let shakeAmp = 0;
  const parts = [];
  const rings = [];
  const flyers = [];

  const COL = {
    body: ['#ffffff', '#ffd6ea', '#ff7ab6'],
    head: ['#ff3b30', '#ff8a65', '#ffffff'],
    double: ['#ffd23f', '#fff3b0', '#ff9f1c', '#ffffff'],
    miss: ['#6c6480'],
    confetti: ['#ff3d8b', '#ffd23f', '#3dd6ff', '#7cff6b', '#b98cff', '#ffffff'],
  };

  function init(o) {
    bg = o.bg; fx = o.fx; shakeEl = o.shake; flashEl = o.flash; popEl = o.pop;
    bgc = bg.getContext('2d'); fxc = fx.getContext('2d');
    resize();
    addEventListener('resize', resize);
  }

  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    for (const c of [bg, fx]) {
      c.width = W * dpr; c.height = H * dpr;
      c.style.width = W + 'px'; c.style.height = H + 'px';
    }
    bgc.setTransform(dpr, 0, 0, dpr, 0, 0);
    fxc.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const setMotion = m => { motion = m; };
  const setTier = (t, ee) => { tier = t; e = ee; };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const n = k => Math.max(1, Math.round(k * (0.15 + 0.85 * motion)));

  // ---------------------------------------------------------------- 粒子

  function burst(x, y, kind, extra = 0) {
    const base = { body: 14, head: 26, double: 70, miss: 5 }[kind] || 10;
    const cnt = n(base * (1 + tier * 0.35 + extra));
    const sp = { body: 380, head: 560, double: 900, miss: 160 }[kind];
    for (let i = 0; i < cnt; i++) {
      const a = Math.random() * Math.PI * 2, v = rnd(0.25, 1) * sp;
      parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === 'double' ? 120 : 40),
        life: rnd(0.35, kind === 'double' ? 1.3 : 0.8), age: 0,
        size: rnd(2, kind === 'double' ? 7 : 4.5), col: pick(COL[kind]),
        shape: kind === 'head' || (kind === 'double' && Math.random() < 0.4) ? 'star' : 'dot',
        g: 900, drag: 2.2,
      });
    }
    if (kind !== 'miss') ring(x, y, kind);
  }

  function ring(x, y, kind) {
    const r = { body: 60, head: 110, double: 320 }[kind];
    rings.push({ x, y, r, age: 0, life: kind === 'double' ? 0.6 : 0.35, col: COL[kind][0], w: kind === 'double' ? 10 : 4 });
    if (kind === 'double') rings.push({ x, y, r: r * 1.6, age: -0.08, life: 0.7, col: '#ffffff', w: 4 });
  }

  function confetti(k) {
    for (let i = 0; i < n(k); i++) {
      parts.push({
        x: rnd(0, W), y: rnd(-60, -10), vx: rnd(-60, 60), vy: rnd(80, 260),
        life: rnd(2.5, 4.5), age: 0, size: rnd(4, 9), col: pick(COL.confetti),
        shape: 'paper', rot: rnd(0, 6), vr: rnd(-8, 8), g: 60, drag: 0.6,
      });
    }
  }

  function firework(x, y) {
    const col = pick(COL.confetti), cnt = n(90);
    for (let i = 0; i < cnt; i++) {
      const a = (i / cnt) * Math.PI * 2, v = rnd(0.85, 1) * 420;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(1, 1.6), age: 0, size: 3, col, shape: 'dot', g: 180, drag: 1.6, trail: true });
    }
    rings.push({ x, y, r: 160, age: 0, life: 0.4, col, w: 3 });
  }

  // ---------------------------------------------------------------- 野獣の眼光
  // 画面を暗転させ、闇の中で2つの眼が光る。人物の絵は使わない

  let eyesT = 0, eyesLen = 1;
  function eyes(len) { eyesT = eyesLen = len; }

  function drawEyes(c) {
    const k = 1 - eyesT / eyesLen;                      // 0→1
    const fade = k < 0.12 ? k / 0.12 : k > 0.75 ? (1 - k) / 0.25 : 1;
    c.globalAlpha = 0.86 * fade;
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);
    const cy = H * 0.4, gap = Math.min(W * 0.09, 110) + 40, ew = Math.min(W * 0.1, 120), eh = ew * 0.28;
    const open = Math.min(1, k / 0.18);                 // まぶたが開く
    for (const sx of [-1, 1]) {
      const cx = W / 2 + sx * gap;
      c.save();
      c.globalAlpha = fade;
      c.shadowColor = '#ff2a2a'; c.shadowBlur = 40;
      c.fillStyle = '#fff';
      c.beginPath();
      c.moveTo(cx - ew, cy);
      c.quadraticCurveTo(cx, cy - eh * 2 * open, cx + ew, cy);
      c.quadraticCurveTo(cx, cy + eh * 1.2 * open, cx - ew, cy);
      c.fill();
      // 光の筋
      const g = c.createLinearGradient(cx - W * 0.4, cy, cx + W * 0.4, cy);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.shadowBlur = 0;
      c.fillStyle = g;
      c.fillRect(cx - W * 0.4, cy - 1.5, W * 0.8, 3);
      c.fillStyle = 'rgba(255,255,255,.8)';
      c.fillRect(cx - 1, cy - ew * 0.9, 2, ew * 1.8);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- 揺れ・光

  function shake(a) { shakeAmp = Math.max(shakeAmp, a * motion); }

  function flash(alpha, col = '#fff') {
    const a = alpha * (0.3 + 0.7 * motion);
    flashEl.style.transition = 'none';
    flashEl.style.background = col;
    flashEl.style.opacity = a;
    requestAnimationFrame(() => {
      flashEl.style.transition = 'opacity .35s ease-out';
      flashEl.style.opacity = 0;
    });
  }

  // ---------------------------------------------------------------- 文字の大表示

  // アニメーションの終わりで消す。終わりが届かない環境でも残らないよう、時間でも消す
  function autoRemove(d, ms) {
    const rm = () => d.remove();
    d.addEventListener('animationend', rm);
    setTimeout(rm, ms);
  }

  let lastWord = null;
  function popWord(text, kind) {
    if (lastWord) lastWord.remove();
    const d = document.createElement('div');
    d.className = 'pop-word k-' + kind;
    d.textContent = text;
    d.style.setProperty('--tilt', rnd(-6, 6).toFixed(1) + 'deg');
    popEl.appendChild(d);
    lastWord = d;
    autoRemove(d, 2500);
    // 最高段階では、撃った語録が画面を横切って飛び続ける
    if (tier >= 4) flyers.push({ text, x: W + 20, y: rnd(40, H - 40), v: rnd(250, 520), size: rnd(20, 44), col: pick(COL.confetti) });
  }

  function popScore(x, y, text, kind) {
    const d = document.createElement('div');
    d.className = 'pop-score k-' + kind;
    d.textContent = text;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    popEl.appendChild(d);
    autoRemove(d, 1500);
  }

  // 指摘した語の真上に「こ↑こ↓」を矢印つきで跳ねさせる
  function popPoint(x, y, text, kind) {
    const d = document.createElement('div');
    d.className = 'pop-point k-' + kind;
    d.textContent = text;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    popEl.appendChild(d);
    autoRemove(d, 1500);
  }

  function popBanner(text, cls = '') {
    const d = document.createElement('div');
    d.className = 'pop-banner ' + cls;
    d.textContent = text;
    popEl.appendChild(d);
    autoRemove(d, 2000);
  }

  // ---------------------------------------------------------------- 毎フレーム

  // dt: 経過秒。frozen: ヒットストップ中（粒子も止める）
  function update(dt, frozen) {
    time += dt;
    if (eyesT > 0) eyesT = Math.max(0, eyesT - dt);
    drawBg(dt);
    if (!frozen) step(dt);
    drawFx();
    // 揺れ
    if (shakeAmp > 0.3) {
      const x = rnd(-1, 1) * shakeAmp, y = rnd(-1, 1) * shakeAmp;
      shakeEl.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${(rnd(-1, 1) * shakeAmp * 0.06).toFixed(2)}deg)`;
      shakeAmp *= Math.pow(0.0008, dt);
    } else if (shakeAmp) {
      shakeAmp = 0; shakeEl.style.transform = '';
    }
  }

  function step(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt);
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.rot !== undefined) p.rot += p.vr * dt;
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].age += dt;
      if (rings[i].age >= rings[i].life) rings.splice(i, 1);
    }
    for (let i = flyers.length - 1; i >= 0; i--) {
      flyers[i].x -= flyers[i].v * dt;
      if (flyers[i].x < -800) flyers.splice(i, 1);
    }
  }

  function star(c, x, y, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
  }

  function drawFx() {
    const c = fxc;
    c.clearRect(0, 0, W, H);
    for (const r of rings) {
      if (r.age < 0) continue;
      const k = r.age / r.life, ease = 1 - Math.pow(1 - k, 3);
      c.globalAlpha = 1 - k;
      c.strokeStyle = r.col; c.lineWidth = r.w * (1 - k) + 1;
      c.beginPath(); c.arc(r.x, r.y, r.r * ease, 0, Math.PI * 2); c.stroke();
    }
    c.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      const k = p.age / p.life;
      c.globalAlpha = 1 - k * k;
      c.fillStyle = p.col;
      if (p.shape === 'star') star(c, p.x, p.y, p.size * 1.8);
      else if (p.shape === 'paper') {
        c.globalCompositeOperation = 'source-over';
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * Math.abs(Math.cos(p.rot * 2)) + 1);
        c.restore();
        c.globalCompositeOperation = 'lighter';
      } else {
        c.beginPath(); c.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2); c.fill();
      }
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    if (eyesT > 0) drawEyes(c);
  }

  // 背景。段階が上がるほど要素が増える
  function drawBg(dt) {
    const c = bgc, m = 0.25 + 0.75 * motion;
    const hue = tier >= 3 ? (time * 40 * m) % 360 : 300;
    // 地
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `hsl(${hue},40%,${6 + tier * 1.5}%)`);
    g.addColorStop(1, `hsl(${(hue + 40) % 360},45%,${3 + tier}%)`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    // 格子（いつも出す。静かな時間の地）
    c.strokeStyle = `hsla(${hue},60%,60%,${0.05 + tier * 0.02})`;
    c.lineWidth = 1;
    const gs = 48, off = (time * 12 * m) % gs;
    c.beginPath();
    for (let x = -gs + off; x < W; x += gs) { c.moveTo(x, 0); c.lineTo(x, H); }
    for (let y = -gs + off; y < H; y += gs) { c.moveTo(0, y); c.lineTo(W, y); }
    c.stroke();

    const cx = W / 2, cy = H * 0.55;
    // 段階1：中央の脈打つ光
    if (tier >= 1) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      const r = Math.max(W, H) * (0.45 + 0.1 * pulse * m);
      const rg = c.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, `hsla(${(hue + 20) % 360},90%,60%,${0.12 + 0.1 * e})`);
      rg.addColorStop(1, 'hsla(0,0%,0%,0)');
      c.fillStyle = rg; c.fillRect(0, 0, W, H);
    }
    // 段階2：回る放射線
    if (tier >= 2) {
      const rays = 16, R = Math.hypot(W, H);
      c.save(); c.translate(cx, cy); c.rotate(time * 0.35 * m);
      for (let i = 0; i < rays; i++) {
        c.fillStyle = `hsla(${(hue + i * (tier >= 3 ? 22 : 0)) % 360},90%,60%,${0.05 + 0.05 * (tier - 2)})`;
        c.beginPath(); c.moveTo(0, 0);
        const a = (i / rays) * Math.PI * 2;
        c.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        c.lineTo(Math.cos(a + Math.PI / rays) * R, Math.sin(a + Math.PI / rays) * R);
        c.closePath(); c.fill();
      }
      c.restore();
    }
    // 段階3：紙吹雪が降り続ける
    if (tier >= 3 && Math.random() < dt * 14 * motion) confetti(1);
    // 段階4：縁が虹色に明滅し、撃った語録が飛び交う
    if (tier >= 4) {
      const w = 18 + 10 * Math.sin(time * 10);
      c.lineWidth = w * m;
      c.strokeStyle = `hsla(${(time * 300) % 360},100%,60%,0.55)`;
      c.strokeRect(0, 0, W, H);
    }
    for (const f of flyers) {
      c.font = `900 ${f.size}px sans-serif`;
      c.fillStyle = f.col; c.globalAlpha = 0.55;
      c.fillText(f.text, f.x, f.y);
    }
    c.globalAlpha = 1;
  }

  function clear() {
    parts.length = 0; rings.length = 0; flyers.length = 0;
    popEl.innerHTML = ''; lastWord = null; eyesT = 0;
    shakeAmp = 0; shakeEl.style.transform = '';
  }

  return { init, setMotion, setTier, burst, confetti, firework, eyes, shake, flash, popWord, popScore, popPoint, popBanner, update, clear, size: () => ({ W, H }) };
})();
