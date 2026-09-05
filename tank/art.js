/* ==========================================================
   ドット絵

   方針
   - 解像度は初代メタルマックス相当。タイルは 16x16、キャラは 16〜24px
   - 色数は制限しない。1マテリアルにつき5段の明暗を持たせる
   - 表示時に2倍へ引き伸ばす（タイル32px・戦車48px）

   画像ファイルは持たず、実行時にここで描いてテクスチャを作る。
   差し替えも色替えもコードだけで済む。
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
      w: w, h: h,
      r: function (x, y, rw, rh, col) { g.fillStyle = col; g.fillRect(x | 0, y | 0, rw | 0, rh | 0); },
      p: function (x, y, col) { g.fillStyle = col; g.fillRect(x | 0, y | 0, 1, 1); },
      /* 点を並べて描く。[[x,y],[x,y]...] */
      dots: function (list, col) { list.forEach(function (d) { api.p(d[0], d[1], col); }); },
      /* 楕円の塊 */
      blob: function (cx, cy, rx, ry, col) {
        for (var y = -ry; y <= ry; y++) {
          var t = 1 - (y * y) / (ry * ry + .0001);
          if (t <= 0) continue;
          var half = Math.round(rx * Math.sqrt(t));
          api.r(cx - half, cy + y, half * 2 + 1, 1, col);
        }
      },
      /* 左右対称に置く。画像の中心で折り返す */
      both: function (x, y, rw, rh, col) {
        api.r(x, y, rw, rh, col);
        api.r(w - x - rw, y, rw, rh, col);
      }
    };
    draw(api);
    return c;
  }

  /* 明暗を作る。明るい側は黄に、暗い側は青に寄せると絵が濁らない */
  function tone(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var wr = amt > 0 ? 1.18 : 0.86;
    var wb = amt > 0 ? 0.66 : 1.22;
    function c(v) { return Math.max(0, Math.min(255, Math.round(v))); }
    r = c(r + amt * wr); g = c(g + amt); b = c(b + amt * wb);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* 5段の明暗をまとめて作る。[0]が最も暗く [4]が最も明るい */
  function ramp(base) {
    return [tone(base, -52), tone(base, -26), base, tone(base, 26), tone(base, 52)];
  }

  var OUT = '#191d22';        // 輪郭。真っ黒にはしない

  /* ==========================================================
     地形（16x16）
     ========================================================== */
  var SAND  = ramp('#a88855');
  var ROAD  = ramp('#cbb188');
  var STONE = ramp('#6b7580');

  /* 風紋。横に伸びる短い弧を置く */
  function ripple(a, y, x0, len, dark, light) {
    for (var i = 0; i < len; i++) {
      var x = (x0 + i) % 16;
      var dy = (i === 0 || i === len - 1) ? 1 : 0;   // 端を下げて弧に見せる
      a.p(x, y + dy, dark);
      // 明線は弧の中ほどだけ。全部に乗せると地面が騒がしくなる
      if (i > 0 && i < len - 1 && i % 2 === 0) a.p(x, y + dy - 1, light);
    }
  }

  function sand(v) {
    var rp = [
      [[3, 3, 6], [9, 7, 5], [1, 11, 7], [10, 14, 5]],
      [[7, 4, 5], [1, 8, 6], [8, 12, 6], [3, 15, 4]],
      [[1, 5, 7], [10, 9, 5], [4, 13, 6], [12, 2, 4]]
    ][v];
    var stones = [
      [[13, 5], [5, 9]], [[2, 2], [12, 12]], [[7, 6], [14, 14]]
    ][v];
    return make(16, 16, function (a) {
      a.r(0, 0, 16, 16, SAND[2]);
      rp.forEach(function (s) { ripple(a, s[1], s[0], s[2], SAND[1], SAND[3]); });
      a.dots([[2, 6], [14, 9], [6, 15], [11, 1], [0, 12]], SAND[1]);
      a.dots([[5, 4], [12, 7], [8, 14], [1, 1]], SAND[3]);
      stones.forEach(function (s) {
        a.r(s[0], s[1] + 1, 2, 1, SAND[0]);
        a.r(s[0], s[1], 2, 1, STONE[2]);
        a.p(s[0], s[1], STONE[3]);
      });
    });
  }

  function road(v) {
    var gravel = [
      [[2, 3], [9, 5], [5, 11], [13, 9]],
      [[6, 2], [1, 8], [11, 12], [14, 5]],
      [[4, 6], [12, 3], [8, 13], [2, 14]]
    ][v];
    return make(16, 16, function (a) {
      a.r(0, 0, 16, 16, ROAD[2]);
      // 踏み固められて色が抜けたところ
      a.dots([[1, 2], [7, 4], [13, 7], [4, 9], [10, 14], [15, 11]], ROAD[3]);
      a.dots([[3, 5], [11, 2], [6, 8], [14, 13], [0, 15]], ROAD[1]);
      // 浮いた砂利
      gravel.forEach(function (s) {
        a.p(s[0], s[1] + 1, ROAD[0]);
        a.p(s[0], s[1], STONE[3]);
      });
    });
  }

  function rock(v) {
    var f = [
      { cx: 8, cy: 8, rx: 6, ry: 5 },
      { cx: 7, cy: 9, rx: 5, ry: 4 },
      { cx: 9, cy: 8, rx: 7, ry: 4 }
    ][v];
    return make(16, 16, function (a) {
      a.r(0, 0, 16, 16, SAND[2]);
      a.dots([[2, 3], [13, 5], [5, 14], [11, 12]], SAND[1]);
      // 落ちる影
      a.blob(f.cx + 1, f.cy + 2, f.rx, f.ry - 1, SAND[0]);
      // 岩本体。左上から光が当たる
      a.blob(f.cx, f.cy, f.rx, f.ry, OUT);
      a.blob(f.cx, f.cy, f.rx - 1, f.ry - 1, STONE[1]);
      a.blob(f.cx - 1, f.cy - 1, f.rx - 2, f.ry - 2, STONE[2]);
      a.blob(f.cx - 1, f.cy - 2, f.rx - 3, f.ry - 3, STONE[3]);
      a.blob(f.cx - 2, f.cy - 3, Math.max(1, f.rx - 5), 1, STONE[4]);
      // 割れ目
      a.p(f.cx + 1, f.cy, STONE[0]);
      a.p(f.cx + 2, f.cy + 1, STONE[0]);
      a.blob(f.cx + 1, f.cy + f.ry - 1, f.rx - 3, 1, STONE[0]);
    });
  }

  function town() {
    var W = ramp('#c9a86e');      // 壁
    var R = ramp('#a8542e');      // 屋根
    return make(16, 16, function (a) {
      a.r(0, 0, 16, 16, ROAD[2]);
      a.dots([[1, 14], [14, 2], [7, 15]], ROAD[3]);

      // 奥の小屋
      a.r(1, 3, 6, 9, OUT);
      a.r(2, 4, 4, 7, W[2]);
      a.r(2, 4, 4, 1, W[3]);
      a.r(2, 10, 4, 1, W[1]);
      a.r(1, 2, 6, 2, OUT);
      a.r(2, 2, 4, 1, R[3]);
      a.r(2, 3, 4, 1, R[2]);
      a.r(3, 6, 2, 2, OUT);
      a.p(3, 6, '#f0c53c');            // 灯り

      // 手前の櫓
      a.r(8, 5, 7, 9, OUT);
      a.r(9, 6, 5, 7, W[2]);
      a.r(9, 6, 5, 1, W[3]);
      a.r(9, 12, 5, 1, W[1]);
      a.r(13, 6, 1, 7, W[1]);
      a.r(8, 4, 7, 2, OUT);
      a.r(9, 4, 5, 1, R[3]);
      a.r(9, 5, 5, 1, R[2]);
      a.r(10, 9, 2, 4, OUT);           // 扉
      a.r(10, 9, 2, 1, '#6b4a28');
      a.p(9, 7, '#f0c53c');            // 窓
      a.p(12, 7, '#f0c53c');

      // 旗
      a.r(11, 1, 1, 4, '#5c6672');
      a.r(12, 1, 3, 2, R[3]);
      a.r(12, 2, 3, 1, R[2]);
    });
  }

  /* ==========================================================
     戦車（24x24）
     装備の色をそのまま渡す。積み替えると見た目が変わる
     ========================================================== */
  /* pal = { body, tread, barrel, sub }

     立体に見せる要は「どの部品にも上面と手前の側面を持たせる」こと。
     真上からの平面図に縁の光を足しても、面が1枚なら板にしか見えない。
     上面と側面の境で明度を段差にすると、そこに角があると読める。
     グラデーションにすると角が消えるので使わない。

     16x16の枠いっぱいを使う。タイルと同じ寸法に収める。

     面の積み方（右向き。画面の上が奥）
        y0-2    奥の履帯（上面だけ見える）
        y2-10   車体   … 上面 y3-6 / 手前の側面 y7-9
        y10-14  手前の履帯（上面＋側面。厚みが出る）
        y15     接地影
     砲塔は車体の上面に載るので、高さのぶん上へ伸び、車体へ影を落とす。
     砲身は先を膨らませない。16ドットでは木槌に見えてしまう。 */
  function tank(dir, pal) {
    var B = ramp(pal.body), T = ramp(pal.tread), C = ramp(pal.barrel);
    var S = pal.sub ? ramp(pal.sub) : null;
    var SHADOW = 'rgba(0,0,0,.28)';

    return make(16, 16, function (a) {
      var i;

      if (dir === 'right') {
        // 奥の履帯
        a.r(1, 0, 14, 3, OUT);
        a.r(2, 1, 12, 1, T[3]);
        for (i = 2; i < 14; i += 3) a.p(i, 1, T[1]);

        // 車体：上面 y3-6 ／ 手前の側面 y7-9
        a.r(0, 2, 16, 9, OUT);
        a.r(1, 3, 14, 4, B[3]);
        a.r(2, 3, 12, 1, B[4]);                    // 奥の縁が最も明るい
        a.r(13, 4, 2, 3, B[2]);                    // 前へ落ちる面
        a.r(1, 7, 14, 3, B[1]);                    // 手前の側面
        a.r(1, 9, 14, 1, B[0]);
        a.r(2, 4, 3, 1, B[2]);                     // 機関室のグリル
        a.r(2, 5, 3, 1, B[2]);

        // 手前の履帯
        a.r(1, 10, 14, 5, OUT);
        a.r(2, 11, 12, 3, T[2]);
        a.r(2, 11, 12, 1, T[3]);
        a.r(2, 13, 12, 1, T[0]);
        for (i = 2; i < 14; i += 3) a.r(i, 11, 1, 3, T[0]);

        a.blob(9, 15, 7, 1, SHADOW);               // 接地影

        // 砲塔。車体の上面に載り、右下へ影を落とす
        a.r(11, 5, 3, 2, B[1]);
        a.r(4, 1, 8, 7, OUT);
        a.r(5, 2, 6, 2, B[4]);                     // 上面
        a.r(5, 4, 6, 3, B[2]);                     // 手前の側面
        a.r(7, 2, 2, 1, B[3]);                     // ハッチ

        // 主砲。先を膨らませない長方形
        a.r(11, 1, 5, 4, OUT);
        a.r(11, 2, 5, 1, C[4]);                    // 上面
        a.r(11, 3, 5, 1, C[2]);                    // 手前の側面

        if (S) {                                   // 副砲
          a.r(10, 7, 6, 3, OUT);
          a.r(10, 8, 6, 1, S[3]);
        }
      } else {
        var up = dir === 'up';

        // 左右の履帯
        [0, 12].forEach(function (x, k) {
          a.r(x, 1, 4, 12, OUT);
          a.r(x + 1, 2, 2, 10, k ? T[1] : T[3]);
          a.r(x + 1, 2, 1, 10, k ? T[0] : T[4]);
          a.r(x, 12, 4, 3, OUT);                   // 手前に回り込む厚み
          a.r(x + 1, 13, 2, 1, k ? T[0] : T[2]);
          for (i = 3; i < 12; i += 3) a.r(x + 1, i, 2, 1, T[0]);
        });

        // 車体：上面 y1-9 ／ 手前の側面 y10-12
        a.r(3, 0, 10, 14, OUT);
        a.r(4, 1, 8, 9, B[3]);
        a.r(4, 1, 1, 9, B[4]);                     // 左の縁が最も明るい
        a.r(10, 1, 1, 9, B[2]);
        a.r(4, up ? 1 : 9, 8, 1, up ? B[4] : B[2]);
        a.r(4, 10, 8, 3, B[1]);                    // 手前の側面
        a.r(4, 12, 8, 1, B[0]);
        a.r(5, up ? 8 : 2, 1, 2, B[2]);            // 機関室のグリル
        a.r(10, up ? 8 : 2, 1, 2, B[2]);

        a.blob(8, 15, 7, 1, SHADOW);               // 接地影

        // 砲塔
        a.r(10, 7, 2, 3, B[1]);                    // 車体へ落ちる影
        a.r(4, 2, 8, 8, OUT);
        a.r(5, 3, 6, 3, B[4]);                     // 上面
        a.r(5, 6, 6, 3, B[2]);                     // 手前の側面
        a.r(7, 4, 2, 1, B[3]);                     // ハッチ

        // 主砲
        if (up) {
          a.r(6, 0, 4, 5, OUT);
          a.r(7, 0, 2, 4, C[2]);
          a.r(7, 0, 1, 4, C[4]);                   // 左が明るい面
        } else {
          a.r(6, 8, 4, 8, OUT);
          a.r(7, 9, 2, 6, C[2]);
          a.r(7, 9, 1, 6, C[4]);
        }

        if (S) {                                   // 副砲
          a.r(11, up ? 0 : 9, 3, 6, OUT);
          a.r(12, up ? 0 : 10, 1, 5, S[3]);
        }
      }
    });
  }

  /* ==========================================================
     雑魚
     ========================================================== */
  function drone() {
    var M = ramp('#8d9aa8'), E = ramp('#e03919');
    return make(16, 16, function (a) {
      a.blob(8, 14, 5, 1, 'rgba(0,0,0,.3)');       // 浮いている影
      // ローター
      a.r(0, 2, 6, 2, OUT); a.r(10, 2, 6, 2, OUT);
      a.r(1, 2, 4, 1, M[4]); a.r(11, 2, 4, 1, M[4]);
      a.r(1, 3, 4, 1, M[1]); a.r(11, 3, 4, 1, M[1]);
      // 支柱
      a.r(3, 4, 2, 3, OUT); a.r(11, 4, 2, 3, OUT);
      a.p(3, 4, M[3]); a.p(11, 4, M[3]);
      // 機体
      a.blob(8, 9, 5, 4, OUT);
      a.blob(8, 9, 4, 3, M[2]);
      a.blob(7, 8, 3, 2, M[3]);
      a.blob(7, 7, 2, 1, M[4]);
      a.r(4, 11, 8, 1, M[0]);
      // 単眼
      a.r(7, 8, 4, 4, OUT);
      a.r(8, 9, 2, 2, E[2]);
      a.p(8, 9, E[4]);
    });
  }

  function buggy() {
    var Y = ramp('#e8b52c'), M = ramp('#7d8894');
    return make(16, 16, function (a) {
      a.blob(8, 15, 6, 1, 'rgba(0,0,0,.3)');
      // 車輪
      a.blob(3, 13, 2, 2, OUT); a.blob(12, 13, 2, 2, OUT);
      a.p(3, 12, M[2]); a.p(12, 12, M[2]);
      // 車体
      a.r(1, 8, 14, 5, OUT);
      a.r(2, 9, 12, 3, Y[2]);
      a.r(2, 9, 12, 1, Y[4]);
      a.r(2, 11, 12, 1, Y[1]);
      a.r(2, 9, 2, 3, Y[3]);
      // ロールバー
      a.r(3, 3, 7, 6, OUT);
      a.r(4, 4, 5, 4, Y[1]);
      a.r(4, 4, 5, 1, Y[3]);
      a.r(5, 5, 3, 2, '#3a3427');       // 座席
      // 積んだ機銃
      a.r(10, 5, 5, 3, OUT);
      a.r(10, 6, 4, 1, M[3]);
      a.p(14, 6, M[4]);
    });
  }

  function junk() {
    var P = ramp('#b45cd6'), M = ramp('#7d8894');
    return make(16, 16, function (a) {
      a.blob(9, 15, 5, 1, 'rgba(0,0,0,.32)');       // 接地影
      // 腕。胴より先に描いて外へ張り出させる
      a.r(0, 6, 3, 7, OUT); a.r(13, 6, 3, 7, OUT);
      a.r(1, 7, 1, 5, M[3]); a.r(14, 7, 1, 5, M[1]);
      a.p(1, 7, M[4]); a.p(14, 7, M[2]);
      // 胴。左が明るく右へ回り込む
      a.r(4, 4, 8, 10, OUT);
      a.r(5, 5, 6, 8, P[2]);
      a.r(5, 5, 6, 1, P[4]);
      a.r(5, 6, 1, 7, P[3]);
      a.r(10, 6, 1, 7, P[1]);
      a.r(5, 12, 6, 1, P[0]);
      // 胸の炉
      a.r(6, 8, 4, 3, OUT);
      a.r(7, 9, 2, 1, '#f0c53c');
      a.p(7, 9, '#fff0a8');
      // 頭
      a.r(5, 0, 6, 4, OUT);
      a.r(6, 1, 4, 2, P[1]);
      a.r(6, 1, 4, 1, P[3]);
      a.p(6, 2, '#f0c53c'); a.p(9, 2, '#f0c53c');
      // 脚
      a.r(5, 13, 2, 3, OUT); a.r(9, 13, 2, 3, OUT);
      a.p(5, 13, M[3]); a.p(9, 13, M[2]);
    });
  }

  /* ==========================================================
     賞金首（32x32）
     data.js の設定文に合わせる。部位ごとに分けて描く
     ========================================================== */
  function bossTrack(base, y0, y1, inset) {
    var T = ramp(base);
    return make(32, 32, function (a) {
      [inset, 32 - inset - 6].forEach(function (x) {
        var len = y1 - y0;
        a.r(x, y0, 6, len, OUT);
        a.r(x + 1, y0 + 1, 4, len - 2, T[2]);
        a.r(x + 1, y0 + 1, 1, len - 2, T[4]);
        a.r(x + 4, y0 + 1, 1, len - 2, T[0]);
        for (var y = y0 + 2; y < y1 - 2; y += 3) a.r(x + 1, y, 4, 1, T[0]);
      });
    });
  }

  var BOSS = {
    /* 鋼鉄のカマキリ：「大型機。鎌で装甲を裂く」 */
    mantis: {
      body: make(32, 32, function (a) {
        var G = ramp('#6f8058'), E = ramp('#e03919');
        // 胸部
        a.r(8, 12, 16, 15, OUT);
        a.r(9, 13, 14, 13, G[2]);
        a.r(9, 13, 14, 3, G[3]);
        a.r(9, 13, 14, 1, G[4]);
        a.r(9, 23, 14, 3, G[1]);
        a.r(9, 25, 14, 1, G[0]);
        a.r(12, 17, 8, 7, G[1]);            // 胸の装甲板
        a.r(13, 18, 6, 5, G[3]);
        a.r(13, 18, 6, 1, G[4]);
        // 肩
        a.both(4, 13, 6, 7, OUT);
        a.both(5, 14, 4, 5, G[2]);
        a.both(5, 14, 4, 1, G[4]);
        a.both(5, 18, 4, 1, G[0]);
        // 首
        a.r(13, 9, 6, 4, OUT);
        a.r(14, 10, 4, 3, G[1]);
        // 三角の頭
        var head = [[15, 1, 2], [14, 2, 4], [13, 3, 6], [12, 4, 8],
                    [11, 5, 10], [11, 6, 10], [12, 7, 8], [13, 8, 6]];
        head.forEach(function (h) { a.r(h[0] - 1, h[1], h[2] + 2, 1, OUT); });
        head.forEach(function (h) { a.r(h[0], h[1], h[2], 1, G[2]); });
        a.r(14, 2, 4, 1, G[4]);
        a.r(12, 7, 8, 1, G[1]);
        // 複眼
        a.r(11, 4, 4, 3, E[2]);
        a.r(17, 4, 4, 3, E[2]);
        a.r(11, 4, 4, 1, E[4]);
        a.r(17, 4, 4, 1, E[4]);
        a.p(12, 5, '#ffe6dc'); a.p(18, 5, '#ffe6dc');
        // 触角
        a.r(12, 0, 1, 2, OUT); a.r(19, 0, 1, 2, OUT);
      }),
      arm: make(32, 32, function (a) {        // 鎌
        var M = ramp('#a9b6c3');
        // 上腕
        a.both(3, 17, 5, 7, OUT);
        a.both(4, 18, 3, 6, M[2]);
        a.both(4, 18, 1, 6, M[4]);
        a.both(6, 18, 1, 6, M[0]);
        // 刃。内へ湾曲させる
        var blade = [[2, 23, 5, 3], [4, 25, 5, 3], [7, 27, 5, 3], [10, 29, 4, 2]];
        blade.forEach(function (b) { a.both(b[0] - 1, b[1] - 1, b[2] + 2, b[3] + 2, OUT); });
        blade.forEach(function (b) {
          a.both(b[0], b[1], b[2], b[3], M[2]);
          a.both(b[0], b[1], b[2], 1, M[4]);              // 刃の光
          a.both(b[0], b[1] + b[3] - 1, b[2], 1, M[1]);
        });
        // 内側の鋸歯
        [[7, 24], [9, 26], [12, 28]].forEach(function (q) { a.both(q[0], q[1], 1, 1, M[0]); });
      }),
      track: bossTrack('#5b636c', 11, 28, 0)
    },

    /* 双胴のサソリ：「二連装の機体。尾の砲が厄介」 */
    scorpion: {
      body: make(32, 32, function (a) {
        var S = ramp('#8a7549'), Y = ramp('#f0c53c');
        // 双胴
        a.both(6, 8, 9, 19, OUT);
        a.both(7, 9, 7, 17, S[2]);
        a.both(7, 9, 7, 3, S[3]);
        a.both(7, 9, 7, 1, S[4]);
        a.both(7, 23, 7, 3, S[1]);
        a.both(7, 25, 7, 1, S[0]);
        // 二連装の砲口
        a.both(8, 13, 5, 8, OUT);
        a.both(9, 14, 3, 6, Y[2]);
        a.both(9, 14, 3, 1, Y[4]);
        a.both(9, 19, 3, 1, Y[0]);
        // 連結部
        a.r(13, 12, 6, 11, OUT);
        a.r(14, 13, 4, 9, S[2]);
        a.r(14, 13, 4, 2, S[3]);
        a.r(14, 21, 4, 1, S[0]);
        // 鋏
        a.both(2, 24, 8, 4, OUT);
        a.both(3, 25, 6, 2, S[2]);
        a.both(3, 25, 6, 1, S[3]);
        a.both(1, 27, 4, 5, OUT);
        a.both(2, 28, 2, 3, S[3]);
        a.both(6, 27, 4, 4, OUT);
        a.both(7, 28, 2, 2, S[3]);
      }),
      tail: make(32, 32, function (a) {       // 尾部砲
        var S = ramp('#8a7549'), M = ramp('#b9c4cf'), E = ramp('#e03919');
        // 背から立ち上がり、先へ行くほど細くなる
        [[10, 0, 8, 5], [11, 4, 7, 5], [13, 8, 6, 4], [14, 11, 5, 4]].forEach(function (b) {
          a.r(b[0] - 1, b[1], b[2] + 2, b[3] + 1, OUT);
          a.r(b[0], b[1] + 1, b[2], b[3] - 1, S[2]);
          a.r(b[0], b[1] + 1, 2, b[3] - 1, S[4]);
          a.r(b[0], b[1] + b[3] - 1, b[2], 1, S[0]);
        });
        // 砲身と砲口
        a.r(14, 15, 5, 6, OUT);
        a.r(15, 16, 3, 5, M[2]);
        a.r(15, 16, 1, 5, M[4]);
        a.r(14, 20, 5, 4, OUT);
        a.r(15, 21, 3, 2, E[2]);
        a.r(15, 21, 3, 1, E[4]);
      }),
      track: bossTrack('#6b5a45', 10, 26, 1)
    },

    /* 灰色の亡霊：「据わったまま動かない、正体不明の重機」 */
    ghost: {
      body: make(32, 32, function (a) {
        var G = ramp('#5e666e');
        a.r(5, 11, 22, 18, OUT);
        a.r(6, 12, 20, 16, G[2]);
        a.r(6, 12, 20, 3, G[3]);
        a.r(6, 12, 20, 1, G[4]);
        a.r(6, 25, 20, 3, G[1]);
        a.r(6, 27, 20, 1, G[0]);
        // 装甲板の継ぎ目
        a.r(6, 18, 20, 1, G[0]);
        a.r(6, 19, 20, 1, G[3]);
        a.r(6, 22, 20, 1, G[0]);
        a.both(8, 13, 2, 14, G[3]);
        // 目ではなく、ただのスリット
        a.r(9, 23, 14, 2, '#141a20');
        a.r(12, 23, 2, 1, G[4]);
        a.r(18, 23, 2, 1, G[4]);
        // 砂に埋まりかけた裾
        a.r(4, 27, 24, 2, SAND[1]);
        a.r(4, 28, 24, 1, SAND[2]);
      }),
      cannon: make(32, 32, function (a) {     // 主砲塔
        var G = ramp('#79838d'), M = ramp('#b9c4cf');
        a.blob(16, 14, 10, 7, OUT);
        a.blob(16, 14, 9, 6, G[2]);
        a.blob(16, 12, 8, 4, G[3]);
        a.blob(15, 10, 6, 2, G[4]);
        a.r(8, 17, 16, 2, G[0]);
        // 長い砲身。先は膨らませない
        a.r(13, 18, 6, 14, OUT);
        a.r(14, 19, 4, 13, M[2]);
        a.r(14, 19, 2, 13, M[4]);
        a.r(17, 19, 1, 13, M[0]);
      }),
      track: bossTrack('#4b525a', 9, 30, 0)
    }
  };

  /* ==========================================================
     Phaser のテクスチャに登録する
     ========================================================== */
  var TILES = {
    sand: [sand(0), sand(1), sand(2)],
    road: [road(0), road(1), road(2)],
    rock: [rock(0), rock(1), rock(2)],
    town: [town()]
  };

  function register(scene, pal) {
    var t = scene.textures;
    function add(key, canvas) {
      if (t.exists(key)) t.remove(key);
      t.addCanvas(key, canvas);
    }
    Object.keys(TILES).forEach(function (k) {
      TILES[k].forEach(function (c, i) { add('tile-' + k + '-' + i, c); });
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
    _make: make, _tank: tank, _tone: tone, _ramp: ramp
  };
})();
