/* ==========================================================
   戦場の絵

   戦闘の上に、荒野を横から見た景色を出す。左に自分の車、右に敵。
   撃つたびに弾が飛び、当たれば爆ぜて数字が跳ねる。被弾すれば車が揺れる。
   勝敗は game.js が決める。ここは見せるだけで、戦闘の数値には触らない。

   - 低い解像度の「ドット」で考え、描くときに整数倍に引き伸ばす（数字だけは画面の解像度で描く）
   - 弾の飛ぶ速さは戦闘の速度（x1/x2/x4）に合わせる。遅いままだと弾が溜まって因果がずれる
   - 画面を描けない環境でも戦闘は進む（こちらは requestAnimationFrame で回すだけ）

   SCENE.start({ foe, chassis, type, floor, speed })   戦闘の始まり
   SCENE.shot(kind, dealt, { miss, big })              自分の武器が撃った
   SCENE.foeShot(dealt, salvo)                         敵の攻撃
   SCENE.ram(dealt) / SCENE.trump() / SCENE.end(win) / SCENE.speed(v)
   ========================================================== */
window.SCENE = (function () {
  'use strict';

  var cv = null, g = null;
  var S = 3, LW = 240, LH = 72, cssW = 0, cssH = 0;
  var raf = 0, last = 0, T = 0;
  var st = null;                 // いまの戦闘の見た目の状態

  function noMotion() { return document.documentElement.classList.contains('no-motion'); }

  function mount(canvas) {
    cv = canvas;
    g = cv.getContext('2d');
  }

  /* 見えている大きさに合わせてキャンバスを作り直す。1ドットは3画素前後 */
  function fit() {
    var r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    var dpr = window.devicePixelRatio || 1;
    if (r.width === cssW && r.height === cssH && cv.width === Math.round(r.width * dpr)) return true;
    cssW = r.width; cssH = r.height;
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    S = Math.max(2, Math.round(cssH / LH)) * dpr;
    LW = Math.ceil(cv.width / S);
    g.imageSmoothingEnabled = false;
    return true;
  }

  /* ---------------------------------------------------------- 景色
     階を登るほど日が傾く。1階は昼、ボスの階は夜 */
  var SKIES = [
    ['#7fb6d8', '#e8d6a8'], ['#8aa8d0', '#f0c890'], ['#6a7ab8', '#f4a070'],
    ['#4a4a88', '#e07a5a'], ['#241e48', '#8a3a4a'], ['#0e0c22', '#3a2448']
  ];
  function skyOf(floor) { return SKIES[Math.min(SKIES.length - 1, Math.floor((floor - 1) / 2))]; }

  function mix(a, b, k) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    function c(s) { return Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k); }
    return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
  }
  function rect(x, y, w, h, col) { g.fillStyle = col; g.fillRect(Math.round(x) * S, Math.round(y) * S, Math.round(w) * S, Math.round(h) * S); }
  function ridge(base, amp, period, col, seed, off) {
    g.fillStyle = col;
    for (var x = 0; x < LW; x++) {
      var u = (x + off) / period;
      var h = Math.sin(u * 2.1 + seed) * .5 + Math.sin(u * 5.3 + seed * 2) * .3 + Math.sin(u * 11.7 + seed) * .2;
      var top = Math.round(base - amp * (h * .5 + .5));
      g.fillRect(x * S, top * S, S, (LH - top) * S);
    }
  }
  var GY = function () { return LH - 13; };   // 地面の高さ

  function drawBack() {
    var sky = skyOf(st.floor), gy = GY(), n = 6;
    for (var i = 0; i < n; i++) {
      var y0 = Math.floor(gy * i / n), y1 = Math.floor(gy * (i + 1) / n);
      rect(0, y0, LW, y1 - y0, mix(sky[0], sky[1], i / (n - 1)));
    }
    /* 夜は星、昼は太陽 */
    if (st.floor >= 9) {
      for (var k = 0; k < 40; k++) {
        if ((T * 2 + k) % 9 < 7) rect((k * 37 + 11) % LW, (k * 13 + 3) % (gy - 20), 1, 1, k % 3 ? '#ffffff' : '#ffe8a0');
      }
      rect(LW * .82, 8, 6, 6, '#f4f0d8'); rect(LW * .82 + 3, 8, 3, 3, mix(sky[0], sky[1], .1));
    } else {
      var sx = LW * (.15 + st.floor * .055), sy = 10 + st.floor * 2.2;
      g.globalAlpha = .35; rect(sx - 3, sy - 3, 12, 12, '#fff4c0'); g.globalAlpha = 1;
      rect(sx, sy, 6, 6, '#fff0b0'); rect(sx + 1, sy + 1, 4, 4, '#ffffff');
    }
    /* 遠くの台地と砂丘。風で砂丘だけゆっくり流れる */
    ridge(gy - 14, 12, 70, mix(sky[1], '#5a3a3a', .55), 1.3, 0);
    ridge(gy - 4, 6, 34, mix(sky[1], '#8a5a3a', .45), 4.1, T * 2);
    rect(0, gy, LW, LH - gy, '#b08a52');
    rect(0, gy, LW, 1, '#d8b47a');
    for (var x = 0; x < LW + 8; x += 8) {
      var xx = Math.round(x - (T * 6) % 8);
      rect(xx, gy + 3, 3, 1, '#9a7442'); rect(xx + 5, gy + 7, 2, 1, '#9a7442'); rect(xx + 2, gy + 10, 1, 1, '#c8a06a');
    }
    /* 轍 */
    rect(0, gy + 5, LW, 1, '#a07c48');
  }

  /* ---------------------------------------------------------- 車と敵の位置 */
  function meBox() {
    var sp = st.meSp;
    return { x: Math.round(LW * .14) + st.meX, y: GY() - sp.height + 2, w: sp.width, h: sp.height };
  }
  function foeBox() {
    var sp = st.foeSp;
    var fly = st.foe === 'drone' ? 8 + Math.round(Math.sin(T * 3) * 2) : 0;
    return { x: Math.round(LW * .80 - sp.width / 2) + st.foeX, y: GY() - sp.height + 3 - fly, w: sp.width, h: sp.height };
  }
  /* 砲口の高さは車体ごとに違う（art.js の vehicleArt と揃える） */
  var MUZZLE_Y = { ch_jeep: 5, ch_apc: 10, ch_ogre: 9 };
  function muzzle() { var b = meBox(); return { x: b.x + b.w + 1, y: b.y + (MUZZLE_Y[st.meId] || 9) }; }
  function foeMid() { var b = foeBox(); return { x: b.x + b.w * .45, y: b.y + b.h * .55 }; }

  /* ---------------------------------------------------------- 一度きりの演出 */
  function puff(x, y, n, cols, sp, life, up) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.28, v = sp * (.4 + Math.random() * .8);
      st.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (up || 0), t: 0,
        life: life * (.6 + Math.random() * .6), col: cols[(Math.random() * cols.length) | 0], g: up ? -20 : 60 });
    }
  }
  function boom(x, y, size) {
    st.booms.push({ x: x, y: y, r: size, t: 0 });
    puff(x, y, 6 + size * 2, ['#ffffff', '#ffe08a', '#ffa040', '#ff6a3a'], 30 + size * 8, .45);
    puff(x, y, 3 + size, ['#6a5a50', '#8a7a6a', '#4a4040'], 10 + size * 2, 1.1, 8);
    shake(size * .8);
    if (size >= 5 && !noMotion()) st.stop = .07;     // 大きな爆ぜは一瞬止めて重さを出す
  }
  function shake(n) { if (!noMotion()) st.shake = Math.max(st.shake, n); }

  function pop(x, y, text, kind) {
    st.pops.push({ x: x, y: y, text: text, kind: kind, t: 0, dx: (Math.random() - .5) * 10 });
    if (st.pops.length > 8) st.pops.shift();
  }

  /* 自分の武器の弾。副砲は曳光弾、主砲は砲弾、特殊は煙を引くミサイル */
  function shot(kind, dealt, o) {
    if (!st) return;
    o = o || {};
    var m = muzzle(), t = foeMid();
    t.y += (Math.random() - .5) * 8;
    st.flash = 1;
    st.meKick = kind === 'sub' ? 1 : 2;
    puff(m.x, m.y, kind === 'sub' ? 2 : 5, ['#ffffff', '#ffe08a', '#ffb040'], 25, .18);
    var dur = (kind === 'sub' ? .16 : kind === 'main' ? .3 : .55) / st.speed;
    var arc = kind === 'special' ? -26 : kind === 'main' ? -6 : 0;
    st.shots.push({ kind: kind, x0: m.x, y0: m.y, x1: t.x + (o.miss ? 10 : 0), y1: o.miss ? GY() + 2 : t.y,
      arc: arc, t: 0, dur: dur, dealt: dealt, miss: !!o.miss, big: !!o.big, mine: true });
  }

  function foeShot(dealt, salvo) {
    if (!st) return;
    var f = foeBox(), me = meBox();
    var n = salvo ? 4 : 1;
    for (var i = 0; i < n; i++) {
      st.shots.push({ kind: salvo ? 'special' : 'foe', x0: f.x + 4, y0: f.y + f.h * .4 - i * 2,
        x1: me.x + me.w * .5 + (i - 1.5) * 4, y1: me.y + me.h * .5, arc: salvo ? -30 - i * 4 : -4,
        t: -i * .08 / st.speed, dur: (salvo ? .6 : .35) / st.speed, dealt: i === n - 1 ? dealt : 0, mine: false, big: salvo });
    }
    st.foeKick = 2;
  }

  function ram(dealt) {
    if (!st) return;
    st.ramT = .35;
    pop(foeMid().x, foeMid().y - 10, String(dealt), 'foe');
  }

  function trump() {
    if (!st) return;
    st.trumpT = 1.2;
    var c = foeMid();
    st.rings.push({ x: c.x, y: c.y, t: 0, col: '#ff5a3c' });
    shake(3);
  }

  function end(win) {
    if (!st) return;
    st.ended = win ? 'win' : 'lose';
    st.endT = 0;
    if (win) {
      var c = foeMid();
      for (var i = 0; i < 4; i++) {
        (function (k) {
          setTimeout(function () {
            if (!st) return;
            boom(c.x + (Math.random() - .5) * 24, c.y + (Math.random() - .5) * 14, k === 3 ? 7 : 4);
          }, k * 180);
        })(i);
      }
    } else {
      var m = meBox();
      boom(m.x + m.w / 2, m.y + m.h / 2, 5);
    }
  }

  function speed(v) { if (st) st.speed = v || 1; }

  /* ---------------------------------------------------------- 毎フレーム */
  function step(dt) {
    if (st.stop > 0) { st.stop -= dt; return; }
    T += dt;
    if (st.meX < 0) st.meX = Math.min(0, st.meX + dt * 90);
    if (st.foeX > 0) st.foeX = Math.max(0, st.foeX - dt * 90);
    st.flash = Math.max(0, st.flash - dt * 8);
    st.meKick = Math.max(0, st.meKick - dt * 12);
    st.foeKick = Math.max(0, st.foeKick - dt * 10);
    st.hurtMe = Math.max(0, st.hurtMe - dt * 5);
    st.hurtFoe = Math.max(0, st.hurtFoe - dt * 6);
    st.shake = Math.max(0, st.shake - dt * 14);
    st.trumpT = Math.max(0, st.trumpT - dt);
    st.ramT = Math.max(0, st.ramT - dt);
    if (st.ended) st.endT += dt;

    st.shots = st.shots.filter(function (s) {
      s.t += dt;
      if (s.t < 0) return true;
      /* 煙の尾 */
      if (s.kind === 'special' && Math.random() < .8) {
        var p = posOf(s);
        st.parts.push({ x: p.x, y: p.y, vx: 0, vy: -4, t: 0, life: .5, col: '#d8d0c8', g: -6 });
      }
      if (s.t < s.dur) return true;
      var e = posOf(s, 1);
      if (s.mine) {
        if (s.miss) { puff(e.x, e.y, 6, ['#d8b47a', '#c8a06a', '#a07c48'], 18, .5, 6); pop(e.x, e.y - 8, 'MISS', 'miss'); }
        else {
          boom(e.x, e.y, s.kind === 'special' ? 5 : s.kind === 'main' ? 3 : 1);
          st.hurtFoe = 1;
          if (s.dealt) pop(e.x, e.y - 8, String(s.dealt), s.big || s.kind === 'special' ? 'big' : 'foe');
        }
      } else {
        boom(e.x, e.y, s.big ? 4 : 2);
        st.hurtMe = 1;
        if (s.dealt) pop(e.x, e.y - 10, '-' + s.dealt, s.big ? 'mebig' : 'me');
      }
      return false;
    });
    st.parts = st.parts.filter(function (p) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= Math.pow(.2, dt);
      return p.t < p.life;
    });
    st.booms = st.booms.filter(function (b) { b.t += dt; return b.t < .4; });
    st.rings = st.rings.filter(function (r) { r.t += dt; return r.t < .7; });
    st.pops = st.pops.filter(function (p) { p.t += dt; return p.t < .9; });
    /* 負けたあとは車から煙 */
    if (st.ended === 'lose' && Math.random() < dt * 12) {
      var m = meBox();
      st.parts.push({ x: m.x + m.w * (.3 + Math.random() * .4), y: m.y + 4, vx: 3, vy: -8, t: 0, life: 1.4, col: '#4a4040', g: -4 });
    }
  }

  function posOf(s, k) {
    var u = k == null ? Math.min(1, Math.max(0, s.t / s.dur)) : k;
    return { x: s.x0 + (s.x1 - s.x0) * u, y: s.y0 + (s.y1 - s.y0) * u + s.arc * 4 * u * (1 - u) };
  }

  /* 白く光らせた絵を作る。当たった瞬間に一瞬だけ使う */
  var whiteCache = {};
  function white(sp, key) {
    if (whiteCache[key]) return whiteCache[key];
    var c = document.createElement('canvas');
    c.width = sp.width; c.height = sp.height;
    var x = c.getContext('2d');
    x.drawImage(sp, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
    whiteCache[key] = c;
    return c;
  }

  function sprite(sp, x, y, flip) {
    g.save();
    if (flip) { g.translate((x + sp.width) * S, y * S); g.scale(-1, 1); g.drawImage(sp, 0, 0, sp.width * S, sp.height * S); }
    else g.drawImage(sp, x * S, y * S, sp.width * S, sp.height * S);
    g.restore();
  }

  function draw() {
    g.save();
    if (st.shake > 0) g.translate(Math.round((Math.random() - .5) * st.shake * 2) * S / 2, Math.round((Math.random() - .5) * st.shake * 2) * S / 2);
    drawBack();

    /* 敵。勝ったら沈んで消える */
    var f = foeBox();
    var fx = f.x + Math.round(st.foeKick) - (st.hurtFoe > .5 ? -2 : 0);
    if (st.ended === 'win') {
      g.globalAlpha = Math.max(0, 1 - st.endT * 1.2);
      f.y += Math.round(st.endT * 10);
    }
    rect(fx + 4, GY() + 1, f.w - 8, 2, 'rgba(40,24,10,.35)');
    if (st.trumpT > 0) {
      var a = .25 + .2 * Math.sin(T * 30);
      var grd = g.createRadialGradient((fx + f.w / 2) * S, (f.y + f.h / 2) * S, 2, (fx + f.w / 2) * S, (f.y + f.h / 2) * S, f.w * S);
      grd.addColorStop(0, 'rgba(255,70,50,' + a + ')'); grd.addColorStop(1, 'rgba(255,70,50,0)');
      g.fillStyle = grd; g.fillRect((fx - f.w / 2) * S, (f.y - f.h / 2) * S, f.w * 2 * S, f.h * 2 * S);
    }
    sprite(st.hurtFoe > .6 ? white(st.foeSp, 'f' + st.foe) : st.foeSp, fx, f.y, true);
    g.globalAlpha = 1;

    /* 自分の車。撃つと反動で下がり、被弾で揺れる */
    var m = meBox();
    var mx = m.x - Math.round(st.meKick) + (st.ramT > 0 ? Math.round(Math.sin(st.ramT / .35 * Math.PI) * 30) : 0);
    var my = m.y + (st.hurtMe > .3 ? (Math.random() < .5 ? -1 : 1) : 0) + (Math.sin(T * 14) > .9 ? 1 : 0);
    rect(mx + 3, GY() + 1, m.w - 6, 2, 'rgba(40,24,10,.35)');
    sprite(st.hurtMe > .7 ? white(st.meSp, 'me') : st.meSp, mx, my, false);
    if (st.flash > 0) {
      var mz = muzzle();
      g.globalAlpha = st.flash;
      rect(mz.x - st.meKick, mz.y - 2, 4, 5, '#fff4c0'); rect(mz.x + 3 - st.meKick, mz.y - 1, 3, 3, '#ffb040');
      g.globalAlpha = 1;
    }

    /* 弾 */
    st.shots.forEach(function (s) {
      if (s.t < 0) return;
      var p = posOf(s);
      if (s.kind === 'sub') { rect(p.x - 3, p.y, 4, 1, '#fff4a0'); rect(p.x - 6, p.y, 3, 1, 'rgba(255,200,80,.5)'); }
      else if (s.kind === 'main') { rect(p.x - 1, p.y - 1, 3, 2, '#ffe08a'); rect(p.x - 4, p.y, 3, 1, 'rgba(255,170,60,.6)'); }
      else if (s.kind === 'special') { rect(p.x - 2, p.y - 1, 4, 2, '#e8e8f0'); rect(p.x - 3, p.y - 1, 1, 2, '#ff7a3a'); }
      else { rect(p.x - 1, p.y - 1, 3, 3, '#ff6a4a'); rect(p.x, p.y, 1, 1, '#ffe0c0'); }
    });

    /* 爆ぜ */
    st.booms.forEach(function (b) {
      var k = b.t / .4, r = b.r * (1 + k * 1.6);
      g.globalAlpha = 1 - k;
      g.fillStyle = k < .3 ? '#ffffff' : k < .6 ? '#ffe08a' : '#ff8a3a';
      g.beginPath(); g.arc(b.x * S, b.y * S, r * S, 0, 7); g.fill();
      g.globalAlpha = 1;
    });
    st.rings.forEach(function (rg) {
      var k = rg.t / .7;
      g.globalAlpha = 1 - k; g.strokeStyle = rg.col; g.lineWidth = S;
      g.beginPath(); g.arc(rg.x * S, rg.y * S, (6 + k * 40) * S, 0, 7); g.stroke();
      g.globalAlpha = 1;
    });
    st.parts.forEach(function (p) {
      g.globalAlpha = Math.max(0, 1 - p.t / p.life);
      rect(p.x, p.y, 1, 1, p.col);
    });
    g.globalAlpha = 1;
    g.restore();

    /* 数字は画面の解像度で描く */
    st.pops.forEach(function (p) {
      var k = p.t / .9;
      var big = p.kind === 'big' || p.kind === 'mebig';
      var size = Math.round((big ? 15 : 11) * S / 3 * (k < .12 ? 1 + (.12 - k) * 4 : 1));
      g.font = '900 ' + size + 'px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      var x = (p.x + p.dx * k) * S, y = (p.y - k * 14 - Math.sin(Math.min(1, k * 3) * Math.PI) * 4) * S;
      g.globalAlpha = Math.max(0, 1 - k * k);
      g.lineWidth = Math.max(3, S); g.strokeStyle = 'rgba(20,12,6,.9)'; g.strokeText(p.text, x, y);
      g.fillStyle = p.kind === 'miss' ? '#e8eef4' : p.kind === 'me' || p.kind === 'mebig' ? '#ff8a70' : big ? '#ffd23c' : '#fff0b0';
      g.fillText(p.text, x, y);
      g.globalAlpha = 1;
    });

    /* 決着の文字 */
    if (st.ended && st.endT > .5) {
      var k2 = Math.min(1, (st.endT - .5) * 3);
      g.globalAlpha = k2;
      g.font = '900 ' + Math.round(20 * S / 3) + 'px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      var txt = st.ended === 'win' ? '撃破！' : '走行不能';
      g.lineWidth = S * 2; g.strokeStyle = 'rgba(20,12,6,.9)';
      g.strokeText(txt, LW * S / 2, LH * S * .32);
      g.fillStyle = st.ended === 'win' ? '#ffd23c' : '#ff8a70';
      g.fillText(txt, LW * S / 2, LH * S * .32);
      g.globalAlpha = 1;
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!st || !cv) return;
    if (!last) last = now;
    var dt = Math.min(.05, (now - last) / 1000);
    last = now;
    if (!cv.offsetParent || !fit()) return;     // 戦闘の画面が隠れている間は描かない
    step(dt);
    draw();
  }

  function start(o) {
    if (!cv || !window.ART) return;
    st = {
      foe: o.foe, floor: o.floor || 1, type: o.type, speed: o.speed || 1,
      foeSp: window.ART.enemy(o.foe), meSp: window.ART.chassis(o.chassis), meId: o.chassis && o.chassis.id,
      meX: -60, foeX: 60, flash: 0, meKick: 0, foeKick: 0, hurtMe: 0, hurtFoe: 0, shake: 0,
      trumpT: 0, ramT: 0, ended: null, endT: 0,
      shots: [], parts: [], booms: [], rings: [], pops: []
    };
    whiteCache = {};
    if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
  }

  return { mount: mount, start: start, shot: shot, foeShot: foeShot, ram: ram, trump: trump, end: end, speed: speed,
    state: function () { return st && { shots: st.shots.length, parts: st.parts.length, pops: st.pops.length, ended: st.ended, LW: LW, S: S }; } };
})();
