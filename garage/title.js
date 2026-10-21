/* ==========================================================
   タイトルの景色

   夕暮れの荒野。遠くの台地の上に最終ボスの影が見え、
   手前を戦車が砂ぼこりを上げて走り抜ける。転がる枯れ草、瞬きはじめる星。
   小さく描いて引き伸ばす（image-rendering: pixelated）。タイトルが出ている間だけ動かす。

   GTITLE.mount(canvas) / GTITLE.start() / GTITLE.stop()
   ========================================================== */
window.GTITLE = (function () {
  'use strict';

  var cv = null, g = null, W = 320, H = 180, cssW = 0, cssH = 0;
  var on = false, raf = 0, last = 0, t = 0;
  var tank = { x: -60, wait: 1.2 }, weeds = [], dust = [], stars = [];
  var tankSp = null, bossSp = null, bossDark = null;

  function mount(c) { cv = c; g = cv.getContext('2d'); }

  function start() {
    if (on || !cv) return;
    on = true; last = 0;
    if (window.ART) {
      tankSp = window.ART.chassis({ color: '#7a8a52' });
      bossSp = window.ART.enemy('golgoda');
      bossDark = silhouette(bossSp, '#2a1830');
    }
    raf = requestAnimationFrame(frame);
  }
  function stop() { on = false; cancelAnimationFrame(raf); }

  function silhouette(sp, col) {
    var c = document.createElement('canvas');
    c.width = sp.width; c.height = sp.height;
    var x = c.getContext('2d');
    x.drawImage(sp, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function fit() {
    var r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (r.width === cssW && r.height === cssH) return true;
    cssW = r.width; cssH = r.height;
    var s = Math.max(2, Math.round(cssH / 180));
    W = Math.ceil(cssW / s); H = Math.ceil(cssH / s);
    cv.width = W; cv.height = H;
    g.imageSmoothingEnabled = false;
    stars = [];
    for (var i = 0; i < W * .3; i++) stars.push({ x: (i * 53 + 7) % W, y: (i * 29 + 3) % Math.round(H * .45), ph: i * 1.7 });
    return true;
  }

  function rect(x, y, w, h, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function ridge(base, amp, period, col, seed, flat) {
    g.fillStyle = col;
    for (var x = 0; x < W; x++) {
      var u = x / period;
      var h = Math.sin(u * 2.1 + seed) * .5 + Math.sin(u * 5.3 + seed * 2) * .3 + Math.sin(u * 11.7 + seed) * .2;
      if (flat) h = Math.round(h * 2) / 2;          // 台地は上が平ら
      var top = Math.round(base - amp * (h * .5 + .5));
      g.fillRect(x, top, 1, H - top);
    }
  }

  function mixHex(a, b, k) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    function c(s) { return Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k); }
    return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
  }

  var GY = function () { return Math.round(H * .78); };
  var SKY = ['#1a1238', '#3a1e4a', '#6a2e4e', '#a8444a', '#d8703e', '#f0a050', '#f8c878'];

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

  function step(dt) {
    t += dt;
    /* 戦車。しばらく待ってから左から右へ走り抜ける */
    if (tank.wait > 0) { tank.wait -= dt; if (tank.wait <= 0) tank.x = -50; }
    else {
      tank.x += 22 * dt;
      if (Math.random() < dt * 30) dust.push({ x: tank.x + 2, y: GY() - 2, vx: -6 - Math.random() * 6, vy: -3 - Math.random() * 4, t: 0, life: 1.2 + Math.random() });
      if (tank.x > W + 20) tank.wait = 5 + Math.random() * 4;
    }
    /* 枯れ草 */
    if (weeds.length < 2 && Math.random() < dt * .25) weeds.push({ x: -8, y: GY() + 4 + Math.random() * 10, ph: 0, sp: 18 + Math.random() * 14 });
    weeds = weeds.filter(function (w) { w.x += w.sp * dt; w.ph += dt * w.sp / 3; return w.x < W + 10; });
    dust = dust.filter(function (d) { d.t += dt; d.x += d.vx * dt; d.y += d.vy * dt; return d.t < d.life; });
  }

  function draw() {
    /* 空。色の表を細かい帯に混ぜ、帯の境目は市松でぼかす */
    var gy = GY(), n = SKY.length - 1, step = 4, prev = null;
    for (var y = 0; y < gy; y += step) {
      var u = y / gy * n, i = Math.min(n - 1, Math.floor(u));
      var col = mixHex(SKY[i], SKY[i + 1], u - i);
      rect(0, y, W, step, col);
      if (prev) { g.fillStyle = prev; for (var x = y & 1; x < W; x += 2) g.fillRect(x, y, 1, 1); }
      prev = col;
    }
    stars.forEach(function (s) {
      var a = .5 + .5 * Math.sin(t * 1.4 + s.ph);
      if (a > .45) rect(s.x, s.y, 1, 1, a > .85 ? '#ffffff' : '#c8b8e8');
    });
    /* 沈みかけの太陽 */
    var sx = Math.round(W * .7), sy = gy - 22;
    g.fillStyle = 'rgba(255,200,120,.18)';
    g.beginPath(); g.arc(sx, sy, 34, 0, 7); g.fill();
    g.fillStyle = '#ffd890';
    g.beginPath(); g.arc(sx, sy, 18, 0, 7); g.fill();
    g.fillStyle = '#fff0c0';
    g.beginPath(); g.arc(sx, sy, 13, 0, 7); g.fill();
    for (var k = 0; k < 4; k++) rect(sx - 20, sy + 2 + k * 4, 40, 1, SKY[5]);   // 横縞で溶ける太陽

    /* 遠くの台地。いちばん奥の台地の上にボスの影 */
    ridge(gy - 26, 26, 90, '#5a2a44', 1.3, true);
    /* 遠くにいるので半分の大きさで、影だけ */
    if (bossDark) g.drawImage(bossDark, Math.round(W * .14), gy - 40, bossDark.width / 2, bossDark.height / 2);
    ridge(gy - 10, 14, 50, '#6e3440', 4.1, true);
    ridge(gy - 2, 6, 30, '#8a4a3a', 2.7, false);

    /* 地面 */
    rect(0, gy, W, H - gy, '#b8784a');
    rect(0, gy, W, 1, '#e0a068');
    for (var y = gy + 3; y < H; y += 5) {
      for (var x2 = ((y * 7) % 11); x2 < W; x2 += 11) rect(x2, y, 3, 1, '#a0663e');
    }
    rect(0, gy + 6, W, 1, '#9a6038'); rect(0, gy + 9, W, 1, '#9a6038');     // 轍

    /* サボテン */
    [[.08, 1], [.46, .8], [.9, 1.1]].forEach(function (c) {
      var x = Math.round(W * c[0]), h = Math.round(18 * c[1]);
      rect(x, gy - h, 3, h, '#3a2a30'); rect(x - 4, gy - h + 6, 4, 2, '#3a2a30'); rect(x - 4, gy - h + 2, 2, 5, '#3a2a30');
      rect(x + 3, gy - h + 9, 4, 2, '#3a2a30'); rect(x + 5, gy - h + 5, 2, 5, '#3a2a30');
    });

    /* 戦車と砂ぼこり */
    dust.forEach(function (d) {
      g.globalAlpha = Math.max(0, 1 - d.t / d.life) * .7;
      rect(d.x, d.y, 2, 2, '#e8c090');
    });
    g.globalAlpha = 1;
    if (tankSp && tank.wait <= 0) {
      var bob = Math.sin(t * 18) > .7 ? 1 : 0;
      g.drawImage(tankSp, Math.round(tank.x), gy - tankSp.height + 3 - bob);
    }
    weeds.forEach(function (w) {
      var cx = Math.round(w.x), cy = Math.round(w.y - Math.abs(Math.sin(w.ph)) * 4);
      g.fillStyle = '#7a5a34';
      for (var a = 0; a < 6; a++) {
        var ang = w.ph + a;
        g.fillRect(cx + Math.round(Math.cos(ang) * 3), cy + Math.round(Math.sin(ang) * 3), 1, 1);
      }
      rect(cx - 1, cy - 1, 3, 3, '#5a4024');
    });
  }

  return { mount: mount, start: start, stop: stop };
})();
