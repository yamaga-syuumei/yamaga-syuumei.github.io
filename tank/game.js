/* ==========================================================
   荒野の戦車乗り（ベータ 0.4）

   企画書の方針
   - 区画選択制ではなく、2Dトップダウンの地続きのフィールド
   - シンボルエンカウント（敵が見えていて、触れると戦闘）
   - 雑魚はワンボタンのオート戦闘、賞金首はターン制で部位を狙う
   - 街とイベントは data.js に外出しし、後から足せるようにする

   描画は Phaser 3（CDN から読む。PCには何もインストールしない）。
   絵は art.js が実行時に生成する。画像ファイルは持たない。
   街・整備・戦闘のUIは DOM のまま。この種の一覧表示は DOM の方が向く。

   座標系はタイル16px。カメラを2倍に拡大して表示するので、
   画面上は1タイル32px になる。
   ========================================================== */
(function () {
  'use strict';

  var D = window.GAME_DATA;

  var TILE = 16, MAPW = 60, MAPH = 45;
  var WORLD_W = MAPW * TILE, WORLD_H = MAPH * TILE;
  var VIEW_W = 704, VIEW_H = 448, ZOOM = 2;
  var SAND = 0, ROCK = 1, ROAD = 2, TOWN = 3;
  var SAVE_KEY = 'tank-save-v2';       // 座標系が変わったので旧セーブは読まない

  /* ==========================================================
     乱数（種を固定して、毎回同じ地形にする）
     ========================================================== */
  function rngFrom(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ==========================================================
     地形
     ========================================================== */
  var map = [];

  function buildMap() {
    var rnd = rngFrom(20260904);
    map = [];
    for (var y = 0; y < MAPH; y++) {
      var row = [];
      for (var x = 0; x < MAPW; x++) row.push(SAND);
      map.push(row);
    }

    // 岩をかたまりで散らす
    for (var i = 0; i < 190; i++) {
      var cx = Math.floor(rnd() * MAPW), cy = Math.floor(rnd() * MAPH);
      var n = 2 + Math.floor(rnd() * 5);
      for (var k = 0; k < n; k++) {
        var px = cx + Math.floor(rnd() * 3) - 1;
        var py = cy + Math.floor(rnd() * 3) - 1;
        if (px > 0 && px < MAPW - 1 && py > 0 && py < MAPH - 1) map[py][px] = ROCK;
      }
    }
    // 外周は岩で囲って外に出られないようにする
    for (var x2 = 0; x2 < MAPW; x2++) { map[0][x2] = ROCK; map[MAPH - 1][x2] = ROCK; }
    for (var y2 = 0; y2 < MAPH; y2++) { map[y2][0] = ROCK; map[y2][MAPW - 1] = ROCK; }

    // 街どうしを道でつなぐ（道の上の岩は取り除かれる）
    var t = D.towns;
    for (var a = 0; a < t.length - 1; a++) road(t[a], t[a + 1]);
    road(t[0], t[2]);

    // 街の周りを均す
    t.forEach(function (tw) {
      for (var dy = -1; dy <= 1; dy++)
        for (var dx = -1; dx <= 1; dx++) map[tw.y + dy][tw.x + dx] = ROAD;
      map[tw.y][tw.x] = TOWN;
      // 出発地点（街の2マス下）も必ず走れるようにしておく。
      // ここが岩だと、出た瞬間に岩の中に埋まって動けなくなる。
      if (map[tw.y + 2]) map[tw.y + 2][tw.x] = ROAD;
    });
  }

  function road(a, b) {
    var x = a.x, y = a.y;
    while (x !== b.x) { x += x < b.x ? 1 : -1; carve(x, y); }
    while (y !== b.y) { y += y < b.y ? 1 : -1; carve(x, y); }
  }
  function carve(x, y) {
    if (map[y][x] !== TOWN) map[y][x] = ROAD;
    // 道の脇も少し広げて走りやすくする
    if (map[y - 1] && map[y - 1][x] === ROCK) map[y - 1][x] = SAND;
    if (map[y + 1] && map[y + 1][x] === ROCK) map[y + 1][x] = SAND;
  }

  function blocked(px, py) {
    var x = Math.floor(px / TILE), y = Math.floor(py / TILE);
    if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) return true;
    return map[y][x] === ROCK;
  }

  /* ==========================================================
     セーブデータ
     ========================================================== */
  var S;

  function fresh() {
    var home = D.towns[0];
    return {
      gold: 300,
      hp: null,                                   // 後で最大値に合わせる
      parts: { cannon: 0, subgun: 0, armor: 0, engine: 0 },
      defeated: {},
      cleared: false,
      x: home.x * TILE + TILE / 2,
      y: (home.y + 2) * TILE + TILE / 2
    };
  }
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) S = JSON.parse(raw);
    } catch (e) { /* 保存できない環境でも遊べるようにする */ }
    if (!S) S = fresh();
    if (S.parts.subgun == null) S.parts.subgun = 0;
    if (!S.defeated) S.defeated = {};
    if (S.cleared == null) S.cleared = bossesLeft() === 0;
    if (S.hp == null) S.hp = maxHp();
    S.hp = Math.min(S.hp, maxHp());
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
  }

  /* ==========================================================
     装備
     ========================================================== */
  /* 何が強くなるのかを、遊ぶ人がその場で読めるようにしておく。
     stats は整備で「いくつからいくつへ」を出すため、
     tag は HUD に今の値を小さく添えるために使う。 */
  var PART_INFO = {
    cannon: {
      label: '主砲', tag: '攻', stats: [{ name: '攻撃力', key: 'atk' }],
      about: '戦闘で最初に撃つ砲。与えるダメージがそのまま上がる。'
    },
    subgun: {
      label: '副砲', tag: '攻', stats: [{ name: '攻撃力', key: 'atk' }],
      about: '主砲のあとに続けて撃つ。積むと1ターンの手数が増える。'
    },
    armor: {
      label: '装甲', tag: '防',
      stats: [{ name: '防御力', key: 'def' }, { name: '最大HP', key: 'hp' }],
      about: '受けるダメージが減り、最大HPも増える。積み替えると全快する。'
    },
    engine: {
      label: 'エンジン', tag: '速', stats: [{ name: '速さ', key: 'spd', fix: 1 }],
      about: '荒野を走る速さ。戦闘の強さには影響しない。'
    }
  };

  function cannon() { return D.parts.cannon[S.parts.cannon]; }
  function subgun() { return D.parts.subgun[S.parts.subgun]; }
  function armor()  { return D.parts.armor[S.parts.armor]; }
  function engine() { return D.parts.engine[S.parts.engine]; }
  function maxHp()  { return armor().hp; }

  /* art.js に渡す色。装備を積み替えると戦車の見た目が変わる */
  function tankPal() {
    return {
      body:   armor().color,
      tread:  engine().color,
      barrel: cannon().color,
      sub:    subgun().color
    };
  }

  /* ベータのクリア条件は、賞金首を全員倒すこと */
  function bossDefs() {
    return D.enemies.filter(function (e) { return e.kind === 'boss'; });
  }
  function bossesLeft() {
    return bossDefs().filter(function (e) { return !S.defeated[e.id]; }).length;
  }

  /* ==========================================================
     敵の配置
     ========================================================== */
  var mobs = [], bosses = [];

  function spawnMobs() {
    var rnd = rngFrom(777);
    mobs = [];
    var tries = 0;
    while (mobs.length < 16 && tries++ < 4000) {
      var x = Math.floor(rnd() * MAPW), y = Math.floor(rnd() * MAPH);
      if (map[y][x] === ROCK || map[y][x] === TOWN) continue;
      if (nearTown(x, y, 3)) continue;
      // 拠点から遠いほど強い敵が出る
      var home = D.towns[0];
      var d = Math.hypot(x - home.x, y - home.y);
      var lv = d < 14 ? 0 : (d < 28 ? 1 : 2);
      mobs.push({
        x: x * TILE + TILE / 2, y: y * TILE + TILE / 2,
        lv: lv, t: rnd() * 100
      });
    }
  }
  function nearTown(x, y, r) {
    return D.towns.some(function (t) { return Math.abs(t.x - x) <= r && Math.abs(t.y - y) <= r; });
  }
  function setupBosses() {
    bosses = bossDefs().map(function (e) {
      return { def: e, x: e.x * TILE + TILE / 2, y: e.y * TILE + TILE / 2 };
    });
  }

  /* ==========================================================
     入力
     ========================================================== */
  var pad = { up: 0, down: 0, left: 0, right: 0 };

  Array.prototype.forEach.call(document.querySelectorAll('#pad button'), function (b) {
    var d = b.dataset.dir;
    function on(e) { e.preventDefault(); pad[d] = 1; }
    function off(e) { e.preventDefault(); pad[d] = 0; }
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
  });

  /* ==========================================================
     進行状態
     ========================================================== */
  var scene = 'field';      // field / mob / boss / town / clear
  var facing = 'right';
  var flipX = false;
  var cool = 0;             // 戦闘直後の無敵時間（フレーム）
  var townLock = null;      // 同じ街で繰り返し開かないようにする

  var toastEl = document.getElementById('toast'), toastT = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastT = 150;
  }

  function panel(id, show) {
    document.getElementById(id).hidden = !show;
    syncIdle();
  }

  /* 街も戦闘も出ていないときだけ、待機カード（凡例）を見せる */
  function syncIdle() {
    var busy = ['mob', 'boss', 'town', 'clear'].some(function (k) {
      return !document.getElementById(k).hidden;
    });
    document.getElementById('idle').hidden = busy;
    if (busy) return;

    var all = bossDefs().length, done = all - bossesLeft();
    document.getElementById('goal-count').textContent = done + ' / ' + all;
    document.getElementById('goal-note').textContent =
      done === all ? '踏破済み。荒野に賞金首はもういない' : '三体すべて仕留めるとクリア';
    document.getElementById('goal').classList.toggle('is-done', done === all);
  }

  function num(v, fix) { return fix == null ? v : v.toFixed(fix); }

  function hud() {
    var hp = Math.max(0, Math.round(S.hp)), max = maxHp();
    document.getElementById('hud-hp').textContent = hp + ' / ' + max;
    document.getElementById('hud-hpbar').style.width = (hp / max * 100) + '%';
    document.getElementById('hud-gold').textContent = S.gold.toLocaleString() + ' G';

    // 装備名と色見本。色は画面上の戦車に使っているものと同じ
    [['cannon', cannon()], ['subgun', subgun()],
     ['armor', armor()],   ['engine', engine()]].forEach(function (pair) {
      var key = pair[0], part = pair[1];
      document.getElementById('gear-' + key).textContent = part.name;
      var info = PART_INFO[key], st = info.stats[0], v = part[st.key];
      document.getElementById('st-' + key).textContent =
        v ? info.tag + ' ' + num(v, st.fix) : '—';
      var sw = document.getElementById('sw-' + key);
      sw.style.background = part.color || 'transparent';
      sw.style.border = part.color ? '0' : '1px solid #39424b';
    });
  }

  /* ==========================================================
     Phaser のシーン
     ========================================================== */
  var G = null;          // シーンへの参照。DOM 側から絵を触るのに使う

  var Field = {
    key: 'field',

    create: function () {
      G = this;
      ART.register(this, tankPal());

      // 地形は一度だけ大きなテクスチャに焼く。毎フレーム2700枚を描くのは無駄
      var rt = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0).setDepth(0);
      rt.beginDraw();
      for (var y = 0; y < MAPH; y++) {
        for (var x = 0; x < MAPW; x++) {
          rt.batchDraw(tileKey(x, y), x * TILE, y * TILE);
        }
      }
      rt.endDraw();

      // 賞金首。部位ごとに重ねて、壊れた部位を消せるようにする
      this.bossViews = bosses.map(function (b) {
        var id = b.def.id;
        var parts = {};
        var layers = ['track', 'body'].concat(
          b.def.parts.map(function (p) { return p.key; })
            .filter(function (k) { return k !== 'body' && k !== 'track'; })
        );
        var list = layers.map(function (k) {
          var sp = G.add.sprite(b.x, b.y, 'boss-' + id + '-' + k).setDepth(b.y);
          parts[k] = sp;
          return sp;
        });
        return { def: b.def, sprites: list, byKey: parts };
      });

      // 雑魚
      this.mobViews = mobs.map(function (m) {
        return G.add.sprite(m.x, m.y, 'mob-' + m.lv).setDepth(m.y);
      });

      // 自車
      this.tank = this.add.sprite(S.x, S.y, 'tank-right').setDepth(S.y + 1);

      this.cameras.main
        .setBounds(0, 0, WORLD_W, WORLD_H)
        .setZoom(ZOOM)
        .startFollow(this.tank, true, 0.18, 0.18);

      this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
      this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');

      refreshBossViews();
      buildLegend();
      hud();
      syncIdle();
    },

    update: function (time, delta) {
      var step = Math.min(delta, 50) / 16.667;    // 60fps を1歩とする
      if (toastT > 0) { toastT -= step; if (toastT <= 0) toastEl.hidden = true; }

      // 雑魚はゆっくり漂う
      var self = this;
      mobs.forEach(function (m, i) {
        m.t += .02 * step;
        var mx = m.x + Math.cos(m.t) * .18 * step, my = m.y + Math.sin(m.t * .7) * .18 * step;
        if (!blocked(mx, my)) { m.x = mx; m.y = my; }
        var v = self.mobViews[i];
        v.setPosition(Math.round(m.x), Math.round(m.y)).setDepth(m.y);
      });

      if (scene !== 'field') return;
      if (cool > 0) cool -= step;

      var a = axis(this), ax = a[0], ay = a[1];
      var sp = engine().spd * (TILE / 32) * step;
      if (ax || ay) {
        var len = Math.hypot(ax, ay);
        var nx = S.x + ax / len * sp, ny = S.y + ay / len * sp;
        // 既に岩の中にいるときは判定を外す。
        // 外さないと、移動先も同じ岩タイルなので永久に出られなくなる。
        var stuck = blocked(S.x, S.y);
        // 縦横を別々に判定して、壁ぎわで引っかからないようにする
        if (stuck || !blocked(nx, S.y)) S.x = nx;
        if (stuck || !blocked(S.x, ny)) S.y = ny;

        // 向きは4方向。斜めのときは動きの大きい方を採る
        if (Math.abs(ax) >= Math.abs(ay)) { facing = 'right'; flipX = ax < 0; }
        else { facing = ay < 0 ? 'up' : 'down'; flipX = false; }
      }

      this.tank.setTexture('tank-' + facing).setFlipX(flipX)
        .setPosition(Math.round(S.x), Math.round(S.y)).setDepth(S.y + 1);

      if (cool <= 0) checkEncounter();
      checkTown();
      drawMinimap();
    }
  };

  /* ==========================================================
     戦闘シーン

     数値の計算とログはこれまでどおり DOM 側が持つ。
     このシーンは「見せる」ことだけを担当し、
     game.js から Battle.xxx() を呼んで演出を差し込む。
     操作ボタンは右の表示エリアに残す。押す場所を動かさないため。
     ========================================================== */
  var BG = null;                       // 戦闘シーンへの参照
  var battleOpen = false;
  var CX = VIEW_W / 2;
  var ENEMY_Y = 168, PLAYER_Y = 360;

  /* Phaser の scene 配列は先頭しか自動で始まらない。
     戦闘は必要になったときに launch し、終わったら stop する。
     背景を毎回作り直すことになるが、中身は数個の図形なので安い。 */
  var BattleScene = {
    key: 'battle',

    create: function (data) {
      BG = this;
      this.parts = {};

      // 地面。砂タイルを敷いて暗く落とす
      this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'tile-sand-0')
        .setOrigin(0, 0).setTileScale(2, 2).setTint(0x7a6642);

      // 上へ行くほど暗くして奥行きを出す
      var sky = this.add.graphics();
      for (var i = 0; i < 26; i++) {
        sky.fillStyle(0x0d1013, 0.60 - i * 0.023);
        sky.fillRect(0, i * 7, VIEW_W, 7);
      }

      // 四隅を落とす
      var vig = this.add.graphics();
      vig.fillStyle(0x000000, 0.40);
      vig.fillRect(0, 0, VIEW_W, 24);
      vig.fillRect(0, VIEW_H - 24, VIEW_W, 24);
      vig.fillRect(0, 0, 24, VIEW_H);
      vig.fillRect(VIEW_W - 24, 0, 24, VIEW_H);

      this.shadow = this.add.ellipse(CX, ENEMY_Y + 60, 120, 22, 0x000000, 0.3).setDepth(4);
      this.enemyBox = this.add.container(CX, ENEMY_Y).setDepth(5);

      this.playerShadow = this.add.ellipse(CX, PLAYER_Y + 40, 76, 16, 0x000000, 0.3).setDepth(5);
      this.player = this.add.sprite(CX, PLAYER_Y, 'tank-up').setScale(5).setDepth(6);

      this.flash = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xffffff)
        .setOrigin(0, 0).setDepth(50).setAlpha(0);

      var sc = this;
      if (data.kind === 'mob') {
        sc.enemyMain = sc.add.sprite(0, 0, 'mob-' + data.def.lv).setScale(6);
        sc.enemyBox.add(sc.enemyMain);
        sc.shadow.setPosition(CX, ENEMY_Y + 54).setDisplaySize(110, 20);
      } else {
        // 賞金首は部位ごとに重ねる。壊れたら消せるようにする
        var order = ['track', 'body'].concat(
          data.def.parts.map(function (p) { return p.key; })
            .filter(function (k) { return k !== 'body' && k !== 'track'; })
        );
        order.forEach(function (k) {
          var sp = sc.add.sprite(0, 0, 'boss-' + data.def.id + '-' + k).setScale(5);
          sc.enemyBox.add(sp);
          sc.parts[k] = sp;
        });
        sc.enemyMain = sc.parts.body;
        sc.shadow.setPosition(CX, ENEMY_Y + 76).setDisplaySize(150, 26);
      }

      sc.enemyBox.setScale(0.6).setAlpha(0);
      sc.tweens.add({ targets: sc.enemyBox, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    }
  };

  var Battle = {
    /* 戦闘の開始。kind は 'mob' か 'boss' */
    open: function (kind, def) {
      if (!G) return;
      battleOpen = true;
      G.scene.pause();
      G.scene.launch('battle', { kind: kind, def: def });
      if (mmEl) mmEl.hidden = true;          // 戦闘中は地図を出さない
      SFX.encounter();
    },

    /* 自車が撃つ */
    playerFire: function (sub, damage, targetKey) {
      if (!Battle.isOpen()) return;
      var sc = BG;
      var bx = CX + (sub ? 26 : 0), by = PLAYER_Y - 40;

      var mf = sc.add.circle(bx, by, sub ? 7 : 12, 0xffe9a8, 0.95).setDepth(7);
      sc.tweens.add({ targets: mf, scale: 0.2, alpha: 0, duration: 130,
                      onComplete: function () { mf.destroy(); } });
      sc.cameras.main.shake(sub ? 60 : 110, sub ? 0.002 : 0.005);
      if (sub) { SFX.subFire(); } else { SFX.fire(); }

      var shell = sc.add.rectangle(bx, by, sub ? 4 : 6, sub ? 10 : 16,
                                   sub ? 0xd6e2ee : 0xffd479).setDepth(7);
      var tx = CX + (Math.random() * 40 - 20), ty = ENEMY_Y + 8;
      sc.tweens.add({
        targets: shell, x: tx, y: ty, duration: sub ? 130 : 180, ease: 'Quad.easeIn',
        onComplete: function () {
          shell.destroy();
          Battle.impact(tx, ty, damage, sub, targetKey);
        }
      });
    },

    /* 着弾。破片を散らして数字を出す */
    impact: function (x, y, damage, small, targetKey) {
      if (!Battle.isOpen()) return;
      var sc = BG;
      SFX.hit();

      var burst = sc.add.circle(x, y, small ? 12 : 20, 0xfff0c0, 0.9).setDepth(8);
      sc.tweens.add({ targets: burst, scale: 2.2, alpha: 0, duration: 240,
                      onComplete: function () { burst.destroy(); } });

      for (var i = 0; i < (small ? 5 : 10); i++) {
        (function () {
          var ang = Math.random() * Math.PI * 2, dist = 30 + Math.random() * 55;
          var sp = sc.add.rectangle(x, y, 4, 4, i % 2 ? 0xffb454 : 0xc8ced4).setDepth(8);
          sc.tweens.add({
            targets: sp, x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist + 30,
            alpha: 0, angle: 180, duration: 380 + Math.random() * 180,
            onComplete: function () { sp.destroy(); }
          });
        })();
      }

      // 当たった部位を白く光らせる
      var target = (targetKey && sc.parts[targetKey]) || sc.enemyMain;
      if (target && target.active) {
        target.setTintFill(0xffffff);
        sc.time.delayedCall(70, function () { if (target.active) target.clearTint(); });
      }
      sc.enemyBox.x = CX + (small ? 4 : 8);
      sc.tweens.add({ targets: sc.enemyBox, x: CX, duration: 160, ease: 'Elastic.easeOut' });

      Battle.number(x, y - 16, damage, small ? '#ffe9a8' : '#ffd479', small ? 20 : 28);
    },

    /* 敵の攻撃 */
    enemyFire: function (damage) {
      if (!Battle.isOpen()) return;
      var sc = BG;
      var shell = sc.add.rectangle(CX, ENEMY_Y + 40, 6, 14, 0xff8a5a).setDepth(7);
      sc.tweens.add({
        targets: shell, x: CX + (Math.random() * 30 - 15), y: PLAYER_Y - 20,
        duration: 200, ease: 'Quad.easeIn',
        onComplete: function () {
          shell.destroy();
          if (!Battle.isOpen()) return;
          SFX.damage();
          sc.cameras.main.shake(200, 0.012);
          sc.flash.setFillStyle(0xe03919).setAlpha(0.35);
          sc.tweens.add({ targets: sc.flash, alpha: 0, duration: 220 });
          sc.player.setTintFill(0xffffff);
          sc.time.delayedCall(80, function () { sc.player.clearTint(); });
          Battle.number(CX, PLAYER_Y - 50, damage, '#ff7a5a', 26);
        }
      });
    },

    /* ダメージの数字を浮かせる */
    number: function (x, y, v, color, size) {
      if (!Battle.isOpen()) return;
      var sc = BG;
      var t = sc.add.text(x, y, String(v), {
        fontFamily: '"Yu Gothic", "Meiryo", sans-serif',
        fontSize: size + 'px', fontStyle: 'bold', color: color,
        stroke: '#12161a', strokeThickness: 5
      }).setOrigin(0.5).setDepth(20);
      sc.tweens.add({
        targets: t, y: y - 46, alpha: 0, duration: 780, ease: 'Quad.easeOut',
        onComplete: function () { t.destroy(); }
      });
    },

    /* 部位の破壊 */
    breakPart: function (key) {
      if (!Battle.isOpen()) return;
      var sc = BG, sp = sc.parts[key];
      SFX.destroy();
      sc.cameras.main.shake(280, 0.016);
      var wx = CX + (Math.random() * 60 - 30), wy = ENEMY_Y;
      var ring = sc.add.circle(wx, wy, 16, 0xffc46a, 0.85).setDepth(9);
      sc.tweens.add({ targets: ring, scale: 4.5, alpha: 0, duration: 420,
                      onComplete: function () { ring.destroy(); } });
      for (var i = 0; i < 16; i++) {
        (function () {
          var ang = Math.random() * Math.PI * 2, d = 40 + Math.random() * 90;
          var f = sc.add.rectangle(wx, wy, 5, 5, i % 3 ? 0xff9a4a : 0x9aa6b2).setDepth(9);
          sc.tweens.add({
            targets: f, x: wx + Math.cos(ang) * d, y: wy + Math.sin(ang) * d + 50,
            alpha: 0, angle: 360, duration: 520 + Math.random() * 260,
            onComplete: function () { f.destroy(); }
          });
        })();
      }
      if (sp) sc.tweens.add({ targets: sp, alpha: 0, duration: 260 });
    },

    /* 撃破 */
    win: function () {
      if (!Battle.isOpen()) return;
      var sc = BG;
      SFX.defeat();
      sc.cameras.main.shake(500, 0.02);
      sc.flash.setFillStyle(0xffffff).setAlpha(0.6);
      sc.tweens.add({ targets: sc.flash, alpha: 0, duration: 420 });
      sc.tweens.add({ targets: sc.enemyBox, alpha: 0, scale: 1.3, angle: 8, duration: 520 });
      sc.tweens.add({ targets: sc.shadow, alpha: 0, duration: 420 });
    },

    /* 大破 */
    lose: function () {
      if (!Battle.isOpen()) return;
      var sc = BG;
      SFX.defeat();
      sc.cameras.main.shake(500, 0.022);
      sc.flash.setFillStyle(0xe03919).setAlpha(0.55);
      sc.tweens.add({ targets: sc.flash, alpha: 0, duration: 520 });
      sc.tweens.add({ targets: sc.player, alpha: 0.25, angle: -14, duration: 520 });
      sc.tweens.add({ targets: sc.playerShadow, alpha: 0, duration: 420 });
    },

    /* 応急修理 */
    repair: function (amount) {
      if (!Battle.isOpen()) return;
      var sc = BG;
      SFX.repair();
      var ring = sc.add.circle(CX, PLAYER_Y, 30, 0x3fb87a, 0)
        .setStrokeStyle(3, 0x7fe3a6, 0.9).setDepth(9);
      sc.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 480,
                      onComplete: function () { ring.destroy(); } });
      Battle.number(CX, PLAYER_Y - 50, '+' + amount, '#7fe3a6', 26);
    },

    /* 戦闘の終了。フィールドへ戻す */
    close: function () {
      if (!battleOpen) return;
      battleOpen = false;
      if (BG) { BG.scene.stop(); BG = null; }
      if (mmEl) mmEl.hidden = false;
      if (G) G.scene.resume();
    },

    isOpen: function () { return battleOpen; }
  };

  /* 待機カードの凡例。実際のスプライトを描き写す。
     手書きの図形で代用すると、絵を描き変えたときに黙ってずれる。 */
  function buildLegend() {
    var host = document.getElementById('legend');
    if (!host || !G) return;
    host.innerHTML = '';

    var boss = bossDefs()[0];
    var bossKeys = ['track', 'body'].concat(
      boss.parts.map(function (p) { return p.key; })
        .filter(function (k) { return k !== 'body' && k !== 'track'; })
    ).map(function (k) { return 'boss-' + boss.id + '-' + k; });

    [{ keys: ['mob-0'], name: D.enemies[0].name, note: '弱い',   scale: 2 },
     { keys: ['mob-1'], name: D.enemies[1].name, note: '中くらい', scale: 2 },
     { keys: ['mob-2'], name: D.enemies[2].name, note: '強い',   scale: 2 },
     { keys: bossKeys,  name: '賞金首',          note: '地図の赤い点',   scale: 1 },
     { keys: ['tile-town-0'], name: '街',        note: '地図の黄色い点', scale: 2 }
    ].forEach(function (r) {
      var c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      var g2 = c.getContext('2d');
      g2.imageSmoothingEnabled = false;
      r.keys.forEach(function (k) {
        if (!G.textures.exists(k)) return;
        var img = G.textures.get(k).getSourceImage();
        var w = img.width * r.scale, h = img.height * r.scale;
        g2.drawImage(img, (32 - w) / 2, (32 - h) / 2, w, h);
      });
      var row = document.createElement('div');
      var nm = document.createElement('span');
      nm.textContent = r.name;
      var note = document.createElement('em');
      note.textContent = r.note;
      row.appendChild(c); row.appendChild(nm); row.appendChild(note);
      host.appendChild(row);
    });
  }

  function tileKey(x, y) {
    var t = map[y][x];
    if (t === ROCK) return 'tile-rock-' + ((x * 3 + y) % 3);
    if (t === ROAD) return 'tile-road-' + ((x * 2 + y) % 3);
    if (t === TOWN) return 'tile-town-0';
    return 'tile-sand-' + ((x * 5 + y * 3) % 3);
  }

  function axis(sc) {
    var k = sc.keys, ax = 0, ay = 0;
    if (k.LEFT.isDown  || k.A.isDown || pad.left)  ax -= 1;
    if (k.RIGHT.isDown || k.D.isDown || pad.right) ax += 1;
    if (k.UP.isDown    || k.W.isDown || pad.up)    ay -= 1;
    if (k.DOWN.isDown  || k.S.isDown || pad.down)  ay += 1;
    return [ax, ay];
  }

  /* 倒した賞金首を画面から消す */
  function refreshBossViews() {
    if (!G || !G.bossViews) return;
    G.bossViews.forEach(function (v) {
      var gone = !!S.defeated[v.def.id];
      v.sprites.forEach(function (sp) { sp.setVisible(!gone); });
    });
  }

  /* 装備を積み替えたら戦車を描き直す */
  function refreshTank() {
    if (!G) return;
    ART.retank(G, tankPal());
    G.tank.setTexture('tank-' + facing);
    if (BG && BG.player) BG.player.setTexture('tank-up');
  }

  /* ==========================================================
     ミニマップ（DOM の小さなキャンバスに描く）
     ========================================================== */
  var mmEl = document.getElementById('minimap');
  var mmG = mmEl ? mmEl.getContext('2d') : null;

  function drawMinimap() {
    if (!mmG) return;
    var w = mmEl.width, h = mmEl.height;
    mmG.fillStyle = 'rgba(5,7,10,.8)';
    mmG.fillRect(0, 0, w, h);
    var sx = w / MAPW, sy = h / MAPH;
    D.towns.forEach(function (t) {
      mmG.fillStyle = '#d9a441';
      mmG.fillRect(t.x * sx - 1, t.y * sy - 1, 3, 3);
    });
    bosses.forEach(function (b) {
      if (S.defeated[b.def.id]) return;
      mmG.fillStyle = '#e03919';
      mmG.fillRect(b.def.x * sx - 1, b.def.y * sy - 1, 3, 3);
    });
    mmG.fillStyle = '#3fb87a';
    mmG.fillRect((S.x / TILE) * sx - 1, (S.y / TILE) * sy - 1, 3, 3);
  }

  /* ==========================================================
     遭遇の判定
     ========================================================== */
  function checkEncounter() {
    for (var i = 0; i < mobs.length; i++) {
      if (Math.hypot(mobs[i].x - S.x, mobs[i].y - S.y) < 10) { startMob(i); return; }
    }
    for (var j = 0; j < bosses.length; j++) {
      var b = bosses[j];
      if (S.defeated[b.def.id]) continue;
      if (Math.hypot(b.x - S.x, b.y - S.y) < 14) { startBoss(j); return; }
    }
  }

  function checkTown() {
    var tx = Math.floor(S.x / TILE), ty = Math.floor(S.y / TILE);
    var here = D.towns.filter(function (t) { return t.x === tx && t.y === ty; })[0];
    if (!here) { townLock = null; return; }
    if (townLock === here.id) return;
    townLock = here.id;
    openTown(here);
  }

  /* ==========================================================
     雑魚戦：ワンボタンのオート戦闘
     ========================================================== */
  var mobIdx = -1;

  function startMob(i) {
    mobIdx = i;
    scene = 'mob';
    var e = D.enemies[mobs[i].lv];
    Battle.open('mob', { lv: mobs[i].lv });
    SFX.bgmMood('mob');
    document.getElementById('mob-title').textContent = e.name + 'と遭遇';
    document.getElementById('mob-log').innerHTML = '<p>' + e.name + 'が向かってくる。</p>';
    document.getElementById('mob-fight').hidden = false;
    document.getElementById('mob-run').hidden = false;
    document.getElementById('mob-close').hidden = true;
    panel('mob', true);
  }

  function resolveMob() {
    var m = mobs[mobIdx], e = D.enemies[m.lv];
    var ehp = e.hp, log = [], shots = [], guard = 0;

    while (ehp > 0 && S.hp > 0 && guard++ < 40) {
      var d1 = Math.max(1, cannon().atk - e.def + Math.floor(Math.random() * 7) - 3);
      ehp -= d1;
      log.push('<p>主砲命中。<span class="hit">' + d1 + '</span> のダメージ。</p>');
      shots.push({ who: 'main', d: d1 });
      if (ehp > 0 && subgun().atk > 0) {
        var ds = Math.max(1, subgun().atk - e.def + Math.floor(Math.random() * 5) - 2);
        ehp -= ds;
        log.push('<p>副砲が続けて撃つ。<span class="hit">' + ds + '</span> のダメージ。</p>');
        shots.push({ who: 'sub', d: ds });
      }
      if (ehp <= 0) break;
      var d2 = Math.max(1, e.atk - armor().def + Math.floor(Math.random() * 5) - 2);
      S.hp -= d2;
      log.push('<p>' + e.name + 'の反撃。<span class="dmg">' + d2 + '</span> を受けた。</p>');
      shots.push({ who: 'enemy', d: d2 });
    }

    // オート戦闘なので、撃ち合いを早回しで見せる
    playVolley(shots, S.hp > 0);

    if (S.hp > 0) {
      S.gold += e.gold;
      log.push('<p class="good">' + e.name + 'を撃破。' + e.gold + ' G を獲得した。</p>');
      relocate(m);                      // 倒した敵は別の場所に湧き直す
    } else {
      S.hp = Math.max(1, Math.floor(maxHp() * 0.2));
      S.gold = Math.floor(S.gold * 0.7);
      log.push('<p class="dmg">大破。牽引されて基地へ戻された。修理費として所持金の一部を失った。</p>');
      warpHome();
    }

    document.getElementById('mob-log').innerHTML = log.reverse().join('');
    document.getElementById('mob-fight').hidden = true;
    document.getElementById('mob-run').hidden = true;
    document.getElementById('mob-close').hidden = false;
    hud(); save();
  }

  /* 雑魚戦の撃ち合いを順に再生する。長引くと待たせるので上限を切る */
  function playVolley(shots, won) {
    if (!Battle.isOpen()) return;
    var step = 150, shown = shots.slice(0, 10), t = 0;
    shown.forEach(function (sh) {
      setTimeout(function () {
        if (!Battle.isOpen()) return;
        if (sh.who === 'enemy') Battle.enemyFire(sh.d);
        else Battle.playerFire(sh.who === 'sub', sh.d, null);
      }, t);
      t += step;
    });
    setTimeout(function () {
      if (!Battle.isOpen()) return;
      if (won) Battle.win(); else Battle.lose();
    }, t + 120);
  }

  function relocate(m) {
    for (var i = 0; i < 400; i++) {
      var x = Math.floor(Math.random() * MAPW), y = Math.floor(Math.random() * MAPH);
      if (map[y][x] === ROCK || map[y][x] === TOWN || nearTown(x, y, 3)) continue;
      if (Math.hypot(x * TILE - S.x, y * TILE - S.y) < 130) continue;
      m.x = x * TILE + TILE / 2; m.y = y * TILE + TILE / 2;
      return;
    }
  }

  function warpHome() {
    var h = D.towns[0];
    S.x = h.x * TILE + TILE / 2;
    S.y = (h.y + 2) * TILE + TILE / 2;
    townLock = h.id;
    if (G) G.tank.setPosition(S.x, S.y);
  }

  document.getElementById('mob-fight').addEventListener('click', resolveMob);
  document.getElementById('mob-run').addEventListener('click', function () {
    closeMob('離脱した。');
  });
  document.getElementById('mob-close').addEventListener('click', function () { closeMob(''); });

  function closeMob(msg) {
    Battle.close();
    panel('mob', false);
    scene = 'field';
    cool = 60;
    SFX.bgmMood('field');
    if (msg) { SFX.escape(); toast(msg); }
  }

  /* ==========================================================
     賞金首戦：ターン制。部位を狙う
     ========================================================== */
  var B = null;

  function startBoss(i) {
    var def = bosses[i].def;
    B = {
      i: i, def: def,
      parts: def.parts.map(function (p) { return { def: p, hp: p.hp }; }),
      repairs: 2, over: false
    };
    scene = 'boss';
    Battle.open('boss', def);
    SFX.bgmMood(def.tier === 'final' ? 'finalboss' : 'midboss');
    document.getElementById('boss-title').textContent = def.name;
    document.getElementById('boss-log').innerHTML = '<p>' + def.desc + '</p>';
    document.getElementById('boss-actions').hidden = false;
    document.getElementById('boss-end').hidden = true;
    renderBoss();
    panel('boss', true);
  }

  function renderBoss() {
    var host = document.getElementById('boss-parts');
    host.innerHTML = '';
    B.parts.forEach(function (p, idx) {
      var broken = p.hp <= 0;
      var row = document.createElement('div');
      row.className = 'tk-part' + (broken ? ' is-broken' : '');
      row.innerHTML =
        '<span class="tk-part-name">' + p.def.name + '</span>' +
        '<span class="tk-bar"><i style="width:' + Math.max(0, p.hp / p.def.hp * 100) + '%"></i></span>' +
        '<span class="tk-part-num">' + Math.max(0, p.hp) + ' / ' + p.def.hp + '</span>';
      var btn = document.createElement('button');
      btn.className = 'tk-btn';
      btn.textContent = broken ? '破壊' : '狙う';
      btn.disabled = broken || B.over;
      btn.addEventListener('click', function () { fire(idx); });
      row.appendChild(btn);
      host.appendChild(row);
    });
    document.getElementById('boss-selfhp').style.width = Math.max(0, S.hp / maxHp() * 100) + '%';
    document.getElementById('boss-selfnum').textContent = Math.max(0, Math.round(S.hp)) + ' / ' + maxHp();
    document.getElementById('boss-repair').disabled = B.repairs <= 0 || B.over;
  }

  /* 新しい行を上に積む。長い戦闘でも、直前に何が起きたかを見に行かなくて済む */
  function bossLog(html) {
    var el = document.getElementById('boss-log');
    el.insertAdjacentHTML('afterbegin', html);
    el.scrollTop = 0;
  }

  function fire(idx) {
    if (B.over) return;
    var p = B.parts[idx];
    var d = Math.max(1, cannon().atk - p.def.def + Math.floor(Math.random() * 9) - 4);
    p.hp -= d;
    bossLog('<p>' + p.def.name + 'に命中。<span class="hit">' + d + '</span> のダメージ。</p>');
    Battle.playerFire(false, d, p.def.key);
    if (p.hp > 0 && subgun().atk > 0) {
      var ds = Math.max(1, subgun().atk - p.def.def + Math.floor(Math.random() * 5) - 2);
      p.hp -= ds;
      bossLog('<p>副砲が続けて撃つ。<span class="hit">' + ds + '</span> のダメージ。</p>');
      setTimeout(function () { Battle.playerFire(true, ds, p.def.key); }, 260);
    }
    if (p.hp <= 0) {
      p.hp = 0;
      bossLog('<p class="good">' + p.def.name + 'を破壊した。</p>');
      breakPart(B.def.id, p.def.key);
      setTimeout(function () { Battle.breakPart(p.def.key); }, 480);
      if (p.def.key === 'body') return winBoss();
    }
    enemyTurn();
  }

  /* 壊れた部位を地図の上からも消す */
  function breakPart(bossId, key) {
    if (!G || !G.bossViews) return;
    var v = G.bossViews.filter(function (x) { return x.def.id === bossId; })[0];
    if (v && v.byKey[key]) v.byKey[key].setVisible(false);
  }

  document.getElementById('boss-repair').addEventListener('click', function () {
    if (B.over || B.repairs <= 0) return;
    B.repairs--;
    var heal = Math.floor(maxHp() * 0.28);
    S.hp = Math.min(maxHp(), S.hp + heal);
    bossLog('<p class="good">応急修理。' + heal + ' 回復した。（残り ' + B.repairs + ' 回）</p>');
    Battle.repair(heal);
    enemyTurn();
  });

  document.getElementById('boss-run').addEventListener('click', function () {
    Battle.close();
    panel('boss', false); scene = 'field'; cool = 90; B = null;
    SFX.bgmMood('field');
    SFX.escape();
    toast('撤退した。');
  });

  document.getElementById('boss-close').addEventListener('click', function () {
    Battle.close();
    panel('boss', false); scene = 'field'; cool = 90; B = null;
    SFX.bgmMood('field');
    if (bossesLeft() === 0 && !S.cleared) {
      S.cleared = true;
      save();
      openClear();
    }
  });

  function enemyTurn() {
    var turn = 0;
    var trackBroken = B.parts.some(function (p) { return p.def.key === 'track' && p.hp <= 0; });
    B.parts.forEach(function (p) {
      if (p.hp <= 0 || !p.def.atk) return;
      if (trackBroken && Math.random() < 0.4) {
        bossLog('<p>' + p.def.name + 'の攻撃。足を潰されて狙いが逸れた。</p>');
        return;
      }
      var d = Math.max(1, p.def.atk - armor().def + Math.floor(Math.random() * 7) - 3);
      S.hp -= d;
      bossLog('<p>' + p.def.name + 'の攻撃。<span class="dmg">' + d + '</span> を受けた。</p>');
      setTimeout(function () { Battle.enemyFire(d); }, 620 + turn * 200);
      turn++;
    });

    if (S.hp <= 0) return loseBoss();
    renderBoss(); hud(); save();
  }

  function winBoss() {
    B.over = true;
    S.defeated[B.def.id] = true;
    S.gold += B.def.gold;
    bossLog('<p class="good">' + B.def.name + 'を撃破した。賞金 ' + B.def.gold + ' G。</p>');
    setTimeout(function () { Battle.win(); }, 200);
    refreshBossViews();
    endBoss();
  }

  function loseBoss() {
    B.over = true;
    S.hp = Math.max(1, Math.floor(maxHp() * 0.2));
    S.gold = Math.floor(S.gold * 0.7);
    bossLog('<p class="dmg">大破。牽引されて基地へ戻された。</p>');
    setTimeout(function () { Battle.lose(); }, 200);
    warpHome();
    endBoss();
  }

  function endBoss() {
    renderBoss();
    document.getElementById('boss-actions').hidden = true;
    document.getElementById('boss-end').hidden = false;
    hud(); save();
  }

  /* ==========================================================
     クリア
     ========================================================== */
  function openClear() {
    scene = 'clear';
    SFX.clear();
    var host = document.getElementById('clear-result');
    host.innerHTML = '';
    var all = bossDefs().length;
    [['討伐した賞金首', all + ' / ' + all],
     ['所持金',        S.gold.toLocaleString() + ' G'],
     ['主砲',          cannon().name],
     ['副砲',          subgun().name],
     ['装甲',          armor().name],
     ['エンジン',      engine().name]
    ].forEach(function (row) {
      var el = document.createElement('div');
      el.innerHTML = '<span>' + row[0] + '</span><b>' + row[1] + '</b>';
      host.appendChild(el);
    });
    panel('clear', true);
  }

  document.getElementById('clear-close').addEventListener('click', function () {
    panel('clear', false);
    scene = 'field';
    cool = 90;
    toast('荒野はまだ続く。');
  });

  /* ==========================================================
     街
     ========================================================== */
  var curTown = null;

  function openTown(t) {
    curTown = t;
    scene = 'town';
    document.getElementById('town-name').textContent = t.name;
    document.getElementById('town-intro').textContent = t.intro;
    showTab('talk');
    panel('town', true);
    SFX.bgmMood('town');
  }

  Array.prototype.forEach.call(document.querySelectorAll('.tk-tab'), function (b) {
    b.addEventListener('click', function () { showTab(b.dataset.tab); });
  });

  function showTab(name) {
    Array.prototype.forEach.call(document.querySelectorAll('.tk-tab'), function (b) {
      b.classList.toggle('is-on', b.dataset.tab === name);
    });
    ['talk', 'shop', 'bounty'].forEach(function (k) {
      document.getElementById('tab-' + k).hidden = k !== name;
    });
    if (name === 'talk') renderTalk();
    if (name === 'shop') renderShop();
    if (name === 'bounty') renderBounty();
  }

  function renderTalk() {
    var host = document.getElementById('tab-talk');
    host.innerHTML = '';
    // events は後から足す枠。npcs と同じ形で並べる
    curTown.npcs.concat(curTown.events || []).forEach(function (n) {
      var line = n.lines[Math.floor(Math.random() * n.lines.length)];
      var el = document.createElement('div');
      el.className = 'tk-npc';
      el.innerHTML = '<div class="tk-npc-who">' + n.who + '</div><p>' + line + '</p>';
      host.appendChild(el);
    });
  }

  function renderShop() {
    var host = document.getElementById('tab-shop');
    host.innerHTML = '';

    // 修理
    var need = maxHp() - S.hp;
    var cost = Math.ceil(need * 1.4);
    addItem(host, '車体の修理', need > 0 ? ('HP を ' + Math.round(need) + ' 回復') : '損傷なし',
      need > 0 ? cost + ' G' : '—', need > 0 && S.gold >= cost, function () {
        S.gold -= cost; S.hp = maxHp(); SFX.coin(); hud(); save(); renderShop();
      });

    // パーツ強化
    ['cannon', 'subgun', 'armor', 'engine'].forEach(function (key) {
      var info = PART_INFO[key], label = info.label;
      var list = D.parts[key], cur = S.parts[key], next = list[cur + 1];
      if (!next) {
        addItem(host, label + '：' + list[cur].name,
          statLine(info, list[cur], null) + about(info), '最大', false, null);
        return;
      }
      var desc = list[cur].name + ' → ' + next.name
               + statLine(info, list[cur], next) + about(info);
      addItem(host, label + 'の強化', desc, next.price + ' G', S.gold >= next.price, function () {
        S.gold -= next.price;
        S.parts[key] = cur + 1;
        if (key === 'armor') S.hp = maxHp();
        SFX.coin();
        refreshTank();
        hud(); save(); renderShop();
      });
    });
  }

  /* 「攻撃力 14 → 34」の行。next が無いときは今の値だけ並べる */
  function statLine(info, cur, next) {
    return '<span class="tk-stat-row">' + info.stats.map(function (st) {
      return '<span class="tk-stat-up">' + st.name + ' ' + num(cur[st.key], st.fix)
           + (next ? ' <b>→ ' + num(next[st.key], st.fix) + '</b>' : '') + '</span>';
    }).join('') + '</span>';
  }
  function about(info) { return '<span class="tk-about">' + info.about + '</span>'; }

  function addItem(host, name, desc, price, can, onBuy) {
    var el = document.createElement('div');
    el.className = 'tk-item';
    el.innerHTML = '<span><span class="tk-item-name">' + name + '</span>'
                 + '<span class="tk-item-desc"><br>' + desc + '</span></span>'
                 + '<span class="tk-item-price">' + price + '</span>';
    var b = document.createElement('button');
    b.className = 'tk-btn';
    b.textContent = onBuy ? '実行' : '—';
    b.disabled = !can;
    if (onBuy) b.addEventListener('click', onBuy);
    el.appendChild(b);
    host.appendChild(el);
  }

  function renderBounty() {
    var host = document.getElementById('tab-bounty');
    host.innerHTML = '';
    var list = bossDefs().filter(function (e) { return e.town === curTown.id; });
    if (!list.length) { host.innerHTML = '<p class="tk-item-desc">この街に依頼は出ていない。</p>'; return; }
    list.forEach(function (e) {
      var done = !!S.defeated[e.id];
      addItem(host, e.name + (done ? '（討伐済み）' : ''),
        e.desc + '　地図の赤い点が居場所。', e.gold + ' G', false, null);
    });
  }

  document.getElementById('town-close').addEventListener('click', function () {
    panel('town', false);
    scene = 'field';
    SFX.bgmMood('field');
    // 押し出しはしない。街の上に立っている間は townLock が効いているので開き直さない
    save();
  });

  /* ==========================================================
     やり直し
     ========================================================== */
  /* 確認はページの中で聞く。
     ブラウザの confirm は「このページに追加のダイアログを表示しない」を
     一度でも選ばれると、何も出さずに false を返して黙って失敗する。 */
  var resetBtn = document.getElementById('reset');
  var resetAsk = document.getElementById('reset-ask');
  var askTimer = null;

  resetBtn.addEventListener('click', function () {
    resetBtn.hidden = true;
    resetAsk.hidden = false;
    clearTimeout(askTimer);
    askTimer = setTimeout(closeAsk, 10000);   // 放っておいたら引っ込む
  });
  document.getElementById('reset-no').addEventListener('click', closeAsk);
  document.getElementById('reset-yes').addEventListener('click', function () {
    closeAsk();
    doReset();
  });

  function closeAsk() {
    clearTimeout(askTimer);
    resetAsk.hidden = true;
    resetBtn.hidden = false;
  }

  function doReset() {
    Battle.close();
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    S = fresh(); S.hp = maxHp();
    spawnMobs();
    if (G) {
      G.mobViews.forEach(function (v, i) {
        v.setTexture('mob-' + mobs[i].lv).setPosition(mobs[i].x, mobs[i].y);
      });
      G.tank.setPosition(S.x, S.y);
      refreshTank();
      refreshBossViews();
      G.bossViews.forEach(function (v) {
        v.sprites.forEach(function (sp) { sp.setVisible(true); });
      });
    }
    panel('town', false); panel('mob', false); panel('boss', false); panel('clear', false);
    scene = 'field'; townLock = null;
    SFX.bgmMood('field');
    hud(); save();
    toast('最初から始めます。');
  }

  /* ==========================================================
     音
     効果音・BGMそれぞれの音量を 0〜100 で持つ。消音は「両方 0」で表す
     （専用のON/OFFは持たない。ここは sfx.js の実装と対にしてある）
     ========================================================== */
  var OPT_KEY = 'tank-opt-v1';
  function loadOpt() {
    var o = { sfx: 70, bgm: 30 };
    try {
      var raw = localStorage.getItem(OPT_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          if (typeof saved.sfx === 'number') o.sfx = saved.sfx;
          if (typeof saved.bgm === 'number') o.bgm = saved.bgm;
        }
      }
    } catch (e) { /* 保存できない環境でも遊べるようにする */ }
    return o;
  }
  var OPT = loadOpt();
  function saveOpt() { try { localStorage.setItem(OPT_KEY, JSON.stringify(OPT)); } catch (e) {} }
  function applyVolume() {
    SFX.setVolume('sfx', OPT.sfx / 100);
    SFX.setVolume('bgm', OPT.bgm / 100);
  }
  applyVolume();

  /* ブラウザは操作より前に音を鳴らさせないので、最初の操作で解錠する */
  ['pointerdown', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function once() {
      SFX.unlock();
      window.removeEventListener(ev, once);
    });
  });

  /* 音量パネル。ヘッダのボタンで開閉する小さなポップオーバー */
  var volBtn = document.getElementById('volbtn');
  var volPanel = document.getElementById('vol-panel');
  if (volBtn && volPanel) {
    var sfxSlider = document.getElementById('opt-sfx'), sfxVal = document.getElementById('opt-sfx-v');
    var bgmSlider = document.getElementById('opt-bgm'), bgmVal = document.getElementById('opt-bgm-v');
    var audioNote = document.getElementById('opt-audio-note');

    function syncVolUI() {
      sfxSlider.value = OPT.sfx; sfxVal.textContent = OPT.sfx;
      bgmSlider.value = OPT.bgm; bgmVal.textContent = OPT.bgm;
      audioNote.hidden = SFX.isUsable();
    }

    function openVol(show) {
      volPanel.hidden = !show;
      volBtn.setAttribute('aria-expanded', show ? 'true' : 'false');
      if (show) syncVolUI();
    }
    volBtn.addEventListener('click', function () { openVol(volPanel.hidden); });
    // 外側を触ったら閉じる
    document.addEventListener('pointerdown', function (e) {
      if (!volPanel.hidden && e.target !== volBtn && !volPanel.contains(e.target)) openVol(false);
    });

    sfxSlider.addEventListener('input', function () {
      OPT.sfx = Number(this.value); sfxVal.textContent = OPT.sfx;
      applyVolume(); saveOpt();
    });
    sfxSlider.addEventListener('change', function () { SFX.coin(); });   // 動かした手応え
    bgmSlider.addEventListener('input', function () {
      OPT.bgm = Number(this.value); bgmVal.textContent = OPT.bgm;
      applyVolume(); saveOpt();
    });
  }

  /* ==========================================================
     起動
     ========================================================== */
  buildMap();
  load();
  spawnMobs();
  setupBosses();
  SFX.bgmMood('field');   // unlock() されるまでは記憶されるだけで鳴らない

  var game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'stage',
    width: VIEW_W, height: VIEW_H,
    pixelArt: true,
    backgroundColor: '#14181c',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    scene: [Field, BattleScene]
  });

  /* URL に ?debug=1 が付いているときだけ、動作確認用の入口を開ける。
     通常の閲覧では何も生えない。 */
  if (/[?&]debug=1/.test(location.search)) {
    window.__tank = {
      state: function () { return S; },
      info: function () { return { scene: scene, cool: cool, townLock: townLock, mobs: mobs.length, facing: facing }; },
      mobAt: function (i) { return mobs[i]; },
      towns: function () { return D.towns; },
      openTown: openTown,
      startBoss: startBoss,
      warp: function (tx, ty) {
        S.x = tx * TILE + TILE / 2; S.y = ty * TILE + TILE / 2;
        if (G) G.tank.setPosition(S.x, S.y);
      },
      scene: function () { return G; },
      battle: function () { return BG; },
      battleApi: Battle,
      sfx: function () { return window.SFX; },
      game: function () { return game; }
    };
  }
})();
