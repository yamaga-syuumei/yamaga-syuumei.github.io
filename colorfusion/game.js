/* ==========================================================
   カラー・フュージョン ／ 試作 step 2

   企画書：ActivityPlan/WebGame/IdeaPlan/WEBゲーム企画_カラーフュージョン.md

   呼び方
   - エネルギー：外から飛んでくる色付きのもの。輪郭の円で描く
   - 火花　　　：融合のときに飛び散るもの。中まで色が付いた点で描く
   - 塊　　　　：融合して大きくなったエネルギー

   ルール
   - ドラッグで矢印を引く。矢印を横切ったものは矢印の向きへ進む
     短い矢印ほど強く曲がり、長い矢印ほど弱く曲がる
   - 同色は近づくと引き合う。速さは変えず、向きだけ相手へ寄っていく
   - 同色が触れると融合する。融合した塊は少し小さくなり、
     減った分より多くの火花が飛び散る（総量は増える）
   - 火花は親以外の色だけで出る。残りの色へ順ぐりに振り分ける
     同じ色で出すと、自分の火花を自分で吸い戻す閉じた輪ができて、
     連鎖が無限になり、色が増えても意味がなくなる
   - エネルギーが大きいほど、火花は数ではなく大きさが増える
   - 火花は火花同士ではぶつからない。エネルギーにだけ触れる
   - 質量は速さに関係しない。大きくなっても遅くならない

   進行
   - 進行度は「融合回数」。時間だと毎回同じになり、スコアだと上手い人ほど損をする
   - 最初は1色が大量に降ってくる。勝手に繋がって光るので、説明なしで面白さが伝わる
   - 進むほど色が増え、数は減り、光の減りは速くなる。1つの価値が上がっていく
   - 最後の段まで行くと次の周へ。配色が変わり、段は途中から流し直す
     形（円・三角・四角・六角）は周が変わっても不変なので、読み方は変わらない

   描画は2枚のキャンバスに分ける
   - 下：エネルギーと火花。消さずに黒を薄く重ねるので、軌跡が光の帯になる
   - 上：コアと矢印。毎フレーム消すので、ぼやけない

   座標系は 1000×1000 の仮想空間に固定する（§7）。
   遊べる領域はその内接円。四角だと四隅から来るものだけコアまで 1.41 倍の距離があり、
   方角で猶予が変わってしまう。円なら全方位で同じ。
   ========================================================== */
