/* ==========================================================
   タイトルの景色

   夕暮れの荒野を戦車が走り続ける。戦車は左寄りに留まり、景色が右から流れてくる。
   遠くの崖の上には灰色の亡霊の影。ときどき主砲で前の岩を撃って砕く。
   小さく描いて引き伸ばす（image-rendering: pixelated）。タイトルが出ている間だけ動かす。

   TTITLE.mount(canvas) / TTITLE.start() / TTITLE.stop()
   ========================================================== */
window.TTITLE = (function () {
  'use strict';

  var cv = null, g = null, W = 240, H = 150, cssW = 0, cssH = 0;
  var on = false, raf = 0, last = 0, t = 0, dist = 0;
  var SPEED = 34;                    // 地面の流れる速さ（ドット/秒）
  var props = [], dust = [], bits = [], shell = null, flash = 0, recoil = 0, fireT = 2.5, spawnT = 0;
  var stars = [], ghost = null, tankSp = null;

  function mount(c) { cv = c; g = cv.getContext('2d'); }

  function start() {
    if (on || !cv) return;
    on = true; last = 0;
    if (!tankSp) tankSp = drawTank();
    if (!ghost) ghost = ghostShadow();
    raf = requestAnimationFrame(frame);
  }
  function stop() { on = false; cancelAnimationFrame(raf); }

  function fit() {
    var r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (r.width === cssW && r.height === cssH) return true;
    cssW = r.width; cssH = r.height;
    var s = Math.max(2, Math.round(cssH / 150));
    W = Math.ceil(cssW / s); H = Math.ceil(cssH / s);
    cv.width = W; cv.height = H;
    g.imageSmoothingEnabled = false;
    stars = [];
    for (var i = 0; i < W * .25; i++) stars.push({ x: (i * 53 + 7) % W, y: (i * 29 + 3) % Math.round(H * .4), ph: i * 1.7 });
    return true;
  }

  function rect(x, y, w, h, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function mixHex(a, b, k) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    function c(s) { return Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k); }
    return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
  }
  function canvas(w, h, fn) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    fn(function (px, py, pw, ph, col) { x.fillStyle = col; x.fillRect(px, py, pw, ph); }, x);
    return c;
  }

  /* 横から見た戦車（40x20）。色は始めの装備に合わせる */
  var TANK_W = 40, TANK_H = 20;
  function drawTank() {
    var O = '#191d22', B = ['#2e5a40', '#3e7052', '#4a7f5e', '#6aa07a', '#8ac096'], C = ['#7a828a', '#c8ced4', '#e8ecf0'];
    return canvas(TANK_W, TANK_H, function (r) {
      r(17, 2, 23, 3, O); r(18, 3, 21, 1, C[1]); r(18, 2, 21, 1, C[2]);          // 主砲
      r(9, 1, 14, 7, O); r(10, 2, 12, 2, B[4]); r(10, 4, 12, 3, B[3]); r(13, 2, 3, 1, B[2]);   // 砲塔
      r(2, 7, 34, 7, O); r(3, 8, 32, 2, B[3]); r(3, 10, 32, 3, B[2]); r(3, 12, 32, 1, B[1]);   // 車体
      r(31, 8, 4, 4, B[1]); r(5, 9, 4, 1, B[1]);
      r(1, 13, 36, 6, O); r(2, 14, 34, 4, '#3a3f44');                            // 履帯
    });
  }
  /* 灰色の亡霊の影。sprites.js の部位を重ねて1色で塗る */
  function ghostShadow() {
    var SP = window.SPRITES, A = window.ART;
    if (!SP || !A || !A.fromRows) return null;
    return canvas(32, 32, function (r, x) {
      ['track', 'body', 'sub', 'cannon'].forEach(function (k) {
        var sp = SP['boss-ghost-' + k];
        if (sp) x.drawImage(A.fromRows(sp), 0, 0);
      });
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = '#3a1e3a'; x.fillRect(0, 0, 32, 32);
    });
  }

  var SKY = ['#1a1238', '#3a1e4a', '#6a2e4e', '#a8444a', '#d8703e', '#f0a050', '#f8c878'];
  function GY() { return Math.round(H * .74); }
  function TX() { return Math.round(W * .26); }

  function frame(now) {
    if (!on) return;
    raf = requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = Math.min(.1, (now - last) / 1000);
    last = now;
    if (!fit()) return;
    step(dt);
    draw();
  }

  function spawn() {
    var kinds = ['rock', 'rock', 'cactus', 'wreck', 'weed'];
    var k = kinds[Math.floor(Math.random() * kinds.length)];
    props.push({ k: k, x: W + 20, y: GY() + (k === 'weed' ? 6 + Math.random() * 8 : 2 + Math.random() * 10), ph: 0 });
  }

  function step(dt) {
    t += dt; dist += SPEED * dt;
    if ((spawnT -= dt) <= 0) { spawn(); spawnT = 1.2 + Math.random() * 1.8; }
    props.forEach(function (p) { p.x -= SPEED * dt * (p.k === 'weed' ? 1.5 : 1); p.ph += dt * 8; });
    props = props.filter(function (p) { return p.x > -30 && !p.gone; });

    /* 砂ぼこりは車体の後ろへ流れる */
    if (Math.random() < dt * 40) {
      dust.push({ x: TX() + 2, y: GY() - 3 - Math.random() * 3, vx: -SPEED - 10 - Math.random() * 14, vy: -4 - Math.random() * 6, t: 0, life: .8 + Math.random() * .8 });
    }
    dust = dust.filter(function (d) { d.t += dt; d.x += d.vx * dt; d.y += d.vy * dt; return d.t < d.life; });
    bits = bits.filter(function (b) { b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 90 * dt; return b.t < b.life; });
    if (flash > 0) flash -= dt;
    if (recoil > 0) recoil -= dt;

    /* 前方に岩があれば、ときどき撃って砕く */
    fireT -= dt;
    var muzzle = TX() + TANK_W, target = null;
    props.forEach(function (p) { if (p.k === 'rock' && !p.hit && p.x > muzzle + 20 && p.x < W - 10 && (!target || p.x < target.x)) target = p; });
    if (fireT <= 0 && target && !shell) {
      fireT = 2.8 + Math.random() * 2;
      target.hit = true;
      shell = { x: muzzle, y: GY() - TANK_H + 3, target: target };
      flash = .08; recoil = .15;
    }
    if (shell) {
      shell.x += 260 * dt;
      var tg = shell.target;
      shell.y += ((tg.y - 4) - shell.y) * Math.min(1, dt * 6);
      if (shell.x >= tg.x - 2) {
        for (var i = 0; i < 12; i++) {
          var a = -Math.PI * (.1 + .8 * Math.random());
          bits.push({ x: tg.x, y: tg.y - 4, vx: Math.cos(a) * (20 + Math.random() * 40) - SPEED, vy: Math.sin(a) * (30 + Math.random() * 40),
                      t: 0, life: .6 + Math.random() * .5, c: i % 3 ? '#8a7a5a' : '#fff0c0' });
        }
        tg.gone = true;
        shell = null;
      }
    }
  }

  function ridge(base, amp, period, col, seed, flat, scroll) {
    g.fillStyle = col;
    for (var x = 0; x < W; x++) {
      var u = (x + scroll) / period;
      var h = Math.sin(u * 2.1 + seed) * .5 + Math.sin(u * 5.3 + seed * 2) * .3 + Math.sin(u * 11.7 + seed) * .2;
      if (flat) h = Math.round(h * 2) / 2;
      var top = Math.round(base - amp * (h * .5 + .5));
      g.fillRect(x, top, 1, H - top);
    }
  }

  function draw() {
    var gy = GY(), n = SKY.length - 1, stp = 4, prev = null, y, x;
    for (y = 0; y < gy; y += stp) {
      var u = y / gy * n, i = Math.min(n - 1, Math.floor(u));
      var col = mixHex(SKY[i], SKY[i + 1], u - i);
      rect(0, y, W, stp, col);
      if (prev) { g.fillStyle = prev; for (x = y & 1; x < W; x += 2) g.fillRect(x, y, 1, 1); }
      prev = col;
    }
    stars.forEach(function (s) {
      var a = .5 + .5 * Math.sin(t * 1.4 + s.ph);
      if (a > .5) rect(s.x, s.y, 1, 1, a > .85 ? '#ffffff' : '#c8b8e8');
    });

    var sx = Math.round(W * .72), sy = gy - 20;
    g.fillStyle = 'rgba(255,200,120,.18)';
    g.beginPath(); g.arc(sx, sy, 30, 0, 7); g.fill();
    g.fillStyle = '#ffd890'; g.beginPath(); g.arc(sx, sy, 16, 0, 7); g.fill();
    g.fillStyle = '#fff0c0'; g.beginPath(); g.arc(sx, sy, 11, 0, 7); g.fill();
    for (var k = 0; k < 4; k++) rect(sx - 18, sy + 2 + k * 4, 36, 1, SKY[5]);

    /* 遠くの崖。いちばん奥はほとんど動かず、その上に亡霊の影が据わる */
    var far = dist * .06;
    ridge(gy - 22, 30, 80, '#5a2a44', 1.3, true, far);
    if (ghost) {
      var gxp = Math.round(W * .55 - far % (W * 1.6));
      var gx = gxp < -20 ? gxp + Math.round(W * 1.6) : gxp;
      rect(gx - 4, gy - 52, 26, 30, '#5a2a44');
      g.drawImage(ghost, gx, gy - 66, 16, 16);
    }
    ridge(gy - 8, 14, 46, '#6e3440', 4.1, true, dist * .25);
    ridge(gy - 1, 6, 28, '#8a4a3a', 2.7, false, dist * .55);

    /* 地面と轍 */
    rect(0, gy, W, H - gy, '#b8784a');
    rect(0, gy, W, 1, '#e0a068');
    for (y = gy + 3; y < H; y += 5) {
      var off = Math.round(dist * (.8 + (y - gy) / H)) % 11;
      for (x = ((y * 7) % 11) - off; x < W; x += 11) rect(x, y, 3, 1, '#a0663e');
    }
    rect(0, gy + 5, TX() + 4, 1, '#8a5432'); rect(0, gy + 8, TX() + 4, 1, '#8a5432');

    var back = props.filter(function (p) { return p.y < gy + 6; }), front = props.filter(function (p) { return p.y >= gy + 6; });
    back.forEach(drawProp);

    dust.forEach(function (d) {
      g.globalAlpha = Math.max(0, 1 - d.t / d.life) * .7;
      rect(d.x, d.y, 2, 2, '#e8c090');
    });
    g.globalAlpha = 1;

    var bob = Math.sin(t * 20) > .6 ? 1 : 0, kick = recoil > 0 ? -1 : 0;
    var tx = TX() + kick, ty = gy - TANK_H + 6 - bob;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(tx + 2, gy + 4, TANK_W - 4, 2);
    g.drawImage(tankSp, tx, ty);
    var tr = Math.floor(dist / 2) % 3;                        // 履帯の送り
    for (x = 3 + tr; x < TANK_W - 4; x += 3) rect(tx + x, ty + 15, 1, 2, '#22262a');
    if (flash > 0) {
      rect(tx + TANK_W, ty + 1, 4, 5, '#fff0c0');
      rect(tx + TANK_W + 3, ty + 2, 3, 3, '#ffd479');
    }
    if (shell) rect(shell.x, shell.y, 4, 2, '#ffd479');
    bits.forEach(function (b) { rect(b.x, b.y, 2, 2, b.c); });

    front.forEach(drawProp);
  }

  function drawProp(p) {
    var x = Math.round(p.x), y = Math.round(p.y), O = '#3a2418';
    if (p.k === 'rock') {
      rect(x - 6, y - 7, 12, 7, O); rect(x - 5, y - 6, 10, 5, '#9a8a6a'); rect(x - 4, y - 6, 5, 2, '#c8b890'); rect(x - 5, y - 2, 10, 1, '#6a5a44');
    } else if (p.k === 'cactus') {
      rect(x, y - 16, 3, 16, '#3a5a34'); rect(x - 4, y - 10, 4, 2, '#3a5a34'); rect(x - 4, y - 14, 2, 5, '#3a5a34');
      rect(x + 3, y - 8, 4, 2, '#3a5a34'); rect(x + 5, y - 12, 2, 5, '#3a5a34'); rect(x + 1, y - 16, 1, 16, '#5a7a4a');
    } else if (p.k === 'wreck') {
      rect(x - 10, y - 8, 20, 7, O); rect(x - 9, y - 7, 18, 5, '#8a4e30'); rect(x - 6, y - 11, 9, 4, '#6a3a22');
      rect(x - 7, y - 2, 4, 3, '#2a2420'); rect(x + 4, y - 2, 4, 3, '#2a2420'); rect(x - 2, y - 6, 3, 1, '#a86a40');
    } else {
      var cy = y - Math.round(Math.abs(Math.sin(p.ph)) * 4);
      g.fillStyle = '#7a5a34';
      for (var a = 0; a < 6; a++) g.fillRect(x + Math.round(Math.cos(p.ph + a) * 3), cy + Math.round(Math.sin(p.ph + a) * 3), 1, 1);
      rect(x - 1, cy - 1, 3, 3, '#5a4024');
    }
  }

  return { mount: mount, start: start, stop: stop };
})();
