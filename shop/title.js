/* ==========================================================
   タイトルの景色
   夕暮れの荒野。崩れたビル群を背に、鉄板張りの店が明かりを灯している。

   - 低解像度のキャンバスに描いて CSS で引き伸ばす（image-rendering: pixelated）
   - 廃墟の並びは幅から決まる。砂ぼこり・看板の明滅・通りがかるハンターだけが動く
   - 人の絵は scene.js の walker を使う
   - タイトルが出ている間だけ動かす

   TITLE.attach(canvas) / TITLE.start() / TITLE.stop()
   ========================================================== */
window.TITLE = (function () {
  'use strict';

  var cv = null, g = null, W = 320, H = 180, cssW = 0, cssH = 0;
  var on = false, raf = 0, last = 0, t = 0;
  var ruins = [], far = [], dust = [];
  var walker = { x: -20, wait: 2, kind: 'hunter' };

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

  /* 1ドットは2画素以上。高さがおよそ180ドットになるように決める */
  function fit() {
    var r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (r.width === cssW && r.height === cssH) return true;
    cssW = r.width; cssH = r.height;
    var s = Math.max(2, Math.round(cssH / 180));
    W = Math.ceil(cssW / s); H = Math.ceil(cssH / s);
    cv.width = W; cv.height = H;
    g.imageSmoothingEnabled = false;
    build();
    return true;
  }

  /* 決まった乱数。幅が同じなら同じ景色になる */
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function GY() { return H - 34; }                  // 地面の高さ
  function CX() { return Math.round(W * .74); }     // 真ん中はメニューが来るので、店は右に寄せる

  /* 廃墟を作る。遠いビルは高く細く、近いビルは低く崩れている。店の前後は空けておく */
  function build() {
    var r = rng(11), x;
    far = [];
    x = -4;
    while (x < W + 4) {
      var fw = 8 + Math.floor(r() * 14), fh = 30 + Math.floor(r() * 46);
      far.push({ x: x, w: fw, h: fh, cut: Math.floor(r() * 3), tilt: r() < .25 ? (r() < .5 ? -1 : 1) : 0 });
      x += fw + Math.floor(r() * 6);
    }
    ruins = [];
    x = -6;
    while (x < W + 6) {
      var w = 14 + Math.floor(r() * 18), h = 10 + Math.floor(r() * 24);
      if (Math.abs(x + w / 2 - CX()) > 62) {
        var holes = [];
        for (var i = 0; i < 3; i++) if (r() < .55) holes.push({ x: 2 + Math.floor(r() * (w - 5)), y: 3 + Math.floor(r() * (h - 6)) });
        var bars = [];
        for (var j = 0; j < 2; j++) if (r() < .6) bars.push({ x: 1 + Math.floor(r() * (w - 2)), h: 2 + Math.floor(r() * 5) });
        ruins.push({ x: x, w: w, h: h, holes: holes, bars: bars, jag: Math.floor(r() * 4) });
      }
      x += w + Math.floor(r() * 5);
    }
  }

  function frame(now) {
    if (!on) return;
    raf = requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = Math.min(100, now - last);
    last = now;
    if (!fit()) return;
    step(dt);
    draw();
  }

  /* ---------------------------------------------------------------- 動き */
  function step(dt) {
    var k = dt / 1000;
    t += k;
    /* 砂ぼこり。右から左へ、地面すれすれを流れる */
    if (dust.length < W / 4 && Math.random() < k * 14) {
      dust.push({ x: W + 2, y: GY() - 2 - Math.random() * 40, vx: -(18 + Math.random() * 26), ph: Math.random() * 6.3,
        life: 6 + Math.random() * 6, t: 0, col: Math.random() < .6 ? '#e8b878' : '#c08a5a' });
    }
    dust = dust.filter(function (p) {
      p.t += k; p.x += p.vx * k; p.y += Math.sin(p.t * 2 + p.ph) * 3 * k;
      return p.t < p.life && p.x > -4;
    });
    /* ハンター。しばらく待ってから左から歩いてきて、店に入る */
    if (walker.wait > 0) {
      walker.wait -= k;
      if (walker.wait <= 0) { walker.x = -12; walker.kind = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'trader'][Math.floor(Math.random() * 7)]; }
    } else {
      walker.x += 20 * k;
      if (walker.x >= CX()) walker.wait = 8 + Math.random() * 7;
    }
  }

  /* ---------------------------------------------------------------- 描く */
  function px(x, y, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
  function rect(x, y, w, h, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  }
  function glowAt(x, y, r, col, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, hexA(col, a)); gr.addColorStop(1, hexA(col, 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /* 空。上は夜の紫、地平は砂の色に焼けた夕日。帯の境目は市松で混ぜる */
  var SKY = ['#120a16', '#24101e', '#3e1624', '#682424', '#9a3e26', '#c8642c', '#e0923e'];
  function drawSky() {
    var gy = GY(), n = SKY.length;
    for (var i = 0; i < n; i++) {
      var y0 = Math.floor(gy * i / n), y1 = Math.floor(gy * (i + 1) / n);
      rect(0, y0, W, y1 - y0, SKY[i]);
      if (i > 0) { g.fillStyle = SKY[i - 1]; for (var x = y0 & 1; x < W; x += 2) g.fillRect(x, y0, 1, 1); }
    }
    /* 沈みかけの太陽。下の方に横の切れ目を入れる */
    var sx = Math.round(W * .3), sy = gy - 12, R = 22;
    glowAt(sx, sy, 70, '#ffb050', .35);
    g.fillStyle = '#ffd27a';
    for (var yy = -R; yy <= R; yy++) {
      if (yy > 2 && (yy % 5 === 0 || yy % 5 === 1)) continue;
      var half = Math.floor(Math.sqrt(R * R - yy * yy));
      g.fillRect(sx - half, sy + yy, half * 2, 1);
    }
    /* 星はまだ少しだけ */
    var r = rng(3);
    for (var s = 0; s < W * .12; s++) {
      var x2 = Math.floor(r() * W), y2 = Math.floor(r() * gy * .35), ph = r() * 6.3;
      if (Math.sin(t * 1.5 + ph) > .2) px(x2, y2, '#d8b8c8');
    }
  }

  /* 遠くの高層ビルの影。上が欠けて、何本かは傾いている */
  function drawFar() {
    var gy = GY() - 10;
    far.forEach(function (b) {
      var top = gy - b.h;
      for (var x = 0; x < b.w; x++) {
        var lean = b.tilt ? Math.round((b.h - 0) * .08 * b.tilt * (x / b.w)) : 0;
        var cut = b.cut ? ((x * 7 + b.x) % (3 + b.cut)) : 0;
        rect(b.x + x + lean, top + cut, 1, b.h - cut + 10, '#4a1e22');
      }
    });
  }

  /* 手前の瓦礫の街並み。鉄骨がはみ出ている */
  function drawRuins() {
    var gy = GY();
    ruins.forEach(function (b) {
      var top = gy - b.h;
      rect(b.x, top, b.w, b.h, '#2a1214');
      for (var x = 0; x < b.w; x += 3) rect(b.x + x, top - ((x + b.jag) % 4), 2, (x + b.jag) % 4, '#2a1214');
      b.holes.forEach(function (h) { rect(b.x + h.x, top + h.y, 2, 2, '#4a1e22'); });
      b.bars.forEach(function (s) { rect(b.x + s.x, top - s.h, 1, s.h, '#3a1a1a'); });
    });
  }

  function drawGround() {
    var gy = GY(), cx = CX();
    rect(0, gy, W, H - gy, '#3a2418');
    rect(0, gy, W, 1, '#6a4028');
    for (var y = gy + 3; y < H; y += 4) {
      var off = ((y >> 2) & 1) * 5;
      for (var x = off; x < W; x += 11) rect(x, y, 6, 1, '#4a2e1e');
    }
    /* 店の前は明かりを受けて明るい */
    for (var y2 = gy + 1; y2 < H; y2++) {
      var w = 16 + (y2 - gy) * 1.8;
      g.fillStyle = 'rgba(255,190,110,' + (.14 * (1 - (y2 - gy) / (H - gy))).toFixed(3) + ')';
      g.fillRect(Math.round(cx - w), y2, Math.round(w * 2), 1);
    }
  }

  /* 店。鉄板張りの箱に、配管・アンテナ・警告帯。扉と窓から明かりが漏れる */
  function drawShop() {
    var gy = GY(), cx = CX();
    var L = cx - 40, R = cx + 40, top = gy - 36;
    glowAt(cx, gy, 54, '#ffb860', .22);
    /* 後ろの給水塔 */
    rect(R - 20, top - 22, 14, 10, '#3e4650'); rect(R - 20, top - 22, 14, 1, '#6a7682');
    rect(R - 18, top - 12, 1, 12, '#2a3038'); rect(R - 8, top - 12, 1, 12, '#2a3038');
    /* 壁。鉄板の継ぎ目とリベット、ところどころ錆 */
    rect(L, top, R - L, 36, '#48535e');
    for (var x = L + 12; x < R; x += 13) rect(x, top, 1, 36, '#2f373f');
    for (var y = top + 9; y < gy; y += 9) rect(L, y, R - L, 1, '#2f373f');
    for (var x2 = L + 3; x2 < R; x2 += 13) for (var y2 = top + 3; y2 < gy - 2; y2 += 9) px(x2, y2, '#8996a3');
    rect(L + 4, top + 20, 7, 5, '#8a5a3a'); rect(R - 26, top + 6, 5, 4, '#8a5a3a');
    rect(L, top, R - L, 2, '#6b7885');
    rect(L - 3, top - 3, R - L + 6, 3, '#2f373f');
    /* 屋根の配管とアンテナ。先の赤い灯が点滅する */
    rect(L + 6, top - 9, 26, 3, '#7d8a97'); rect(L + 6, top - 9, 26, 1, '#a8b4c0');
    rect(L + 30, top - 9, 3, 6, '#7d8a97');
    rect(L + 14, top - 30, 1, 27, '#2a3038');
    rect(L + 11, top - 24, 7, 1, '#2a3038'); rect(L + 12, top - 19, 5, 1, '#2a3038');
    var blink = Math.sin(t * 3) > .2;
    if (blink) { glowAt(L + 14, top - 31, 8, '#ff4020', .6); px(L + 14, top - 31, '#ff6a45'); }
    /* 足元の警告帯 */
    for (var sx = L; sx < R; sx += 6) { rect(sx, gy - 4, 3, 4, '#d9a441'); rect(sx + 3, gy - 4, 3, 4, '#14181c'); }
    /* 窓。緑の端末の光 */
    [L + 8, R - 22].forEach(function (wx, i) {
      var fl = .85 + .15 * Math.sin(t * 5 + i * 2);
      glowAt(wx + 7, top + 13, 14, '#3fb87a', .25 * fl);
      rect(wx - 1, top + 7, 16, 12, '#14181c');
      rect(wx, top + 8, 14, 10, '#0d1f18');
      rect(wx + 2, top + 10, 8, 1, '#3fb87a'); rect(wx + 2, top + 13, 5, 1, '#3fb87a');
      if (fl > .9) rect(wx + 2, top + 16, 9, 1, '#3fb87a');
    });
    /* 扉。シャッターが半分上がっていて、中の明かりが漏れる */
    glowAt(cx, gy - 8, 18, '#ffd080', .45);
    rect(cx - 9, gy - 22, 18, 18, '#14181c');
    rect(cx - 8, gy - 13, 16, 9, '#ffcf7a');
    rect(cx - 8, gy - 21, 16, 8, '#7d8a97');
    for (var sy = gy - 20; sy < gy - 13; sy += 2) rect(cx - 8, sy, 16, 1, '#5a6672');
    /* 看板。薄い板に、ネオンの銃弾の印。ときどき瞬く */
    var neon = Math.sin(t * 9) * Math.sin(t * 2.3) > -.85;
    var bx = cx - 13, by = top - 16;
    rect(bx + 4, by + 9, 1, 7, '#2a3038'); rect(bx + 21, by + 9, 1, 7, '#2a3038');
    rect(bx, by, 26, 10, '#14181c'); rect(bx + 1, by + 1, 24, 8, '#24101e');
    if (neon) glowAt(cx, by + 5, 16, '#ff5a3a', .35);
    var nc = neon ? '#ff7a50' : '#5a2a22';
    rect(bx + 4, by + 3, 8, 4, nc); rect(bx + 12, by + 4, 2, 2, nc);      // 銃弾
    rect(bx + 16, by + 3, 6, 1, nc); rect(bx + 16, by + 5, 6, 1, nc); rect(bx + 16, by + 7, 4, 1, nc);
    /* 店の前に停めた戦車 */
    var tx = L - 46, ty = gy;
    rect(tx, ty - 8, 36, 6, '#3e4a3a'); rect(tx, ty - 8, 36, 1, '#5e6e56');
    rect(tx - 2, ty - 3, 40, 3, '#14181c');
    for (var wx2 = tx + 1; wx2 < tx + 37; wx2 += 6) px(wx2, ty - 2, '#48535e');
    rect(tx + 10, ty - 14, 16, 6, '#4a5844'); rect(tx + 10, ty - 14, 16, 1, '#6e7e64');
    rect(tx + 26, ty - 12, 16, 2, '#3e4a3a');
    rect(tx + 14, ty - 17, 3, 3, '#2a3028');
  }

  function drawWalker() {
    if (walker.wait > 0 || !window.SCENE) return;
    SCENE.walker(g, walker.kind, walker.x, GY() + 3, Math.floor(t * 6) % 4);
  }

  function draw() {
    drawSky();
    drawFar();
    drawRuins();
    drawGround();
    drawShop();
    drawWalker();
    dust.forEach(function (p) {
      g.globalAlpha = Math.min(1, p.t) * Math.max(0, 1 - p.t / p.life) * .7;
      px(p.x, p.y, p.col);
      g.globalAlpha = 1;
    });
  }

  return { attach: attach, start: start, stop: stop };
})();