(function () {
  'use strict';

  var VERSION = 'ベータ 1.0';
  /* 音。sound.js が無くても落ちないようにしておく */
  var SFX = window.CFSFX || { se: function () {}, bgm: function () {}, unlock: function () {},
                              setVol: function () {}, vol: function () { return { se: 0, bgm: 0 }; },
                              credits: function () { return []; }, ready: function () { return false; } };

  var VW = 1000, VH = 1000;
  var CX = VW / 2, CY = VH / 2;
  var CORE_R = 46;
  var FIELD_R = 500;                 // 遊べる領域の半径（仮想座標の内接円）

  /* ★ は実機で確認して決めた値。それ以外は仮 */
  var P = {
    aMin: 70,          // ★ 矢印の下限
    aMax: 400,         //   矢印の上限
    powNear: 1.00,     // ★ 最短のときの強さ
    powFar: 0.20,      //   最長のときの強さ
    band: 40,          // ★ 当たり帯の半幅。狭いと引いても反応しない

    /* 同色どうしの引き合い。すれ違いを減らして連鎖を起こすための中心機構。
       速さは変えず向きだけ寄せる（質量は速さに関係しないルールを崩さない） */
    pullR: 240,        // 引き合いが届く距離。0 で無効
    pullF: 3.2,        // 引き合う強さ。1秒に向きを何ラジアン寄せられるか

    shrink: 0.20,      // 融合で塊が減る割合

    /* 火花は「数」と「大きさ」の階段で増える。
       数が上限に達すると、大きさが1段上がって数が下がり、また増えていく */
    fragMin: 3,        // 火花の最小の数
    fragMax: 8,        // 火花の数の上限。ここを超えると大きさが1段上がる
    fragGrow: 0.8,     // 塊が1大きくなるごとに火花が何個増えるか
    fragUnit: 1.0,     // 火花の大きさ1段ぶん
    fragSpeed: 230,    // 火花の初速
    fragDecay: 2.2,    // 火花が普通の速さへ落ちる速さ

    /* コアの光。常に減り、吸い込むと回復する。尽きたらラン終了 */
    lightMax: 200,     // 満タン
    lightStart: 120,   // 開始時
    drain: 6,          // 1秒あたり減る量
    payBase: 1.2,      // 大きさ1あたりの回復量
    payExp: 1.6,       // 大きさに対する伸び。1より大きいほど「まとめる」価値が出る

    trail: 0.04,       // 軌跡の消え方。小さいほど尾が長く残る
    speed: 105,
    spawnEvery: 0.45,   // 段階進行を切ったときの値。長すぎると同色が出会わない
    life: 3.0,
    count: 3,
    jitter: 7,
    maxShapes: 200,
    fragChain: 0,      // 1 にすると火花からも火花が出る（発散の確認用）
    combo: 1.5,        // 連鎖が途切れるまでの猶予（秒）
    chainMul: 1.0,     // 連鎖1つあたり倍率がどれだけ伸びるか。0 で倍率なし
    stages: 1,         // 段階進行。切ると下の値をそのまま使える（調整用）
    colors: 4,         // 使う色数。段階進行が入っていると STAGES に上書きされる
    preview: 1,
    glow: 1            // 火花の発光。切ると shadowBlur を使わなくなる（重さの切り分け用）
  };

  /* 進行の段。at は融合回数。
     出現間隔はここが肝で、最初ほど短い（＝大量に降る）。
     進むほど間隔が伸びて数が減り、1つを取りこぼせなくなる。

     最初から2色にしてある。1色だと出会い＝必ず融合で、
     「同じ色だけがくっつく」というルールがそもそも見えない。
     2色なら半分は素通りするので、最初の数秒でルールが目に入る */
  var STAGES = [
    { at:   0, colors: 2, spawn: 0.30, drain: 0,  speed: 105, say: '' },
    { at:   3, colors: 2, spawn: 0.32, drain: 4,  speed: 105, say: '光が減りはじめる' },
    { at:  12, colors: 3, spawn: 0.36, drain: 5,  speed: 108, say: '四角が来る' },
    { at:  26, colors: 4, spawn: 0.42, drain: 6,  speed: 112, say: '六角が来る' },
    { at:  40, colors: 4, spawn: 0.48, drain: 7,  speed: 115, say: '速くなる' },
    { at:  56, colors: 4, spawn: 0.56, drain: 9,  speed: 120, say: '数が減る' },
    { at:  72, colors: 4, spawn: 0.66, drain: 11, speed: 128, say: '一つが重くなる' },
    { at:  88, colors: 4, spawn: 0.76, drain: 13, speed: 136, say: '静かになる' },
    { at: 105, colors: 4, spawn: 0.86, drain: 15, speed: 144, say: '光が遠い' }
  ];
  /* 周回。最終段から LAP_EXTRA だけ融合したら次の周へ。
     段は LAP_START から流し直す（また1色からでは戻りすぎる）。
     周ごとに配色が変わり、光の減りと速度に下駄を履かせる */
  var LAP_START = 2;
  var LAP_EXTRA = 20;
  var LAP_DRAIN = 4;
  var LAP_SPEED = 8;

  var R0 = 13;
  var HIT_CD = 0.2;
  var FRAG_MIN_R = 4.5;              // 火花の最小の見た目の半径
  /* 色ごとに形を変える。色だけで区別させると、
     色覚特性のある人と暗い画面で判別できない人が同時に落ちる（§4.3）。
     sides 0 は円 */
  var COLORS = [
    { hue: 352, sides: 0 },
    { hue: 205, sides: 3 },
    { hue:  46, sides: 4 },
    { hue: 142, sides: 6 }
  ];
  /* 周ごとの配色。形は変えないので、色が変わっても読み方は同じ。
     色相は4つが互いに離れるように置く（暗い画面で隣り合うと判別できない） */
  var PALETTES = [
    [352, 205,  46, 142],
    [285, 195,  30, 105],
    [320, 240,  60, 160],
    [ 10, 265,  75, 170]
  ];
  function setPalette(i) {
    var pal = PALETTES[i % PALETTES.length];
    for (var k = 0; k < COLORS.length; k++) COLORS[k].hue = pal[k];
  }

  var cv = document.getElementById('cv');       // 下の層（軌跡）
  var cv2 = document.getElementById('cv2');     // 上の層（コアと矢印）
  var ctx = cv.getContext('2d');
  var ctx2 = cv2.getContext('2d');

  var view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0 };
  var shapes = [], arrows = [], parts = [], seq = 0;
  var shards = [];                    // 縁を越えて砕けた欠片
  var pending = [];                   // 本体が消えるのを待っている砕け
  var spawnTimer = 0, tPrev = 0, tNow = 0;
  var drag = null;
  var core = { t: 0, pulse: 0, light: 0, flick: 0 };
  var heat = 0;
  var state = 'title';                // title / play / over
  /* タイトルの裏では誰も触っていないのに勝手に遊んでいる。
     説明文を読ませずに「きれい」と「こうやるのか」を同時に見せるため */
  var demo = { t: 0, next: 0 };
  var overT = 0;
  var score = 0, high = 0, newHigh = false;
  var rank = '';                      // ランの称号。終わった瞬間に決めて動かさない
  var tip = null;                     // 結果画面に出す一言。終わった瞬間に決めて動かさない
  var runs = 0;                       // 何回遊んだか。最初の数回はルールを順に見せる
  try { runs = parseInt(localStorage.getItem('cf_runs') || '0', 10) || 0; } catch (e) { runs = 0; }
  var stat = { fuse: 0, lost: 0, biggest: 1, chain: 0, fps: 60, mass: 0 };
  /* 1フレームの内訳（?tune=1 のときだけ表示）。
     全画面で重くなる原因を、実機で切り分けるためのもの。
     キャンバスの描画はGPUに積むだけなので CPU 側の時間は下限でしかないが、
     どこかが突出していれば見える */
  var prof = { up: 0, low: 0, top: 0 };
  var texts = [];                     // 得点をその場に浮かせる
  /* 連鎖は「盤面のどこかで融合が続いている間」を1本と数える。
     塊ごとに数えると画面に小さい数字が散らばって連鎖に見えない（落ち物の数え方に寄せる） */
  var chain = { n: 0, t: -99, pop: 0, end: 0, endN: 0 };
  var stage = 0, lap = 0, fuseBase = 0, flash = 0;
  var banner = { s: '', life: 0 };   // 段が変わったときの一言

  try { high = parseFloat(localStorage.getItem('cf_high')) || 0; } catch (e) { high = 0; }

  /* 吸い込んだときの回復量。大きさより速く増やす。
     ここが比例だと、まとめてから通す意味がなくなる */
  function payout(size) { return P.payBase * Math.pow(size, P.payExp); }

  function restart() {
    shapes.length = 0; arrows.length = 0; parts.length = 0;
    shards.length = 0; pending.length = 0;
    heat = 0; drag = null;
    core.light = P.lightStart; core.pulse = 0;
    score = 0; newHigh = false;
    stat.fuse = 0; stat.lost = 0; stat.biggest = 1; stat.chain = 0;
    spawnTimer = 0;
    texts.length = 0;
    chain.n = 0; chain.t = -99; chain.pop = 0; chain.end = 0; chain.endN = 0;
    stage = 0; lap = 0; fuseBase = 0; flash = 0; banner.life = 0;
    setPalette(0);
    if (P.stages) applyStage(STAGES[0]);
    state = 'play';
    /* 軌跡の層に前のランの絵が残るので消しておく */
    if (view.w) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#05070d';
      ctx.fillRect(0, 0, cv.width, cv.height);
      var dpr = dprFor(view.w, view.h);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function toTitle() {
    restart();
    state = 'title';
    demo.t = 0; demo.next = 0.4;
    SFX.bgm('title');
  }

  function startRun() {
    restart();
    SFX.se('start');
    SFX.bgm('play');
  }

  /* ---------- デモ ---------- */

  /* 自分で矢印を引く。同色どうしを寄せるのを優先し、
     相手がいなければ大きいものをコアへ送る。この2つがこのゲームの全部なので */
  function demoAI(dt) {
    if (state !== 'title') return;   // プレイ中に矢印が勝手に引かれないように
    demo.next -= dt;
    if (demo.next > 0) return;
    demo.next = 0.65 + Math.random() * 0.6;

    var best = null, target = null, bestD = 1e9, i, j;
    for (i = 0; i < shapes.length; i++) {
      var s1 = shapes[i];
      if (Math.hypot(s1.x - CX, s1.y - CY) < 210) continue;
      for (j = 0; j < shapes.length; j++) {
        if (i === j) continue;
        var s2 = shapes[j];
        if (s2.ci !== s1.ci) continue;
        if (s1.frag && s2.frag) continue;
        var d = Math.hypot(s1.x - s2.x, s1.y - s2.y);
        if (d > 70 && d < bestD) { bestD = d; best = s1; target = s2; }
      }
    }
    if (!best) {
      for (i = 0; i < shapes.length; i++) {
        var s3 = shapes[i];
        if (Math.hypot(s3.x - CX, s3.y - CY) < 230) continue;
        if (!best || s3.size > best.size) { best = s3; target = { x: CX, y: CY }; }
      }
    }
    if (!best || !target) return;

    var ax = target.x - best.x, ay = target.y - best.y;
    var L = Math.hypot(ax, ay) || 1; ax /= L; ay /= L;
    var sp = Math.hypot(best.vx, best.vy) || 1;
    /* 少し進行方向の先に置く。その場に置くと通過済みで反応しない */
    var x1 = best.x + best.vx / sp * 36, y1 = best.y + best.vy / sp * 36;
    var len = 120 + Math.random() * 90;
    var a = shapeArrow({ id: ++seq, x1: x1, y1: y1, x2: x1 + ax * len, y2: y1 + ay * len,
                         life: P.life, flash: 0 });
    if (!a.ok) return;
    arrows.push(a);
    while (arrows.length > P.count) arrows.shift();
  }

  /* ---------- 画面サイズ ---------- */

  /* 仮想1000の盤面を、デバイスピクセルで何px幅まで描くか。
     軌跡のために毎フレーム画面全体を塗りつぶすので、描画の重さは面積に比例する。
     1000を1500pxで描けば十分で、それ以上は見た目が変わらないまま重くなるだけ。
     実測：0.6Mpx で 0.52ms、8.3Mpx で 1.98ms（画面消し1回あたり） */
  var FIELD_PX_CAP = 1500;

  function dprFor(w, h) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var fieldPx = Math.min(w, h) * dpr;        // 仮想1000ぶんのデバイスピクセル
    if (fieldPx > FIELD_PX_CAP) dpr *= FIELD_PX_CAP / fieldPx;
    return dpr;
  }

  function resize() {
    var w = cv.clientWidth, h = cv.clientHeight;
    var dpr = dprFor(w, h);
    [cv, cv2].forEach(function (c) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    });
    view.w = w; view.h = h;
    view.scale = Math.min(w / VW, h / VH);
    view.ox = (w - VW * view.scale) / 2;
    view.oy = (h - VH * view.scale) / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, w, h);
  }
  window.addEventListener('resize', resize);

  function toVirtual(cx, cy) {
    var r = cv.getBoundingClientRect();
    return {
      x: (cx - r.left - view.ox) / view.scale,
      y: (cy - r.top - view.oy) / view.scale
    };
  }

  /* ---------- 矢印 ---------- */

  function powerOf(len) {
    var t = (len - P.aMin) / Math.max(1, P.aMax - P.aMin);
    t = Math.max(0, Math.min(1, t));
    return P.powNear + (P.powFar - P.powNear) * t;
  }

  function shapeArrow(a) {
    var dx = a.x2 - a.x1, dy = a.y2 - a.y1;
    a.len = Math.hypot(dx, dy);
    if (a.len > P.aMax) {
      a.x2 = a.x1 + dx / a.len * P.aMax;
      a.y2 = a.y1 + dy / a.len * P.aMax;
      dx = a.x2 - a.x1; dy = a.y2 - a.y1; a.len = P.aMax;
    }
    var L = a.len || 1;
    a.dx = dx / L; a.dy = dy / L;
    a.pow = powerOf(a.len);
    a.ok = a.len >= P.aMin;
    return a;
  }

  function distSeg(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var L2 = dx * dx + dy * dy;
    var t = L2 ? ((px - x1) * dx + (py - y1) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
  }

  function turn(a, px, py, dx, dy) {
    if (distSeg(px, py, a.x1, a.y1, a.x2, a.y2) > P.band) return null;
    var a1 = Math.atan2(dy, dx), a2 = Math.atan2(a.dy, a.dx);
    var d = a2 - a1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    var na = a1 + d * a.pow;
    return [Math.cos(na), Math.sin(na)];
  }

  /* ---------- 結果画面の一言 ---------- */

  /* 最初の数回はルールそのものを順に見せる。
     説明画面を置かないぶん、負けた直後のここが唯一の教える場所になる */
  var TIP_RULES = [
    ['同じ色どうしだけが融合します', '形が違うものはすり抜けます'],
    ['同じ色は近づくと引き合います', '近くまで寄せれば、あとは勝手にくっつきます'],
    ['短い矢印ほど強く曲がります', '長い矢印は広く拾えますが、あまり曲がりません'],
    ['融合で散る火花は、親と違う色になります', '赤をまとめると、青や黄の材料が湧きます']
  ];

  /* 上から順に見て、最初に当てはまったものを出す。
     そのランで実際に足りなかったことを言う */
  var TIP_HINTS = [
    { ok: function (r) { return r.fuse < 12; },
      t: ['まず同じ色を2つ寄せることから', '矢印は、行かせたい向きへ引きます'] },
    { ok: function (r) { return r.big < 4; },
      t: ['小さいまま通していませんか', '点は大きさの1.6乗。倍に育てると3倍入ります'] },
    { ok: function (r) { return r.lost > r.fuse * 1.5; },
      t: ['逃がしている光が多いようです', '矢印はコアの方向へも引けます'] },
    { ok: function (r) { return r.chain < 5; },
      t: ['連鎖が続いている間に吸い込むと倍率が乗ります', '数字の下の帯が、連鎖の残り時間です'] },
    { ok: function (r) { return r.big >= 8; },
      t: ['育てた塊は、連鎖が切れる前に通すと一番伸びます', '大きいまま抱えていると、光が先に尽きます'] },
    { ok: function (r) { return r.stage >= 9; },
      t: ['あと少しで2周目です', '周が変わると配色が入れ替わります'] }
  ];

  var TIP_GENERAL = [
    ['コアの光は常に減っています', '手が止まっている時間が、そのまま損になります'],
    ['矢印は3本まで', '4本目を引くと、古いものから消えます'],
    ['火花も融合の材料です', '拾えば無駄になりません'],
    ['大きい塊は当たり判定も大きくなります', '育つほど巻き込みやすくなります'],
    ['進むほど数が減り、1つが重くなります', '終盤は取りこぼしが効きます']
  ];

  function pickTip() {
    if (runs < TIP_RULES.length) return TIP_RULES[runs];
    var r = { fuse: stat.fuse, big: stat.biggest, lost: stat.lost,
              chain: stat.chain, stage: stage + 1, lap: lap + 1 };
    for (var i = 0; i < TIP_HINTS.length; i++) if (TIP_HINTS[i].ok(r)) return TIP_HINTS[i].t;
    return TIP_GENERAL[runs % TIP_GENERAL.length];
  }

  /* ---------- 称号 ---------- */

  /* 上から順に見て、最初に当てはまったものを名乗る。
     深さが基本だが、連鎖と大玉は深さより珍しいので割り込ませる */
  var RANKS = [
    { t: '灯台守',      ok: function (r) { return r.lap >= 4; } },
    { t: '異色の景色',  ok: function (r) { return r.lap >= 3; } },
    { t: '二周目の人',  ok: function (r) { return r.lap >= 2; } },
    { t: '連鎖狂い',    ok: function (r) { return r.chain >= 60; } },
    { t: '大玉づかい',  ok: function (r) { return r.big >= 25; } },
    { t: '静寂歩き',    ok: function (r) { return r.stage >= 8; } },
    { t: '手さばき',    ok: function (r) { return r.stage >= 6; } },
    { t: '色合わせ',    ok: function (r) { return r.stage >= 4; } },
    { t: '火種',        ok: function (r) { return r.stage >= 2; } },
    { t: 'ひとめ',      ok: function () { return true; } }
  ];

  function rankOf() {
    var r = { lap: lap + 1, stage: stage + 1, chain: stat.chain, big: stat.biggest };
    for (var i = 0; i < RANKS.length; i++) if (RANKS[i].ok(r)) return RANKS[i].t;
    return '';
  }

  function depthText() { return (lap + 1) + '周' + (stage + 1) + '段'; }

  function shareText() {
    return 'カラー・フュージョン\n' +
      Math.round(score) + '点／' + depthText() +
      '／最大連鎖 x' + stat.chain +
      '／称号「' + rank + '」';
  }

  /* ---------- 進行 ---------- */

  function applyStage(st) {
    P.colors = st.colors;
    P.spawnEvery = st.spawn;
    P.drain = st.drain + lap * LAP_DRAIN;
    P.speed = st.speed + lap * LAP_SPEED;
    syncPanel();
  }

  function announce(str) {
    banner.s = str; banner.life = 2.2;
    core.pulse = Math.min(1, core.pulse + 0.7);
  }

  /* 融合回数で段を進める。最終段を過ぎたら次の周へ */
  function progress() {
    if (!P.stages) return;
    var f = stat.fuse - fuseBase;
    while (stage < STAGES.length - 1 && f >= STAGES[stage + 1].at) {
      stage++;
      applyStage(STAGES[stage]);
      if (STAGES[stage].say) { announce(STAGES[stage].say); SFX.se('stage'); }
    }
    if (stage === STAGES.length - 1 && f >= STAGES[stage].at + LAP_EXTRA) {
      lap++;
      stage = LAP_START;
      /* 次の周の最初の段の位置から数え直す */
      fuseBase = stat.fuse - STAGES[LAP_START].at;
      setPalette(lap);
      applyStage(STAGES[stage]);
      announce((lap + 1) + '周目');
      SFX.se('lap');
      flash = 0.85;
    }
  }

  /* ---------- 引き合い ---------- */

  /* 速さを保ったまま、向きを (tx,ty) の方へ rate ラジアンだけ回す。
     加速で引き寄せると重い塊が速くなってルールが崩れるので、向きだけ変える */
  function steer(s, tx, ty, rate) {
    var sp = Math.hypot(s.vx, s.vy);
    if (sp < 1e-3) return;
    var a1 = Math.atan2(s.vy, s.vx), a2 = Math.atan2(ty, tx);
    var d = a2 - a1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    var na = a1 + (Math.abs(d) < rate ? d : (d > 0 ? rate : -rate));
    s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
  }

  /* 同色どうしを互いに寄せる。
     火花同士は融合しないので引き合わせない（寄っても何も起きず紛らわしい） */
  function pullPass(dt) {
    if (P.pullR <= 0 || P.pullF <= 0) return;
    var R = P.pullR, R2 = R * R;
    for (var i = 0; i < shapes.length; i++) {
      var s1 = shapes[i];
      for (var j = i + 1; j < shapes.length; j++) {
        var s2 = shapes[j];
        if (s1.ci !== s2.ci) continue;
        if (s1.frag && s2.frag) continue;
        var dx = s2.x - s1.x, dy = s2.y - s1.y;
        var d2 = dx * dx + dy * dy;
        if (d2 > R2 || d2 < 1) continue;
        var d = Math.sqrt(d2);
        var w = 1 - d / R;                 // 近いほど強い
        var rate = P.pullF * w * w * dt;
        steer(s1, dx / d, dy / d, rate);
        steer(s2, -dx / d, -dy / d, rate);
      }
    }
  }

  /* ---------- エネルギーと火花 ---------- */

  function radius(size) { return R0 * Math.sqrt(size); }

  function spawn() {
    if (shapes.length >= P.maxShapes) return;
    var edge = Math.random() * Math.PI * 2;
    var x = CX + Math.cos(edge) * (FIELD_R + R0);
    var y = CY + Math.sin(edge) * (FIELD_R + R0);

    var ang = Math.atan2(CY - y, CX - x);
    ang += (Math.random() - 0.5) * 2 * (P.jitter * Math.PI / 180);
    shapes.push({
      x: x, y: y,
      vx: Math.cos(ang) * P.speed, vy: Math.sin(ang) * P.speed,
      size: 1, ci: Math.floor(Math.random() * Math.max(1, Math.min(COLORS.length, P.colors))),
      cd: {}, chain: 0, chainT: 0,
      rot: Math.random() * 6.2832, spin: (Math.random() - 0.5) * 1.2
    });
  }

  /* 融合
     - 塊は (a+b) より小さくなる
     - 減った分より多くの火花が飛ぶ。総量は増える
     - 火花の数は固定。大きい融合ほど1個が大きくなる
     - 向きは運動量から決めるが、速さは変えない（質量は速さに関係しない） */
  function fuse(a, b) {
    var aWasFrag = !!a.frag, bWasFrag = !!b.frag;
    var total = a.size + b.size;
    /* 減る量は「吸収された側」の割合。合計にかけると、
       小さい火花を1つ拾うたびに塊が大きく削られて育たなくなる */
    var lost = Math.min(a.size, b.size) * P.shrink;

    var px = a.vx * a.size + b.vx * b.size;
    var py = a.vy * a.size + b.vy * b.size;
    var pl = Math.hypot(px, py);
    var heavier = a.size >= b.size ? a : b;
    var dx, dy;
    if (pl > 1e-3) { dx = px / pl; dy = py / pl; }
    else {
      var hl = Math.hypot(heavier.vx, heavier.vy) || 1;
      dx = heavier.vx / hl; dy = heavier.vy / hl;
    }

    a.x = (a.x * a.size + b.x * b.size) / total;
    a.y = (a.y * a.size + b.y * b.size) / total;
    a.vx = dx * P.speed;
    a.vy = dy * P.speed;
    a.size = total - lost;
    a.frag = 0;                       // 融合したものはエネルギーになる
    a.flash = 0.4;
    a.nf = tNow + 0.10;

    a.chain = Math.max(a.chain, b.chain) + 1;
    a.chainT = tNow;

    /* 猶予を過ぎていたら前の連鎖は終わっている。数え直す */
    if (tNow - chain.t > P.combo) chain.n = 0;
    chain.n++; chain.t = tNow; chain.pop = 1;

    stat.fuse++;
    if (a.size > stat.biggest) stat.biggest = a.size;
    if (chain.n > stat.chain) stat.chain = chain.n;
    heat = Math.min(1, heat + 0.06 + chain.n * 0.02);

    burst(a.x, a.y, a.size, a.chain);

    /* 火花は階段で増える。
       塊が大きいほど本数が増え、上限に達すると大きさが1段上がって本数が戻る */
    /* 火花が関わった融合では火花を撒かない。
       撒くと物体が1回につき「火花の数 − 1」だけ増え続けて盤面が発散する */
    var seed = (!aWasFrag && !bWasFrag) || P.fragChain;
    var units = seed ? Math.max(P.fragMin, Math.round(P.fragMin + (a.size - 2) * P.fragGrow)) : 0;
    var lv = Math.max(1, Math.ceil(units / P.fragMax));
    var k = Math.max(P.fragMin, Math.min(P.fragMax, Math.round(units / lv)));
    var fs = lv * P.fragUnit;
    if (units > 0 && fs > 0.01 && shapes.length + k <= P.maxShapes) {
      var base = Math.random() * Math.PI * 2;
      var r = radius(a.size) + radius(fs) + 8;
      /* 火花は親以外の色へ順ぐりに配る。親の色は入れない。
         入れると自分の火花を自分で吸い戻すことになって不自然（1色のときだけ例外） */
      var nc = Math.max(1, Math.min(COLORS.length, P.colors));
      var other = nc - 1;
      for (var i = 0; i < k; i++) {
        var ang = base + i * (Math.PI * 2 / k);
        shapes.push({
          x: a.x + Math.cos(ang) * r,
          y: a.y + Math.sin(ang) * r,
          vx: Math.cos(ang) * P.fragSpeed,
          vy: Math.sin(ang) * P.fragSpeed,
          size: fs, ci: other > 0 ? (a.ci + 1 + (i % other)) % nc : a.ci,
          cd: {}, chain: 0, chainT: 0, frag: 1,
          rot: Math.random() * 6.2832, spin: (Math.random() - 0.5) * 3,
          nf: tNow + 0.15
        });
      }
    }
    /* 連鎖が伸びるほど高くする。同じ音でも積み上がって聞こえる */
    SFX.se('fuse', { rate: 1 + Math.min(0.9, (chain.n - 1) * 0.045) });
  }

  /* 縁を越えたものが砕ける。
     本体が消えてから少し置いて、暗い欠片が全方向へはじける。
     同時に出すと本体の光に隠れて、はじけたことが見えない。
     飛ぶ距離は塊の半径に比例させる。固定値だと、大きい塊ほど
     自分の体から欠片が出られず「小さくはじけた」ようにしか見えない。
     光らせない。このゲームは「光る＝良いこと」で統一しているので、
     損失を光らせると逆の意味に読まれる */
  var SHARD_WAIT = 0.09;             // 本体が消えてから、はじけるまで
  var SHARD_DRAG = 9;                // 欠片の減速。飛距離 ≒ 初速 ÷ これ

  function shatter(s) {
    pending.push({ x: s.x, y: s.y, size: s.size, ci: s.ci, t: SHARD_WAIT });
  }

  function burstShards(p) {
    var hue = COLORS[p.ci].hue;
    var r = radius(p.size);
    var n = Math.max(5, Math.min(32, Math.round(5 + p.size * 1.5)));
    if (shards.length > 320) n = Math.min(n, 6);
    var base = Math.random() * Math.PI * 2;
    var longer = Math.min(0.35, p.size * 0.02);
    for (var i = 0; i < n; i++) {
      /* 等間隔に散らすと星形に見えるので、大きく崩す */
      var a = base + (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 2.4;
      /* 飛距離が半径の 0.8〜1.8 倍になる初速 */
      var sp = r * (7 + Math.random() * 9);
      shards.push({
        x: p.x + Math.cos(a) * r * (0.1 + Math.random() * 0.5),
        y: p.y + Math.sin(a) * r * (0.1 + Math.random() * 0.5),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.18 + Math.random() * (0.32 + longer), max: 0.50 + longer,
        w: 1.6 + Math.random() * (1.8 + r * 0.16),
        tail: (0.6 + Math.random() * 0.9) * (1 + r * 0.02), hue: hue
      });
    }
  }

  function floatText(x, y, str, hue) {
    texts.push({ x: x, y: y, s: str, hue: hue === undefined ? -1 : hue, life: 0.9, max: 0.9 });
    if (texts.length > 40) texts.shift();
  }

  /* ---------- パーティクル（演出のみ。白でまとめ、火花と区別する） ---------- */

  function burst(x, y, m, chain) {
    var n = Math.min(40, 8 + Math.round(m * 2) + chain * 2);
    if (parts.length > 420) n = Math.min(n, 6);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = 80 + Math.random() * (160 + m * 10);
      parts.push({
        x: x, y: y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0.2 + Math.random() * 0.28, max: 0.48,
        w: 0.8 + Math.random() * 1.6, ring: 0
      });
    }
    parts.push({ x: x, y: y, vx: 0, vy: 0, life: 0.2, max: 0.2, w: radius(m) * 1.5, ring: 1 });
  }

  /* ---------- 更新 ---------- */

  function update(dt) {
    if (state === 'title') {
      demo.t += dt;
      core.light = P.lightMax;        // デモは死なない
      demoAI(dt);
      if (demo.t > 42) { toTitle(); return; }   // 進みすぎる前に頭から流し直す
    }

    spawnTimer -= dt;
    if (spawnTimer <= 0) { spawn(); spawnTimer = P.spawnEvery; }

    for (var i = arrows.length - 1; i >= 0; i--) {
      arrows[i].life -= dt;
      if (arrows[i].flash) arrows[i].flash = Math.max(0, arrows[i].flash - dt);
      if (arrows[i].life <= 0) arrows.splice(i, 1);
    }

    pullPass(dt);

    for (var j = shapes.length - 1; j >= 0; j--) {
      var s = shapes[j];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.flash) s.flash = Math.max(0, s.flash - dt);
      if (s.spin) s.rot += s.spin * dt;
      if (s.chain && tNow - s.chainT > P.combo) s.chain = 0;

      /* 火花は撒かれた直後だけ速い。普通の速さまで落ちてくる */
      var sp = Math.hypot(s.vx, s.vy) || 1;
      if (sp > P.speed) {
        var ns = P.speed + (sp - P.speed) * Math.exp(-P.fragDecay * dt);
        s.vx *= ns / sp; s.vy *= ns / sp; sp = ns;
      }

      for (var k = 0; k < arrows.length; k++) {
        var a = arrows[k];
        if (s.cd[a.id] && tNow - s.cd[a.id] < HIT_CD) continue;
        var nd = turn(a, s.x, s.y, s.vx / sp, s.vy / sp);
        if (!nd) continue;
        s.vx = nd[0] * sp; s.vy = nd[1] * sp;
        s.cd[a.id] = tNow;
        a.flash = 0.3;
        break;
      }

      var m = radius(s.size) + 40;
      if (Math.hypot(s.x - CX, s.y - CY) > FIELD_R + m) {
        shatter(s);
        shapes.splice(j, 1); stat.lost++; continue;
      }

      if (Math.hypot(s.x - CX, s.y - CY) < CORE_R + radius(s.size) * 0.6) {
        shapes.splice(j, 1);
        /* 連鎖が続いている間に吸い込むと倍率が乗る。
           点の出どころはコアのままで、連鎖は「いつ通すか」の価値になる */
        var mult = chain.n > 0 ? 1 + (chain.n - 1) * P.chainMul : 1;
        var gain = payout(s.size) * mult;
        score += gain;
        core.light = Math.min(P.lightMax, core.light + gain);
        core.pulse = Math.min(1, core.pulse + 0.2 + Math.min(0.6, gain * 0.04));
        floatText(s.x, s.y,
          (mult > 1.05 ? 'x' + (Math.round(mult * 10) / 10) + ' ' : '') + '+' + Math.round(gain),
          COLORS[s.ci].hue);
        SFX.se('absorb', { gain: Math.min(1, 0.5 + gain * 0.012) });
      }
    }

    /* 同色が触れたら融合。火花同士はぶつからない */
    var guard = 0;
    for (var p = 0; p < shapes.length && guard < 60; p++) {
      for (var q = p + 1; q < shapes.length && guard < 60; q++) {
        var s1 = shapes[p], s2 = shapes[q];
        if (s1.ci !== s2.ci) continue;
        if (s1.frag && s2.frag) continue;
        if ((s1.nf && tNow < s1.nf) || (s2.nf && tNow < s2.nf)) continue;
        var rr = radius(s1.size) + radius(s2.size);
        var ddx = s1.x - s2.x, ddy = s1.y - s2.y;
        if (ddx * ddx + ddy * ddy < rr * rr) {
          fuse(s1, s2);
          shapes.splice(q, 1);
          q--; guard++;
        }
      }
    }

    for (var v = parts.length - 1; v >= 0; v--) {
      var pt = parts[v];
      pt.life -= dt;
      if (pt.life <= 0) { parts.splice(v, 1); continue; }
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= Math.exp(-2.6 * dt); pt.vy *= Math.exp(-2.6 * dt);
    }

    for (var pd = pending.length - 1; pd >= 0; pd--) {
      pending[pd].t -= dt;
      if (pending[pd].t <= 0) { burstShards(pending[pd]); pending.splice(pd, 1); }
    }

    for (var d = shards.length - 1; d >= 0; d--) {
      var sh = shards[d];
      sh.life -= dt;
      if (sh.life <= 0) { shards.splice(d, 1); continue; }
      sh.x += sh.vx * dt; sh.y += sh.vy * dt;
      sh.vx *= Math.exp(-SHARD_DRAG * dt); sh.vy *= Math.exp(-SHARD_DRAG * dt);
    }

    for (var y2 = texts.length - 1; y2 >= 0; y2--) {
      texts[y2].life -= dt;
      texts[y2].y -= dt * 34;
      if (texts[y2].life <= 0) texts.splice(y2, 1);
    }

    /* 連鎖の切れ目。最後の数字をその場に置いて余韻を出す */
    chain.pop = Math.max(0, chain.pop - dt * 3.2);
    if (chain.n > 0 && tNow - chain.t > P.combo) {
      if (chain.n >= 2) { chain.end = 0.9; chain.endN = chain.n; }
      if (chain.n >= 3) SFX.se('chain');
      chain.n = 0;
    }
    chain.end = Math.max(0, chain.end - dt);

    progress();
    if (banner.life > 0) banner.life = Math.max(0, banner.life - dt);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.2);

    heat = Math.max(0, heat - dt * 0.55);
    core.pulse = Math.max(0, core.pulse - dt * 1.6);
    core.t += dt;

    /* 光は常に減る。尽きたらラン終了 */
    core.light -= P.drain * dt;
    if (core.light <= 0 && state === 'play') {
      core.light = 0;
      state = 'over';
      overT = tNow;
      rank = rankOf();
      tip = pickTip();
      runs++;
      try { localStorage.setItem('cf_runs', String(runs)); } catch (e) {}
      SFX.se('over');
      if (score > high) {
        high = score; newHigh = true;
        try { localStorage.setItem('cf_high', String(high)); } catch (e) {}
      }
      for (var w = 0; w < 60; w++) {
        var aa = Math.random() * Math.PI * 2, vv = 100 + Math.random() * 320;
        parts.push({ x: CX, y: CY, vx: Math.cos(aa) * vv, vy: Math.sin(aa) * vv,
                     life: 0.5 + Math.random() * 0.5, max: 1, w: 1 + Math.random() * 2.5, ring: 0 });
      }
    }

    var mass = 0;
    for (var z = 0; z < shapes.length; z++) mass += shapes[z].size;
    stat.mass = mass;
  }

  /* ---------- 先読み ---------- */

  function predict(s, all) {
    var pts = [s.x, s.y];
    var x = s.x, y = s.y;
    var sp = Math.hypot(s.vx, s.vy) || 1;
    var dx = s.vx / sp, dy = s.vy / sp;
    var cd = {}, step = 12, hit = false;

    for (var i = 0; i < 90; i++) {
      for (var k = 0; k < all.length; k++) {
        var a = all[k];
        if (!a.ok) continue;
        if (cd[a.id] !== undefined && i - cd[a.id] < 4) continue;
        var nd = turn(a, x, y, dx, dy);
        if (!nd) continue;
        dx = nd[0]; dy = nd[1];
        pts.push(x, y);
        cd[a.id] = i; hit = true;
        break;
      }
      x += dx * step; y += dy * step;
      if (Math.hypot(x - CX, y - CY) > FIELD_R + 60) break;
      if (Math.hypot(x - CX, y - CY) < CORE_R) break;
    }
    pts.push(x, y);
    return hit ? pts : null;
  }

  /* ---------- 描画 ---------- */

  function col(hue, l, a) { return 'hsla(' + hue + ',95%,' + l + '%,' + a + ')'; }

  /* 色に紐づいた形。sides 0 は円 */
  function pathShape(g, s, r) {
    var sides = COLORS[s.ci].sides;
    g.beginPath();
    if (!sides) { g.arc(s.x, s.y, r, 0, 6.2832); return; }
    var rot = s.rot || 0;
    for (var i = 0; i < sides; i++) {
      var a = rot + i * (Math.PI * 2 / sides) - Math.PI / 2;
      var px = s.x + Math.cos(a) * r, py = s.y + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
  }

  /* 軌跡。通った場所を細く光る帯で描く */
  /* エネルギー：輪郭の円。大きいほど線も太いが、中の穴は必ず残す */
  function drawEnergy(s, ghost) {
    var c = COLORS[s.ci], r = radius(s.size);
    var w = Math.min(r * 0.34, 2.4 + r * 0.10);

    /* にじみ・芯・内側の縁を重ねて描く。
       shadowBlur は中まで塗りつぶして「穴」を消すので使わない */
    ctx.lineJoin = 'round';
    ctx.strokeStyle = col(c.hue, 58, 0.10 + s.chain * 0.015);
    ctx.lineWidth = w * 3.0;
    pathShape(ctx, s, r); ctx.stroke();

    ctx.strokeStyle = col(c.hue, 68, 0.34);
    ctx.lineWidth = w * 1.7;
    pathShape(ctx, s, r); ctx.stroke();

    ctx.strokeStyle = col(c.hue, s.flash ? 96 : 82, 0.95);
    ctx.lineWidth = w;
    pathShape(ctx, s, r); ctx.stroke();

    if (ghost) return;

    if (s.flash) {
      ctx.strokeStyle = 'rgba(255,255,255,' + s.flash * 1.8 + ')';
      ctx.lineWidth = 2;
      pathShape(ctx, s, r + (0.4 - s.flash) * 80); ctx.stroke();
    }

  }

  /* 火花：中まで色が付いた点。小さくても見えるように下限を置く */
  function drawSpark(s) {
    var c = COLORS[s.ci], r = Math.max(FRAG_MIN_R, radius(s.size));
    ctx.shadowBlur = P.glow ? 12 + r : 0;
    ctx.shadowColor = col(c.hue, 66, 0.95);
    var g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
    g.addColorStop(0, col(c.hue, 95, 1));
    g.addColorStop(0.55, col(c.hue, 68, 0.95));
    g.addColorStop(1, col(c.hue, 55, 0.15));
    ctx.fillStyle = g;
    ctx.lineJoin = 'round';
    pathShape(ctx, s, r); ctx.fill();
    ctx.shadowBlur = 0;
  }

  /* 砕けた欠片。加算合成にしない。
     進む向きに伸ばした短い線で描く。丸だと粒に見えて「欠片」にならない */
  function drawShards() {
    ctx.lineCap = 'butt';
    for (var i = 0; i < shards.length; i++) {
      var p = shards[i];
      var t = p.life / p.max;
      var sp = Math.hypot(p.vx, p.vy) || 1;
      var tail = (3 + Math.min(26, sp * 0.045)) * (p.tail || 1);
      ctx.strokeStyle = 'hsla(' + p.hue + ',58%,' + (30 + t * 32).toFixed(0) + '%,' + Math.min(1, t * 1.3).toFixed(3) + ')';
      ctx.lineWidth = p.w * (0.45 + t * 0.75);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx / sp * tail, p.y - p.vy / sp * tail);
      ctx.stroke();
    }
    ctx.lineCap = 'round';
  }

  function drawParts() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var t = p.life / p.max;
      if (p.ring) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (t * 0.8) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.w * (1.7 - t), 0, 6.2832); ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,' + (t * 0.75) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.w * t, 0, 6.2832); ctx.fill();
      }
    }
  }

  /* 引き合っている同色を細い糸でつなぐ。
     「もう少しでくっつく」を見せるための線。上の層に描いて軌跡に残さない */
  function drawThreads() {
    if (P.pullR <= 0 || P.pullF <= 0) return;
    var R = P.pullR, R2 = R * R, n = 0;
    ctx2.lineCap = 'round';
    for (var i = 0; i < shapes.length && n < 140; i++) {
      var s1 = shapes[i];
      for (var j = i + 1; j < shapes.length && n < 140; j++) {
        var s2 = shapes[j];
        if (s1.ci !== s2.ci) continue;
        if (s1.frag && s2.frag) continue;
        var dx = s2.x - s1.x, dy = s2.y - s1.y, d2 = dx * dx + dy * dy;
        if (d2 > R2) continue;
        var w = 1 - Math.sqrt(d2) / R;
        ctx2.strokeStyle = col(COLORS[s1.ci].hue, 72, 0.06 + w * w * 0.5);
        ctx2.lineWidth = 0.7 + w * 2.4;
        ctx2.beginPath(); ctx2.moveTo(s1.x, s1.y); ctx2.lineTo(s2.x, s2.y); ctx2.stroke();
        n++;
      }
    }
  }

  /* 連鎖の段。伸びるほど色が熱くなる */
  function chainHue(n) {
    if (n >= 12) return 305;
    if (n >= 8) return 18;
    if (n >= 5) return 42;
    if (n >= 3) return 160;
    return 195;
  }

  /* 連鎖表示。塊の脇ではなく画面の一点に大きく出す。
     残り時間の帯を下に添えて「まだ続いている」を見せる */
  function drawChain() {
    var n = chain.n, y = CY - 232;

    if (chain.end > 0 && n === 0) {
      var e = chain.end / 0.9;
      var hu = chainHue(chain.endN);
      ctx2.textAlign = 'center';
      ctx2.font = 'bold ' + (52 + Math.min(52, chain.endN * 5)) + 'px system-ui, sans-serif';
      ctx2.shadowBlur = 26; ctx2.shadowColor = col(hu, 70, 0.9);
      ctx2.fillStyle = col(hu, 88, e * 0.85);
      ctx2.fillText('x' + chain.endN, CX, y + (1 - e) * 34);
      ctx2.shadowBlur = 0;
      return;
    }
    if (n < 2) return;

    var hue = chainHue(n);
    var pop = 1 + chain.pop * chain.pop * 0.42;
    var size = (52 + Math.min(52, n * 5)) * pop;

    ctx2.textAlign = 'center';
    ctx2.font = 'bold ' + size.toFixed(0) + 'px system-ui, sans-serif';
    ctx2.shadowBlur = 20 + chain.pop * 34;
    ctx2.shadowColor = col(hue, 68, 0.95);
    ctx2.fillStyle = col(hue, 92, 0.95);
    ctx2.fillText('x' + n, CX, y);
    ctx2.shadowBlur = 0;

    ctx2.font = 'bold 15px system-ui, sans-serif';
    ctx2.fillStyle = col(hue, 80, 0.55);
    ctx2.fillText('連鎖', CX, y + 26);

    /* 残り時間 */
    var left = Math.max(0, 1 - (tNow - chain.t) / P.combo);
    var bw = 150;
    ctx2.fillStyle = col(hue, 60, 0.18);
    ctx2.fillRect(CX - bw / 2, y + 38, bw, 5);
    ctx2.shadowBlur = 10; ctx2.shadowColor = col(hue, 70, 0.9);
    ctx2.fillStyle = col(hue, 88, 0.9);
    ctx2.fillRect(CX - bw / 2, y + 38, bw * left, 5);
    ctx2.shadowBlur = 0;
  }

  /* 連鎖が伸びるほど周囲を落として中心に目を寄せる */
  function drawVignette() {
    var lv = Math.min(1, Math.max(chain.n - 1, 0) / 9);
    if (lv <= 0.01) return;
    var g = ctx2.createRadialGradient(CX, CY, VW * 0.20, CX, CY, VW * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + (lv * 0.5).toFixed(3) + ')');
    ctx2.fillStyle = g;
    ctx2.fillRect(-VW, -VH, VW * 3, VH * 3);
  }

  /* 段が変わったときの一言。連鎖の数字は上、こちらは下に置いて重ねない */
  function drawBanner() {
    if (banner.life <= 0) return;
    var t = banner.life / 2.2;
    var a = Math.min(1, t * 3) * Math.min(1, (1 - t) * 8 + 0.15);
    var y = CY + 186 - (1 - t) * 10;
    ctx2.textAlign = 'center';
    ctx2.font = 'bold 27px system-ui, sans-serif';
    ctx2.shadowBlur = 18; ctx2.shadowColor = 'rgba(150,225,255,0.9)';
    ctx2.fillStyle = 'rgba(225,245,255,' + (a * 0.92) + ')';
    ctx2.fillText(banner.s, CX, y);
    ctx2.shadowBlur = 0;
    ctx2.fillStyle = 'rgba(150,205,245,' + (a * 0.35) + ')';
    ctx2.fillRect(CX - 110, y + 12, 220, 1);
  }

  function drawCore() {
    var lv = P.lightMax > 0 ? core.light / P.lightMax : 0;      // 0..1
    var low = lv < 0.25 ? (1 - lv / 0.25) : 0;                  // 残り少ないほど1に近い
    var flick = low > 0 ? (0.75 + Math.sin(core.t * (8 + low * 14)) * 0.25 * low) : 1;
    var bright = (0.25 + lv * 0.75) * flick;
    var r = CORE_R * (0.62 + lv * 0.38) * (1 + Math.sin(core.t * 1.7) * 0.03 + core.pulse * 0.18);
    var g = ctx2.createRadialGradient(CX, CY, r * 0.2, CX, CY, r * 2.4);
    g.addColorStop(0, 'rgba(255,255,255,' + ((0.25 + core.pulse * 0.4) * bright + 0.08) + ')');
    g.addColorStop(0.35, 'rgba(120,230,255,' + (0.4 * bright) + ')');
    g.addColorStop(1, 'rgba(120,230,255,0)');
    ctx2.fillStyle = g;
    ctx2.beginPath(); ctx2.arc(CX, CY, r * 2.4, 0, 6.2832); ctx2.fill();

    ctx2.shadowBlur = 20 + 26 * bright; ctx2.shadowColor = 'rgba(140,240,255,0.9)';
    ctx2.strokeStyle = 'rgba(220,250,255,' + (0.35 + 0.6 * bright) + ')';
    ctx2.lineWidth = 3;
    ctx2.beginPath(); ctx2.arc(CX, CY, r, 0, 6.2832); ctx2.stroke();

    /* 残りを細い弧で示す。数字は読ませない */
    ctx2.shadowBlur = 12;
    ctx2.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx2.lineWidth = 5;
    ctx2.beginPath(); ctx2.arc(CX, CY, CORE_R + 16, 0, 6.2832); ctx2.stroke();
    ctx2.strokeStyle = low > 0.4 ? 'rgba(255,150,150,0.9)' : 'rgba(150,240,255,0.85)';
    ctx2.lineWidth = 5;
    ctx2.beginPath();
    ctx2.arc(CX, CY, CORE_R + 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lv);
    ctx2.stroke();
    ctx2.shadowBlur = 0;
  }

  function drawArrow(a, alpha) {
    var f = a.flash || 0;

    if (!a.ok) {
      ctx2.setLineDash([5, 7]);
      ctx2.strokeStyle = 'rgba(150,180,210,0.45)';
      ctx2.lineWidth = 2;
      ctx2.beginPath(); ctx2.moveTo(a.x1, a.y1); ctx2.lineTo(a.x2, a.y2); ctx2.stroke();
      ctx2.setLineDash([]);
      ctx2.strokeStyle = 'rgba(150,180,210,0.35)';
      ctx2.lineWidth = 1.5;
      ctx2.beginPath(); ctx2.arc(a.x1, a.y1, P.aMin, 0, 6.2832); ctx2.stroke();
      return;
    }

    var t = (a.pow - P.powFar) / Math.max(0.001, P.powNear - P.powFar);
    var w = 2 + t * 6;
    var head = 14 + t * 22;
    var lum = 0.45 + t * 0.55;

    ctx2.shadowBlur = 0;
    ctx2.strokeStyle = 'rgba(80,170,255,' + (0.13 + t * 0.10) * alpha + ')';
    ctx2.lineWidth = P.band * 2;
    ctx2.lineCap = 'round';
    ctx2.beginPath(); ctx2.moveTo(a.x1, a.y1); ctx2.lineTo(a.x2, a.y2); ctx2.stroke();

    ctx2.shadowBlur = 10 + t * 22 + f * 40;
    ctx2.shadowColor = 'rgba(255,255,255,0.9)';
    ctx2.strokeStyle = 'rgba(255,255,255,' + Math.min(1, (lum + f) * alpha) + ')';
    ctx2.lineWidth = w;
    ctx2.beginPath();
    ctx2.moveTo(a.x1, a.y1);
    ctx2.lineTo(a.x2 - a.dx * head * 0.55, a.y2 - a.dy * head * 0.55);
    ctx2.stroke();

    var nx = -a.dy, ny = a.dx;
    ctx2.fillStyle = 'rgba(255,255,255,' + Math.min(1, (lum + 0.15 + f) * alpha) + ')';
    ctx2.beginPath();
    ctx2.moveTo(a.x2, a.y2);
    ctx2.lineTo(a.x2 - a.dx * head + nx * head * 0.5, a.y2 - a.dy * head + ny * head * 0.5);
    ctx2.lineTo(a.x2 - a.dx * head * 0.62, a.y2 - a.dy * head * 0.62);
    ctx2.lineTo(a.x2 - a.dx * head - nx * head * 0.5, a.y2 - a.dy * head - ny * head * 0.5);
    ctx2.closePath();
    ctx2.fill();

    ctx2.shadowBlur = 6;
    ctx2.fillStyle = 'rgba(200,235,255,' + (0.7 * alpha) + ')';
    ctx2.beginPath(); ctx2.arc(a.x1, a.y1, 2 + t * 3, 0, 6.2832); ctx2.fill();
    ctx2.shadowBlur = 0;
  }

  function drawPredictions() {
    if (!P.preview || !drag || !drag.ok) return;
    var all = arrows.concat([drag]);
    ctx2.setLineDash([7, 9]);
    ctx2.lineWidth = 1.6;
    ctx2.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx2.shadowBlur = 8; ctx2.shadowColor = 'rgba(255,255,255,0.6)';
    for (var i = 0; i < shapes.length; i++) {
      var pts = predict(shapes[i], all);
      if (!pts) continue;
      ctx2.beginPath();
      ctx2.moveTo(pts[0], pts[1]);
      for (var k = 2; k < pts.length; k += 2) ctx2.lineTo(pts[k], pts[k + 1]);
      ctx2.stroke();
    }
    ctx2.shadowBlur = 0;
    ctx2.setLineDash([]);
  }

  function render() {
    var _t0 = performance.now();
    /* 下の層：消さずに黒を薄く重ねる。動いたものが尾を引く */
    /* 下の層は消さずに黒を薄く重ねる。動いたものが光の帯を引く。
       加算合成にすると同じ場所に足し続けて尾が白く飽和するので使わない */
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(5,7,13,' + P.trail + ')';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    for (var i = 0; i < shapes.length; i++) {
      if (shapes[i].frag) drawSpark(shapes[i]); else drawEnergy(shapes[i]);
    }
    drawShards();
    ctx.globalCompositeOperation = 'lighter';
    drawParts();
    ctx.restore();
    var _t1 = performance.now();

    /* 上の層：毎フレーム消す */
    ctx2.save();
    ctx2.clearRect(0, 0, view.w, view.h);
    ctx2.translate(view.ox, view.oy);
    ctx2.scale(view.scale, view.scale);
    drawVignette();
    ctx2.globalCompositeOperation = 'lighter';

    if (heat > 0.01) {
      var hg = ctx2.createRadialGradient(CX, CY, 0, CX, CY, VW * 0.75);
      hg.addColorStop(0, 'rgba(90,150,255,' + (heat * 0.10) + ')');
      hg.addColorStop(1, 'rgba(90,150,255,0)');
      ctx2.fillStyle = hg;
      ctx2.fillRect(0, 0, VW, VH);
    }

    /* 領域の縁。ここを越えたものは失われるので、うっすら見せる */
    ctx2.strokeStyle = 'rgba(120,200,255,0.16)';
    ctx2.lineWidth = 2;
    ctx2.beginPath(); ctx2.arc(CX, CY, FIELD_R, 0, 6.2832); ctx2.stroke();
    ctx2.strokeStyle = 'rgba(120,200,255,0.05)';
    ctx2.lineWidth = 14;
    ctx2.beginPath(); ctx2.arc(CX, CY, FIELD_R - 8, 0, 6.2832); ctx2.stroke();

    drawThreads();
    drawCore();
    /* タイトル中は連鎖の数字と段の一言を出さない。タイトル文字と重なって読めなくなる */
    if (state !== 'title') { drawChain(); drawBanner(); }
    drawPredictions();
    for (var j = 0; j < arrows.length; j++) drawArrow(arrows[j], Math.min(1, arrows[j].life / 0.5));
    if (drag) drawArrow(drag, 0.85);

    /* 得点をその場に浮かせる */
    ctx2.textAlign = 'center';
    for (var y3 = 0; y3 < texts.length; y3++) {
      var tx = texts[y3], al = Math.min(1, tx.life / tx.max * 1.6);
      ctx2.font = 'bold 22px system-ui, sans-serif';
      ctx2.shadowBlur = 10; ctx2.shadowColor = 'rgba(255,255,255,0.8)';
      ctx2.fillStyle = tx.hue < 0 ? 'rgba(255,255,255,' + al + ')' : col(tx.hue, 88, al);
      ctx2.fillText(tx.s, tx.x, tx.y);
      ctx2.shadowBlur = 0;
    }
    ctx2.restore();

    /* 周が変わった瞬間の閃光。配色が切り替わるのを一拍で見せる */
    if (flash > 0) {
      ctx2.save();
      ctx2.globalCompositeOperation = 'source-over';
      ctx2.fillStyle = 'rgba(230,246,255,' + (flash * flash * 0.65) + ')';
      ctx2.fillRect(0, 0, view.w, view.h);
      ctx2.restore();
    }

    if (state === 'title') drawTitle();
    else if (state === 'over') drawOver();
    if (overUI) overUI.hidden = (state !== 'over') || (tNow - overT < 0.45);

    prof.low += (_t1 - _t0 - prof.low) * 0.05;
    prof.top += (performance.now() - _t1 - prof.top) * 0.05;

    var el = document.getElementById('stat');
    if (el) {
      el.textContent = 'SCORE ' + Math.round(score) + ' ／ BEST ' + Math.round(high) +
        ' ／ ' + Math.round(stat.fps) + 'fps ／ 数 ' + shapes.length +
        ' ／ 総量 ' + stat.mass.toFixed(0) +
        ' ／ 融合 ' + stat.fuse + ' ／ 最大 ' + stat.biggest.toFixed(1) +
        ' ／ 最長連鎖 x' + stat.chain +
        ' ／ ' + (lap + 1) + '周' + (stage + 1) + '段' +
        (drag ? (' ／ 長さ ' + Math.round(drag.len) +
                 (drag.ok ? ' 強さ ' + Math.round(drag.pow * 100) + '%' : ' 短すぎ')) : '') +
        ' ／ ' + (cv.width * cv.height / 1e6).toFixed(1) + 'Mpx' +
        ' ／ 更新 ' + prof.up.toFixed(1) +
        ' 下層 ' + prof.low.toFixed(1) +
        ' 上層 ' + prof.top.toFixed(1) + 'ms';
    }
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ベストは「また来る理由」そのものなので、額に入れて目立たせる */
  function drawBest(g, cx, y, fs) {
    if (!(high > 0)) return;
    var num = String(Math.round(high));
    var nf = fs * 0.86, lf = fs * 0.34, gap = fs * 0.38;
    g.font = 'bold ' + nf.toFixed(0) + 'px system-ui, sans-serif';
    var nw = g.measureText(num).width;
    g.font = lf.toFixed(0) + 'px system-ui, sans-serif';
    var lw = g.measureText('ベスト').width;
    var tw = lw + gap + nw, pad = fs * 0.55, bh = fs * 1.3;

    g.save();
    g.textBaseline = 'middle';
    roundRect(g, cx - tw / 2 - pad, y - bh / 2, tw + pad * 2, bh, bh * 0.28);
    g.fillStyle = col(46, 55, 0.10); g.fill();
    g.strokeStyle = col(46, 72, 0.45); g.lineWidth = 1.3; g.stroke();

    g.textAlign = 'left';
    g.font = lf.toFixed(0) + 'px system-ui, sans-serif';
    g.fillStyle = col(46, 78, 0.75);
    g.fillText('ベスト', cx - tw / 2, y + fs * 0.03);

    g.font = 'bold ' + nf.toFixed(0) + 'px system-ui, sans-serif';
    g.shadowBlur = 14; g.shadowColor = col(46, 70, 0.9);
    g.fillStyle = col(46, 88, 1);
    g.fillText(num, cx - tw / 2 + lw + gap, y);
    g.restore();
  }

  function drawTitle() {
    var w = view.w, h = view.h, cx = w / 2, cy = h / 2;
    ctx2.save();
    ctx2.globalCompositeOperation = 'source-over';

    /* 裏のデモを殺さない程度に落とす */
    var g = ctx2.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(3,5,10,0.72)');
    g.addColorStop(0.5, 'rgba(3,5,10,0.35)');
    g.addColorStop(1, 'rgba(3,5,10,0.72)');
    ctx2.fillStyle = g;
    ctx2.fillRect(0, 0, w, h);

    ctx2.textAlign = 'center';

    var fs = Math.min(42, w / 11);
    ctx2.shadowBlur = 26; ctx2.shadowColor = 'rgba(120,220,255,0.85)';
    ctx2.fillStyle = 'rgba(238,250,255,0.97)';
    ctx2.font = 'bold ' + fs.toFixed(0) + 'px system-ui, sans-serif';
    ctx2.fillText('カラー・フュージョン', cx, cy - fs * 2.6);

    ctx2.shadowBlur = 10;
    ctx2.fillStyle = 'rgba(170,215,250,0.8)';
    ctx2.font = (fs * 0.36).toFixed(0) + 'px system-ui, sans-serif';
    ctx2.fillText('同じ色をくっつけて、光を絶やすな', cx, cy - fs * 1.8);

    /* 中央はコアに空けておく。文字を重ねるとコアが読めなくなる */
    ctx2.shadowBlur = 8; ctx2.shadowColor = 'rgba(120,220,255,0.7)';
    ctx2.fillStyle = 'rgba(190,225,255,' + (0.5 + 0.4 * Math.sin(tNow * 2.6)) + ')';
    ctx2.font = 'bold ' + (fs * 0.42).toFixed(0) + 'px system-ui, sans-serif';
    ctx2.fillText('画面をタップして始める', cx, cy + fs * 2.0);

    ctx2.shadowBlur = 0;
    ctx2.fillStyle = 'rgba(150,195,235,0.55)';
    ctx2.font = (fs * 0.32).toFixed(0) + 'px system-ui, sans-serif';
    ctx2.fillText('ドラッグで矢印を引く。引いた向きへ飛ぶ', cx, cy + fs * 2.9);

    drawBest(ctx2, cx, Math.min(cy + fs * 4.3, h - fs * 1.4), fs);

    ctx2.fillStyle = 'rgba(130,170,210,0.38)';
    ctx2.font = (fs * 0.27).toFixed(0) + 'px system-ui, sans-serif';
    ctx2.fillText(VERSION, cx, h - 30);
    ctx2.restore();
  }

  function drawOver() {
    var t = Math.max(0, Math.min(1, (tNow - overT) / 0.5));
    ctx2.save();
    ctx2.globalCompositeOperation = 'source-over';
    ctx2.fillStyle = 'rgba(3,5,10,' + (0.72 * t) + ')';
    ctx2.fillRect(0, 0, view.w, view.h);

    var cx = view.w / 2, cy = view.h / 2;
    ctx2.textAlign = 'center';
    ctx2.shadowBlur = 18; ctx2.shadowColor = 'rgba(120,220,255,0.9)';

    ctx2.fillStyle = 'rgba(180,215,245,' + (0.7 * t) + ')';
    ctx2.font = '13px system-ui, sans-serif';
    ctx2.fillText('光が尽きた', cx, cy - 124);

    /* 称号。スコアより先に目に入る位置に置く。
       点の大小より「何をした人か」のほうが人に言いたくなる */
    ctx2.font = 'bold 30px system-ui, sans-serif';
    var rw = ctx2.measureText(rank).width, rp = 22, rh = 48;
    roundRect(ctx2, cx - rw / 2 - rp, cy - 104, rw + rp * 2, rh, 9);
    ctx2.fillStyle = col(196, 60, 0.10 * t); ctx2.fill();
    ctx2.strokeStyle = col(196, 72, 0.42 * t); ctx2.lineWidth = 1.3; ctx2.stroke();
    ctx2.shadowBlur = 18; ctx2.shadowColor = 'rgba(120,220,255,0.85)';
    ctx2.fillStyle = 'rgba(228,246,255,' + t + ')';
    ctx2.fillText(rank, cx, cy - 70);

    ctx2.fillStyle = 'rgba(235,250,255,' + t + ')';
    ctx2.font = 'bold 54px system-ui, sans-serif';
    ctx2.fillText(String(Math.round(score)), cx, cy - 6);

    ctx2.shadowBlur = 0;
    ctx2.fillStyle = 'rgba(160,205,240,' + (0.62 * t) + ')';
    ctx2.font = '13px system-ui, sans-serif';
    ctx2.fillText(depthText() + '　最大連鎖 x' + stat.chain +
                  '　最大の塊 ' + stat.biggest.toFixed(1), cx, cy + 20);

    if (newHigh) {
      ctx2.shadowBlur = 16; ctx2.shadowColor = col(46, 70, 0.9);
      ctx2.fillStyle = col(46, 88, (0.65 + 0.35 * Math.sin(tNow * 4)) * t);
      ctx2.font = 'bold 20px system-ui, sans-serif';
      ctx2.fillText('新記録', cx, cy + 50);
    }
    ctx2.shadowBlur = 0;
    if (t > 0.3) drawBest(ctx2, cx, cy + (newHigh ? 96 : 72), 38);

    ctx2.shadowBlur = 8; ctx2.shadowColor = 'rgba(120,220,255,0.9)';
    ctx2.fillStyle = 'rgba(170,215,245,' + (0.42 + 0.3 * Math.sin(tNow * 3)) * t + ')';
    ctx2.font = '14px system-ui, sans-serif';
    ctx2.fillText('画面をクリック／タップで再開', cx, cy + (newHigh ? 190 : 166));
    ctx2.shadowBlur = 0;

    /* 一言。称号やスコアと競わないよう、いちばん下に静かに置く */
    if (tip && t > 0.5) {
      var ty = Math.min(cy + (newHigh ? 234 : 210), view.h - 42);
      ctx2.fillStyle = 'rgba(140,185,225,' + (0.5 * t) + ')';
      ctx2.font = '11px system-ui, sans-serif';
      ctx2.fillText('ヒント', cx, ty - 18);
      ctx2.fillStyle = 'rgba(120,165,205,' + (0.3 * t) + ')';
      ctx2.fillRect(cx - 90, ty - 12, 180, 1);
      ctx2.fillStyle = 'rgba(195,225,250,' + (0.82 * t) + ')';
      ctx2.font = '14px system-ui, sans-serif';
      ctx2.fillText(tip[0], cx, ty + 6);
      if (tip[1]) {
        ctx2.fillStyle = 'rgba(155,195,232,' + (0.6 * t) + ')';
        ctx2.font = '12px system-ui, sans-serif';
        ctx2.fillText(tip[1], cx, ty + 26);
      }
    }
    ctx2.restore();
  }

  /* ---------- 入力 ---------- */

  cv2.addEventListener('pointerdown', function (e) {
    SFX.unlock();
    if (state === 'title') { startRun(); return; }
    if (state === 'over') {
      if (tNow - overT > 0.4) startRun();
      return;
    }
    if (drag) return;
    if (cv2.setPointerCapture) cv2.setPointerCapture(e.pointerId);
    var p = toVirtual(e.clientX, e.clientY);
    drag = shapeArrow({ id: ++seq, pid: e.pointerId, x1: p.x, y1: p.y, x2: p.x, y2: p.y, life: P.life, flash: 0 });
  });
  cv2.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.pid) return;
    var p = toVirtual(e.clientX, e.clientY);
    drag.x2 = p.x; drag.y2 = p.y;
    shapeArrow(drag);
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    if (drag.ok) {
      drag.life = P.life;
      arrows.push(drag);
      while (arrows.length > P.count) arrows.shift();
    }
    drag = null;
  }
  cv2.addEventListener('pointerup', endDrag);
  cv2.addEventListener('pointercancel', endDrag);

  /* ---------- 調整パネル ---------- */

  var binds = [];
  /* 段が進むと P を書き換えるので、スライダーの表示も追従させる */
  function syncPanel() {
    for (var i = 0; i < binds.length; i++) {
      var b = binds[i];
      b.el.value = P[b.key];
      b.out.textContent = P[b.key];
    }
  }

  function bind(id, key, after) {
    var el = document.getElementById(id), out = document.getElementById(id + '-v');
    if (!el) return;
    binds.push({ el: el, out: out, key: key });
    el.value = P[key];
    out.textContent = P[key];
    el.addEventListener('input', function () {
      P[key] = parseFloat(el.value);
      out.textContent = P[key];
      if (after) after();
    });
  }
  function restyle() {
    for (var i = 0; i < arrows.length; i++) shapeArrow(arrows[i]);
    if (drag) shapeArrow(drag);
  }
  bind('p-amin', 'aMin', restyle);
  bind('p-amax', 'aMax', restyle);
  bind('p-pn', 'powNear', restyle);
  bind('p-pf', 'powFar', restyle);
  bind('p-band', 'band');
  bind('p-pullr', 'pullR');
  bind('p-pullf', 'pullF');
  bind('p-combo', 'combo');
  bind('p-cmul', 'chainMul');
  bind('p-drain', 'drain');
  bind('p-paybase', 'payBase');
  bind('p-payexp', 'payExp');
  bind('p-lmax', 'lightMax');
  bind('p-shrink', 'shrink');
  bind('p-fmin', 'fragMin');
  bind('p-fmax', 'fragMax');
  bind('p-fgrow', 'fragGrow');
  bind('p-funit', 'fragUnit');
  bind('p-fspeed', 'fragSpeed');
  bind('p-fdecay', 'fragDecay');
  bind('p-trail', 'trail');
  bind('p-speed', 'speed');
  bind('p-spawn', 'spawnEvery');
  bind('p-life', 'life');
  bind('p-count', 'count');
  bind('p-jitter', 'jitter');
  bind('p-maxs', 'maxShapes');
  bind('p-colors', 'colors');

  var fc = document.getElementById('p-fchain');
  if (fc) {
    fc.checked = !!P.fragChain;
    fc.addEventListener('change', function () { P.fragChain = fc.checked ? 1 : 0; });
  }

  var stg = document.getElementById('p-stage');
  if (stg) {
    stg.checked = !!P.stages;
    stg.addEventListener('change', function () { P.stages = stg.checked ? 1 : 0; });
  }

  var glw = document.getElementById('p-glow');
  if (glw) {
    glw.checked = !!P.glow;
    glw.addEventListener('change', function () { P.glow = glw.checked ? 1 : 0; });
  }

  var prev = document.getElementById('p-prev');
  if (prev) {
    prev.checked = !!P.preview;
    prev.addEventListener('change', function () { P.preview = prev.checked ? 1 : 0; });
  }

  /* 結果のコピー。リンクは持たせない（貼る先はプレイヤーが決める） */
  var overUI = document.getElementById('over');
  var copyBtn = document.getElementById('copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var txt = shareText();
      function done() {
        copyBtn.textContent = 'コピーしました';
        setTimeout(function () { copyBtn.textContent = '結果をコピー'; }, 1600);
      }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed'; ta.style.top = '-200px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (err) {}
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, fallback);
      } else fallback();
    });
  }

  /* 調整パネルは開発用。URL に ?tune=1 を付けたときだけ出す */
  var panel = document.getElementById('panel');
  var tuneBtn = document.getElementById('tune');
  if (/[?&]tune=1/.test(location.search)) {
    tuneBtn.addEventListener('click', function () { panel.hidden = !panel.hidden; });
  } else {
    tuneBtn.hidden = true;
    document.getElementById('stat').hidden = true;
    document.querySelector('.hud').classList.add('bare');
  }

  /* 設定（音量と素材の出どころ） */
  var setPanel = document.getElementById('setting');
  document.getElementById('gear').addEventListener('click', function () {
    SFX.unlock();
    setPanel.hidden = !setPanel.hidden;
  });
  (function () {
    var v = SFX.vol();
    [['v-bgm', 'bgm'], ['v-se', 'se']].forEach(function (pair) {
      var el = document.getElementById(pair[0]), out = document.getElementById(pair[0] + '-v');
      el.value = v[pair[1]];
      out.textContent = Math.round(v[pair[1]] * 100) + '%';
      el.addEventListener('input', function () {
        var val = parseFloat(el.value);
        SFX.setVol(pair[1], val);
        out.textContent = Math.round(val * 100) + '%';
      });
    });
    var box = document.getElementById('credits');
    var list = SFX.credits();
    if (!list.length) {
      box.innerHTML = '<p class="none">音の素材は準備中です</p>';
    } else {
      box.innerHTML = '<p class="ttl">音の素材</p>' + list.map(function (c) {
        var who = c.url
          ? '<a href="' + c.url + '" target="_blank" rel="noopener">' + c.who + '</a>'
          : c.who;
        return '<p>' + c.what + '：' + who + ' 様</p>';
      }).join('');
    }
    document.getElementById('ver').textContent = VERSION;
  })();
  document.getElementById('clear').addEventListener('click', function () {
    SFX.unlock(); startRun();
  });

  /* ---------- ループ ---------- */

  function frame(ts) {
    if (cv.clientWidth !== view.w || cv.clientHeight !== view.h) resize();
    /* tNow は実時刻そのものではなく、経過を足した内部時計。
       検証用の sim() で先へ進めても、時刻のつじつまが合うようにする */
    var now = ts / 1000;
    var dt = tPrev ? Math.min(now - tPrev, 0.05) : 0;
    tPrev = now;
    tNow += dt;
    if (dt > 0) stat.fps += (1 / dt - stat.fps) * 0.06;
    var _u0 = performance.now();
    if (state === 'play' || state === 'title') update(dt);
    else { core.t += dt; for (var q = parts.length - 1; q >= 0; q--) { var pp = parts[q]; pp.life -= dt; pp.x += pp.vx * dt; pp.y += pp.vy * dt; pp.vx *= Math.exp(-2.6 * dt); pp.vy *= Math.exp(-2.6 * dt); if (pp.life <= 0) parts.splice(q, 1); } }
    prof.up += (performance.now() - _u0 - prof.up) * 0.05;
    render();
    requestAnimationFrame(frame);
  }

  window.CF = { P: P, shapes: shapes, arrows: arrows, parts: parts, view: view,
                stat: stat, prof: prof, turn: turn, powerOf: powerOf, shapeArrow: shapeArrow,
                chain: chain, STAGES: STAGES, PALETTES: PALETTES, COLORS: COLORS,
                shards: shards, pending: pending,
                stage: function () { return { lap: lap, stage: stage, colors: P.colors, spawn: P.spawnEvery, drain: P.drain, speed: P.speed, hues: COLORS.map(function (c) { return c.hue; }) }; },
                core: core, restart: restart, toTitle: toTitle, VERSION: VERSION,
                FIELD_R: FIELD_R, dprFor: dprFor,
                canvasPx: function () { return { w: cv.width, h: cv.height, Mpx: +(cv.width * cv.height / 1e6).toFixed(2) }; },
                rank: function () { return rank; }, share: shareText,
                tip: function () { return tip; },
                runs: function () { return runs; },
                setRuns: function (n) { runs = n; try { localStorage.setItem('cf_runs', String(n)); } catch (e) {} },
                info: function () { return { state: state, score: +score.toFixed(0), high: +high.toFixed(0), light: +core.light.toFixed(1) }; },
                sim: function (sec, step) {
                  step = step || 1 / 60;
                  var n = Math.round(sec / step);
                  for (var i = 0; i < n; i++) {
                    if (state !== 'play' && state !== 'title') break;
                    tNow += step; update(step);
                  }
                  return { frames: n, shapes: shapes.length };
                } };

  toTitle();
  resize();
  requestAnimationFrame(frame);
})();
