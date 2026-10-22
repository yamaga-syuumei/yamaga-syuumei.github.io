/* ==========================================================
   人のドット絵（2頭身・見下ろしの正面向き）

   16×21 の格子に、頭・髪・胴・腕・脚・持ち物を1ドットずつ置き、最後に濃い輪郭で縁取る
   （website/alchemy の _sprites.py と同じ作り。こちらは画像を持たない方針なので実行時に組む）。
   目は光のない縦長の黒目（横1×縦2）。
   歩きは4コマ（立ち・左足・立ち・右足）。腕も脚に合わせて振る。

   人ごとの違いは下の WHO に書く。色は文字ごとに持ち、部品は style の名前で選ぶ
     S/s 肌（明・暗）  H/h 髪  T/t 上着  P/p 下  O 靴  A/a 差し色  X/x 小物
   ========================================================== */
window.SPRITES = (function () {
  'use strict';

  var W = 16, H = 21;
  var OUTLINE = '#1c1226', EYE = '#1c1226';

  var WHO = {
    /* 店主。赤いバンダナと前掛け */
    keeper:  { S: '#f4cfa8', s: '#c8936c', H: '#4a3426', h: '#2e2018', T: '#5a7a9a', t: '#3d5670',
               P: '#3a3f48', p: '#262a30', O: '#4a3426', A: '#d24a32', a: '#8a2a1e', X: '#c8a070', x: '#8e6a44',
               hair: 'bandana', outfit: 'apron' },
    /* 商人。つば広の帽子と長い外套 */
    trader:  { S: '#e8c0a0', s: '#b88a6a', H: '#2e2018', h: '#1e140e', T: '#b8863a', t: '#7e5a24',
               P: '#4a3a2a', p: '#30261c', O: '#2e2018', A: '#6a4a2a', a: '#45301a', X: '#d9a441', x: '#9a7020',
               hair: 'hat', outfit: 'coat' },
    mobA:    { S: '#f0c8a0', s: '#c49270', H: '#6a4a30', h: '#45301e', T: '#7d8a97', t: '#56626e',
               P: '#48535e', p: '#2f373f', O: '#3a2a1e', hair: 'short', outfit: 'shirt' },
    mobB:    { S: '#e0b088', s: '#b0805e', H: '#c8a060', h: '#8e6a34', T: '#8a6a74', t: '#5e4650',
               P: '#5a4650', p: '#3e2e36', O: '#3a2a1e', hair: 'long', outfit: 'shirt' },
    mobC:    { S: '#f4d0b0', s: '#c89a78', H: '#3a5a4a', h: '#24392e', T: '#5a8a6a', t: '#3a5e46',
               P: '#3a5a4a', p: '#24392e', O: '#2a2a2a', hair: 'hood', outfit: 'shirt' },

    /* 三馬鹿のリーダー。額のゴーグルと赤いマフラー。見せかけだけ立派 */
    h1:      { S: '#f4cfa8', s: '#c8936c', H: '#d8822e', h: '#9a521a', T: '#6a7a3a', t: '#4a5626',
               P: '#5a4a38', p: '#3a2e22', O: '#3a2a1e', A: '#e03919', a: '#8a2210', X: '#7de0ff', x: '#3a6a8a',
               hair: 'spiky', outfit: 'shirt', extra: ['goggles', 'scarf'] },
    /* 流れの老人。白い髭、茶の外套、杖 */
    h2:      { S: '#e8c0a0', s: '#b88a6a', H: '#f0eee8', h: '#b8b4a8', T: '#7a5a3a', t: '#523a24',
               P: '#5a4a38', p: '#3a2e22', O: '#3a2a1e', X: '#a8743e', x: '#6e4420',
               hair: 'bald', outfit: 'cloak', extra: ['beard', 'stick'] },
    /* 科学者。白衣と眼鏡、跳ねた灰色の髪 */
    h3:      { S: '#f4d8bc', s: '#c8a080', H: '#a8acb4', h: '#6e727a', T: '#eef2f6', t: '#aab4c0',
               P: '#3d5a80', p: '#263c58', O: '#2a2a2a', X: '#2a2a2a', x: '#2a2a2a', A: '#3d8be0', a: '#1f4e80',
               hair: 'messy', outfit: 'labcoat', extra: ['glasses'] },
    /* 凄腕の賞金稼ぎ。つば広の帽子とポンチョ */
    h4:      { S: '#d8a880', s: '#a87858', H: '#2a2420', h: '#1a1612', T: '#8a3a2a', t: '#5a2418',
               P: '#3a3028', p: '#241e18', O: '#2a2018', A: '#4a3a2a', a: '#2e2418', X: '#d9a441', x: '#8a6420',
               hair: 'hat', outfit: 'poncho' },
    /* 旅の整備士。後ろ向きの帽子、青いつなぎ、スパナ */
    h5:      { S: '#f0c8a0', s: '#c49270', H: '#8a5a2b', h: '#5a3a1a', T: '#e8e0d0', t: '#b0a890',
               P: '#3d6ab0', p: '#284a80', O: '#3a2a1e', A: '#e0a030', a: '#9a6a10', X: '#c8ced4', x: '#6f7c88',
               hair: 'cap', outfit: 'overalls', extra: ['wrench'] },
    /* 寡黙な狙撃手。頭巾と口当て、背中の長い銃 */
    h6:      { S: '#e8c0a0', s: '#b88a6a', H: '#4a5a3a', h: '#2e3a24', T: '#5a6a44', t: '#3a4a2c',
               P: '#3a4030', p: '#262a20', O: '#2a2418', A: '#4a5a3a', a: '#2e3a24', X: '#3a3f48', x: '#22262c',
               hair: 'hood', outfit: 'shirt', extra: ['mask', 'rifle'] }
  };
  /* 名前のない「ハンター」は、三馬鹿の絵を借りずに地味な服で描く */
  WHO.hunter = { S: '#f0c8a0', s: '#c49270', H: '#5a3a1a', h: '#3a2410', T: '#7a6a4a', t: '#54482e',
                 P: '#5a4a38', p: '#3a2e22', O: '#3a2a1e', hair: 'short', outfit: 'shirt' };

  /* ---------------------------------------------------------------- 格子 */
  function grid() {
    var g = [];
    for (var y = 0; y < H; y++) { g.push([]); for (var x = 0; x < W; x++) g[y].push('.'); }
    return g;
  }
  function put(g, x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H && c) g[y][x] = c; }
  function rect(g, x, y, w, h, c) { for (var yy = y; yy < y + h; yy++) for (var xx = x; xx < x + w; xx++) put(g, xx, yy, c); }

  /* 頭の楕円の中か */
  var HCX = 7.5, HCY = 5.6, HRX = 5.4, HRY = 4.9;
  function inHead(x, y) { var ex = (x - HCX) / HRX, ey = (y - HCY) / HRY; return ex * ex + ey * ey < 1; }

  /* ---------------------------------------------------------------- 部品 */
  /* 脚。コマで片足が持ち上がる */
  function legs(g, f) {
    var lift = { 1: 'R', 3: 'L' }[f];
    rect(g, 5, 16, 2, lift === 'L' ? 2 : 3, 'P'); put(g, 6, 16, 'p');
    rect(g, 9, 16, 2, lift === 'R' ? 2 : 3, 'P'); put(g, 9, 16, 'p');
    rect(g, 4, lift === 'L' ? 18 : 19, 3, 1, 'O');
    rect(g, 9, lift === 'R' ? 18 : 19, 3, 1, 'O');
  }
  /* 腕。歩くときは脚と逆の腕が前に出る（正面向きなので、少し下がって見える） */
  function arms(g, f, sleeve, sleeveDark) {
    var ld = f === 1 ? 1 : f === 3 ? -1 : 0, rd = -ld;
    rect(g, 3, 11, 1, 4 + Math.max(0, ld), sleeve); put(g, 3, 11, sleeveDark);
    rect(g, 12, 11, 1, 4 + Math.max(0, rd), sleeveDark);
    put(g, 3, 15 + Math.max(0, ld), 'S');
    put(g, 12, 15 + Math.max(0, rd), 's');
  }
  function torso(g, top, topDark) {
    rect(g, 4, 11, 8, 5, top);
    rect(g, 4, 11, 1, 5, topDark); rect(g, 11, 11, 1, 5, topDark);
    rect(g, 4, 15, 8, 1, topDark);
  }

  var OUTFITS = {
    shirt: function (g, f) { legs(g, f); torso(g, 'T', 't'); arms(g, f, 'T', 't'); },
    apron: function (g, f) {
      legs(g, f); torso(g, 'T', 't'); arms(g, f, 'T', 't');
      rect(g, 5, 13, 6, 4, 'X'); rect(g, 5, 16, 6, 1, 'x'); put(g, 5, 12, 'x'); put(g, 10, 12, 'x');
    },
    coat: function (g, f) {
      legs(g, f); rect(g, 4, 11, 8, 7, 'T'); rect(g, 4, 11, 1, 7, 't'); rect(g, 11, 11, 1, 7, 't');
      rect(g, 7, 12, 1, 6, 't'); arms(g, f, 'T', 't'); put(g, 7, 14, 'X');
    },
    labcoat: function (g, f) {
      legs(g, f); rect(g, 4, 11, 8, 7, 'T'); rect(g, 11, 11, 1, 7, 't'); rect(g, 4, 17, 8, 1, 't');
      rect(g, 6, 11, 4, 3, 'A'); put(g, 7, 11, 'a'); put(g, 8, 11, 'a');
      arms(g, f, 'T', 't'); put(g, 10, 13, 'X');
    },
    poncho: function (g, f) {
      legs(g, f); torso(g, 'P', 'p');
      rect(g, 2, 11, 12, 4, 'T'); rect(g, 3, 15, 10, 1, 'T'); rect(g, 2, 14, 12, 1, 't'); rect(g, 3, 15, 10, 1, 't');
      for (var x = 3; x < 13; x += 3) put(g, x, 12, 'X');
      put(g, 3, 16, 'S'); put(g, 12, 16, 's');
    },
    overalls: function (g, f) {
      legs(g, f); torso(g, 'T', 't'); arms(g, f, 'T', 't');
      rect(g, 5, 13, 6, 3, 'P'); put(g, 5, 11, 'P'); put(g, 5, 12, 'P'); put(g, 10, 11, 'P'); put(g, 10, 12, 'P');
      put(g, 7, 14, 'A');
    },
    cloak: function (g, f) {
      legs(g, f); rect(g, 3, 11, 10, 7, 'T'); rect(g, 3, 11, 1, 7, 't'); rect(g, 12, 11, 1, 7, 't');
      rect(g, 3, 17, 10, 1, 't'); put(g, 3, 15, 'S'); put(g, 12, 15, 's');
    }
  };

  /* 髪。顔の楕円の上に被せる */
  var HAIRS = {
    short: function (g) {
      for (var y = 0; y < 11; y++) for (var x = 0; x < W; x++) {
        if (!inHead(x, y)) continue;
        if (y <= 3 || (y <= 5 && (x <= 3 || x >= 12)) || (y === 4 && x % 3 !== 1)) put(g, x, y, x >= 11 ? 'h' : 'H');
      }
    },
    long: function (g) {
      HAIRS.short(g);
      rect(g, 2, 5, 2, 7, 'H'); rect(g, 12, 5, 2, 7, 'h');
    },
    spiky: function (g) {
      HAIRS.short(g);
      [[3, 0], [6, -1], [9, 0], [12, 1]].forEach(function (p) { put(g, p[0], p[1] + 1, 'H'); put(g, p[0] + 1, p[1] + 1, 'h'); put(g, p[0], p[1], 'H'); });
    },
    messy: function (g) {
      HAIRS.short(g);
      [[1, 3], [2, 1], [5, 0], [10, 0], [13, 1], [14, 4], [1, 6], [14, 7]].forEach(function (p) { put(g, p[0], p[1], 'H'); });
    },
    bald: function (g) {
      put(g, 5, 2, 'S'); put(g, 6, 2, 'S');        // 頭のてかり
      rect(g, 2, 5, 2, 3, 'H'); rect(g, 12, 5, 2, 3, 'h');
      put(g, 4, 5, 'H'); put(g, 5, 5, 'H'); put(g, 10, 5, 'H'); put(g, 11, 5, 'h');   // 白い眉
    },
    bandana: function (g) {
      HAIRS.short(g);
      for (var x = 2; x < 14; x++) for (var y = 1; y <= 3; y++) if (inHead(x, y)) put(g, x, y, y === 3 ? 'a' : 'A');
      put(g, 13, 3, 'A'); put(g, 14, 3, 'A'); put(g, 14, 4, 'a'); put(g, 15, 5, 'a');
    },
    hat: function (g) {
      HAIRS.short(g);
      rect(g, 0, 3, 16, 1, 'A'); rect(g, 1, 4, 14, 1, 'a');
      rect(g, 4, 0, 8, 3, 'A'); rect(g, 4, 2, 8, 1, 'X'); rect(g, 11, 0, 1, 3, 'a');
    },
    cap: function (g) {
      HAIRS.short(g);
      for (var x = 2; x < 14; x++) for (var y = 0; y <= 3; y++) if (inHead(x, y)) put(g, x, y, 'A');
      rect(g, 3, 3, 10, 1, 'a'); rect(g, 0, 4, 3, 1, 'a');      // 後ろ向きのつば
    },
    hood: function (g) {
      for (var y = 0; y < 12; y++) for (var x = 0; x < W; x++) {
        var ex = (x - HCX) / (HRX + 1.2), ey = (y - HCY) / (HRY + 1.0);
        if (ex * ex + ey * ey >= 1) continue;
        if (!inHead(x, y) || y <= 3 || x <= 3 || x >= 12) put(g, x, y, x >= 10 ? 'h' : 'H');
      }
    }
  };

  var EXTRAS = {
    goggles: function (g) { rect(g, 2, 3, 12, 1, 'x'); rect(g, 4, 3, 2, 1, 'X'); rect(g, 9, 3, 2, 1, 'X'); },
    scarf: function (g) { rect(g, 4, 11, 8, 1, 'A'); rect(g, 10, 12, 2, 2, 'a'); put(g, 11, 14, 'a'); },
    beard: function (g) {
      for (var y = 8; y <= 13; y++) for (var x = 3; x <= 12; x++) {
        if ((y >= 10 || inHead(x, y)) && Math.abs(x - 7.5) <= 5 - (y - 8) * 0.6) put(g, x, y, x >= 9 ? 'h' : 'H');
      }
    },
    stick: function (g) { for (var y = 9; y < 20; y++) put(g, 14, y, y < 11 ? 'X' : 'x'); },
    glasses: function (g) { rect(g, 4, 6, 3, 1, 'X'); rect(g, 9, 6, 3, 1, 'X'); put(g, 7, 6, 'X'); put(g, 8, 6, 'X'); },
    wrench: function (g) { put(g, 13, 13, 'X'); put(g, 13, 14, 'x'); put(g, 13, 15, 'x'); put(g, 14, 12, 'X'); put(g, 12, 12, 'X'); },
    mask: function (g) { rect(g, 4, 8, 8, 2, 'X'); rect(g, 5, 10, 6, 1, 'x'); },
    rifle: function (g) { for (var i = 0; i < 13; i++) put(g, 1 + i, 17 - i, i > 10 ? 'X' : 'x'); }
  };
  var BEHIND = { rifle: true };     // 体より先に描く持ち物

  /* 1コマを文字の格子で組む */
  function build(id, f) {
    var w = WHO[id] || WHO.hunter, g = grid();
    (w.extra || []).forEach(function (e) { if (BEHIND[e]) EXTRAS[e](g); });
    (OUTFITS[w.outfit] || OUTFITS.shirt)(g, f);
    for (var y = 0; y < 11; y++) for (var x = 0; x < W; x++) {
      if (inHead(x, y)) put(g, x, y, (x >= 11 || y >= 9) ? 's' : 'S');
    }
    (HAIRS[w.hair] || HAIRS.short)(g);
    put(g, 5, 6, 'E'); put(g, 5, 7, 'E'); put(g, 10, 6, 'E'); put(g, 10, 7, 'E');
    (w.extra || []).forEach(function (e) { if (!BEHIND[e]) EXTRAS[e](g); });
    /* 輪郭。何も無いマスのうち、上下左右に何かがあれば縁取る */
    var out = g.map(function (r) { return r.slice(); });
    for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
      if (g[yy][xx] !== '.') continue;
      if ((xx > 0 && g[yy][xx - 1] !== '.') || (xx < W - 1 && g[yy][xx + 1] !== '.') ||
          (yy > 0 && g[yy - 1][xx] !== '.') || (yy < H - 1 && g[yy + 1][xx] !== '.')) out[yy][xx] = 'K';
    }
    return out;
  }

  var cache = {};
  function sheet(id, f) {
    var key = id + f;
    if (cache[key]) return cache[key];
    var w = WHO[id] || WHO.hunter, rows = build(id, f);
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');
    for (var y = 0; y < H; y++) for (var i = 0; i < W; i++) {
      var ch = rows[y][i];
      if (ch === '.') continue;
      x.fillStyle = ch === 'K' ? OUTLINE : ch === 'E' ? EYE : (w[ch] || '#ff00ff');
      x.fillRect(i, y, 1, 1);
    }
    cache[key] = c;
    return c;
  }

  /* 足元を (x, y) に合わせて描く。f は歩きのコマ（0〜3） */
  function walker(g, id, x, y, f) {
    g.drawImage(sheet(id, (f || 0) % 4), Math.round(x) - 8, Math.round(y) - (H - 1));
  }
  /* 左上を (x, y) にして描く */
  function draw(g, id, x, y, f) { g.drawImage(sheet(id, f || 0), Math.round(x), Math.round(y)); }

  return { walker: walker, draw: draw, sheet: sheet, has: function (id) { return !!WHO[id]; }, W: W, H: H };
})();
