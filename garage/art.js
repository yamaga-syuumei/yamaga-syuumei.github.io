/* ==========================================================
   ドット絵

   画像ファイルは持たない。実行時にここで canvas に描く。
   tank/art.js と同じ方針・同じ描画ヘルパを使っている。

   - 1マス16px。表示は2〜3倍に引き伸ばす
   - 1マテリアルにつき5段の明暗（ramp）を持たせる
   - 光は左上から当てる
   ========================================================== */
window.ART = (function () {
  'use strict';

  /* ==========================================================
     描画ヘルパ
     ========================================================== */
  function make(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    var api = {
      w: w, h: h, g: g,
      r: function (x, y, rw, rh, col) { g.fillStyle = col; g.fillRect(x | 0, y | 0, rw | 0, rh | 0); },
      p: function (x, y, col) { g.fillStyle = col; g.fillRect(x | 0, y | 0, 1, 1); },
      dots: function (list, col) { list.forEach(function (d) { api.p(d[0], d[1], col); }); },
      blob: function (cx, cy, rx, ry, col) {
        for (var y = -ry; y <= ry; y++) {
          var t = 1 - (y * y) / (ry * ry + 0.0001);
          if (t <= 0) continue;
          var half = Math.round(rx * Math.sqrt(t));
          api.r(cx - half, cy + y, half * 2 + 1, 1, col);
        }
      }
    };
    draw(api);
    return c;
  }

  /* 明暗。明るい側は黄へ、暗い側は青へ寄せると濁らない */
  function tone(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var wr = amt > 0 ? 1.18 : 0.86;
    var wb = amt > 0 ? 0.66 : 1.22;
    function c(v) { return Math.max(0, Math.min(255, Math.round(v))); }
    r = c(r + amt * wr); g = c(g + amt); b = c(b + amt * wb);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function ramp(base) {
    return [tone(base, -54), tone(base, -27), base, tone(base, 27), tone(base, 54)];
  }

  var OUT = '#14181d';
  var STEEL = ramp('#78828e');
  var SAND = ramp('#a88855');
  var RUST = ramp('#8a5334');

  /* ==========================================================
     部品

     shape は ['##','#.'] のような文字列配列。
     回転は game.js 側が canvas を90度ずつ回して描くので、
     ここでは常に回転0の絵だけを作る。
     ========================================================== */
  var CELL = 16;

  function maskOf(shape) {
    return shape.map(function (row) {
      return row.split('').map(function (ch) { return ch === '#'; });
    });
  }

  /* 枠と面。マスの外周にだけ輪郭を置く */
  function plate(a, m, R) {
    var rows = m.length, cols = m[0].length;
    function at(x, y) { return y >= 0 && y < rows && x >= 0 && x < cols && m[y][x]; }

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        if (!m[y][x]) continue;
        var px = x * CELL, py = y * CELL;
        a.r(px, py, CELL, CELL, R[2]);
        /* 面のざらつき */
        a.dots([[px + 3, py + 5], [px + 10, py + 3], [px + 6, py + 12], [px + 13, py + 9]], R[1]);
        a.dots([[px + 5, py + 4], [px + 11, py + 11]], R[3]);

        /* 外周だけ輪郭・内側の境目は薄い線 */
        if (!at(x, y - 1)) { a.r(px, py, CELL, 1, OUT); a.r(px, py + 1, CELL, 1, R[4]); }
        else { a.r(px, py, CELL, 1, R[1]); }
        if (!at(x, y + 1)) { a.r(px, py + CELL - 1, CELL, 1, OUT); a.r(px, py + CELL - 2, CELL, 1, R[0]); }
        if (!at(x - 1, y)) { a.r(px, py, 1, CELL, OUT); a.r(px + 1, py, 1, CELL, R[3]); }
        else { a.r(px, py, 1, CELL, R[1]); }
        if (!at(x + 1, y)) { a.r(px + CELL - 1, py, 1, CELL, OUT); a.r(px + CELL - 2, py, 1, CELL, R[0]); }

        /* リベット */
        a.p(px + 3, py + 3, R[4]); a.p(px + 3, py + 4, R[0]);
        a.p(px + CELL - 4, py + 3, R[4]); a.p(px + CELL - 4, py + 4, R[0]);
      }
    }
  }

  /* 砲身。形の中心の高さに、右へ突き出す */
  function barrel(a, m, thick, R, muzzle) {
    var rows = m.length, cols = m[0].length;
    var cy = Math.floor(rows * CELL / 2) - Math.floor(thick / 2);
    var x0 = Math.floor(cols * CELL * 0.30);
    var x1 = cols * CELL - 1;
    a.r(x0, cy - 1, x1 - x0, thick + 2, OUT);
    a.r(x0, cy, x1 - x0 - 1, thick, R[2]);
    a.r(x0, cy, x1 - x0 - 1, 1, R[4]);
    a.r(x0, cy + thick - 1, x1 - x0 - 1, 1, R[0]);
    if (muzzle) {
      a.r(x1 - 4, cy - 2, 3, thick + 4, OUT);
      a.r(x1 - 4, cy - 1, 2, thick + 2, R[3]);
    }
    /* 砲塔側の付け根 */
    a.r(x0 - 2, cy - 2, 3, thick + 4, OUT);
    a.r(x0 - 1, cy - 1, 2, thick + 2, R[3]);
  }

  var partDetail = {
    engine: function (a, m, R) {
      var cols = m[0].length, rows = m.length;
      /* シリンダーを並べる */
      for (var i = 0; i < cols; i++) {
        var x = i * CELL + 4;
        var y = rows * CELL - 11;
        a.r(x, y - 1, 8, 9, OUT);
        a.r(x + 1, y, 6, 7, STEEL[2]);
        a.r(x + 1, y, 6, 1, STEEL[4]);
        a.r(x + 1, y + 6, 6, 1, STEEL[0]);
        a.r(x + 3, y - 4, 2, 4, OUT);
        a.r(x + 3, y - 3, 1, 3, STEEL[3]);
      }
      /* 排気口 */
      a.r(cols * CELL - 6, 3, 4, 5, OUT);
      a.r(cols * CELL - 5, 4, 2, 3, RUST[2]);
    },
    cunit: function (a, m, R) {
      var cx = m[0].length * CELL / 2, cy = m.length * CELL / 2;
      a.r(cx - 5, cy - 5, 10, 10, OUT);
      a.r(cx - 4, cy - 4, 8, 8, tone(R[2], 30));
      a.r(cx - 3, cy - 3, 6, 6, OUT);
      a.r(cx - 2, cy - 2, 4, 4, '#a8ffd8');
      a.r(cx - 2, cy - 2, 4, 1, '#ffffff');
      /* 端子 */
      [-6, -3, 0, 3].forEach(function (d) {
        a.p(cx - 6, cy + d + 1, R[4]); a.p(cx + 5, cy + d + 1, R[4]);
      });
    },
    main: function (a, m, R) { barrel(a, m, 5, STEEL, true); },
    sub: function (a, m, R) {
      barrel(a, m, 3, STEEL, false);
      /* 弾帯 */
      var rows = m.length;
      var y = Math.floor(rows * CELL / 2) + 4;
      a.r(2, y, 7, 3, OUT);
      a.r(3, y + 1, 5, 1, ramp('#b09030')[3]);
    },
    special: function (a, m, R) {
      var cols = m[0].length, rows = m.length;
      var cy = Math.floor(rows * CELL / 2);
      /* 発射管を上下に2本 */
      [cy - 5, cy + 1].forEach(function (y) {
        a.r(3, y - 1, cols * CELL - 5, 6, OUT);
        a.r(4, y, cols * CELL - 7, 4, R[1]);
        a.r(4, y, cols * CELL - 7, 1, R[3]);
        a.r(cols * CELL - 5, y, 2, 4, '#ffd88a');
      });
    },
    support: function (a, m, R, part) {
      var cx = m[0].length * CELL / 2, cy = m.length * CELL / 2;
      if (part.id === 'u_ammo') {
        /* 砲弾を3本 */
        [-4, 0, 4].forEach(function (d) {
          a.r(cx + d - 1, cy - 5, 3, 10, OUT);
          a.r(cx + d - 1, cy - 4, 2, 8, ramp('#c8a83c')[2]);
          a.p(cx + d - 1, cy - 4, '#ffe9a0');
          a.r(cx + d - 1, cy + 2, 2, 2, RUST[2]);
        });
      } else if (part.id === 'u_cool') {
        /* ファン */
        a.blob(cx, cy, 6, 6, OUT);
        a.blob(cx, cy, 5, 5, STEEL[1]);
        [[0, -4], [4, 0], [0, 4], [-4, 0]].forEach(function (d) {
          a.r(cx + d[0] - 1, cy + d[1] - 1, 3, 3, '#9fd8ff');
        });
        a.r(cx - 1, cy - 1, 2, 2, STEEL[4]);
      } else {
        /* 照準 */
        a.blob(cx, cy, 6, 6, OUT);
        a.blob(cx, cy, 5, 5, '#2a1416');
        a.r(cx - 6, cy, 13, 1, '#ff5a4a');
        a.r(cx, cy - 6, 1, 13, '#ff5a4a');
        a.p(cx, cy, '#fff2a0');
      }
    }
  };

  /* 種類の目印。グリッドに並べたとき、灰色の砲どうしを見分けるための印 */
  var KIND_COLOR = {
    engine: '#e0a03a', cunit: '#57e0c0', main: '#ff6a4a',
    sub: '#7fb4ff', special: '#c58bff', support: '#f0e08a'
  };
  function kindTab(a, m, kind) {
    var col = KIND_COLOR[kind];
    if (!col) return;
    for (var y = 0; y < m.length; y++) {
      for (var x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        a.r(x * CELL + 2, y * CELL + 2, 5, 5, OUT);
        a.r(x * CELL + 3, y * CELL + 3, 3, 3, col);
        a.p(x * CELL + 3, y * CELL + 3, '#ffffff');
        return;
      }
    }
  }

  var partCache = {};

  function partSprite(part) {
    if (partCache[part.id]) return partCache[part.id];
    var m = maskOf(part.shape);
    var R = ramp(part.color);
    var c = make(m[0].length * CELL, m.length * CELL, function (a) {
      plate(a, m, R);
      var f = partDetail[part.kind];
      if (f) f(a, m, R, part);
      kindTab(a, m, part.kind);
    });
    partCache[part.id] = c;
    return c;
  }

  /* ==========================================================
     形で組んで陰影を付ける絵（車体・敵）

     部品（矩形・円・多角形・線）を材質ごとに置き、左上から光が当たるとして
     「上か左が別の材質なら明、下か右が別なら暗、それ以外は中」の3段に塗り分け、
     最後に外周を濃い輪郭で縁取る。錬金工場の勇者たちと同じ作り。
     材質は ramp() の5段、'!#rrggbb' は陰影を付けない1色。
     ========================================================== */
  function inside(pts, x, y) {
    var c = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi) c = !c;
    }
    return c;
  }

  function shaded(w, h, mats, build) {
    var m = [];
    for (var y = 0; y < h; y++) { m.push([]); for (var x = 0; x < w; x++) m[y].push(null); }
    var G = {
      set: function (x, y, k) {
        x = Math.round(x); y = Math.round(y);
        if (x >= 0 && y >= 0 && x < w && y < h) m[y][x] = k;
      },
      rect: function (x0, y0, x1, y1, k) {
        for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) G.set(xx, yy, k);
      },
      disc: function (cx, cy, rx, ry, k) {
        for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
          var dx = (xx + .5 - cx) / rx, dy = (yy + .5 - cy) / ry;
          if (dx * dx + dy * dy <= 1) m[yy][xx] = k;
        }
      },
      poly: function (pts, k) {
        for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) if (inside(pts, xx + .5, yy + .5)) m[yy][xx] = k;
      },
      line: function (x0, y0, x1, y1, k, wd) {
        var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
        for (var i = 0; i <= n; i++) {
          var t = i / n, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
          for (var a = 0; a < (wd || 1); a++) for (var b = 0; b < (wd || 1); b++) G.set(Math.floor(px) + a, Math.floor(py) + b, k);
        }
      }
    };
    build(G);
    return make(w, h, function (a) {
      function at(x, y) { return x >= 0 && y >= 0 && x < w && y < h ? m[y][x] : null; }
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var k = m[y][x];
        if (!k) continue;
        var d = mats[k];
        if (typeof d === 'string') { a.p(x, y, d.slice(1)); continue; }
        var col = (at(x, y - 1) !== k || at(x - 1, y) !== k) ? d[3]
          : (at(x, y + 1) !== k || at(x + 1, y) !== k) ? d[1] : d[2];
        a.p(x, y, col);
      }
      for (var y2 = 0; y2 < h; y2++) for (var x2 = 0; x2 < w; x2++) {
        if (m[y2][x2]) continue;
        if (at(x2 + 1, y2) || at(x2 - 1, y2) || at(x2, y2 + 1) || at(x2, y2 - 1)) a.p(x2, y2, OUT);
      }
    });
  }

  var TIRE = ramp('#34383e'), TRACK = ramp('#454a52'), GLASS = '!#9fd8ff';

  /* 車輪。タイヤとホイールと軸 */
  function wheel(G, cx, cy, r) {
    G.disc(cx, cy, r, r, 'tire');
    G.disc(cx, cy, r * .5, r * .5, 'steel');
    G.set(cx - .5, cy - .5, 'hubc');
  }
  /* 履帯。角の丸い帯に転輪を並べる */
  function tracks(G, x0, x1, y0, y1, n) {
    var r = (y1 - y0) / 2;
    G.rect(x0 + r, y0, x1 - r, y1, 'track');
    G.disc(x0 + r, y0 + r + .5, r + .5, r + .5, 'track');
    G.disc(x1 - r, y0 + r + .5, r + .5, r + .5, 'track');
    for (var i = 0; i < n; i++) {
      var cx = x0 + r + (x1 - x0 - r * 2) * i / (n - 1);
      G.disc(cx, y0 + r + .5, r * .62, r * .62, 'steel');
      G.set(cx - .5, y0 + r, 'hubc');
    }
    for (var x = x0 + 2; x < x1 - 1; x += 3) G.set(x, y0, 'tread');
  }

  /* ==========================================================
     車体。横から見た姿 48x32。右を向いている
     ========================================================== */
  var vehicleArt = {
    /* 幌付きジープ。荷台に機関銃、後ろに畳んだ幌 */
    ch_jeep: function (G) {
      G.poly([[4, 16], [36, 16], [44, 19], [44, 24], [4, 24]], 'body');
      G.rect(31, 13, 41, 16, 'body');
      G.rect(5, 11, 12, 16, 'canvas');                       // 畳んだ幌
      G.line(29, 16, 27, 8, 'steel', 1); G.rect(28, 9, 29, 15, 'glass');
      G.rect(14, 7, 15, 16, 'steel'); G.rect(23, 7, 24, 16, 'steel'); G.rect(14, 7, 24, 8, 'steel');   // ロールバー
      G.rect(17, 4, 20, 7, 'steel'); G.rect(20, 5, 32, 6, 'steel');    // 機関銃
      G.set(43, 19, 'lamp'); G.set(43, 20, 'lamp');
      G.rect(5, 19, 43, 19, 'seam');
      wheel(G, 12, 24, 5.5); wheel(G, 36, 24, 5.5);
    },
    /* 装甲車。6輪に砲塔 */
    ch_apc: function (G) {
      G.poly([[3, 14], [40, 14], [46, 19], [46, 25], [2, 25], [2, 18]], 'body');
      G.rect(3, 20, 45, 20, 'seam');
      G.poly([[14, 8], [27, 8], [30, 11], [30, 14], [12, 14], [12, 10]], 'body');
      G.rect(17, 5, 23, 7, 'steel');                         // ハッチ
      G.rect(29, 10, 43, 11, 'steel'); G.rect(42, 9, 45, 12, 'steel');  // 砲
      G.set(37, 16, 'slit'); G.set(39, 16, 'slit'); G.set(41, 17, 'slit');
      G.set(45, 21, 'lamp');
      wheel(G, 10, 26, 4.5); wheel(G, 24, 26, 4.5); wheel(G, 38, 26, 4.5);
    },
    /* 重戦車。長い砲身と大きな砲塔、履帯 */
    ch_ogre: function (G) {
      tracks(G, 2, 46, 21, 29, 6);
      G.poly([[4, 14], [40, 14], [46, 18], [46, 21], [2, 21], [2, 17]], 'body');
      G.rect(3, 18, 45, 18, 'seam');
      G.poly([[11, 6], [29, 6], [34, 10], [34, 14], [9, 14], [9, 9]], 'body');
      G.rect(15, 3, 21, 5, 'steel');                         // キューポラ
      G.rect(33, 8, 47, 10, 'steel'); G.rect(44, 7, 47, 11, 'steel');   // 長砲身と制退器
      G.set(30, 11, 'slit'); G.set(12, 10, 'slit');
    }
  };

  var vehicleCache = {};
  function chassisSprite(ch) {
    var key = (ch.id || 'ch_ogre') + ch.color;
    if (vehicleCache[key]) return vehicleCache[key];
    var R = ramp(ch.color || '#6d6f7a');
    vehicleCache[key] = shaded(48, 32, {
      body: R, seam: '!' + R[0], canvas: ramp('#c9b07a'), steel: STEEL, tire: TIRE, track: TRACK,
      hubc: '!' + STEEL[4], tread: '!' + TRACK[0], glass: GLASS, lamp: '!#ffe9a0', slit: '!#14181d'
    }, vehicleArt[ch.id] || vehicleArt.ch_ogre);
    return vehicleCache[key];
  }

  /* ==========================================================
     敵。48x32（ボスだけ64x40）。右を向いて描き、戦場では左右を返す
     ========================================================== */
  function foeMats(base, extra) {
    var R = ramp(base);
    var o = { hull: R, seam: '!' + R[0], steel: STEEL, tire: TIRE, track: TRACK, rust: RUST,
      hubc: '!' + STEEL[4], tread: '!' + TRACK[0], eye: '!#ff5a4a', eyew: '!#ffe0a0', dark: '!#1a1416', glow: '!#ffb03a' };
    for (var k in extra || {}) o[k] = extra[k];
    return o;
  }

  var enemyArt = {
    /* 空を飛ぶ四枚羽 */
    drone: function () {
      return shaded(48, 32, foeMats('#7f8fa0', { blur: '!#c8d0d8' }), function (G) {
        G.rect(3, 4, 17, 4, 'blur'); G.rect(31, 4, 45, 4, 'blur');   // 回るローター
        G.rect(9, 5, 11, 8, 'steel'); G.rect(37, 5, 39, 8, 'steel');
        G.rect(10, 9, 38, 10, 'steel');                              // 支持アーム
        G.disc(24, 15, 10, 6.5, 'hull');
        G.rect(15, 15, 33, 15, 'seam');
        G.disc(30, 14, 3, 3, 'dark'); G.set(30, 13, 'eye'); G.set(31, 13, 'eye');
        G.line(19, 20, 16, 25, 'steel'); G.line(29, 20, 32, 25, 'steel');
        G.rect(32, 18, 41, 19, 'steel');                             // 機関銃
      });
    },
    /* 砂賊のバギー */
    buggy: function () {
      return shaded(48, 32, foeMats('#a5622f', { flag: ramp('#c0392b') }), function (G) {
        G.poly([[5, 15], [33, 15], [42, 18], [42, 23], [5, 23]], 'hull');
        G.rect(6, 19, 41, 19, 'seam');
        G.line(16, 15, 18, 7, 'steel'); G.line(28, 15, 26, 7, 'steel'); G.rect(18, 7, 26, 7, 'steel');   // ロールバー
        G.rect(7, 8, 11, 12, 'steel'); G.rect(11, 9, 22, 10, 'steel');   // 荷台の機関銃
        G.line(5, 15, 3, 3, 'steel'); G.poly([[3, 3], [10, 4], [3, 8]], 'flag');   // 砂賊の旗
        G.set(41, 19, 'eyew');
        wheel(G, 12, 24, 5.5); wheel(G, 35, 24, 5.5);
      });
    },
    /* 廃車を寄せ集めた塊 */
    golem: function () {
      return shaded(48, 32, foeMats('#6a6257', { car: RUST, glass: GLASS }), function (G) {
        G.rect(12, 25, 17, 29, 'hull'); G.rect(30, 25, 35, 29, 'hull');   // 脚
        G.disc(24, 19, 16, 9, 'hull');
        G.poly([[10, 8], [22, 6], [24, 14], [12, 15]], 'car');            // 刺さった車
        G.rect(14, 9, 19, 11, 'glass');
        G.poly([[26, 9], [40, 10], [39, 16], [27, 15]], 'steel');
        G.disc(8, 17, 4, 4, 'tire');
        G.rect(16, 18, 18, 20, 'glow'); G.rect(28, 18, 30, 20, 'glow');   // 目
        G.line(12, 23, 36, 23, 'seam');
        G.set(20, 25, 'seam'); G.set(26, 14, 'seam'); G.set(34, 21, 'seam');
      });
    },
    /* 長い砲身の自走砲 */
    sniper: function () {
      return shaded(48, 32, foeMats('#5f6b52'), function (G) {
        tracks(G, 3, 37, 21, 28, 5);
        G.poly([[6, 14], [32, 14], [37, 18], [37, 21], [4, 21], [4, 17]], 'hull');
        G.rect(5, 18, 36, 18, 'seam');
        G.poly([[13, 7], [22, 7], [25, 10], [25, 14], [12, 14]], 'hull');
        G.rect(24, 9, 45, 10, 'steel'); G.rect(43, 7, 47, 12, 'steel');   // 長砲身
        G.rect(15, 4, 19, 6, 'steel'); G.set(19, 5, 'eye');               // 照準器
      });
    },
    /* 賞金首：鉄クワガタ */
    stag: function () {
      return shaded(48, 32, foeMats('#4a5560'), function (G) {
        [10, 18, 26].forEach(function (x) { G.line(x, 21, x - 3, 28, 'steel'); });   // 脚
        G.poly([[29, 11], [42, 5], [46, 7], [44, 10], [36, 12], [33, 14]], 'steel');  // 上の大顎
        G.poly([[29, 19], [42, 25], [46, 23], [44, 20], [36, 18], [33, 16]], 'steel'); // 下の大顎
        G.set(40, 10, 'seam'); G.set(40, 20, 'seam');
        G.disc(19, 15, 15, 9, 'hull');
        G.line(19, 7, 19, 23, 'seam');
        G.disc(30, 15, 4, 4, 'hull');
        G.set(31, 13, 'eye'); G.set(32, 13, 'eye'); G.set(31, 17, 'eye'); G.set(32, 17, 'eye');
        G.set(12, 11, 'seam'); G.set(26, 11, 'seam'); G.set(12, 19, 'seam'); G.set(26, 19, 'seam');
      });
    },
    /* 賞金首：砂ヒル */
    leech: function () {
      return shaded(48, 32, foeMats('#8a6f4a', { mouth: '!#3a1a1a', tooth: '!#ffe9c0', sand: ramp('#c8a06a') }), function (G) {
        G.rect(0, 28, 47, 31, 'sand');
        for (var i = 0; i < 5; i++) {
          var x = 6 + i * 7, y = 23 - Math.round(Math.sin(i * .9) * 7);
          G.disc(x, y, 5.5, 5.5, 'hull');
          G.set(x, y - 4, 'seam');
        }
        G.disc(41, 11, 6.5, 6.5, 'hull');
        G.disc(42, 11, 4, 4, 'mouth');
        [[-3, -2], [2, -3], [3, 2], [-2, 3], [0, -4], [4, 0]].forEach(function (d) { G.set(42 + d[0], 11 + d[1], 'tooth'); });
      });
    },
    /* ボス：大型戦車ゴルゴダ */
    golgoda: function () {
      return shaded(64, 40, foeMats('#57606b', { tube: '!#ffd88a' }), function (G) {
        tracks(G, 2, 62, 28, 37, 8);
        G.poly([[5, 17], [55, 17], [61, 22], [61, 28], [3, 28], [3, 21]], 'hull');
        G.rect(4, 24, 60, 24, 'seam');
        G.poly([[16, 8], [37, 8], [42, 12], [42, 18], [13, 18], [13, 11]], 'hull');
        G.rect(41, 11, 61, 13, 'steel'); G.rect(58, 9, 63, 15, 'steel');    // 主砲
        G.rect(5, 13, 12, 18, 'hull'); G.rect(11, 14, 20, 15, 'steel');     // 副砲
        G.rect(20, 2, 35, 7, 'steel');                                      // 一斉射撃の発射管
        for (var i = 0; i < 4; i++) G.set(22 + i * 4, 3, 'tube');
        G.set(38, 14, 'eye'); G.set(15, 13, 'eye');
      });
    }
  };

  var enemyCache = {};
  function enemySprite(key) {
    if (!enemyCache[key]) enemyCache[key] = (enemyArt[key] || enemyArt.drone)();
    return enemyCache[key];
  }

  /* ==========================================================
     マップのノード（16x16）
     ========================================================== */
  var nodeArt = {
    battle: function (a) {
      /* 交差した砲身 */
      a.r(3, 11, 11, 2, OUT); a.r(3, 12, 10, 1, STEEL[3]);
      a.r(2, 3, 3, 10, OUT); a.r(3, 4, 1, 8, STEEL[2]);
      a.r(11, 3, 3, 10, OUT); a.r(12, 4, 1, 8, STEEL[2]);
      a.r(6, 6, 4, 4, OUT); a.r(7, 7, 2, 2, ramp('#c0392b')[3]);
    },
    elite: function (a) {
      /* 賞金首の星 */
      var G = ramp('#d9a441');
      a.blob(8, 8, 7, 7, OUT);
      a.blob(8, 8, 6, 6, G[1]);
      [[8, 2], [8, 13], [2, 8], [13, 8]].forEach(function (d) { a.r(d[0] - 1, d[1] - 1, 3, 3, G[3]); });
      a.r(5, 5, 6, 6, G[3]);
      a.r(6, 6, 4, 4, G[4]);
      a.r(7, 7, 2, 2, '#3a2408');
    },
    boss: function (a) {
      /* どくろ */
      a.blob(8, 7, 6, 5, OUT);
      a.blob(8, 7, 5, 4, '#d8d2c4');
      a.r(4, 5, 3, 3, '#241c16'); a.r(9, 5, 3, 3, '#241c16');
      a.r(7, 9, 2, 2, '#241c16');
      a.r(5, 11, 6, 4, OUT);
      a.r(6, 12, 4, 3, '#d8d2c4');
      a.r(7, 12, 1, 3, '#241c16'); a.r(9, 12, 1, 3, '#241c16');
    },
    rest: function (a) {
      /* 焚き火 */
      a.r(2, 12, 12, 2, OUT);
      a.r(3, 12, 10, 1, RUST[2]);
      a.blob(8, 8, 4, 5, '#c2612c');
      a.blob(8, 9, 3, 3, '#f0a83c');
      a.blob(8, 10, 1, 2, '#ffe9a0');
      a.dots([[5, 3], [11, 4], [8, 2]], '#f0a83c');
    },
    /* 「？」の看板。何が起きるか分からない場所 */
    event: function (a) {
      var W = ramp('#8a7f6a');
      /* 支柱 */
      a.r(7, 10, 2, 5, OUT);
      a.r(7, 10, 1, 5, W[1]);
      /* 板 */
      a.r(2, 2, 12, 9, OUT);
      a.r(3, 3, 10, 7, W[2]);
      a.r(3, 3, 10, 1, W[4]);
      a.r(3, 9, 10, 1, W[0]);
      /* ? */
      a.r(6, 4, 4, 1, '#241c10');
      a.r(9, 5, 1, 1, '#241c10');
      a.r(8, 6, 1, 1, '#241c10');
      a.r(7, 7, 1, 1, '#241c10');
      a.r(7, 9, 1, 1, '#241c10');
      /* 釘 */
      a.p(3, 3, W[4]); a.p(12, 3, W[4]);
    },
    shop: function (a) {
      /* 幌テント */
      var W = ramp('#c9a86e');
      a.r(2, 6, 12, 8, OUT);
      a.r(3, 7, 10, 6, W[2]);
      a.r(3, 7, 10, 1, W[4]);
      for (var x = 3; x < 13; x += 3) a.r(x, 7, 1, 6, W[1]);
      a.r(1, 4, 14, 3, OUT);
      a.r(2, 5, 12, 1, ramp('#a8542e')[3]);
      a.r(6, 9, 4, 5, ramp('#8a5334')[1]);
    }
  };

  var nodeCache = {};
  function nodeSprite(type) {
    if (!nodeCache[type]) {
      nodeCache[type] = make(16, 16, function (a) { (nodeArt[type] || nodeArt.battle)(a); });
    }
    return nodeCache[type];
  }

  /* ==========================================================
     塞がったマス
     まだ使えない場所。開ければ部品を置けるようになる
     ========================================================== */
  var blockedTile = null;
  function blockedCell() {
    if (blockedTile) return blockedTile;
    blockedTile = make(16, 16, function (a) {
      a.r(0, 0, 16, 16, '#191f25');
      /* 溶接で塞いだ鉄板 */
      a.r(2, 2, 12, 12, OUT);
      a.r(3, 3, 10, 10, STEEL[0]);
      a.r(3, 3, 10, 1, STEEL[1]);
      /* 斜めの補強 */
      for (var i = 0; i < 10; i++) {
        a.p(3 + i, 3 + i, STEEL[1]);
        a.p(12 - i, 3 + i, STEEL[1]);
      }
      /* 隅のリベット */
      [[4, 4], [11, 4], [4, 11], [11, 11]].forEach(function (d) {
        a.p(d[0], d[1], STEEL[3]);
        a.p(d[0], d[1] + 1, OUT);
      });
      /* 錆 */
      a.dots([[6, 8], [9, 6], [7, 12]], RUST[1]);
    });
    return blockedTile;
  }

  /* ==========================================================
     消耗品のアイコン（16x16）
     ========================================================== */
  var itemArt = {
    /* 徹甲弾。尖った弾芯 */
    i_ap: function (a, R) {
      a.r(6, 1, 4, 3, OUT);
      a.r(5, 3, 6, 10, OUT);
      a.r(6, 4, 4, 8, R[2]);
      a.r(6, 4, 4, 1, R[4]);
      a.r(6, 11, 4, 1, R[0]);
      a.r(7, 1, 2, 3, R[3]);
      a.p(7, 1, '#ffffff');
      a.r(5, 13, 6, 2, OUT);
      a.r(6, 13, 4, 1, RUST[2]);
    },
    /* 追加弾倉。箱に弾を詰めた形 */
    i_mag: function (a, R) {
      a.r(3, 5, 10, 9, OUT);
      a.r(4, 6, 8, 7, R[2]);
      a.r(4, 6, 8, 1, R[4]);
      a.r(4, 12, 8, 1, R[0]);
      [5, 8, 11].forEach(function (x) {
        a.r(x - 1, 2, 2, 4, OUT);
        a.r(x - 1, 3, 1, 3, ramp('#c8a83c')[3]);
      });
      a.r(4, 9, 8, 1, R[0]);
    },
    /* タイルパック。マスそのもの */
    i_tile: function (a, R) {
      a.r(2, 2, 12, 12, OUT);
      a.r(3, 3, 10, 10, R[1]);
      a.r(3, 3, 10, 1, R[3]);
      /* 4分割の目地 */
      a.r(8, 3, 1, 10, R[0]);
      a.r(3, 8, 10, 1, R[0]);
      a.r(4, 4, 4, 4, R[2]);
      a.r(9, 9, 4, 4, R[2]);
      a.p(4, 4, R[4]); a.p(9, 9, R[4]);
    },
    /* 応急パッチ。当て板 */
    i_patch: function (a, R) {
      a.r(2, 4, 12, 8, OUT);
      a.r(3, 5, 10, 6, R[2]);
      a.r(3, 5, 10, 1, R[4]);
      a.r(3, 10, 10, 1, R[0]);
      /* 十字 */
      a.r(7, 6, 2, 4, '#ffffff');
      a.r(6, 7, 4, 2, '#ffffff');
      [[3, 5], [12, 5], [3, 10], [12, 10]].forEach(function (d) { a.p(d[0], d[1], STEEL[3]); });
    }
  };

  var itemCache = {};
  function itemSprite(item) {
    if (itemCache[item.id]) return itemCache[item.id];
    var R = ramp(item.color || '#8a8f9a');
    itemCache[item.id] = make(16, 16, function (a) {
      var f = itemArt[item.id];
      if (f) f(a, R);
      else { a.r(3, 3, 10, 10, OUT); a.r(4, 4, 8, 8, R[2]); }
    });
    return itemCache[item.id];
  }

  /* ==========================================================
     改造（16x16）
     賞金首の報酬。部品ではなく車そのものへの手入れなので、
     どれも「車体に何かを足した」形にしてある
     ========================================================== */
  var modArt = {
    /* 増槽：増設した燃料タンク */
    tank: function (a, R) {
      a.r(3, 4, 10, 9, OUT);
      a.blob(8, 8, 4, 4, R[2]);
      a.r(4, 5, 8, 1, R[4]);
      a.r(4, 11, 8, 1, R[0]);
      a.r(7, 2, 2, 3, OUT); a.p(7, 3, R[3]);
      a.dots([[5, 8], [11, 9]], R[1]);
    },
    /* 放熱板：櫛状のフィン */
    fin: function (a, R) {
      a.r(2, 10, 12, 3, OUT);
      a.r(3, 11, 10, 1, R[1]);
      for (var i = 0; i < 5; i++) {
        a.r(3 + i * 2, 3, 2, 8, OUT);
        a.r(3 + i * 2, 4, 1, 6, R[3]);
      }
    },
    /* 弾薬庫：積み上げた弾 */
    maga: function (a, R) {
      a.r(2, 6, 12, 8, OUT);
      a.r(3, 7, 10, 6, R[1]);
      [4, 7, 10].forEach(function (x) {
        a.r(x - 1, 3, 3, 5, OUT);
        a.r(x - 1, 4, 2, 4, ramp('#c8a83c')[3]);
        a.p(x - 1, 4, '#ffe9a0');
      });
      a.r(3, 10, 10, 1, R[0]);
    },
    /* 軽量フレーム：骨組み */
    frame: function (a, R) {
      a.r(2, 3, 12, 10, OUT);
      a.r(3, 4, 10, 8, '#11161b');
      a.r(3, 4, 10, 1, R[3]);
      a.r(3, 11, 10, 1, R[1]);
      a.r(3, 4, 1, 8, R[2]); a.r(12, 4, 1, 8, R[2]);
      for (var i = 0; i < 4; i++) a.p(4 + i * 3, 7 + (i % 2), R[4]);
    },
    /* 複座化：ふたつの座席 */
    crew: function (a, R) {
      [4, 10].forEach(function (cx) {
        a.r(cx - 3, 4, 6, 4, OUT);
        a.r(cx - 2, 5, 4, 2, R[3]);
        a.r(cx - 3, 8, 6, 5, OUT);
        a.r(cx - 2, 9, 4, 3, R[1]);
      });
      a.r(7, 6, 2, 6, OUT);
    },
    /* 増加装甲：貼り増した鉄板 */
    armor: function (a, R) {
      a.r(2, 2, 12, 12, OUT);
      a.r(3, 3, 10, 10, R[1]);
      a.r(3, 3, 10, 1, R[3]);
      a.r(3, 12, 10, 1, R[0]);
      a.r(6, 3, 1, 10, R[0]); a.r(10, 3, 1, 10, R[0]);
      [[4, 4], [11, 4], [4, 11], [11, 11]].forEach(function (d) { a.p(d[0], d[1], R[4]); });
    },
    /* 拡張ベイ：剥がした鉄板の下に空いたマス */
    bay: function (a, R) {
      a.r(2, 2, 12, 12, OUT);
      a.r(3, 3, 10, 10, '#11161b');
      a.r(3, 3, 5, 5, R[2]);
      a.r(3, 3, 5, 1, R[4]);
      a.r(8, 8, 5, 5, R[1]);
      a.dots([[10, 5], [5, 10], [11, 4]], R[3]);
    },
    /* 予備弾倉：外付けの弾倉 */
    spare: function (a, R) {
      a.r(4, 2, 8, 5, OUT);
      a.r(5, 3, 6, 3, R[2]);
      a.r(3, 7, 10, 7, OUT);
      a.r(4, 8, 8, 5, R[1]);
      a.r(4, 8, 8, 1, R[3]);
      [5, 8, 11].forEach(function (x) { a.r(x - 1, 9, 1, 3, ramp('#c8a83c')[3]); });
    }
  };

  var MOD_COLOR = {
    tank: '#8a7a3c', fin: '#4a86b8', maga: '#b09030', frame: '#7c8a99',
    crew: '#57a07a', armor: '#6d6f7a', bay: '#8a6f4a', spare: '#a0704a'
  };

  var modCache = {};
  function modSprite(mod) {
    if (modCache[mod.id]) return modCache[mod.id];
    var R = ramp(MOD_COLOR[mod.art] || '#8a8f9a');
    modCache[mod.id] = make(16, 16, function (a) {
      var f = modArt[mod.art];
      if (f) f(a, R);
      else { a.r(3, 3, 10, 10, OUT); a.r(4, 4, 8, 8, R[2]); }
    });
    return modCache[mod.id];
  }

  return {
    CELL: CELL,
    part: partSprite,
    mod: modSprite,
    item: itemSprite,
    enemy: enemySprite,
    node: nodeSprite,
    chassis: chassisSprite,
    blocked: blockedCell,
    maskOf: maskOf,
    _make: make, _ramp: ramp, _tone: tone
  };
})();
