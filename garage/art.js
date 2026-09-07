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
     車体アイコン（マップ・選択画面用）32x24
     ========================================================== */
  function chassisSprite(ch) {
    var R = ramp(ch.color);
    return make(32, 24, function (a) {
      /* 履帯 */
      a.r(2, 15, 28, 7, OUT);
      a.r(3, 16, 26, 5, STEEL[1]);
      for (var x = 4; x < 29; x += 3) a.r(x, 16, 1, 5, STEEL[0]);
      a.r(3, 16, 26, 1, STEEL[3]);
      /* 車体 */
      a.r(4, 8, 24, 8, OUT);
      a.r(5, 9, 22, 6, R[2]);
      a.r(5, 9, 22, 1, R[4]);
      a.r(5, 14, 22, 1, R[0]);
      /* 砲塔 */
      a.r(10, 3, 12, 6, OUT);
      a.r(11, 4, 10, 4, R[3]);
      a.r(11, 4, 10, 1, R[4]);
      /* 主砲 */
      a.r(20, 5, 11, 3, OUT);
      a.r(20, 6, 10, 1, STEEL[3]);
    });
  }

  /* ==========================================================
     敵。48x32（ボスだけ64x40）
     ========================================================== */
  function ground(a, w, h) {
    a.r(0, h - 3, w, 3, SAND[1]);
    a.r(0, h - 3, w, 1, SAND[2]);
  }

  var enemyArt = {
    /* 空を飛ぶ四枚羽 */
    drone: function () {
      var R = ramp('#7f8fa0');
      return make(48, 32, function (a) {
        ground(a, 48, 32);
        /* 影 */
        a.blob(24, 28, 9, 2, SAND[0]);
        /* ローター。回っているのを1枚絵で見せるため、薄く長い帯にする */
        [11, 37].forEach(function (x) {
          a.r(x - 10, 5, 20, 1, R[1]);
          a.r(x - 7, 6, 14, 1, R[0]);
          a.r(x - 2, 4, 4, 5, OUT);
          a.r(x - 1, 5, 2, 3, R[3]);
        });
        /* 支持アーム */
        a.r(11, 9, 26, 3, OUT);
        a.r(12, 10, 24, 1, R[1]);
        /* 胴 */
        a.r(15, 11, 18, 12, OUT);
        a.r(16, 12, 16, 10, R[2]);
        a.r(16, 12, 16, 2, R[4]);
        a.r(16, 20, 16, 2, R[0]);
        a.dots([[19, 17], [27, 16], [23, 20]], R[1]);
        /* センサ */
        a.r(19, 14, 10, 4, OUT);
        a.r(20, 15, 8, 2, '#2a1416');
        a.r(21, 15, 2, 1, '#ff5a4a');
        a.r(25, 15, 2, 1, '#ff5a4a');
        /* 脚 */
        a.r(17, 23, 2, 4, OUT); a.r(29, 23, 2, 4, OUT);
        /* 銃 */
        a.r(32, 18, 10, 3, OUT);
        a.r(32, 19, 9, 1, STEEL[3]);
      });
    },
    /* 砂賊のバギー */
    buggy: function () {
      var R = ramp('#a5622f');
      return make(48, 32, function (a) {
        ground(a, 48, 32);
        [12, 35].forEach(function (x) {
          a.blob(x, 23, 6, 6, OUT);
          a.blob(x, 23, 5, 5, '#2c2f34');
          a.blob(x, 23, 2, 2, STEEL[2]);
        });
        a.r(6, 14, 36, 8, OUT);
        a.r(7, 15, 34, 6, R[2]);
        a.r(7, 15, 34, 1, R[4]);
        a.r(7, 20, 34, 1, R[0]);
        /* ロールバー */
        a.r(16, 7, 2, 8, OUT); a.r(28, 7, 2, 8, OUT);
        a.r(16, 6, 14, 2, OUT);
        a.r(17, 7, 12, 1, STEEL[3]);
        /* 荷台の機関銃 */
        a.r(30, 9, 12, 2, OUT);
        a.r(30, 9, 11, 1, STEEL[3]);
        a.r(27, 8, 4, 4, OUT);
        a.r(28, 9, 2, 2, STEEL[1]);
      });
    },
    /* 廃車を寄せ集めた塊 */
    golem: function () {
      var R = ramp('#6a6257');
      return make(48, 32, function (a) {
        ground(a, 48, 32);
        a.blob(24, 26, 15, 3, SAND[0]);
        /* 積み上がった鉄屑 */
        a.r(8, 12, 32, 16, OUT);
        a.r(9, 13, 30, 14, R[2]);
        a.r(9, 13, 30, 1, R[4]);
        a.r(9, 26, 30, 1, R[0]);
        /* 差さった車の残骸 */
        a.r(12, 6, 12, 8, OUT);
        a.r(13, 7, 10, 6, RUST[2]);
        a.r(13, 7, 10, 1, RUST[3]);
        a.r(15, 9, 6, 3, '#2a3038');
        a.r(26, 9, 14, 6, OUT);
        a.r(27, 10, 12, 4, R[1]);
        a.r(27, 10, 12, 1, R[3]);
        /* 目 */
        a.r(17, 18, 3, 3, '#ffb03a');
        a.r(28, 18, 3, 3, '#ffb03a');
        /* 傷 */
        a.dots([[14, 22], [22, 24], [33, 20], [20, 16], [36, 24]], R[0]);
      });
    },
    /* 長い砲身の自走砲 */
    sniper: function () {
      var R = ramp('#5f6b52');
      return make(48, 32, function (a) {
        ground(a, 48, 32);
        a.r(4, 20, 34, 7, OUT);
        a.r(5, 21, 32, 5, STEEL[1]);
        for (var x = 7; x < 36; x += 4) a.r(x, 21, 1, 5, STEEL[0]);
        a.r(6, 13, 30, 8, OUT);
        a.r(7, 14, 28, 6, R[2]);
        a.r(7, 14, 28, 1, R[4]);
        a.r(7, 19, 28, 1, R[0]);
        /* 長砲身 */
        a.r(14, 6, 8, 8, OUT);
        a.r(15, 7, 6, 6, R[3]);
        a.r(20, 8, 27, 4, OUT);
        a.r(20, 9, 26, 2, STEEL[2]);
        a.r(20, 9, 26, 1, STEEL[4]);
        a.r(44, 7, 3, 6, OUT);
        a.r(44, 8, 2, 4, STEEL[3]);
      });
    },
    /* 賞金首：鉄クワガタ */
    stag: function () {
      var R = ramp('#4a5560');
      return make(48, 32, function (a) {
        ground(a, 48, 32);
        a.blob(24, 27, 13, 2, SAND[0]);
        /* 大顎 */
        a.r(30, 8, 14, 3, OUT); a.r(30, 9, 13, 1, STEEL[3]);
        a.r(30, 19, 14, 3, OUT); a.r(30, 20, 13, 1, STEEL[3]);
        a.r(42, 6, 3, 6, OUT); a.r(42, 18, 3, 6, OUT);
        a.r(42, 7, 2, 4, STEEL[2]); a.r(42, 19, 2, 4, STEEL[2]);
        /* 甲羅 */
        a.blob(19, 15, 15, 9, OUT);
        a.blob(19, 15, 14, 8, R[2]);
        a.blob(18, 13, 12, 5, R[3]);
        a.blob(17, 11, 8, 2, R[4]);
        /* 背中の継ぎ目 */
        a.r(19, 8, 1, 15, R[0]);
        a.dots([[12, 12], [26, 12], [12, 19], [26, 19]], R[0]);
        /* 目 */
        a.r(29, 13, 3, 2, '#ff5a4a');
        a.r(29, 16, 3, 2, '#ff5a4a');
        /* 脚 */
        [8, 16, 24].forEach(function (x) {
          a.r(x, 23, 2, 5, OUT); a.p(x, 24, STEEL[2]);
        });
      });
    },
    /* 賞金首：砂ヒル */
    leech: function () {
      var R = ramp('#8a6f4a');
      return make(48, 32, function (a) {
        ground(a, 48, 32);
        /* 砂から出ている胴を節で描く */
        for (var i = 0; i < 5; i++) {
          var x = 6 + i * 8;
          var y = 22 - Math.round(Math.sin(i * 0.9) * 7);
          a.blob(x, y, 6, 6, OUT);
          a.blob(x, y, 5, 5, R[2]);
          a.blob(x - 1, y - 1, 3, 3, R[3]);
          a.blob(x - 1, y - 2, 2, 1, R[4]);
        }
        /* 口 */
        a.blob(41, 10, 7, 7, OUT);
        a.blob(41, 10, 6, 6, R[1]);
        a.blob(42, 10, 4, 4, '#3a1a1a');
        [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, -4], [0, 4]].forEach(function (d) {
          a.p(42 + d[0], 10 + d[1], '#ffe9c0');
        });
        /* 砂けむり */
        a.dots([[4, 27], [10, 28], [17, 27], [30, 28]], SAND[3]);
      });
    },
    /* ボス：大型戦車ゴルゴダ */
    golgoda: function () {
      var R = ramp('#57606b');
      return make(64, 40, function (a) {
        ground(a, 64, 40);
        /* 二重履帯 */
        a.r(3, 26, 58, 10, OUT);
        a.r(4, 27, 56, 8, STEEL[1]);
        for (var x = 6; x < 59; x += 4) a.r(x, 27, 1, 8, STEEL[0]);
        a.r(4, 27, 56, 1, STEEL[3]);
        [9, 22, 35, 48].forEach(function (cx) {
          a.blob(cx, 31, 4, 4, STEEL[0]);
          a.blob(cx, 31, 2, 2, STEEL[2]);
        });
        /* 車体 */
        a.r(5, 16, 54, 11, OUT);
        a.r(6, 17, 52, 9, R[2]);
        a.r(6, 17, 52, 1, R[4]);
        a.r(6, 25, 52, 1, R[0]);
        a.dots([[12, 21], [24, 20], [40, 22], [52, 20]], R[0]);
        /* 主砲塔 */
        a.r(16, 7, 24, 10, OUT);
        a.r(17, 8, 22, 8, R[3]);
        a.r(17, 8, 22, 1, R[4]);
        a.r(17, 15, 22, 1, R[1]);
        a.r(38, 10, 25, 5, OUT);
        a.r(38, 11, 24, 3, STEEL[2]);
        a.r(38, 11, 24, 1, STEEL[4]);
        a.r(60, 8, 3, 9, OUT);
        a.r(60, 9, 2, 7, STEEL[3]);
        /* 副砲 */
        a.r(8, 11, 8, 6, OUT);
        a.r(9, 12, 6, 4, R[1]);
        a.r(14, 13, 9, 2, OUT);
        a.r(14, 13, 8, 1, STEEL[3]);
        /* 一斉射撃の発射管 */
        a.r(20, 3, 16, 5, OUT);
        for (var i = 0; i < 4; i++) {
          a.r(22 + i * 3, 4, 2, 3, RUST[2]);
          a.p(22 + i * 3, 4, '#ffd88a');
        }
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
     砂地のタイル（グリッドの下敷き）
     ========================================================== */
  var floorTile = null;
  function gridFloor() {
    if (floorTile) return floorTile;
    floorTile = make(16, 16, function (a) {
      a.r(0, 0, 16, 16, '#232a31');
      a.dots([[3, 4], [11, 2], [7, 9], [14, 12], [1, 13]], '#2b333b');
      a.dots([[5, 6], [12, 8]], '#1d242a');
    });
    return floorTile;
  }

  return {
    CELL: CELL,
    part: partSprite,
    item: itemSprite,
    enemy: enemySprite,
    node: nodeSprite,
    chassis: chassisSprite,
    blocked: blockedCell,
    gridFloor: gridFloor,
    maskOf: maskOf,
    _make: make, _ramp: ramp, _tone: tone
  };
})();
