/* ==========================================================
   店の場面（見下ろし・SF）

   原案の「全体的にシステムの表示は使わないで街に含めた形にする」を絵にする。

   方針
   - **見下ろし（トップビュー）**。ドラクエの建物の中のような間取り
   - 世界観はメタルマックス。木造ではなく、鉄板・配管・端末・警告帯のSF
   - 384×240 の低解像度に整数ピクセルで描き、×2 に拡大する
   - 画像ファイルは持たない
   - **文字はキャンバスに描かない。** 部屋名は HTML を上に重ねる（_scene.html 側）
   - 商品を棚に1つずつ並べることはしない（見た目が潰れるため）。
     棚の「数」と「埋まり具合」だけを見せる
   ========================================================== */
window.SCENE = (function () {
  'use strict';

  var W = 448, H = 288;

  /* ---------- 色（廃墟の基地を直して使っている想定） ---------- */
  var C = {
    void:     '#05070a',
    floor:    '#2b333b',
    floorAlt: '#252c33',
    seam:     '#1d232a',
    grate:    '#333d46',
    wall:     '#48535e',
    wallTop:  '#6b7885',
    wallDark: '#2f373f',
    rivet:    '#8996a3',
    metal:    '#7d8a97',
    metalLit: '#a8b4c0',
    rust:     '#8a5a3a',
    rustLit:  '#b0754a',
    warn:     '#d9a441',
    crt:      '#0d1f18',
    crtLit:   '#3fb87a',
    red:      '#e03919',
    blue:     '#3d8be0',
    glow:     'rgba(217,164,65,.10)',
    crtGlow:  'rgba(63,184,122,.12)',
    dark:     '#14181c',
    cloth:    '#3d5a80'
  };

  /* ---------- 人（見下ろし気味の立ち姿・16×16） ---------- */
  var PERSON = [
    '................',
    '......aaaa......',
    '.....abbbba.....',
    '.....abcbca.....',
    '.....abbbba.....',
    '......aaaa......',
    '....adddddda....',
    '...adddddddda...',
    '...adeddddeda...',
    '...adddddddda...',
    '....aaddddaa....',
    '.....a....a.....',
    '....aa....aa....',
    '...aaa....aaa...',
    '................',
    '................'
  ];
  var SUITS = {
    hunter:  ['#14181c', '#d8b48a', '#2a2a2a', '#5a4a38', '#8a5a3a'],
    keeper:  ['#14181c', '#e0c0a0', '#2a2a2a', '#3d5a80', '#d9a441'],
    mobA:    ['#14181c', '#d8b48a', '#2a2a2a', '#48535e', '#7d8a97'],
    mobB:    ['#14181c', '#c8a480', '#2a2a2a', '#5a4650', '#8a6a74'],
    mobC:    ['#14181c', '#e0c0a0', '#2a2a2a', '#3a5a4a', '#5a8a6a'],
    trader:  ['#14181c', '#c8a480', '#2a2a2a', '#6a4a2a', '#d9a441']
  };

  function box(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }

  function stamp(g, grid, pal, x, y) {
    for (var yy = 0; yy < grid.length; yy++) {
      for (var xx = 0; xx < grid[yy].length; xx++) {
        var ch = grid[yy].charAt(xx);
        if (ch === '.') continue;
        var col = pal[ch.charCodeAt(0) - 97];
        if (!col) continue;
        box(g, x + xx, y + yy, 1, 1, col);
      }
    }
  }
  function person(g, kind, x, y) { stamp(g, PERSON, SUITS[kind] || SUITS.mobA, x, y); }

  /* ---------- 床：金属パネルの継ぎ目を見せる ---------- */
  function floorTiles(g, x, y, w, h, grate) {
    box(g, x, y, w, h, C.floor);
    for (var ty = y; ty < y + h; ty += 12) {
      box(g, x, ty, w, 1, C.seam);
      for (var tx = x; tx < x + w; tx += 16) {
        box(g, tx, ty, 1, Math.min(12, y + h - ty), C.seam);
        if (((tx / 16) + (ty / 12)) % 3 === 0) box(g, tx + 1, ty + 1, 15, 11, C.floorAlt);
      }
    }
    if (grate) {   // 格子（通気口）
      for (var gy = y + 4; gy < y + h - 2; gy += 4) box(g, x + 4, gy, w - 8, 2, C.grate);
    }
  }

  /* ---------- 部屋の壁。上辺は face を見せて厚みを出す ---------- */
  function walls(g, x, y, w, h) {
    box(g, x, y, w, 6, C.wall);            // 上の壁（面が見える）
    box(g, x, y, w, 2, C.wallTop);
    box(g, x, y + h - 3, w, 3, C.wallDark);
    box(g, x, y, 3, h, C.wallDark);
    box(g, x + w - 3, y, 3, h, C.wallDark);
    // リベット
    for (var rx = x + 6; rx < x + w - 6; rx += 14) box(g, rx, y + 3, 1, 1, C.rivet);
  }

  /* 部屋（床＋壁）。中身を描ける領域を返す */
  function room(g, x, y, w, h, opt) {
    opt = opt || {};
    floorTiles(g, x + 3, y + 6, w - 6, h - 9, opt.grate);
    walls(g, x, y, w, h);
    if (opt.warn) {                        // 床の警告帯
      for (var sx = x + 6; sx < x + w - 8; sx += 8) box(g, sx, y + h - 8, 4, 3, C.warn);
    }
    return { x: x + 4, y: y + 7, w: w - 8, h: h - 11, fy: y + h - 4 };
  }

  /* ---------- 備品 ---------- */
  function pipe(g, x, y, len, vertical) {
    if (vertical) { box(g, x, y, 4, len, C.metal); box(g, x, y, 1, len, C.metalLit); }
    else { box(g, x, y, len, 4, C.metal); box(g, x, y, len, 1, C.metalLit); }
  }
  function lampGlow(g, x, y, r, col) {
    g.fillStyle = col || C.glow;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  /* 端末（緑のCRT） */
  function terminal(g, x, y, w) {
    w = w || 14;
    box(g, x, y, w, 12, C.metal);
    box(g, x + 1, y + 1, w - 2, 8, C.crt);
    box(g, x + 2, y + 3, w - 6, 1, C.crtLit);
    box(g, x + 2, y + 5, w - 8, 1, C.crtLit);
    box(g, x, y + 12, w, 2, C.wallDark);
    lampGlow(g, x + w / 2, y + 5, 12, C.crtGlow);
  }
  /* 陳列ラック1台。商品は個別に描かず、積まれている量だけ見せる */
  function rack(g, x, y, fill) {
    var w = 34, h = 18;
    box(g, x, y, w, h, C.wallDark);
    box(g, x, y, w, 2, C.metalLit);                 // 天板
    box(g, x, y + h - 2, w, 2, C.metal);            // 前面の縁
    box(g, x, y, 2, h, C.metal);                    // 支柱
    box(g, x + w - 2, y, 2, h, C.metal);
    var f = Math.max(0, Math.min(1, fill));
    var cols = Math.round(6 * f);
    for (var i = 0; i < cols; i++) {                // 積み荷
      var bx = x + 3 + i * 5;
      box(g, bx, y + 4, 4, 5, i % 2 ? C.rust : '#6a5a48');
      if (i % 3 !== 2) box(g, bx, y + 10, 4, 5, i % 2 ? '#5a6a7a' : C.rustLit);
    }
  }
  /* 積み上げた箱 */
  function crates(g, x, y) {
    box(g, x, y, 12, 12, C.rust);
    box(g, x, y, 12, 2, C.rustLit);
    box(g, x + 13, y + 3, 10, 9, '#5a6a7a');
    box(g, x + 13, y + 3, 10, 2, '#7a8a9a');
    box(g, x + 3, y - 9, 10, 9, '#6a5a48');
    box(g, x + 3, y - 9, 10, 2, '#8a7a63');
  }
  /* 自室のベッド（寝ると次の日へ） */
  function bed(g, x, y) {
    box(g, x, y, 26, 34, C.metal);
    box(g, x + 1, y + 1, 24, 32, '#3a4450');
    box(g, x + 3, y + 3, 20, 9, '#c8ced4');        // 枕
    box(g, x + 3, y + 13, 20, 18, '#5a4650');      // 毛布
    box(g, x + 3, y + 13, 20, 2, '#7a6270');
  }
  /* 寝台（カプセル） */
  function pod(g, x, y, fine, occupied) {
    box(g, x, y, 26, 14, C.metal);
    box(g, x + 1, y + 1, 24, 12, fine ? '#3a4a5e' : C.wallDark);
    box(g, x + 2, y + 2, 10, 10, fine ? '#5a6a80' : C.cloth);   // 寝床
    box(g, x + 20, y + 3, 4, 8, C.crt);
    box(g, x + 21, y + 5, 2, 1, C.crtLit);                      // 生体モニタ
    if (fine) box(g, x, y, 26, 1, C.warn);
    if (occupied) { box(g, x + 3, y + 4, 8, 6, '#c8ced4'); box(g, x + 5, y + 2, 5, 4, '#d8b48a'); }
  }
  /* 加工機 */
  function machine(g, x, y, level) {
    box(g, x, y, 22, 20, C.metal);
    box(g, x + 1, y + 1, 20, 18, C.wallDark);
    box(g, x + 4, y + 10, 14, 8, C.red);
    box(g, x + 6, y + 12, 10, 4, C.warn);
    lampGlow(g, x + 11, y + 14, 18);
    pipe(g, x + 6, y - 6, 6, true);
    if (level >= 1) { box(g, x + 26, y + 6, 12, 14, C.metal); box(g, x + 28, y + 8, 8, 6, C.crt); }
    if (level >= 2) { box(g, x + 26, y - 2, 4, 8, C.metalLit); box(g, x + 33, y - 2, 4, 8, C.metalLit); }
  }
  /* サーバーラック */
  function server(g, x, y, blink) {
    box(g, x, y, 16, 22, C.wallDark);
    box(g, x, y, 16, 2, C.metal);
    for (var i = 0; i < 5; i++) {
      box(g, x + 2, y + 4 + i * 4, 12, 2, C.dark);
      box(g, x + 3, y + 4 + i * 4, 2, 2, (blink + i) % 3 ? C.crtLit : C.red);
    }
    lampGlow(g, x + 8, y + 12, 14, C.crtGlow);
  }
  /* 制御盤 */
  function console_(g, x, y, w) {
    box(g, x, y, w, 10, C.metal);
    box(g, x + 1, y + 1, w - 2, 6, C.crt);
    for (var i = 0; i < Math.floor(w / 6); i++) box(g, x + 3 + i * 6, y + 3, 3, 2, C.crtLit);
    box(g, x, y + 10, w, 3, C.wallDark);
    lampGlow(g, x + w / 2, y + 5, 20, C.crtGlow);
  }
  /* 書架（資料室） */
  function archive(g, x, y, w) {
    box(g, x, y, w, 18, C.wallDark);
    box(g, x, y, w, 2, C.metal);
    for (var i = 0; i < Math.floor((w - 4) / 5); i++) {
      box(g, x + 2 + i * 5, y + 4, 3, 12, i % 2 ? C.rust : '#4a5a6a');
    }
  }
  /* カウンター（帳場・酒場） */
  function counter(g, x, y, w, h) {
    box(g, x, y, w, h, C.metal);
    box(g, x, y, w, 2, C.metalLit);
    box(g, x + 1, y + 3, w - 2, h - 4, C.wallDark);
  }
  /* 商人の装甲車 */
  function truck(g, x, y) {
    box(g, x, y + 6, 62, 22, C.wallDark);          // 荷台
    box(g, x, y + 6, 62, 3, C.metal);
    box(g, x + 4, y + 12, 54, 12, C.rust);
    for (var i = 0; i < 4; i++) box(g, x + 8 + i * 13, y + 12, 1, 12, C.wallDark);
    box(g, x + 62, y + 2, 22, 26, C.metal);        // 運転席
    box(g, x + 64, y + 6, 18, 10, C.crt);
    box(g, x + 65, y + 8, 6, 1, C.crtLit);
    box(g, x + 2, y + 28, 14, 6, C.dark);          // 履帯
    box(g, x + 24, y + 28, 14, 6, C.dark);
    box(g, x + 46, y + 28, 14, 6, C.dark);
    box(g, x + 66, y + 28, 14, 6, C.dark);
    box(g, x + 30, y, 8, 6, C.metalLit);           // 排気
  }

  /* ---------- 通路の床（部屋の床と描き分ける） ---------- */
  function corridor(g, x, y, w, h) {
    box(g, x, y, w, h, '#20262c');
    for (var ty = y; ty < y + h; ty += 8) box(g, x, ty, w, 1, '#191e23');
    for (var tx = x; tx < x + w; tx += 8) box(g, tx, y, 1, h, '#191e23');
  }

  /* ---------- 通路に置く物 ---------- */
  function ventFan(g, x, y) {
    box(g, x, y, 12, 12, C.wallDark);
    box(g, x + 1, y + 1, 10, 10, C.dark);
    box(g, x + 5, y + 2, 2, 8, C.metal);
    box(g, x + 2, y + 5, 8, 2, C.metal);
  }
  function vending(g, x, y) {
    box(g, x, y, 14, 20, C.metal);
    box(g, x + 2, y + 2, 10, 10, C.crt);
    box(g, x + 3, y + 4, 3, 2, C.crtLit);
    box(g, x + 3, y + 14, 8, 4, C.red);
    lampGlow(g, x + 7, y + 7, 14, C.crtGlow);
  }
  function locker(g, x, y) {
    box(g, x, y, 20, 14, C.wallDark);
    box(g, x, y, 20, 2, C.metal);
    box(g, x + 9, y + 2, 1, 12, C.metal);
    box(g, x + 5, y + 7, 2, 1, C.rivet);
    box(g, x + 13, y + 7, 2, 1, C.rivet);
  }

  /* ==========================================================
     場面を描く
     st = { slots, racksFilled, rooms:[{grade,who}], mobs, hunters:[], fac:{} }
     戻り値：押せる場所（1倍座標）
     ========================================================== */
  function draw(g, st) {
    var hit = [];
    g.imageSmoothingEnabled = false;
    box(g, 0, 0, W, H, C.void);
    st = st || {};
    var fac = st.fac || {};
    var blink = Math.floor(Date.now() / 500) % 3;

    /* ================= 間取り =================
       ドラクエの街と同じ考え方で、まず「道」を通し、その区画に建物を置く。
       ・道は人が2人すれ違える幅（34〜38px）
       ・道幅と区画の大きさは場所ごとに変えるが、壁は道の縁にきちんと揃える
       ・右の列（資料室・管理室・データルーム・自室）は右端で揃える
       ・入口は下（通り側）。客が入ってすぐが店舗になるように前面に置く */
    var BLD = 232;                                  // 建物の下端
    corridor(g, 0, 0, W, BLD);
    box(g, 0, 0, W, 3, C.wallDark);
    box(g, 0, 0, W, 1, C.wallTop);
    box(g, 0, 0, 3, BLD, C.wallDark);
    box(g, W - 3, 0, 3, BLD, C.wallDark);

    var slots = st.slots || 6;
    var fill = st.racksFilled == null ? 0.6 : st.racksFilled;

    /* ---------- 奥（上）：作業と生活の区画 ---------- */

    /* 工房 */
    var ws = room(g, 4, 4, 110, 76, { grate: true });
    machine(g, ws.x + 6, ws.y + 20, fac.workshop || 0);
    locker(g, ws.x + 72, ws.y + 4);
    crates(g, ws.x + 76, ws.y + 46);
    person(g, 'keeper', ws.x + 46, ws.y + 34);
    hit.push({ x: 4, y: 4, w: 110, h: 76, place: 'workshop', label: '工房' });

    /* 宿屋（一番広い） */
    var inn = room(g, 152, 4, 154, 114);
    var beds = st.rooms || [];
    beds.slice(0, 8).forEach(function (rm, k) {
      var bx = inn.x + 6 + (k % 2) * 76;
      var by = inn.y + 6 + Math.floor(k / 2) * 26;
      pod(g, bx, by, rm.grade >= 2, !!rm.who);
    });
    ventFan(g, inn.x + inn.w - 16, inn.y + inn.h - 16);
    terminal(g, inn.x + 4, inn.y + inn.h - 18, 16);
    hit.push({ x: 152, y: 4, w: 154, h: 114, place: 'inn', label: '宿屋' });

    /* 右の列：資料室・管理室（右端で揃える） */
    var RX = 342, RW = 102;
    var lib = room(g, RX, 4, RW, 54);
    archive(g, lib.x + 4, lib.y + 6, 40);
    archive(g, lib.x + 50, lib.y + 6, 40);
    terminal(g, lib.x + 36, lib.y + 30, 18);
    hit.push({ x: RX, y: 4, w: RW, h: 54, place: 'library', label: '資料室' });

    var adm = room(g, RX, 58, RW, 60);
    console_(g, adm.x + 4, adm.y + 6, 70);
    console_(g, adm.x + 4, adm.y + 24, 52);
    box(g, adm.x + 78, adm.y + 24, 12, 12, C.metal);
    box(g, adm.x + 80, adm.y + 26, 8, 8, C.red);
    hit.push({ x: RX, y: 58, w: RW, h: 60, place: 'admin', label: '管理室' });

    /* ---------- 手前（下）：客が来る区画 ---------- */

    /* 店舗（入口の正面） */
    var sp = room(g, 4, 152, 156, 80, { warn: true });
    hit.push({ x: 4, y: 152, w: 156, h: 80, place: 'shop', label: '店舗' });

    var racks = Math.max(2, Math.min(8, Math.round(slots / 1.5)));
    var placed = 0;
    for (var i = 0; i < Math.min(4, racks); i++) {           // 壁際
      rack(g, sp.x + 4 + i * 37, sp.y + 3, fill); placed++;
    }
    for (var j = 0; placed < racks && j < 4; j++) {           // 中央の島
      rack(g, sp.x + 22 + (j % 2) * 74, sp.y + 26 + Math.floor(j / 2) * 22, fill);
      placed++;
    }
    var cy = sp.y + sp.h - 20;
    counter(g, sp.x + 16, cy, 86, 11);                        // 帳場
    terminal(g, sp.x + 106, cy - 12, 15);
    person(g, 'keeper', sp.x + 44, cy - 15);
    hit.push({ x: sp.x + 12, y: cy - 16, w: 110, h: 28, place: 'office', label: '帳場' });
    box(g, sp.x + sp.w - 10, sp.y + 1, 4, 4, C.red);
    lampGlow(g, sp.x + sp.w - 8, sp.y + 3, 14, 'rgba(224,57,25,.10)');

    /* 酒場 */
    var bar = room(g, 196, 152, 110, 80);
    counter(g, bar.x + 6, bar.y + bar.h - 20, 82, 12);
    box(g, bar.x + 12, bar.y + bar.h - 26, 4, 5, C.warn);
    box(g, bar.x + 20, bar.y + bar.h - 26, 4, 5, C.warn);
    for (var t = 0; t < 2; t++) {                             // 立ち飲みの卓
      var tx = bar.x + 10 + t * 52, ty = bar.y + 8;
      box(g, tx, ty, 24, 15, C.metal);
      box(g, tx + 1, ty + 1, 22, 13, C.wallDark);
    }
    terminal(g, bar.x + bar.w - 22, bar.y + 30, 16);          // 依頼の掲示端末
    var mobs = Math.min(4, st.mobs || 0);
    for (var m = 0; m < mobs; m++) {
      person(g, ['mobA', 'mobB', 'mobC'][m % 3], bar.x + 8 + m * 24, bar.y + 30);
    }
    hit.push({ x: 196, y: 152, w: 110, h: 80, place: 'saloon', label: '酒場' });

    /* 右の列：データルーム・自室 */
    var dat = room(g, RX, 152, RW, 38, { grate: true });
    server(g, dat.x + 8, dat.y + 5, blink);
    server(g, dat.x + 34, dat.y + 5, blink + 1);
    server(g, dat.x + 60, dat.y + 5, blink + 2);
    hit.push({ x: RX, y: 152, w: RW, h: 38, place: 'data', label: 'データルーム' });

    /* 自室（寝ると次の日へ） */
    var my = room(g, RX, 190, RW, 42);
    bed(g, my.x + 6, my.y + 2);
    box(g, my.x + 40, my.y + 20, 16, 10, C.metal);            // 小机
    box(g, my.x + 42, my.y + 22, 12, 6, C.wallDark);
    terminal(g, my.x + 62, my.y + 6, 16);
    hit.push({ x: RX, y: 190, w: RW, h: 42, place: 'bedroom', label: '自室' });

    /* ---------- 道に置く物と、歩いている人 ---------- */
    pipe(g, 118, 6, 100, true);                               // 縦の道の配管
    pipe(g, 118, 118, 30, true);
    vending(g, 122, 24);
    ventFan(g, 128, 96);
    locker(g, 118, 196);
    crates(g, 168, 130);
    vending(g, 314, 126);
    for (var wm = 10; wm < W - 14; wm += 16) box(g, wm, 134, 8, 1, C.warn);   // 横の道の区画線

    person(g, 'mobA', 126, 60);
    person(g, 'mobB', 320, 200);
    (st.hunters || []).slice(0, 3).forEach(function (_, k) {
      person(g, 'hunter', 200 + k * 26, 128);                 // 横の道を歩くハンター
    });

    /* ================= 下：入口と通り ================= */
    var stY = BLD;
    // 外は屋内と描き分ける。舗装の割れと瓦礫で「荒野の街」に寄せる
    box(g, 0, stY, W, H - stY, '#211d18');
    for (var dy = stY + 6; dy < H; dy += 9) box(g, 0, dy, W, 1, '#191512');
    for (var dx = 0; dx < W; dx += 37) box(g, dx, stY + 4, 1, H - stY - 4, '#191512');
    for (var rb = 0; rb < 14; rb++) {                       // 瓦礫
      var bx2 = (rb * 53 + 17) % W, by2 = stY + 8 + (rb * 29) % (H - stY - 14);
      box(g, bx2, by2, 2 + rb % 2, 2, '#332c25');
    }
    box(g, 0, stY, W, 4, C.wallDark);                       // 建物の外壁
    box(g, 0, stY, W, 1, C.wallTop);

    // 扉。店舗と酒場が通りに面しているので、それぞれの前に置く
    // （押しても開くものは無いので当たり判定は置かない）
    [[40, '店舗'], [230, '酒場']].forEach(function (d) {
      box(g, d[0] - 4, stY - 4, 44, 4, C.warn);
      box(g, d[0], stY, 36, 8, C.metal);
      for (var sy = stY + 1; sy < stY + 7; sy += 3) box(g, d[0], sy, 36, 1, C.wallDark);
      lampGlow(g, d[0] + 18, stY + 4, 24);
    });

    // 商人の装甲車
    truck(g, 300, stY + 12);
    person(g, 'trader', 288, stY + 26);
    hit.push({ x: 282, y: stY + 8, w: 112, h: 44, place: 'merchant', label: '商人' });

    // 通行人
    person(g, 'mobA', 110, stY + 28);
    person(g, 'mobB', 160, stY + 20);
    person(g, 'mobC', 196, stY + 32);

    return hit;
  }

  return { draw: draw, W: W, H: H };
})();
