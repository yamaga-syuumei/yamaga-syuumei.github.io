/* ==========================================================
   ドット絵

   画像ファイルは持たず、ここで1ドットずつ描いて作る。
   外部アセットが要らないので、差し替えも色替えもコードだけで済む。

   ドット単位で描いたものを Phaser 側で2倍に引き伸ばす。
   タイルは 16x16 → 32px、戦車は 24x24 → 48px。
   ========================================================== */
window.ART = (function () {
  'use strict';

  /* ---------- 小さな描画ヘルパ ---------- */
  function make(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    var api = {
      w: w, h: h,
      r: function (x, y, rw, rh, col) { g.fillStyle = col; g.fillRect(x | 0, y | 0, rw | 0, rh | 0); },
      p: function (x, y, col) { g.fillStyle = col; g.fillRect(x | 0, y | 0, 1, 1); },
      // 中抜きの四角。輪郭を描くのに使う
      box: function (x, y, rw, rh, col) {
        api.r(x, y, rw, 1, col); api.r(x, y + rh - 1, rw, 1, col);
        api.r(x, y, 1, rh, col); api.r(x + rw - 1, y, 1, rh, col);
      },
      // 楕円っぽい塊。砲塔や胴体に使う
      blob: function (cx, cy, rx, ry, col) {
        for (var y = -ry; y <= ry; y++) {
          var t = 1 - (y * y) / (ry * ry + .0001);
          if (t <= 0) continue;
          var half = Math.round(rx * Math.sqrt(t));
          api.r(cx - half, cy + y, half * 2 + 1, 1, col);
        }
      },
      // 種を固定した点描。毎回同じ模様になる
      speck: function (n, seed, col, x0, y0, sw, sh) {
        var s = seed >>> 0;
        for (var i = 0; i < n; i++) {
          s = (s * 1664525 + 1013904223) >>> 0;
          var x = x0 + (s >>> 16) % sw;
          s = (s * 1664525 + 1013904223) >>> 0;
          var y = y0 + (s >>> 16) % sh;
          api.p(x, y, col);
        }
      }
    };
    draw(api);
    return c;
  }

  /* ==========================================================
     地形タイル（16x16）
     ========================================================== */
  function sand(seed) {
    return make(16, 16, function (a) {
      a.r(0, 0, 16, 16, '#413928');
      a.speck(26, seed,      '#4a4130', 0, 0, 16, 16);
      a.speck(18, seed + 91, '#383020', 0, 0, 16, 16);
      a.speck(6,  seed + 17, '#544a38', 0, 0, 16, 16);
    });
  }

  function road(seed) {
    return make(16, 16, function (a) {
      a.r(0, 0, 16, 16, '#544a36');
      a.speck(30, seed,      '#5f5540', 0, 0, 16, 16);
      a.speck(20, seed + 55, '#4a412f', 0, 0, 16, 16);
      // 踏み固められて浮いた小石
      a.speck(7, seed + 311, '#6e6558', 0, 0, 16, 16);
    });
  }

  /* 岩は3種類。同じ形が並ぶと反復が目立つため */
  function rock(v) {
    var f = [
      { cx: 8, cy: 8, rx: 6, ry: 5, hx: 6, hy: 6 },
      { cx: 7, cy: 9, rx: 5, ry: 4, hx: 6, hy: 7 },
      { cx: 9, cy: 8, rx: 7, ry: 4, hx: 8, hy: 6 }
    ][v || 0];
    return make(16, 16, function (a) {
      a.r(0, 0, 16, 16, '#413928');
      a.speck(20, 7 + v * 91, '#4a4130', 0, 0, 16, 16);
      a.blob(f.cx, f.cy + 2, f.rx + 1, f.ry - 1, '#2a251b');   // 落ちる影
      a.blob(f.cx, f.cy, f.rx, f.ry, '#454d55');
      a.blob(f.cx - 1, f.cy - 1, f.rx - 1, f.ry - 1, '#525b64');
      a.blob(f.hx, f.hy, f.rx - 3, f.ry - 3, '#626c76');
      a.p(f.hx - 1, f.hy - 1, '#727d88');
      a.blob(f.cx + 1, f.cy + f.ry - 1, f.rx - 2, 1, '#353c43');
    });
  }

  function town() {
    return make(16, 16, function (a) {
      a.r(0, 0, 16, 16, '#4e4634');
      a.speck(16, 3, '#574e3a', 0, 0, 16, 16);
      // 奥の建物
      a.r(2, 3, 5, 9, '#6b5426');
      a.r(2, 3, 5, 1, '#8a6d33');
      a.r(3, 6, 1, 2, '#2b2318');
      a.r(5, 6, 1, 2, '#2b2318');
      // 手前の建物
      a.r(8, 5, 6, 8, '#7d6330');
      a.r(8, 5, 6, 1, '#9c7c3c');
      a.r(9, 8, 2, 3, '#2b2318');
      a.r(12, 8, 1, 2, '#2b2318');
      // 土台
      a.r(1, 12, 14, 2, '#3a2f1c');
      // 旗
      a.r(10, 2, 1, 3, '#5c5c5c');
      a.r(11, 2, 3, 2, '#c04a2a');
    });
  }

  /* ==========================================================
     戦車（24x24）
     装備の色をそのまま渡すので、積み替えると見た目が変わる
     ========================================================== */
  var OUT = '#14181c';

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* pal = { body, tread, barrel, sub } */
  function tank(dir, pal) {
    var body = pal.body, hi = shade(body, 34), lo = shade(body, -30);
    var tread = pal.tread, treadHi = shade(tread, 26);
    var barrel = pal.barrel, barrelHi = shade(barrel, 30);
    var sub = pal.sub;

    return make(24, 24, function (a) {
      if (dir === 'right') {
        // 履帯（上下）
        a.r(3, 2, 18, 4, OUT); a.r(3, 18, 18, 4, OUT);
        for (var x = 4; x < 20; x += 3) {
          a.r(x, 3, 2, 2, treadHi); a.r(x + 2, 3, 1, 2, tread);
          a.r(x, 19, 2, 2, treadHi); a.r(x + 2, 19, 1, 2, tread);
        }
        // 車体
        a.r(2, 6, 20, 12, OUT);
        a.r(3, 7, 18, 10, body);
        a.r(3, 7, 18, 2, hi);
        a.r(3, 15, 18, 2, lo);
        a.r(4, 9, 3, 6, lo);            // 前面の傾斜
        // 砲塔
        a.blob(12, 12, 6, 4, OUT);
        a.blob(12, 12, 5, 3, body);
        a.blob(11, 11, 4, 2, hi);
        a.r(9, 10, 2, 1, shade(body, 60));
        // 主砲
        a.r(17, 11, 7, 3, OUT);
        a.r(17, 12, 6, 1, barrel);
        a.r(17, 11, 6, 1, barrelHi);
        a.r(22, 11, 2, 3, barrelHi);
        // 副砲
        if (sub) {
          a.r(15, 7, 7, 2, OUT);
          a.r(15, 7, 6, 1, sub);
        }
      } else {
        var up = dir === 'up';
        // 履帯（左右）
        a.r(2, 3, 4, 18, OUT); a.r(18, 3, 4, 18, OUT);
        for (var y = 4; y < 20; y += 3) {
          a.r(3, y, 2, 2, treadHi); a.r(3, y + 2, 2, 1, tread);
          a.r(19, y, 2, 2, treadHi); a.r(19, y + 2, 2, 1, tread);
        }
        // 車体
        a.r(6, 2, 12, 20, OUT);
        a.r(7, 3, 10, 18, body);
        a.r(7, 3, 2, 18, hi);
        a.r(15, 3, 2, 18, lo);
        a.r(9, up ? 4 : 17, 6, 3, lo);
        // 砲塔
        a.blob(12, 12, 4, 5, OUT);
        a.blob(12, 12, 3, 4, body);
        a.blob(11, 11, 2, 3, hi);
        // 主砲
        var by = up ? 0 : 17;
        a.r(11, by, 3, 7, OUT);
        a.r(12, by, 1, 6, barrel);
        a.r(11, by, 1, 6, barrelHi);
        // 副砲
        if (sub) {
          a.r(16, up ? 2 : 15, 2, 7, OUT);
          a.r(16, up ? 2 : 16, 1, 6, sub);
        }
      }
    });
  }

  /* ==========================================================
     雑魚（16x16）
     ========================================================== */
  function drone() {
    return make(16, 16, function (a) {
      a.blob(8, 13, 5, 2, 'rgba(0,0,0,.35)');   // 浮いている影
      a.r(1, 5, 14, 2, OUT);                    // ローターアーム
      a.r(2, 5, 12, 1, '#8d98a4');
      a.r(0, 3, 5, 3, OUT); a.r(11, 3, 5, 3, OUT);
      a.r(1, 4, 3, 1, '#c3d4e2'); a.r(12, 4, 3, 1, '#c3d4e2');
      a.blob(8, 9, 5, 4, OUT);                  // 機体
      a.blob(8, 9, 4, 3, '#9fb4c6');
      a.blob(7, 8, 3, 2, '#cfdde9');
      a.r(8, 8, 4, 3, OUT);                     // 目
      a.r(9, 9, 3, 2, '#e03919');
      a.p(9, 9, '#ffb0a0');
    });
  }

  function buggy() {
    return make(16, 16, function (a) {
      a.r(1, 9, 14, 5, OUT);                  // 車体
      a.r(2, 10, 12, 3, '#f0c53c');
      a.r(2, 10, 12, 1, '#ffe07a');
      a.r(3, 4, 7, 6, OUT);                   // ロールバー
      a.r(4, 5, 5, 4, '#8a7020');
      a.r(4, 5, 5, 1, '#c9a53a');
      a.r(11, 6, 4, 2, OUT);                  // 積んだ銃
      a.r(11, 6, 4, 1, '#b9c4cf');
      a.blob(4, 14, 2, 2, '#20242a');         // 車輪
      a.blob(12, 14, 2, 2, '#20242a');
      a.p(4, 14, '#4a525c'); a.p(12, 14, '#4a525c');
    });
  }

  function junk() {
    return make(18, 18, function (a) {
      a.r(4, 16, 10, 2, 'rgba(0,0,0,.3)');            // 接地影
      a.r(2, 7, 5, 7, OUT); a.r(11, 7, 5, 7, OUT);    // 腕を先に、外へ張り出させる
      a.r(3, 8, 3, 5, '#5b6672'); a.r(12, 8, 3, 5, '#5b6672');
      a.r(3, 8, 3, 1, '#7f8c99'); a.r(12, 8, 3, 1, '#7f8c99');
      a.r(5, 5, 8, 11, OUT);                          // 胴
      a.r(6, 6, 6, 9, '#b45cd6');
      a.r(6, 6, 6, 2, '#d89bf2');
      a.r(6, 13, 6, 2, '#7a3199');
      a.r(7, 9, 4, 3, '#4a1f5e');                     // 胸の空洞
      a.r(8, 10, 2, 1, '#ffd34a');
      a.r(6, 1, 6, 5, OUT);                           // 頭
      a.r(7, 2, 4, 3, '#9a4bb8');
      a.r(7, 2, 4, 1, '#c88ae0');
      a.p(7, 3, '#ffd34a'); a.p(10, 3, '#ffd34a');
      a.r(8, 0, 2, 2, OUT); a.p(8, 0, '#e03919');     // アンテナ
      a.r(6, 15, 3, 2, OUT); a.r(10, 15, 3, 2, OUT);  // 脚
      a.r(6, 15, 3, 1, '#5b6672'); a.r(10, 15, 3, 1, '#5b6672');
    });
  }

  /* ==========================================================
     賞金首（32x32）
     部位ごとに分けて描く。壊れた部位を消せるようにするため。
     ========================================================== */
  /* 見下ろし視点なので、履帯は車体の左右に来る。
     data.js の設定文にそれぞれ寄せて描く。 */
  function bossTrack(col, y0, y1, inset) {
    inset = inset || 0;
    return make(32, 32, function (a) {
      [inset, 32 - inset - 6].forEach(function (x) {
        a.r(x, y0, 6, y1 - y0, OUT);
        a.r(x + 1, y0 + 1, 4, y1 - y0 - 2, col);
        a.r(x + 1, y0 + 1, 2, y1 - y0 - 2, shade(col, 24));
        for (var y = y0 + 2; y < y1 - 2; y += 3) a.r(x + 1, y, 4, 1, shade(col, -32));
      });
    });
  }

  /* 左右対称に描くための鏡写し。x を 32 の中心で折り返す */
  function mirror(a, box, col) { a.r(32 - box[0] - box[2], box[1], box[2], box[3], col); }
  function both(a, box, col) { a.r(box[0], box[1], box[2], box[3], col); mirror(a, box, col); }

  var BOSS = {
    /* --------------------------------------------------------
       鋼鉄のカマキリ：「基地の北をうろつく大型機。鎌で装甲を裂く」
       三角の頭・赤い複眼・前へ突き出した2本の鎌
       -------------------------------------------------------- */
    mantis: {
      body: make(32, 32, function (a) {
        var md = '#5c6a52', hi = '#7c8c70', lo = '#3b4635';
        // 胸部
        a.r(8, 12, 16, 15, OUT);
        a.r(9, 13, 14, 13, md);
        a.r(9, 13, 14, 3, hi);
        a.r(9, 23, 14, 3, lo);
        a.r(13, 17, 6, 6, lo);                     // 胸の装甲板
        a.r(14, 18, 4, 4, '#8ea082');
        // 肩（鎌の付け根）
        both(a, [4, 13, 6, 7], OUT);
        both(a, [5, 14, 4, 5], md);
        both(a, [5, 14, 4, 1], hi);
        // 首
        a.r(13, 9, 6, 4, OUT);
        a.r(14, 10, 4, 3, lo);
        // 三角の頭。下に向かって広がる
        var head = [[15, 1, 2], [14, 2, 4], [13, 3, 6], [12, 4, 8], [11, 5, 10], [11, 6, 10], [12, 7, 8], [13, 8, 6]];
        head.forEach(function (h) { a.r(h[0] - 1, h[1], h[2] + 2, 1, OUT); });
        head.forEach(function (h) { a.r(h[0], h[1], h[2], 1, md); });
        a.r(14, 2, 4, 1, hi);
        // 複眼
        a.r(11, 4, 4, 3, '#e03919');
        a.r(17, 4, 4, 3, '#e03919');
        a.r(11, 4, 4, 1, '#ff9a80');
        a.r(17, 4, 4, 1, '#ff9a80');
        a.p(12, 5, '#ffe0d4'); a.p(18, 5, '#ffe0d4');
        // 触角
        a.r(12, 0, 1, 2, OUT); a.r(19, 0, 1, 2, OUT);
      }),
      arm: make(32, 32, function (a) {             // 鎌
        var mt = '#9aa6b2', ed = '#e4edf5', dk = '#5c6672';
        // 上腕。肩から前（下）へ
        both(a, [3, 17, 5, 7], OUT);
        both(a, [4, 18, 3, 6], mt);
        both(a, [4, 18, 1, 6], '#c6d2de');
        // 鎌の刃。内へ湾曲させる
        [[2, 23, 5, 3], [4, 25, 5, 3], [7, 27, 5, 3], [10, 29, 4, 2]].forEach(function (b) {
          both(a, [b[0] - 1, b[1] - 1, b[2] + 2, b[3] + 2], OUT);
        });
        [[2, 23, 5, 3], [4, 25, 5, 3], [7, 27, 5, 3], [10, 29, 4, 2]].forEach(function (b) {
          both(a, b, mt);
          both(a, [b[0], b[1], b[2], 1], ed);      // 刃の光
        });
        // 内側の鋸歯
        [[7, 24], [9, 26], [12, 28]].forEach(function (q) {
          both(a, [q[0], q[1], 1, 1], dk);
        });
      }),
      track: bossTrack('#4a5158', 11, 28, 0)
    },

    /* --------------------------------------------------------
       双胴のサソリ：「二連装の機体。尾の砲が厄介」
       胴が2つ・前に鋏・背から立つ尾部砲
       -------------------------------------------------------- */
    scorpion: {
      body: make(32, 32, function (a) {
        var md = '#6b5a3a', hi = '#8a7549', lo = '#453a25';
        // 双胴
        both(a, [6, 8, 9, 19], OUT);
        both(a, [7, 9, 7, 17], md);
        both(a, [7, 9, 7, 3], hi);
        both(a, [7, 23, 7, 3], lo);
        both(a, [9, 14, 3, 6], '#f0c53c');         // 二連装の砲口
        both(a, [9, 14, 3, 1], '#fff0a8');
        // 連結部
        a.r(13, 12, 6, 11, OUT);
        a.r(14, 13, 4, 9, md);
        a.r(14, 13, 4, 2, hi);
        // 前に伸びる鋏。二又にして外へ張り出させる
        both(a, [2, 24, 8, 4], OUT);
        both(a, [3, 25, 6, 2], '#8a7549');
        both(a, [3, 25, 6, 1], '#a89060');
        both(a, [1, 27, 4, 5], OUT);      // 外側の爪
        both(a, [2, 28, 2, 3], '#9c8552');
        both(a, [6, 27, 4, 4], OUT);      // 内側の爪
        both(a, [7, 28, 2, 2], '#9c8552');
      }),
      tail: make(32, 32, function (a) {            // 尾部砲
        var seg = '#7d6a44', hi = '#a08a58';
        // 背後から立ち上がり、先へ行くほど細くなる。少し斜めにずらして弧に見せる
        [[10, 0, 8, 5], [11, 4, 7, 5], [13, 8, 6, 4], [14, 11, 5, 4]].forEach(function (b) {
          a.r(b[0] - 1, b[1], b[2] + 2, b[3] + 1, OUT);
          a.r(b[0], b[1] + 1, b[2], b[3] - 1, seg);
          a.r(b[0], b[1] + 1, 2, b[3] - 1, hi);
          a.r(b[0], b[1] + b[3] - 1, b[2], 1, '#54462c');   // 節の切れ目
        });
        // 砲身と砲口
        a.r(14, 15, 5, 6, OUT);
        a.r(15, 16, 3, 5, '#b9c4cf');
        a.r(15, 16, 1, 5, '#e2eaf2');
        a.r(13, 20, 7, 4, OUT);
        a.r(14, 21, 5, 2, '#e03919');
        a.r(15, 21, 3, 1, '#ffd0c0');
      }),
      track: bossTrack('#55483a', 10, 26, 1)
    },

    /* --------------------------------------------------------
       灰色の亡霊：「崖の上に据わったまま動かない、正体不明の重機」
       低く広い装甲・目はなくスリットのみ・巨大な主砲塔
       -------------------------------------------------------- */
    ghost: {
      body: make(32, 32, function (a) {
        var md = '#4d545c', hi = '#666e78', lo = '#333940';
        // 低く据わった車体
        a.r(5, 11, 22, 18, OUT);
        a.r(6, 12, 20, 16, md);
        a.r(6, 12, 20, 3, hi);
        a.r(6, 25, 20, 3, lo);
        // 装甲板の継ぎ目
        a.r(6, 18, 20, 1, lo);
        a.r(6, 22, 20, 1, lo);
        both(a, [8, 13, 2, 14], hi);
        // 目ではなく、ただのスリット。砲塔に隠れない位置に置く
        a.r(9, 23, 14, 2, '#1b1f24');
        a.r(12, 23, 2, 1, '#8d98a4');
        a.r(18, 23, 2, 1, '#8d98a4');
        // 砂に埋まりかけた裾
        a.r(4, 27, 24, 2, '#3a3327');
      }),
      cannon: make(32, 32, function (a) {          // 主砲塔
        a.blob(16, 14, 10, 7, OUT);
        a.blob(16, 14, 9, 6, '#5e666e');
        a.blob(15, 11, 7, 3, '#7e8892');
        a.r(9, 17, 14, 2, '#3b4249');
        // 長い砲身。前（下）へ突き出す
        a.r(13, 18, 6, 14, OUT);
        a.r(14, 19, 4, 13, '#b9c4cf');
        a.r(14, 19, 2, 13, '#e2eaf2');
        a.r(12, 28, 8, 4, OUT);
        a.r(13, 29, 6, 2, '#8d98a4');
      }),
      track: bossTrack('#3f454c', 9, 30, 0)
    }
  };

  /* ==========================================================
     まとめて Phaser のテクスチャに登録する
     ========================================================== */
  var TILE_KEYS = {
    sand:  [sand(11), sand(2903), sand(48211)],
    road:  [road(77), road(6104), road(31337)],
    rock:  [rock(0), rock(1), rock(2)],
    town:  [town()]
  };

  function register(scene, pal) {
    var t = scene.textures;
    function add(key, canvas) {
      if (t.exists(key)) t.remove(key);
      t.addCanvas(key, canvas);
    }

    Object.keys(TILE_KEYS).forEach(function (k) {
      TILE_KEYS[k].forEach(function (c, i) { add('tile-' + k + '-' + i, c); });
    });

    ['right', 'up', 'down'].forEach(function (d) { add('tank-' + d, tank(d, pal)); });

    add('mob-0', drone());
    add('mob-1', buggy());
    add('mob-2', junk());

    Object.keys(BOSS).forEach(function (id) {
      Object.keys(BOSS[id]).forEach(function (part) {
        add('boss-' + id + '-' + part, BOSS[id][part]);
      });
    });
  }

  /* 装備を積み替えたときに戦車だけ描き直す */
  function retank(scene, pal) {
    ['right', 'up', 'down'].forEach(function (d) {
      var key = 'tank-' + d;
      if (scene.textures.exists(key)) scene.textures.remove(key);
      scene.textures.addCanvas(key, tank(d, pal));
    });
  }

  return {
    register: register,
    retank: retank,
    tileVariants: { sand: 3, road: 3, rock: 3, town: 1 },
    // 見た目の確認用
    _make: make, _tank: tank, _shade: shade
  };
})();
