/* ==========================================================
   荒野の車載工房（ベータ 0.1）

   企画書の方針
   - Slay the Spire のフロー（マップでノードを選んで登る）
   - backpack battles の配置（車体グリッドに部品を敷き詰める）
   - 戦闘はオート。プレイヤーは戦闘中に何もしない
   - 車体＝キャラ。重量制限が装備選択の制約になる

   外部ライブラリなし・ビルドなし。file:// でもそのまま動く。
   絵は art.js、音は sfx.js が実行時に作る。画像・音声ファイルは持たない。
   ========================================================== */
(function () {
  'use strict';

  var D = window.GAME_DATA;
  var SAVE_KEY = 'garage-run-v1';

  var PART_BY_ID = {};
  D.parts.forEach(function (p) { PART_BY_ID[p.id] = p; });
  var CHASSIS_BY_ID = {};
  D.chassis.forEach(function (c) { CHASSIS_BY_ID[c.id] = c; });
  var ITEM_BY_ID = {};
  (D.items || []).forEach(function (i) { ITEM_BY_ID[i.id] = i; });
  var ITEM_CAP = 5;                 // 持ち物の上限

  var KIND_LABEL = {
    engine: 'エンジン', cunit: 'Cユニット', main: '主砲',
    sub: '副砲', special: 'スペシャル', support: '補助'
  };
  var NODE_LABEL = {
    battle: '戦闘', elite: '賞金首', boss: 'ボス', rest: '焚き火', shop: '行商', event: '？'
  };
  var NODE_DESC = {
    battle: '雑魚と自動で戦う', elite: '手強い中ボス。戦利品が良い',
    boss: '最上階。倒せばクリア', rest: '装甲を回復か、部品を強化',
    shop: '部品の購入・強化・修理', event: '何が起きるかは入るまで分からない'
  };

  /* ==========================================================
     永続データ（図鑑・実績）
     ラン単体のセーブ（SAVE_KEY）とは別に持つ。リセットしても消えない。
     ========================================================== */
  var META_KEY = 'garage-meta-v1';

  function loadMeta() {
    try {
      var raw = localStorage.getItem(META_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 保存できない設定でも遊べるようにする */ }
    return {
      seenParts: {}, seenEnemies: {}, unlocked: {}, tut: {},
      stats: { battlesWon: 0, clears: 0, bestFloor: 0, maxGold: 0, shoplessClears: 0, clearedChassis: {} }
    };
  }
  var META = loadMeta();
  if (!META.tut) META.tut = {};   // 古いセーブ（tut を持たない）を引き継いだとき用
  if (META.stats.runs == null) META.stats.runs = 0;

  /* ==========================================================
     設定
     音量・戦闘速度の初期値・演出の量。走行とは無関係なので別に持つ
     ========================================================== */
  var OPT_KEY = 'garage-opt-v1';

  function loadOpt() {
    var o = { sfx: 70, speed: 1, motion: true };
    try {
      var raw = localStorage.getItem(OPT_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          if (typeof saved.sfx === 'number') o.sfx = saved.sfx;
          if (saved.speed === 1 || saved.speed === 2 || saved.speed === 4) o.speed = saved.speed;
          if (typeof saved.motion === 'boolean') o.motion = saved.motion;
        }
      }
    } catch (e) { /* 保存できない設定でも遊べるようにする */ }
    return o;
  }
  var OPT = loadOpt();

  /* 動作確認中に音が鳴り続けると邪魔なので、?debug=1 のあいだは黙らせる。
     設定値そのものは触らない（保存も表示もいつもどおり）。出力だけ 0 にする */
  var DEBUG = /[?&]debug=1/.test(location.search);
  var MUTED = DEBUG;

  function saveOpt() {
    try { localStorage.setItem(OPT_KEY, JSON.stringify(OPT)); } catch (e) { }
  }
  /* 音量の反映はここ一箇所に通す。消音中でも設定値は保ったままにする */
  function applyVolume() {
    window.SFX.setVolume('sfx', MUTED ? 0 : OPT.sfx / 100);
  }
  function applyOpt() {
    applyVolume();
    document.documentElement.classList.toggle('no-motion', !OPT.motion);
  }
  function saveMeta() {
    try { localStorage.setItem(META_KEY, JSON.stringify(META)); } catch (e) { }
  }

  var ACHIEVEMENTS = [
    { id: 'first_win', name: '初仕事', desc: '戦闘に一度勝利する',
      cond: function (m) { return m.stats.battlesWon >= 1; } },
    { id: 'first_clear', name: '荒野の踏破者', desc: 'ボスを倒してクリアする',
      cond: function (m) { return m.stats.clears >= 1; } },
    { id: 'clear_jeep', name: '俊足の賞金稼ぎ', desc: 'ジープでクリアする',
      cond: function (m) { return !!m.stats.clearedChassis.ch_jeep; } },
    { id: 'clear_apc', name: '鉄壁の相棒', desc: '装甲車でクリアする',
      cond: function (m) { return !!m.stats.clearedChassis.ch_apc; } },
    { id: 'clear_ogre', name: '重戦車の王', desc: '重戦車でクリアする',
      cond: function (m) { return !!m.stats.clearedChassis.ch_ogre; } },
    { id: 'rich', name: '荒稼ぎ', desc: '所持金を500G以上貯める',
      cond: function (m) { return m.stats.maxGold >= 500; } },
    { id: 'floor8', name: '北の岩場まで', desc: '8階まで到達する',
      cond: function (m) { return m.stats.bestFloor >= 8; } },
    { id: 'no_shop', name: '一匹狼', desc: '行商に一度も寄らずにクリアする',
      cond: function (m) { return m.stats.shoplessClears >= 1; } },
    { id: 'all_parts', name: '整備士全書修了', desc: '全部品を一度は手に入れる',
      cond: function (m) { return Object.keys(m.seenParts).length >= D.parts.length; } },
    { id: 'all_enemies', name: '賞金稼業一人前', desc: '全種の敵と遭遇する',
      cond: function (m) { return Object.keys(m.seenEnemies).length >= D.enemies.length; } }
  ];

  function checkAchievements() {
    var newly = [];
    ACHIEVEMENTS.forEach(function (a) {
      if (!META.unlocked[a.id] && a.cond(META)) { META.unlocked[a.id] = true; newly.push(a); }
    });
    if (newly.length) {
      saveMeta();
      newly.forEach(function (a) { toast('実績解除：' + a.name); });
    }
  }

  function markPartSeen(pid) {
    if (META.seenParts[pid]) return;
    META.seenParts[pid] = true;
    saveMeta(); checkAchievements();
  }
  function markEnemySeen(id) {
    if (META.seenEnemies[id]) return;
    META.seenEnemies[id] = true;
    saveMeta(); checkAchievements();
  }

  /* 一度だけ出す案内を見たかどうか。実績とは違い達成度ではないので checkAchievements は呼ばない */
  function tutSeen(key) { return !!META.tut[key]; }
  function markTutSeen(key) {
    if (META.tut[key]) return;
    META.tut[key] = true;
    saveMeta();
  }

  /* ==========================================================
     小物
     ========================================================== */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function rint(n) { return Math.floor(Math.random() * n); }
  function pick(arr) { return arr[rint(arr.length)]; }
  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = rint(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function r1(n) { return Math.round(n * 10) / 10; }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1900);
  }

  function cellPx() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--cell');
    return parseInt(v, 10) || 40;
  }
  var STASH_CELL = 32;

  /* ==========================================================
     形（マスの並び）と回転
     ========================================================== */
  function shapeMask(part) { return window.ART.maskOf(part.shape); }

  function rotateMask(m, rot) {
    var r = ((rot % 4) + 4) % 4;
    var out = m;
    for (var k = 0; k < r; k++) {
      var rows = out.length, cols = out[0].length;
      var next = [];
      for (var y = 0; y < cols; y++) {
        var row = [];
        for (var x = 0; x < rows; x++) row.push(out[rows - 1 - x][y]);
        next.push(row);
      }
      out = next;
    }
    return out;
  }

  function instMask(inst) { return rotateMask(shapeMask(PART_BY_ID[inst.pid]), inst.rot); }
  function instSize(inst) {
    var m = instMask(inst);
    return { cols: m[0].length, rows: m.length };
  }
  function instCells(inst) {
    var m = instMask(inst), out = [];
    for (var y = 0; y < m.length; y++) {
      for (var x = 0; x < m[y].length; x++) if (m[y][x]) out.push([x, y]);
    }
    return out;
  }

  /* ==========================================================
     部品の実効性能
     強化1段ごとに 威力/装甲/積載 +22%、弾+1、リロード-6%、速度+0.03
     ========================================================== */
  function eff(inst) {
    var p = PART_BY_ID[inst.pid];
    var k = (inst.lvl || 1) - 1;
    var mul = 1 + 0.22 * k;
    var s = p.stats || {};
    var out = {
      part: p, name: p.name, kind: p.kind, lvl: inst.lvl || 1,
      weight: Math.max(1, p.weight - (inst.wcut || 0)),
      cap: s.cap ? Math.round(s.cap * mul) : 0,
      hp: s.hp ? Math.round(s.hp * mul) : 0,
      spd: (s.spd || 0) + (s.spd ? 0.03 * k : 0),
      dmg: s.dmg ? Math.round(s.dmg * mul) : 0,
      ammo: s.ammo == null ? null : s.ammo + k,
      reload: s.reload ? s.reload * Math.pow(0.94, k) : 0,
      pierce: s.pierce || 0,
      aura: null
    };
    if (p.aura) {
      out.aura = {
        /* 威力は率で乗せる。固定値だと弾数無限の速射武器だけ突出してしまう */
        dmgPct: (p.aura.dmgPct || 0) + (p.aura.dmgPct ? 0.05 * k : 0),
        ammo: (p.aura.ammo || 0) + (p.aura.ammo ? 1 * k : 0),
        reload: (p.aura.reload || 0) - (p.aura.reload ? 0.03 * k : 0)
      };
    }
    return out;
  }

  function isWeapon(kind) { return kind === 'main' || kind === 'sub' || kind === 'special'; }

  /* ==========================================================
     状態
     ========================================================== */
  var S = null;
  var uidSeq = 1;

  function newInst(pid) {
    markPartSeen(pid);
    return { uid: uidSeq++, pid: pid, lvl: 1, wcut: 0, rot: 0, x: null, y: null };
  }

  function chassis() { return CHASSIS_BY_ID[S.chassis]; }
  function placed() { return S.parts.filter(function (i) { return i.x != null; }); }
  /* つかんでいる部品は x が null になるが、倉庫には出さない（手の中にあるため） */
  function stashed() {
    return S.parts.filter(function (i) { return i.x == null && (!held || i.uid !== held.uid); });
  }
  function instById(uid) {
    for (var i = 0; i < S.parts.length; i++) if (S.parts[i].uid === uid) return S.parts[i];
    return null;
  }

  /* ==========================================================
     グリッド
     ========================================================== */
  function occupancy(exceptUid) {
    var map = {};
    placed().forEach(function (i) {
      if (i.uid === exceptUid) return;
      instCells(i).forEach(function (c) { map[(i.x + c[0]) + ',' + (i.y + c[1])] = i; });
    });
    return map;
  }

  /* 塞がったマスかどうか。開けたぶんは使える */
  function isBlocked(x, y) {
    var ch = chassis();
    var key = x + ',' + y;
    if (!ch.blocked || ch.blocked.indexOf(key) < 0) return false;
    return !(S.opened && S.opened[key]);
  }
  /* まだ開いていないマスの一覧 */
  function blockedCells() {
    var ch = chassis(), out = [];
    (ch.blocked || []).forEach(function (key) {
      var p = key.split(',');
      if (isBlocked(Number(p[0]), Number(p[1]))) out.push(key);
    });
    return out;
  }
  function usableCells() {
    var ch = chassis();
    return ch.cols * ch.rows - blockedCells().length;
  }

  function canPlace(inst, gx, gy, occ) {
    var ch = chassis();
    var cells = instCells(inst);
    for (var i = 0; i < cells.length; i++) {
      var x = gx + cells[i][0], y = gy + cells[i][1];
      if (x < 0 || y < 0 || x >= ch.cols || y >= ch.rows) return false;
      if (occ[x + ',' + y]) return false;
      if (isBlocked(x, y)) return false;
    }
    return true;
  }

  function autoPlace(inst) {
    var ch = chassis(), occ = occupancy(inst.uid);
    for (var rot = 0; rot < 4; rot++) {
      var save = inst.rot;
      inst.rot = rot;
      for (var y = 0; y < ch.rows; y++) {
        for (var x = 0; x < ch.cols; x++) {
          if (canPlace(inst, x, y, occ)) { inst.x = x; inst.y = y; return true; }
        }
      }
      inst.rot = save;
    }
    inst.x = null; inst.y = null;
    return false;
  }

  /* ==========================================================
     隣接ボーナス
     補助部品は、辺で接している武器だけを強化する
     ========================================================== */
  function auraFor(weaponInst) {
    var cellOwner = {};
    placed().forEach(function (i) {
      instCells(i).forEach(function (c) { cellOwner[(i.x + c[0]) + ',' + (i.y + c[1])] = i; });
    });
    var found = {}, sum = { dmgPct: 0, ammo: 0, reload: 0, list: [] };
    instCells(weaponInst).forEach(function (c) {
      var x = weaponInst.x + c[0], y = weaponInst.y + c[1];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var o = cellOwner[(x + d[0]) + ',' + (y + d[1])];
        if (!o || o.uid === weaponInst.uid || found[o.uid]) return;
        var e = eff(o);
        if (!e.aura) return;
        found[o.uid] = true;
        sum.dmgPct += e.aura.dmgPct;
        sum.ammo += e.aura.ammo;
        sum.reload += e.aura.reload;
        sum.list.push(e.name);
      });
    });
    return sum;
  }

  /* 補助部品が今いくつの武器に効いているか（UIの表示用） */
  function auraTargets(supportInst) {
    var n = 0;
    placed().forEach(function (i) {
      if (!isWeapon(PART_BY_ID[i.pid].kind)) return;
      if (auraFor(i).list.length && touching(i, supportInst)) n++;
    });
    return n;
  }
  function touching(a, b) {
    var bc = {};
    instCells(b).forEach(function (c) { bc[(b.x + c[0]) + ',' + (b.y + c[1])] = true; });
    var hit = false;
    instCells(a).forEach(function (c) {
      var x = a.x + c[0], y = a.y + c[1];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        if (bc[(x + d[0]) + ',' + (y + d[1])]) hit = true;
      });
    });
    return hit;
  }

  /* ==========================================================
     組み上がった車の性能
     ========================================================== */
  function build() {
    var ch = chassis();
    var b = {
      maxHp: ch.hp, cap: ch.cap, weight: 0, spd: 1 + ch.spd,
      def: ch.def, weapons: [], over: 0
    };
    placed().forEach(function (i) {
      var e = eff(i);
      b.weight += e.weight;
      b.maxHp += e.hp;
      b.cap += e.cap;
      b.spd += e.spd;
    });
    b.over = Math.max(0, b.weight - b.cap);
    /* 過積載は速度で払う。1超過につき5%、下限は25% */
    b.spd = Math.max(0.25, b.spd - b.over * 0.05);

    placed().forEach(function (i) {
      var e = eff(i);
      if (!isWeapon(e.kind)) return;
      var a = auraFor(i);
      b.weapons.push({
        uid: i.uid, name: e.name, kind: e.kind,
        dmg: Math.round(e.dmg * (1 + a.dmgPct)),
        ammo: e.ammo == null ? null : e.ammo + a.ammo,
        reload: Math.max(0.15, e.reload * (1 + a.reload) / b.spd),
        pierce: e.pierce,
        aura: a
      });
    });
    /* リロードの速い順に並べると、ログの流れが読みやすい */
    b.weapons.sort(function (p, q) { return p.reload - q.reload; });
    return b;
  }

  function syncHp() {
    var b = build();
    if (S.maxHp == null) { S.maxHp = b.maxHp; S.hp = b.maxHp; return b; }
    if (b.maxHp > S.maxHp) S.hp += (b.maxHp - S.maxHp);
    S.maxHp = b.maxHp;
    if (S.hp > S.maxHp) S.hp = S.maxHp;
    if (S.hp < 1) S.hp = 1;
    return b;
  }

  /* ==========================================================
     マップ生成
     ========================================================== */
  function genMap() {
    var N = D.run.floors;
    var floors = [];
    for (var f = 0; f < N; f++) {
      var count = f === N - 1 ? 1 : (f === 0 ? 2 : 2 + rint(2));
      var row = [];
      for (var i = 0; i < count; i++) row.push({ type: 'battle' });
      floors.push(row);
    }

    /* 種類を割り当てる */
    floors[N - 1][0].type = 'boss';
    floors[N - 2].forEach(function (n) { n.type = 'rest'; });   // ボス前は必ず休める

    for (var f2 = 2; f2 < N - 2; f2++) {
      floors[f2].forEach(function (n) {
        var r = Math.random();
        if (r < 0.16) n.type = 'shop';
        else if (r < 0.34) n.type = 'rest';
        else if (r < 0.52) n.type = 'event';
        else n.type = 'battle';
      });
    }
    /* 中ボスを置く階 */
    D.run.eliteFloors.forEach(function (fl) {
      var f3 = Math.min(N - 3, fl - 1);
      if (f3 < 1) return;
      floors[f3][rint(floors[f3].length)].type = 'elite';
    });

    /* 枝。近い位置どうしをつなぐ */
    var edges = [];
    for (var f4 = 0; f4 < N - 1; f4++) {
      var a = floors[f4].length, b = floors[f4 + 1].length;
      var e = [];
      for (var i2 = 0; i2 < a; i2++) {
        var j = a === 1 ? 0 : Math.round(i2 * (b - 1) / (a - 1));
        var set = {};
        set[j] = true;
        if (Math.random() < 0.55 && j + 1 < b) set[j + 1] = true;
        if (Math.random() < 0.55 && j - 1 >= 0) set[j - 1] = true;
        e.push(Object.keys(set).map(Number));
      }
      /* 行き止まりの受け側をなくす */
      for (var j2 = 0; j2 < b; j2++) {
        var has = e.some(function (l) { return l.indexOf(j2) >= 0; });
        if (!has) {
          var near = a === 1 ? 0 : Math.min(a - 1, Math.round(j2 * (a - 1) / Math.max(1, b - 1)));
          e[near].push(j2);
        }
      }
      edges.push(e);
    }
    return { floors: floors, edges: edges, cur: null, floor: 0, cleared: [] };
  }

  function openNodes() {
    var m = S.map;
    if (!m.cur) return m.floors[0].map(function (_, i) { return { f: 0, i: i }; });
    if (m.cur.f >= m.floors.length - 1) return [];
    return (m.edges[m.cur.f][m.cur.i] || []).map(function (i) { return { f: m.cur.f + 1, i: i }; });
  }

  /* ==========================================================
     保存
     ========================================================== */
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ s: S, uid: uidSeq }));
    } catch (e) { /* 保存できない設定でも遊べるようにする */ }
    if (S) {
      var touched = false;
      if (S.gold > META.stats.maxGold) { META.stats.maxGold = S.gold; touched = true; }
      if (S.map && S.map.cur && S.map.cur.f + 1 > META.stats.bestFloor) {
        META.stats.bestFloor = S.map.cur.f + 1; touched = true;
      }
      if (touched) saveMeta();
      checkAchievements();
    }
  }
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.s || !o.s.map) return null;
      uidSeq = o.uid || 1;
      return o.s;
    } catch (e) { return null; }
  }
  function wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { }
  }

  /* ==========================================================
     画面切り替え
     ========================================================== */
  var SCREENS = ['title', 'pick', 'map', 'garage', 'battle', 'reward', 'shop', 'rest', 'event', 'end', 'codex'];
  function show(name) {
    SCREENS.forEach(function (s) { $('sc-' + s).hidden = (s !== name); });
    $('status').hidden = (name === 'title' || name === 'pick' || name === 'codex');
    window.scrollTo(0, 0);
  }
  function currentScreen() {
    for (var i = 0; i < SCREENS.length; i++) {
      if (!$('sc-' + SCREENS[i]).hidden) return SCREENS[i];
    }
    return 'title';
  }

  function refreshStatus() {
    if (!S) return;
    var pct = Math.max(0, Math.min(100, S.hp / S.maxHp * 100));
    var bar = $('st-hpbar');
    bar.style.width = pct + '%';
    bar.classList.toggle('is-low', pct <= 30);
    $('st-hp').textContent = S.hp + ' / ' + S.maxHp;
    $('st-gold').textContent = S.gold + ' G';
    var f = S.map.cur ? S.map.cur.f + 1 : 0;
    $('st-floor').textContent = f + ' / ' + D.run.floors;
  }

  /* ==========================================================
     部品の絵をつくる
     ========================================================== */
  function paintPart(canvas, inst, cell) {
    var part = PART_BY_ID[inst.pid];
    var sz = instSize(inst);
    canvas.width = sz.cols * cell;
    canvas.height = sz.rows * cell;
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
    var g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    var sp = window.ART.part(part);
    var scale = cell / window.ART.CELL;
    g.save();
    g.translate(canvas.width / 2, canvas.height / 2);
    g.rotate((inst.rot || 0) * Math.PI / 2);
    g.drawImage(sp, -sp.width * scale / 2, -sp.height * scale / 2, sp.width * scale, sp.height * scale);
    g.restore();
  }

  function partThumb(pid, cell) {
    var c = document.createElement('canvas');
    paintPart(c, { pid: pid, rot: 0 }, cell || 20);
    return c;
  }

  /* 図鑑でまだ出会っていない部品・敵の見た目 */
  function lockedThumb(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.fillStyle = '#171c21'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2c353d'; g.strokeRect(0.5, 0.5, w - 1, h - 1);
    g.fillStyle = '#4a5560';
    g.font = 'bold ' + Math.floor(h * 0.5) + 'px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('？', w / 2, h / 2 + 1);
    return c;
  }

  /* ==========================================================
     整備画面
     ========================================================== */
  var held = null;            // つかんでいる部品
  var heldFrom = null;        // 'grid' | 'stash'
  var heldOff = [0, 0];
  var dragMoved = false;
  var grabPt = { x: 0, y: 0 };
  var lastPt = { x: 0, y: 0 };
  var selUid = null;
  var pending = null;         // { type:'upgrade'|'lighten', cost, back }

  function renderGarage() {
    var ch = chassis(), cell = cellPx();
    var b = syncHp();
    refreshStatus();          // 積み替えで最大装甲が変わるので、上の表示も直す

    $('garage-title').textContent = pending
      ? (pending.type === 'upgrade' ? '強化する部品を選ぶ'
        : pending.type === 'lighten' ? '軽量化する部品を選ぶ'
        : '開けるマスを選ぶ')
      : '整備';
    $('garage-done').textContent = pending ? 'やめる' : (S.map.cur ? '戻る' : '出発する');
    $('garage-tut').hidden = !!pending || tutSeen('garage');

    $('grid-chassis').textContent = ch.name;
    var w = $('grid-weight');
    w.textContent = '重量 ' + r1(b.weight) + ' / ' + b.cap;
    w.classList.toggle('is-over', b.over > 0);

    /* --- グリッド --- */
    var grid = $('grid');
    clear(grid);
    grid.style.width = (ch.cols * cell) + 'px';
    grid.style.height = (ch.rows * cell) + 'px';
    for (var y = 0; y < ch.rows; y++) {
      for (var x = 0; x < ch.cols; x++) {
        var c = el('div', 'ss-gridcell');
        c.style.left = (x * cell) + 'px';
        c.style.top = (y * cell) + 'px';
        c.dataset.gx = x; c.dataset.gy = y;
        if (isBlocked(x, y)) {
          c.classList.add('is-blocked');
          var bc = document.createElement('canvas');
          bc.width = cell; bc.height = cell;
          var bg = bc.getContext('2d');
          bg.imageSmoothingEnabled = false;
          bg.drawImage(window.ART.blocked(), 0, 0, cell, cell);
          c.appendChild(bc);
          /* タイルパックや増設で開ける対象を選んでいる最中 */
          if (pending && pending.type === 'open') {
            c.classList.add('is-openable');
            /* キーボードでも選べるようにする */
            c.tabIndex = 0;
            c.setAttribute('role', 'button');
            c.setAttribute('aria-label', (x + 1) + '列 ' + (y + 1) + '行 のマスを開ける');
            c.onkeydown = function (ev) {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                applyOpenCell(this.dataset.gx + ',' + this.dataset.gy);
              }
            };
          }
          c.title = '塞がっている。増設かタイルパックで開けられる';
        }
        grid.appendChild(c);
      }
    }
    placed().forEach(function (inst) {
      var node = makeItemNode(inst, cell);
      node.style.left = (inst.x * cell) + 'px';
      node.style.top = (inst.y * cell) + 'px';
      grid.appendChild(node);
    });

    renderBag();

    /* --- 倉庫 --- */
    var stash = $('stash');
    clear(stash);
    var st = stashed();
    $('stash-count').textContent = st.length + ' 個';
    if (!st.length) stash.appendChild(el('p', 'ss-stash-empty', '空。戦利品はここに入る。'));
    st.forEach(function (inst) { stash.appendChild(makeItemNode(inst, STASH_CELL)); });

    /* --- 合計 --- */
    var sum = $('grid-summary');
    clear(sum);
    var dps = 0;
    b.weapons.forEach(function (wp) { dps += wp.dmg / wp.reload; });
    [
      ['装甲（体力）', S.hp + ' / ' + b.maxHp],
      ['積載', r1(b.weight) + ' / ' + b.cap + (b.over > 0 ? '（超過 ' + r1(b.over) + '）' : '')],
      ['速度', Math.round(b.spd * 100) + '%'],
      ['被弾軽減', b.def],
      ['使えるマス', usableCells() + ' / ' + (chassis().cols * chassis().rows)],
      ['武器', b.weapons.length + ' 門'],
      ['目安 毎秒火力', r1(dps)]
    ].forEach(function (row) {
      var d = el('div');
      d.appendChild(el('i', null, row[0]));
      d.appendChild(el('b', null, String(row[1])));
      sum.appendChild(d);
    });

    renderDetail();
  }

  function makeItemNode(inst, cell) {
    var sz = instSize(inst);
    var node = el('button', 'ss-item');
    node.style.width = (sz.cols * cell) + 'px';
    node.style.height = (sz.rows * cell) + 'px';
    node.dataset.uid = inst.uid;
    if (inst.uid === selUid) node.classList.add('is-sel');
    var cv = document.createElement('canvas');
    paintPart(cv, inst, cell);
    node.appendChild(cv);
    if ((inst.lvl || 1) > 1) node.appendChild(el('span', 'ss-lvl', '+' + (inst.lvl - 1)));
    if (inst.x != null && isWeapon(PART_BY_ID[inst.pid].kind)) {
      var a = auraFor(inst);
      if (a.list.length) node.appendChild(el('span', 'ss-linked', '★' + a.list.length));
    }
    node.title = PART_BY_ID[inst.pid].name;
    return node;
  }

  function renderDetail() {
    var box = $('detail');
    clear(box);
    var inst = selUid ? instById(selUid) : null;
    if (!inst) {
      box.appendChild(el('p', 'ss-detail-empty', '部品を選ぶと、ここに性能が出ます。'));
      return;
    }
    var e = eff(inst), p = e.part;
    box.appendChild(el('span', 'ss-kind', KIND_LABEL[p.kind]));
    var h = el('h4', null, p.name + (e.lvl > 1 ? '  +' + (e.lvl - 1) : ''));
    box.appendChild(h);

    var ul = el('ul');
    function li(t, cls) { var l = el('li', cls, t); ul.appendChild(l); }
    li('重さ ' + e.weight + '　占有 ' + instSize(inst).cols + '×' + instSize(inst).rows);
    if (e.cap) li('積載 +' + e.cap);
    if (e.hp) li('装甲 +' + e.hp);
    if (e.spd) li('速度 +' + Math.round(e.spd * 100) + '%');
    if (isWeapon(p.kind)) {
      var a = inst.x != null ? auraFor(inst) : { dmg: 0, ammo: 0, reload: 0, list: [] };
      var b = build();
      var dmgNow = Math.round(e.dmg * (1 + a.dmgPct));
      li('威力 ' + dmgNow + (a.dmgPct ? '（+' + Math.round(a.dmgPct * 100) + '%）' : ''));
      li('弾 ' + (e.ammo == null ? '∞' : (e.ammo + a.ammo) + (a.ammo ? '（+' + a.ammo + '）' : '')));
      li('発射間隔 ' + r1(e.reload * (1 + a.reload)) + ' 秒' +
        (inst.x != null ? '（車体速度こみ ' + r1(Math.max(0.15, e.reload * (1 + a.reload) / b.spd)) + ' 秒）' : ''));
      if (e.pierce) li('貫通 ' + (e.pierce >= 99 ? '完全' : e.pierce));
      if (a.list.length) li('隣接：' + a.list.join('・'), 'ss-aura');
    }
    if (e.aura) {
      var t = [];
      if (e.aura.dmgPct) t.push('威力+' + Math.round(e.aura.dmgPct * 100) + '%');
      if (e.aura.ammo) t.push('弾+' + e.aura.ammo);
      if (e.aura.reload) t.push('リロード' + Math.round(e.aura.reload * 100) + '%');
      li('隣接する武器へ ' + t.join(' / '), 'ss-aura');
      if (inst.x != null) li('いま効いている武器：' + auraTargets(inst) + ' 門', 'ss-aura');
    }
    box.appendChild(ul);

    var btns = el('div', 'ss-btns');
    var rot = el('button', 'ss-btn', '回転');
    rot.onclick = function () {
      var old = inst.rot;
      inst.rot = (inst.rot + 1) % 4;
      if (inst.x != null && !canPlace(inst, inst.x, inst.y, occupancy(inst.uid))) {
        inst.rot = old; window.SFX.deny(); toast('その向きでは入らない');
      } else { window.SFX.rotate(); save(); renderGarage(); }
    };
    btns.appendChild(rot);

    if (inst.x != null) {
      var off = el('button', 'ss-btn', '倉庫へ');
      off.onclick = function () { inst.x = null; inst.y = null; window.SFX.place(); save(); renderGarage(); };
      btns.appendChild(off);
    } else {
      var on = el('button', 'ss-btn', '車体へ');
      on.onclick = function () {
        if (autoPlace(inst)) { window.SFX.place(); save(); renderGarage(); }
        else { window.SFX.deny(); toast('空きマスが足りない'); }
      };
      btns.appendChild(on);
      var sell = el('button', 'ss-btn', '売る（' + sellPrice(inst) + ' G）');
      sell.onclick = function () {
        S.gold += sellPrice(inst);
        S.parts = S.parts.filter(function (i) { return i.uid !== inst.uid; });
        selUid = null;
        window.SFX.coin(); save(); refreshStatus(); renderGarage();
      };
      btns.appendChild(sell);
    }
    box.appendChild(btns);
  }

  function sellPrice(inst) {
    return Math.round(PART_BY_ID[inst.pid].price * (0.45 + 0.15 * ((inst.lvl || 1) - 1)));
  }

  /* ==========================================================
     消耗品

     グリッドには置かない。持ち物として別に持ち、整備画面から使う。
     効果は「次の戦闘のあいだ」か「その場で永続」の二種類
     ========================================================== */
  function bagFull() { return S.items.length >= ITEM_CAP; }

  function addItem(iid) {
    if (bagFull()) return false;
    S.items.push(iid);
    save();
    return true;
  }

  function useItem(idx) {
    var iid = S.items[idx];
    var it = ITEM_BY_ID[iid];
    if (!it) return;
    var e = it.effect || {};

    /* 穴を開けるものは、どのマスを開けるか選ばせる */
    if (e.tile) {
      if (!blockedCells().length) { window.SFX.deny(); toast('開けられるマスがない'); return; }
      startPending('open', 0, 'garage', idx);
      return;
    }

    if (e.repair) {
      if (S.hp >= S.maxHp) { window.SFX.deny(); toast('装甲は満タン'); return; }
      S.hp = Math.min(S.maxHp, S.hp + Math.ceil(S.maxHp * e.repair));
      window.SFX.repair();
      toast(it.name + ' で装甲を張った');
    }
    if (e.pierce || e.ammo) {
      S.buff = S.buff || { pierce: 0, ammo: 0 };
      S.buff.pierce += (e.pierce || 0);
      S.buff.ammo += (e.ammo || 0);
      window.SFX.upgrade();
      toast(it.name + ' を装填した。次の戦闘で効く');
    }
    S.items.splice(idx, 1);
    save(); refreshStatus(); renderGarage();
  }

  function itemThumb(iid, px) {
    var c = document.createElement('canvas');
    var sp = window.ART.item(ITEM_BY_ID[iid]);
    c.width = sp.width; c.height = sp.height;
    c.getContext('2d').drawImage(sp, 0, 0);
    c.style.width = (px || 24) + 'px';
    c.style.height = (px || 24) + 'px';
    return c;
  }

  function renderBag() {
    var box = $('bag');
    clear(box);
    $('bag-count').textContent = S.items.length + ' / ' + ITEM_CAP;
    if (!S.items.length) {
      box.appendChild(el('p', 'ss-stash-empty', '空。行商や戦利品で手に入る。'));
      return;
    }
    S.items.forEach(function (iid, idx) {
      var it = ITEM_BY_ID[iid];
      var b = el('button', 'ss-bagitem');
      b.appendChild(itemThumb(iid, 26));
      var t = el('span');
      t.appendChild(el('b', null, it.name));
      t.appendChild(el('i', null, it.note));
      b.appendChild(t);
      b.appendChild(el('em', null, '使う'));
      b.onclick = function () { useItem(idx); };
      box.appendChild(b);
    });
  }

  /* ==========================================================
     つかむ・置く

     ドラッグでも、タップ→もう一度タップでも動くようにする。
     スマホではドラッグ中に画面が動かないよう touch-action:none。
     ========================================================== */
  function ghostPaint() {
    if (!held) return;
    paintPart($('drag-canvas'), held, cellPx());
  }
  function ghostMove(x, y) {
    var d = $('drag');
    var cell = cellPx();
    d.style.left = (x - heldOff[0] * cell - cell / 2) + 'px';
    d.style.top = (y - heldOff[1] * cell - cell / 2) + 'px';
  }

  function grab(inst, from, px, py, node) {
    held = inst; heldFrom = from; dragMoved = false;
    grabPt.x = px; grabPt.y = py;
    selUid = inst.uid;
    var rect = node.getBoundingClientRect();
    var cell = from === 'grid' ? cellPx() : STASH_CELL;
    heldOff = [
      Math.max(0, Math.floor((px - rect.left) / cell)),
      Math.max(0, Math.floor((py - rect.top) / cell))
    ];
    inst.x = null; inst.y = null;
    $('drag').hidden = false;
    ghostPaint();
    ghostMove(px, py);
    window.SFX.pick();
    renderGarage();
  }

  function releaseGhost() {
    held = null;
    $('drag').hidden = true;
    hintClear();
  }

  function hintClear() {
    var cells = $('grid').querySelectorAll('.ss-gridcell');
    for (var i = 0; i < cells.length; i++) cells[i].className = 'ss-gridcell';
  }

  function targetCell(px, py) {
    var grid = $('grid');
    var r = grid.getBoundingClientRect();
    var cell = cellPx();
    return {
      x: Math.floor((px - r.left) / cell) - heldOff[0],
      y: Math.floor((py - r.top) / cell) - heldOff[1],
      inside: px >= r.left - cell && px <= r.right + cell && py >= r.top - cell && py <= r.bottom + cell
    };
  }

  function hintDraw(px, py) {
    hintClear();
    if (!held) return;
    var t = targetCell(px, py);
    if (!t.inside) return;
    var ok = canPlace(held, t.x, t.y, occupancy(held.uid));
    var ch = chassis();
    instCells(held).forEach(function (c) {
      var x = t.x + c[0], y = t.y + c[1];
      if (x < 0 || y < 0 || x >= ch.cols || y >= ch.rows) return;
      var node = $('grid').querySelector('.ss-gridcell[data-gx="' + x + '"][data-gy="' + y + '"]');
      if (node) node.className = 'ss-gridcell ' + (ok ? 'is-hint' : 'is-bad');
    });
  }

  function tryDrop(px, py) {
    if (!held) return false;
    var grid = $('grid'), stash = $('stash');
    var gr = grid.getBoundingClientRect(), sr = stash.getBoundingClientRect();
    var inGrid = px >= gr.left && px <= gr.right && py >= gr.top && py <= gr.bottom;
    var inStash = px >= sr.left && px <= sr.right && py >= sr.top && py <= sr.bottom;

    if (inGrid) {
      var t = targetCell(px, py);
      if (canPlace(held, t.x, t.y, occupancy(held.uid))) {
        held.x = t.x; held.y = t.y;
        window.SFX.place();
        releaseGhost(); save(); renderGarage();
        return true;
      }
      window.SFX.deny();
      return false;
    }
    if (inStash) {
      held.x = null; held.y = null;
      window.SFX.place();
      releaseGhost(); save(); renderGarage();
      return true;
    }
    return false;
  }

  function rotateHeld() {
    if (!held) return;
    held.rot = (held.rot + 1) % 4;
    var sz = instSize(held);
    heldOff = [Math.min(heldOff[0], sz.cols - 1), Math.min(heldOff[1], sz.rows - 1)];
    window.SFX.rotate();
    ghostPaint();
    ghostMove(lastPt.x, lastPt.y);
    hintDraw(lastPt.x, lastPt.y);
  }

  function setupGarageInput() {
    var area = $('sc-garage');

    area.addEventListener('pointerdown', function (ev) {
      window.SFX.unlock();
      var itemNode = ev.target.closest ? ev.target.closest('.ss-item') : null;

      /* マスを開けるモード。塞がったマスを直接たたく */
      if (pending && pending.type === 'open') {
        var cellNode = ev.target.closest ? ev.target.closest('.ss-gridcell.is-blocked') : null;
        if (cellNode) {
          ev.preventDefault();
          applyOpenCell(cellNode.dataset.gx + ',' + cellNode.dataset.gy);
        }
        return;
      }

      /* つかんでいるものがあれば、まず置くことを試す */
      if (held) {
        if (tryDrop(ev.clientX, ev.clientY)) ev.preventDefault();
        return;
      }
      if (!itemNode) return;
      ev.preventDefault();
      var inst = instById(parseInt(itemNode.dataset.uid, 10));
      if (!inst) return;

      /* ショップ・焚き火からの「強化する部品を選ぶ」モード */
      if (pending) { applyPending(inst); return; }

      grab(inst, inst.x != null ? 'grid' : 'stash', ev.clientX, ev.clientY, itemNode);
    });

    document.addEventListener('pointermove', function (ev) {
      lastPt.x = ev.clientX; lastPt.y = ev.clientY;
      if (!held) return;
      /* 数ピクセルの震えでドラッグ扱いにすると、タップで置く操作が使えなくなる */
      if (Math.abs(ev.clientX - grabPt.x) > 6 || Math.abs(ev.clientY - grabPt.y) > 6) dragMoved = true;
      ghostMove(ev.clientX, ev.clientY);
      hintDraw(ev.clientX, ev.clientY);
    });

    document.addEventListener('pointerup', function (ev) {
      if (!held) return;
      /* 動かさずに離したときは、つかんだまま（もう一度タップで置く） */
      if (!dragMoved) return;
      if (!tryDrop(ev.clientX, ev.clientY)) {
        /* 置けなかったら倉庫へ落とす。宙に浮いたままにしない */
        held.x = null; held.y = null;
        releaseGhost(); save(); renderGarage();
      }
    });

    document.addEventListener('keydown', function (ev) {
      /* ダイアログが開いているときは、そちらを先に閉じる */
      if (ev.key === 'Escape' && modalOpen()) { closeModal(); return; }
      if (ev.key === 'r' || ev.key === 'R') rotateHeld();
      if (ev.key === 'Escape' && held) {
        held.x = null; held.y = null;
        releaseGhost(); save(); renderGarage();
      }
    });

    area.addEventListener('contextmenu', function (ev) {
      if (held) { ev.preventDefault(); rotateHeld(); }
    });
    $('drag-rotate').addEventListener('pointerdown', function (ev) {
      ev.preventDefault(); ev.stopPropagation(); rotateHeld();
    });
    $('drag-rotate').addEventListener('click', function (ev) { ev.stopPropagation(); });

    /* クリックでの選択（つかまずに詳細だけ見たいとき） */
    area.addEventListener('click', function (ev) {
      var itemNode = ev.target.closest ? ev.target.closest('.ss-item') : null;
      if (itemNode) { selUid = parseInt(itemNode.dataset.uid, 10); renderDetail(); }
    });

    window.addEventListener('resize', function () {
      if (!$('sc-garage').hidden) renderGarage();
    });
  }

  /* ==========================================================
     強化・軽量化（店と焚き火から呼ぶ）
     ========================================================== */
  function startPending(type, cost, back, itemIdx) {
    if (type === 'open') {
      if (!blockedCells().length) { window.SFX.deny(); toast('開けられるマスがない'); return; }
    } else if (!S.parts.length) {
      toast('部品がない'); return;
    }
    pending = { type: type, cost: cost, back: back, itemIdx: itemIdx };
    show('garage');
    renderGarage();
    toast(type === 'upgrade' ? '強化する部品をタップ'
      : type === 'lighten' ? '軽量化する部品をタップ'
      : '開けるマスをタップ');
  }

  /* 塞がったマスを開ける。企画書の「穴追加 / 穴をふさぐ」 */
  function applyOpenCell(key) {
    var p = pending;
    S.opened = S.opened || {};
    S.opened[key] = true;
    S.gold -= p.cost;
    if (p.cost) S.openCost = Math.round(S.openCost * 1.4) + 12;
    /* タイルパックから来たときは、その持ち物を消す */
    if (p.itemIdx != null) S.items.splice(p.itemIdx, 1);
    pending = null;
    window.SFX.upgrade();
    toast('マスを1つ開けた');
    syncHp(); save(); refreshStatus();
    if (p.back === 'shop') renderShop();
    else if (p.back === 'rest') afterNode();
    else { show('garage'); renderGarage(); }
  }

  function applyPending(inst) {
    var p = pending;
    if (p.type === 'upgrade') {
      inst.lvl = (inst.lvl || 1) + 1;
      window.SFX.upgrade();
      toast(PART_BY_ID[inst.pid].name + ' を強化した');
    } else {
      if (PART_BY_ID[inst.pid].weight - (inst.wcut || 0) <= 1) {
        window.SFX.deny(); toast('これ以上は削れない'); return;
      }
      inst.wcut = (inst.wcut || 0) + 2;
      window.SFX.upgrade();
      toast(PART_BY_ID[inst.pid].name + ' を軽くした');
    }
    S.gold -= p.cost;
    if (p.type === 'upgrade') S.upgCost = Math.round(S.upgCost * 1.45) + 10;
    else S.lightCost = Math.round(S.lightCost * 1.45) + 10;
    pending = null;
    syncHp(); save(); refreshStatus();
    if (p.back === 'shop') renderShop();
    else if (p.back === 'rest') afterNode();
    else { show('garage'); renderGarage(); }
  }

  function cancelPending() {
    var back = pending.back;
    pending = null;
    if (back === 'shop') { show('shop'); renderShop(); }
    else if (back === 'rest') { show('rest'); renderRest(); }
    else { show('map'); renderMap(); }
  }

  /* ==========================================================
     マップ描画
     ========================================================== */
  function renderMapLegend() {
    var box = $('map-legend');
    if (box.children.length) return;   // 中身は変わらないので一度作れば十分
    ['battle', 'elite', 'boss', 'rest', 'shop', 'event'].forEach(function (type) {
      var item = el('div', 'ss-legend-item');
      var cv = document.createElement('canvas');
      var sp = window.ART.node(type);
      cv.width = sp.width; cv.height = sp.height;
      cv.getContext('2d').drawImage(sp, 0, 0);
      item.appendChild(cv);
      var t = el('span');
      t.appendChild(el('b', null, NODE_LABEL[type]));
      t.appendChild(document.createTextNode(' ' + NODE_DESC[type]));
      item.appendChild(t);
      box.appendChild(item);
    });
  }

  function renderMap() {
    renderMapLegend();
    var m = S.map;
    var wrap = $('map-nodes');
    clear(wrap);
    var open = openNodes();
    var openKey = {};
    open.forEach(function (o) { openKey[o.f + ':' + o.i] = true; });

    for (var f = m.floors.length - 1; f >= 0; f--) {
      var row = el('div', 'ss-mapfloor');
      row.dataset.f = f;
      m.floors[f].forEach(function (n, i) {
        var b = el('button', 'ss-node');
        b.dataset.f = f; b.dataset.i = i;
        var cv = document.createElement('canvas');
        var sp = window.ART.node(n.type);
        cv.width = 16; cv.height = 16;
        cv.getContext('2d').drawImage(sp, 0, 0);
        b.appendChild(cv);
        b.appendChild(el('span', 'ss-nodetag', NODE_LABEL[n.type]));
        var isHere = m.cur && m.cur.f === f && m.cur.i === i;
        if (isHere) b.classList.add('is-here');
        else if (openKey[f + ':' + i]) {
          b.classList.add('is-open');
          /* f は外側のループ変数なので、閉じ込めずに dataset から読み直す */
          b.onclick = function () {
            enterNode(parseInt(this.dataset.f, 10), parseInt(this.dataset.i, 10));
          };
        } else if (m.cleared.indexOf(f + ':' + i) >= 0) b.classList.add('is-done');
        row.appendChild(b);
      });
      wrap.appendChild(row);
    }
    $('map-hint').textContent = m.cur
      ? '次に進める行き先が光っている。'
      : '好きなところから走り出せる。';
    /* 12階ぶんの縦長になるので、選べるところが画面に入るまで送る */
    setTimeout(function () {
      drawMapLines();
      var n = $('map-nodes').querySelector('.ss-node.is-open');
      if (n && n.scrollIntoView) n.scrollIntoView({ block: 'center' });
    }, 0);
  }

  function drawMapLines() {
    var svg = $('map-lines');
    var box = $('map-body');
    var br = box.getBoundingClientRect();
    svg.setAttribute('viewBox', '0 0 ' + br.width + ' ' + br.height);
    clear(svg);
    var m = S.map;
    function center(f, i) {
      var n = $('map-nodes').querySelector('.ss-node[data-f="' + f + '"][data-i="' + i + '"]');
      if (!n) return null;
      var r = n.getBoundingClientRect();
      return { x: r.left - br.left + r.width / 2, y: r.top - br.top + r.height / 2 };
    }
    for (var f = 0; f < m.edges.length; f++) {
      for (var i = 0; i < m.edges[f].length; i++) {
        m.edges[f][i].forEach(function (j) {
          var a = center(f, i), b = center(f + 1, j);
          if (!a || !b) return;
          var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
          line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
          var live = m.cur && m.cur.f === f && m.cur.i === i;
          line.setAttribute('stroke', live ? '#d9a441' : '#2c353d');
          line.setAttribute('stroke-width', live ? 2 : 1.5);
          if (!live) line.setAttribute('stroke-dasharray', '3 4');
          svg.appendChild(line);
        });
      }
    }
  }

  /* ==========================================================
     ノードに入る
     ========================================================== */
  function enterNode(f, i) {
    window.SFX.select();
    S.map.cur = { f: f, i: i };
    S.map.cleared.push(f + ':' + i);
    save(); refreshStatus();
    var type = S.map.floors[f][i].type;
    if (type === 'shop') {
      S.visitedShop = true; S.shopStock = null; S.itemStock = null;
      show('shop'); renderShop();
    }
    else if (type === 'rest') { show('rest'); renderRest(); }
    else if (type === 'event') { startEvent(); }
    else startBattle(type, f);
  }

  function afterNode() {
    if (S.map.cur && S.map.cur.f >= S.map.floors.length - 1) return;   // ボスは別処理
    show('map'); renderMap(); refreshStatus(); save();
  }

  /* ==========================================================
     戦闘（オート）
     ========================================================== */
  var B = null;
  var rafId = 0;

  function scaleEnemy(base, floor) {
    var e = JSON.parse(JSON.stringify(base));
    /* 中ボスとボスは出る階が決まっているので、その階向けの数値をそのまま使う */
    if (e.tier === 'mob') {
      e.hp = Math.round(e.hp * (1 + D.run.scaleHp * floor));
      e.atk = Math.round(e.atk * (1 + D.run.scaleAtk * floor));
    } else if (e.tier === 'elite') {
      var up = Math.max(0, floor - D.run.eliteBaseFloor);
      e.hp = Math.round(e.hp * (1 + D.run.eliteScaleHp * up));
      e.atk = Math.round(e.atk * (1 + D.run.eliteScaleAtk * up));
    }
    e.gold = Math.round(e.gold * (1 + 0.05 * floor));
    return e;
  }

  function pickEnemy(type, floor) {
    var pool = D.enemies.filter(function (e) {
      if (type === 'boss') return e.tier === 'boss';
      if (type === 'elite') return e.tier === 'elite';
      /* 装甲の厚い敵を初手に出すと、初期装備では抜けない */
      return e.tier === 'mob' && floor >= (e.minFloor || 0);
    });
    if (!pool.length) pool = D.enemies.filter(function (e) { return e.tier === 'mob'; });
    return scaleEnemy(pick(pool), floor);
  }

  function startBattle(type, floor) {
    var b = syncHp();
    var foe = pickEnemy(type, floor);
    markEnemySeen(foe.id);
    /* 途中で閉じても、再開したときに同じ戦闘からやり直せるようにする */
    S.inBattle = { type: type, floor: floor };
    save();

    B = {
      type: type, foe: foe, foeHp: foe.hp, foeMax: foe.hp, foeT: 0, salvoT: 0,
      me: b, meHp: S.hp, meMax: b.maxHp,
      guns: b.weapons.map(function (w) {
        var bf = S.buff || { pierce: 0, ammo: 0 };
        return {
          name: w.name, kind: w.kind, dmg: w.dmg,
          pierce: w.pierce + (bf.pierce || 0),
          reload: w.reload,
          /* 弾無限の武器に弾数を足しても意味がないので、有限のものだけ */
          ammo: w.ammo == null ? null : w.ammo + (bf.ammo || 0),
          ammoMax: w.ammo == null ? null : w.ammo + (bf.ammo || 0),
          t: 0
        };
      }),
      ramT: 0, over: false, speed: OPT.speed, last: 0,
      /* 負けたときに何が足りなかったか言うための記録 */
      tally: { dealt: 0, blocked: 0, taken: 0, shots: 0, dryT: 0, elapsed: 0 }
    };

    show('battle');
    $('battle-title').textContent = type === 'boss' ? 'ボス戦' : (type === 'elite' ? '賞金首' : '遭遇');
    $('battle-end').hidden = true;
    $('battle-speed').textContent = '速度 x' + B.speed;

    var meC = $('battle-me');
    var chSp = window.ART.chassis(chassis());
    meC.width = chSp.width; meC.height = chSp.height;
    meC.getContext('2d').drawImage(chSp, 0, 0);
    $('battle-mename').textContent = chassis().name;

    var foeC = $('battle-foe');
    var foeSp = window.ART.enemy(foe.art);
    foeC.width = foeSp.width; foeC.height = foeSp.height;
    foeC.getContext('2d').drawImage(foeSp, 0, 0);
    $('battle-foename').textContent = foe.name;
    $('battle-foeinfo').textContent = '装甲 ' + foe.armor + '　攻撃 ' + foe.atk +
      '　間隔 ' + r1(foe.interval) + '秒' + (foe.trait ? '\n' + foe.trait : '');

    clear($('battle-log'));
    if (!tutSeen('battle')) {
      logLine('sys', '戦闘は自動。操作はいらない。武器のバーが満タンで発射する。');
      markTutSeen('battle');
    }
    logLine('sys', '── ' + foe.name + ' が現れた ──');
    if (!B.guns.length) logLine('sys', '武器を積んでいない。体当たりしかできない。');
    if (b.over > 0) logLine('sys', '過積載。全体の動きが鈍い（速度 ' + Math.round(b.spd * 100) + '%）');
    if (S.buff && (S.buff.pierce || S.buff.ammo)) {
      var bt = [];
      if (S.buff.pierce) bt.push('貫通+' + S.buff.pierce);
      if (S.buff.ammo) bt.push('弾+' + S.buff.ammo);
      logLine('big', '消耗品の効果：' + bt.join(' / '));
    }
    renderGuns();
    updateBars();
    updateIntent();
    window.SFX.encounter();

    startLoop();
  }

  function logLine(cls, text) {
    var box = $('battle-log');
    var p = el('p', cls, text);
    box.appendChild(p);
    while (box.children.length > 160) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  function renderGuns() {
    var box = $('battle-guns');
    clear(box);
    B.guns.forEach(function (g, idx) {
      var row = el('div', 'ss-gun');
      row.dataset.idx = idx;
      var bar = el('div', 'ss-gunbar');
      bar.appendChild(el('i'));
      bar.appendChild(el('span', null, g.name));
      row.appendChild(bar);
      row.appendChild(el('b', null, g.ammo == null ? '∞' : String(g.ammo)));
      box.appendChild(row);
    });
  }

  function updateGuns() {
    var rows = $('battle-guns').children;
    for (var i = 0; i < rows.length; i++) {
      var g = B.guns[i], row = rows[i];
      var pct = Math.min(1, g.t / g.reload) * 100;
      row.querySelector('i').style.width = pct + '%';
      row.classList.toggle('is-ready', pct >= 100);
      row.classList.toggle('is-empty', g.ammo === 0);
      row.querySelector('b').textContent = g.ammo == null ? '∞' : String(g.ammo);
    }
  }

  /* 敵が次にいつ殴ってくるか。オートバトルを「見ているだけ」にしないための表示 */
  function updateIntent() {
    var left = Math.max(0, B.foe.interval - B.foeT);
    var pct = Math.min(100, B.foeT / B.foe.interval * 100);
    $('intent-fill').style.width = pct + '%';
    $('intent-num').textContent = r1(left) + '秒';
    $('intent-label').textContent = '次の攻撃 ' + Math.max(1, B.foe.atk - B.me.def);
    $('battle-intent').firstElementChild.classList.toggle('is-soon', left <= 0.9);

    var row = $('intent-salvo');
    if (B.foe.salvo) {
      row.hidden = false;
      var sLeft = Math.max(0, B.foe.salvo.every - B.salvoT);
      $('salvo-fill').style.width = Math.min(100, B.salvoT / B.foe.salvo.every * 100) + '%';
      $('salvo-num').textContent = r1(sLeft) + '秒';
      row.classList.toggle('is-soon', sLeft <= 2);
    } else {
      row.hidden = true;
    }
  }

  function updateBars() {
    var mp = Math.max(0, B.meHp / B.meMax * 100);
    var fp = Math.max(0, B.foeHp / B.foeMax * 100);
    var mb = $('battle-mehp');
    mb.style.width = mp + '%';
    mb.classList.toggle('is-low', mp <= 30);
    $('battle-foehp').style.width = fp + '%';
    $('battle-menum').textContent = Math.max(0, Math.ceil(B.meHp)) + ' / ' + B.meMax;
    $('battle-foenum').textContent = Math.max(0, Math.ceil(B.foeHp)) + ' / ' + B.foeMax;
  }

  function flash(which) {
    var c = $(which === 'me' ? 'battle-me' : 'battle-foe');
    c.classList.remove('is-hurt');
    void c.offsetWidth;
    c.classList.add('is-hurt');
  }

  /* 当たった数字をその場に飛ばす。ログだけだと手応えがない。
     速度x4だと数が増えるので、溜まりすぎたら古いものから捨てる */
  function popDamage(which, amount, big) {
    var host = $(which === 'me' ? 'battle-me' : 'battle-foe').parentNode;
    var live = host.querySelectorAll('.ss-pop');
    for (var i = 0; i + 3 < live.length; i++) {
      if (live[i].parentNode) live[i].parentNode.removeChild(live[i]);
    }
    var e = el('span', 'ss-pop ' + (which === 'me' ? 'is-me' : 'is-foe') + (big ? ' is-big' : ''),
      (which === 'me' ? '-' : '') + amount);
    /* 同時に出たとき重ならないよう、少しだけ横にずらす */
    e.style.marginLeft = (rint(41) - 20) + 'px';
    host.appendChild(e);
    setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 900);
  }

  /* requestAnimationFrame は環境によっては回らない（画面を描いていない
     プレビューなど）。タイマーで回し、間隔が空いたぶんは切り捨てる。
     裏に回ったタブで勝手に戦闘が進むのも、これで防げる。 */
  function tick() {
    if (!B || B.over) { stopLoop(); return; }
    var now = performance.now();
    var dt = Math.min(0.06, (now - B.last) / 1000) * B.speed;
    B.last = now;
    advance(dt);
    updateBars();
    updateGuns();
    updateIntent();
    if (B.over) stopLoop();
  }
  function startLoop() {
    stopLoop();
    B.last = performance.now();
    rafId = setInterval(tick, 40);
  }
  function stopLoop() {
    if (rafId) { clearInterval(rafId); rafId = 0; }
  }

  function advance(dt) {
    B.tally.elapsed += dt;
    var anyUsable = false;

    B.guns.forEach(function (g) {
      if (g.ammo === 0) return;
      anyUsable = true;
      g.t += dt;
      while (g.t >= g.reload && !B.over && g.ammo !== 0) {
        g.t -= g.reload;
        fireGun(g);
      }
    });

    if (!anyUsable && !B.over) {
      B.tally.dryT += dt;
      B.ramT += dt;
      if (B.ramT >= 3) {
        B.ramT = 0;
        var d = Math.max(1, 4 - B.foe.armor);
        B.foeHp -= d;
        logLine('me', '体当たり。' + d + ' のダメージ');
        flash('foe');
        popDamage('foe', d, false);
        checkEnd();
      }
    }

    if (!B.over) {
      B.foeT += dt;
      if (B.foeT >= B.foe.interval) {
        B.foeT -= B.foe.interval;
        foeAttack(1, false);
      }
      if (B.foe.salvo && !B.over) {
        B.salvoT += dt;
        if (B.salvoT >= B.foe.salvo.every) {
          B.salvoT -= B.foe.salvo.every;
          foeAttack(B.foe.salvo.mult, true);
        }
      }
    }
  }

  function fireGun(g) {
    var raw = g.dmg;
    var armor = Math.max(0, B.foe.armor - g.pierce);
    var dealt = Math.max(1, raw - armor);
    B.foeHp -= dealt;
    if (g.ammo != null) g.ammo--;

    var blocked = raw - dealt;
    B.tally.dealt += dealt;
    B.tally.blocked += blocked;
    B.tally.shots++;
    var txt = g.name + '　' + dealt + ' ダメージ' + (blocked > 0 ? '（装甲が ' + blocked + ' 受けた）' : '');
    logLine(g.kind === 'special' ? 'big' : 'me', txt);
    if (g.kind === 'special') window.SFX.special();
    else if (g.kind === 'main') window.SFX.fire();
    else window.SFX.subFire();
    flash('foe');
    popDamage('foe', dealt, g.kind === 'special');
    if (g.ammo === 0) logLine('sys', g.name + ' は弾切れ');
    checkEnd();
  }

  function foeAttack(mult, salvo) {
    var raw = Math.round(B.foe.atk * mult);
    var dealt = Math.max(1, raw - B.me.def);
    B.meHp -= dealt;
    B.tally.taken += dealt;
    logLine('foe', (salvo ? '★一斉射撃！　' : '') + B.foe.name + 'の攻撃　' + dealt + ' ダメージ' +
      (B.me.def > 0 ? '（装甲が ' + Math.min(B.me.def, raw - 1) + ' 受けた）' : ''));
    window.SFX.damage();
    flash('me');
    popDamage('me', dealt, !!salvo);
    checkEnd();
  }

  function checkEnd() {
    if (B.over) return;
    if (B.foeHp <= 0) { B.over = true; endBattle(true); }
    else if (B.meHp <= 0) { B.over = true; endBattle(false); }
  }

  function endBattle(win) {
    stopLoop();
    B.foeHp = Math.max(0, B.foeHp);
    B.meHp = Math.max(0, B.meHp);
    updateBars();
    updateGuns();
    updateIntent();
    S.hp = Math.max(0, Math.round(B.meHp));

    if (win) {
      logLine('win', '── ' + B.foe.name + ' を撃破 ──');
      window.SFX.defeat();
      S.hp = Math.max(1, S.hp);
      $('battle-end').hidden = false;
      $('battle-next').textContent = B.type === 'boss' ? '結果を見る' : '戦利品';
      META.stats.battlesWon++; saveMeta(); checkAchievements();
    } else {
      logLine('foe', '── 車は動かなくなった ──');
      window.SFX.lose();
      $('battle-end').hidden = false;
      $('battle-next').textContent = '結果を見る';
    }
    B.win = win;
    if (!win) {
      S.lastLoss = {
        foe: B.foe.name, armor: B.foe.armor, atk: B.foe.atk,
        tally: B.tally, meMax: B.meMax, foeHp: B.foeHp, foeMax: B.foeMax,
        spd: B.me.spd, over: B.me.over, guns: B.guns.length
      };
    }
    S.inBattle = null;
    S.buff = null;                 // 消耗品の効果はこの戦闘限り
    save(); refreshStatus();
  }

  /* ==========================================================
     報酬
     ========================================================== */
  function partPool(floor) {
    return D.parts.filter(function (p) {
      if (p.tier === 3) return floor >= 5;
      if (p.tier === 2) return floor >= 2;
      return true;
    });
  }

  /* 品揃え。まだ持っていない部品を先に出す。
     同じものばかり並ぶと、選ぶ意味がなくなる */
  function offerParts(floor, n) {
    var owned = {};
    S.parts.forEach(function (i) { owned[i.pid] = (owned[i.pid] || 0) + 1; });
    var pool = partPool(floor);
    var fresh = shuffled(pool.filter(function (p) { return !owned[p.id]; }));
    var dup = shuffled(pool.filter(function (p) { return owned[p.id]; }));
    return fresh.concat(dup).slice(0, n);
  }

  function renderReward(gold, count) {
    S.gold += gold;
    $('reward-gold').textContent = gold + ' G を回収した。積める部品を一つ持っていける。';
    var box = $('reward-offer');
    clear(box);
    var pool = offerParts(S.map.cur.f, count);
    /* たまに消耗品を混ぜる。持ち物が空いているときだけ */
    if (!bagFull() && Math.random() < 0.4) {
      var it = pick(D.items);
      box.appendChild(itemGoodsButton(it, null, function () {
        addItem(it.id);
        window.SFX.coin();
        toast(it.name + ' を手に入れた');
        save(); refreshStatus();
        afterNode();
      }));
      pool = pool.slice(0, Math.max(1, count - 1));
    }
    pool.forEach(function (p) {
      box.appendChild(goodsButton(p, null, function () {
        var inst = newInst(p.id);
        S.parts.push(inst);
        if (!autoPlace(inst)) toast(p.name + ' を倉庫に入れた');
        else toast(p.name + ' を積んだ');
        window.SFX.coin();
        syncHp(); save(); refreshStatus();
        afterNode();
      }));
    });
    refreshStatus(); save();
  }

  /* いま積んでいる同じ種類の部品のうち、いちばん強いもの。比較の相手にする */
  function bestOwned(kind) {
    var best = null, score = -1;
    placed().forEach(function (i) {
      var e = eff(i);
      if (e.kind !== kind) return;
      var v = isWeapon(kind) ? (e.dmg / Math.max(0.1, e.reload))
        : (e.hp + e.cap + e.spd * 100);
      if (v > score) { score = v; best = e; }
    });
    return best;
  }

  /* 買う前に強くなるか分かるように、手持ちとの差を出す */
  function compareLine(part) {
    var cur = bestOwned(part.kind);
    if (!cur) return null;
    var n = eff({ pid: part.id, lvl: 1, wcut: 0, rot: 0 });
    var d = [];
    function push(label, now, next, better) {
      var diff = Math.round((next - now) * 10) / 10;
      if (!diff) return;
      d.push({ t: label + (diff > 0 ? '+' : '') + diff, good: better ? diff > 0 : diff < 0 });
    }
    if (isWeapon(part.kind)) {
      push('威力', cur.dmg, n.dmg, true);
      push('間隔', cur.reload, n.reload, false);
      if (cur.ammo != null && n.ammo != null) push('弾', cur.ammo, n.ammo, true);
      push('貫通', cur.pierce, n.pierce, true);
    } else {
      push('装甲', cur.hp, n.hp, true);
      push('積載', cur.cap, n.cap, true);
      push('速度', Math.round(cur.spd * 100), Math.round(n.spd * 100), true);
    }
    push('重さ', cur.weight, n.weight, false);
    if (!d.length) return null;
    return { name: cur.name, diffs: d };
  }

  function goodsButton(part, price, onBuy) {
    var b = el('button', 'ss-goods');
    var top = el('div', 'ss-goodstop');
    top.appendChild(partThumb(part.id, 18));
    var nm = el('div');
    nm.appendChild(el('span', 'ss-kind', KIND_LABEL[part.kind]));
    nm.appendChild(el('b', null, part.name));
    top.appendChild(nm);
    b.appendChild(top);
    b.appendChild(el('div', 'ss-note', part.note));
    b.appendChild(el('div', 'ss-w', '重さ ' + part.weight + '　' +
      part.shape[0].length + '×' + part.shape.length + 'マス'));

    var cmp = compareLine(part);
    if (cmp) {
      var c = el('div', 'ss-cmp');
      c.appendChild(el('i', null, '積んでいる ' + cmp.name + ' と比べて'));
      var row = el('span');
      cmp.diffs.forEach(function (x) {
        row.appendChild(el('em', x.good ? 'is-up' : 'is-down', x.t));
      });
      c.appendChild(row);
      b.appendChild(c);
    }
    if (price != null) {
      var p = el('div', 'ss-price', price + ' G');
      if (S.gold < price) { p.className = 'ss-price is-poor'; b.disabled = true; }
      b.appendChild(p);
    }
    b.onclick = onBuy;
    return b;
  }

  /* ==========================================================
     ショップ
     ========================================================== */
  function renderShop() {
    show('shop');
    if (!S.shopStock) {
      S.shopStock = offerParts(S.map.cur.f, 4).map(function (p) { return p.id; });
    }
    var box = $('shop-goods');
    clear(box);
    S.shopStock.forEach(function (pid, idx) {
      if (pid === null) return;
      var p = PART_BY_ID[pid];
      box.appendChild(goodsButton(p, p.price, function () {
        if (S.gold < p.price) return;
        S.gold -= p.price;
        var inst = newInst(p.id);
        S.parts.push(inst);
        if (!autoPlace(inst)) toast(p.name + ' を倉庫に入れた');
        else toast(p.name + ' を積んだ');
        S.shopStock[idx] = null;
        window.SFX.coin();
        syncHp(); save(); refreshStatus(); renderShop();
      }));
    });
    if (!box.children.length) box.appendChild(el('p', 'ss-lead', '売り物は残っていない。'));

    var sv = $('shop-services');
    clear(sv);
    var repair = Math.max(0, S.maxHp - S.hp);
    sv.appendChild(serviceButton(
      '応急修理', '装甲を ' + Math.min(repair, Math.ceil(S.maxHp * 0.5)) + ' 回復する',
      S.repairCost, repair > 0,
      function () {
        S.gold -= S.repairCost;
        S.hp = Math.min(S.maxHp, S.hp + Math.ceil(S.maxHp * 0.5));
        S.repairCost = Math.round(S.repairCost * 1.4) + 10;
        window.SFX.repair(); save(); refreshStatus(); renderShop();
      }));
    sv.appendChild(serviceButton(
      '部品の強化', '選んだ部品を1段上げる（威力・装甲・積載 +22%、弾+1、リロード-6%）',
      S.upgCost, true,
      function () { startPending('upgrade', S.upgCost, 'shop'); }));
    sv.appendChild(serviceButton(
      '軽量化', '選んだ部品の重さを 2 減らす',
      S.lightCost, true,
      function () { startPending('lighten', S.lightCost, 'shop'); }));
    sv.appendChild(serviceButton(
      '車体の増設', '塞がったマスを1つ開ける（残り ' + blockedCells().length + ' マス）',
      S.openCost, blockedCells().length > 0,
      function () { startPending('open', S.openCost, 'shop'); }));

    /* --- 消耗品 --- */
    if (!S.itemStock) {
      S.itemStock = shuffled(D.items).slice(0, 2).map(function (i) { return i.id; });
    }
    var ib = $('shop-items');
    clear(ib);
    S.itemStock.forEach(function (iid, idx) {
      if (iid === null) return;
      var it = ITEM_BY_ID[iid];
      ib.appendChild(itemGoodsButton(it, it.price, function () {
        if (S.gold < it.price) return;
        if (bagFull()) { window.SFX.deny(); toast('持ち物がいっぱい'); return; }
        S.gold -= it.price;
        addItem(iid);
        S.itemStock[idx] = null;
        window.SFX.coin();
        toast(it.name + ' を買った');
        save(); refreshStatus(); renderShop();
      }));
    });
    if (!ib.children.length) ib.appendChild(el('p', 'ss-lead', '消耗品は売り切れ。'));
    refreshStatus();
  }

  /* 消耗品のカード。部品と作りは同じだが重さとマスが無い */
  function itemGoodsButton(it, price, onBuy) {
    var b = el('button', 'ss-goods');
    var top = el('div', 'ss-goodstop');
    top.appendChild(itemThumb(it.id, 22));
    var nm = el('div');
    nm.appendChild(el('span', 'ss-kind', '消耗品'));
    nm.appendChild(el('b', null, it.name));
    top.appendChild(nm);
    b.appendChild(top);
    b.appendChild(el('div', 'ss-note', it.note));
    if (price != null) {
      var p = el('div', 'ss-price', price + ' G');
      if (S.gold < price) { p.className = 'ss-price is-poor'; b.disabled = true; }
      b.appendChild(p);
    }
    b.onclick = onBuy;
    return b;
  }

  function serviceButton(title, note, price, enabled, onBuy) {
    var b = el('button', 'ss-goods');
    var top = el('div', 'ss-goodstop');
    top.appendChild(el('b', null, title));
    b.appendChild(top);
    b.appendChild(el('div', 'ss-note', note));
    var p = el('div', 'ss-price', price + ' G');
    if (S.gold < price || !enabled) { p.className = 'ss-price is-poor'; b.disabled = true; }
    b.appendChild(p);
    b.onclick = onBuy;
    return b;
  }

  /* ==========================================================
     図鑑（部品・敵・実績）
     ラン間で引き継ぐ META をそのまま表示する。読み取り専用の画面
     ========================================================== */
  var ENEMY_TIER_LABEL = { mob: '雑魚', elite: '賞金首', boss: 'ボス' };

  function codexPartCard(p) {
    var seen = !!META.seenParts[p.id];
    var b = el('div', 'ss-goods' + (seen ? '' : ' is-locked'));
    var top = el('div', 'ss-goodstop');
    top.appendChild(seen ? partThumb(p.id, 22) : lockedThumb(22, 22));
    var nm = el('div');
    nm.appendChild(el('span', 'ss-kind', seen ? KIND_LABEL[p.kind] : '？？？'));
    nm.appendChild(el('b', null, seen ? p.name : '？？？'));
    top.appendChild(nm);
    b.appendChild(top);
    b.appendChild(el('div', 'ss-note', seen ? p.note : 'まだ手に入れていない'));
    return b;
  }

  function codexEnemyCard(e) {
    var seen = !!META.seenEnemies[e.id];
    var b = el('div', 'ss-goods' + (seen ? '' : ' is-locked'));
    var top = el('div', 'ss-goodstop');
    var cv;
    if (seen) {
      var sp = window.ART.enemy(e.art);
      cv = document.createElement('canvas');
      cv.width = sp.width; cv.height = sp.height;
      cv.getContext('2d').drawImage(sp, 0, 0);
      cv.style.width = '52px'; cv.style.height = Math.round(52 * sp.height / sp.width) + 'px';
    } else {
      cv = lockedThumb(52, 34);
    }
    top.appendChild(cv);
    var nm = el('div');
    nm.appendChild(el('span', 'ss-kind', seen ? ENEMY_TIER_LABEL[e.tier] : '？？？'));
    nm.appendChild(el('b', null, seen ? e.name : '？？？'));
    top.appendChild(nm);
    b.appendChild(top);
    var note = 'まだ遭遇していない';
    if (seen) {
      note = 'HP' + e.hp + '　装甲' + e.armor + '　攻撃' + e.atk +
        (e.tier === 'mob' ? '（階層で上がる）' : '') + (e.trait ? '　' + e.trait : '');
    }
    b.appendChild(el('div', 'ss-note', note));
    return b;
  }

  function achRow(a) {
    var unlocked = !!META.unlocked[a.id];
    var row = el('div', 'ss-ach' + (unlocked ? ' is-on' : ''));
    row.appendChild(el('span', 'ss-ach-mark', unlocked ? '✓' : '－'));
    var body = el('div', 'ss-ach-body');
    body.appendChild(el('b', null, a.name));
    body.appendChild(el('div', null, a.desc));
    row.appendChild(body);
    return row;
  }

  function renderCodex() {
    var pBox = $('codex-parts'); clear(pBox);
    D.parts.forEach(function (p) { pBox.appendChild(codexPartCard(p)); });
    var pSeen = Object.keys(META.seenParts).length;
    $('codex-parts-count').textContent = pSeen + '/' + D.parts.length;

    var eBox = $('codex-enemies'); clear(eBox);
    D.enemies.forEach(function (e) { eBox.appendChild(codexEnemyCard(e)); });
    var eSeen = Object.keys(META.seenEnemies).length;
    $('codex-enemies-count').textContent = eSeen + '/' + D.enemies.length;

    var aBox = $('codex-ach'); clear(aBox);
    ACHIEVEMENTS.forEach(function (a) { aBox.appendChild(achRow(a)); });
    var aDone = Object.keys(META.unlocked).length;
    $('codex-ach-count').textContent = aDone + '/' + ACHIEVEMENTS.length;
  }

  var codexReturn = 'title';
  function openCodex(from) {
    codexReturn = from;
    renderCodex();
    show('codex');
  }

  /* ==========================================================
     イベント（マップの「？」）

     選択肢を出し、選んだ効果をその場で適用する。
     ストーリーは持たせず、損得だけで作る
     ========================================================== */
  function startEvent() {
    /* 同じ走行で同じイベントが続けて出ないように、直近のものは避ける */
    S.seenEvents = S.seenEvents || [];
    var pool = D.events.filter(function (e) { return S.seenEvents.indexOf(e.id) < 0; });
    if (!pool.length) { S.seenEvents = []; pool = D.events; }
    var ev = pick(pool);
    S.seenEvents.push(ev.id);

    show('event');
    $('event-name').textContent = ev.name;
    $('event-text').textContent = ev.text;
    var box = $('event-opts');
    clear(box);
    ev.opts.forEach(function (o) {
      var b = el('button', 'ss-goods');
      var top = el('div', 'ss-goodstop');
      top.appendChild(el('b', null, o.label));
      b.appendChild(top);
      if (o.note) b.appendChild(el('div', 'ss-note', o.note));
      /* 払えないものは押せなくする */
      var cost = (o.effect && o.effect.gold < 0) ? -o.effect.gold : 0;
      if (cost && S.gold < cost) b.disabled = true;
      b.onclick = function () { applyEvent(o.effect || {}); };
      box.appendChild(b);
    });
    save(); refreshStatus();
  }

  function applyEvent(e) {
    var msg = [];

    if (e.gold) {
      S.gold = Math.max(0, S.gold + e.gold);
      msg.push(e.gold > 0 ? ('+' + e.gold + ' G') : (e.gold + ' G'));
      window.SFX.coin();
    }
    if (e.hp) {
      var d = Math.round(S.maxHp * e.hp);
      S.hp = Math.max(1, Math.min(S.maxHp, S.hp + d));
      msg.push('装甲 ' + (d > 0 ? '+' : '') + d);
      if (d > 0) window.SFX.repair(); else window.SFX.damage();
    }
    if (e.item) {
      var it = e.item === 'random' ? pick(D.items) : ITEM_BY_ID[e.item];
      if (it && addItem(it.id)) msg.push(it.name);
      else msg.push('持ち物がいっぱいで受け取れない');
    }
    if (e.part) {
      var got = pick(offerParts(S.map.cur.f, 3));
      var inst = newInst(got.id);
      S.parts.push(inst);
      autoPlace(inst);
      msg.push(got.name);
      window.SFX.coin();
    }
    if (e.sellStash) {
      var sum = 0;
      stashed().forEach(function (i) { sum += sellPrice(i); });
      var n = stashed().length;
      S.parts = S.parts.filter(function (i) { return i.x != null; });
      S.gold += sum;
      msg.push(n ? (n + '個を売って +' + sum + ' G') : '売るものがなかった');
      if (sum) window.SFX.coin();
    }
    if (e.openCell) {
      if (blockedCells().length) {
        /* どのマスを開けるかは選ばせる。戻り先はマップ */
        syncHp(); save(); refreshStatus();
        if (msg.length) toast(msg.join('　'));
        startPending('open', 0, 'rest');   // back:'rest' は「終わったらマップへ」の意味
        return;
      }
      msg.push('開けられるマスがなかった');
    }
    if (e.weightCut) {
      if (S.parts.length) {
        syncHp(); save(); refreshStatus();
        if (msg.length) toast(msg.join('　'));
        startPending('lighten', 0, 'rest');
        return;
      }
      msg.push('部品がなかった');
    }
    if (e.fight) {
      syncHp(); save();
      startBattle(e.fight, S.map.cur.f);
      return;
    }

    if (msg.length) toast(msg.join('　'));
    syncHp(); save(); refreshStatus();
    afterNode();
  }

  /* ==========================================================
     焚き火（休憩）
     ========================================================== */
  function renderRest() {
    var box = $('rest-menu');
    clear(box);
    var heal = Math.ceil(S.maxHp * 0.55);
    box.appendChild(serviceButton0('修理する', '装甲を ' + heal + ' 回復（最大 ' + S.maxHp + '）', function () {
      S.hp = Math.min(S.maxHp, S.hp + heal);
      window.SFX.repair(); toast('装甲を張り直した');
      save(); refreshStatus(); afterNode();
    }));
    box.appendChild(serviceButton0('部品を強化する', '選んだ部品を1段上げる', function () {
      startPending('upgrade', 0, 'rest');
    }));
    box.appendChild(serviceButton0('部品を削る', '選んだ部品の重さを 2 減らす', function () {
      startPending('lighten', 0, 'rest');
    }));
    box.appendChild(serviceButton0('積み替える', 'グリッドの配置だけ直して先へ進む', function () {
      pending = null; show('garage'); renderGarage();
    }));
  }
  function serviceButton0(title, note, onClick) {
    var b = el('button', 'ss-goods');
    var top = el('div', 'ss-goodstop');
    top.appendChild(el('b', null, title));
    b.appendChild(top);
    b.appendChild(el('div', 'ss-note', note));
    b.onclick = onClick;
    return b;
  }

  /* ==========================================================
     決着
     ========================================================== */
  /* ==========================================================
     負けた理由を言葉にする
     数字を並べるだけだと「なぜ負けたか」が分からず、次の一手が決まらない
     ========================================================== */
  function lossAdvice() {
    var L = S.lastLoss;
    if (!L) return [];
    var t = L.tally, out = [];
    var totalRaw = t.dealt + t.blocked;

    /* 1. 装甲に吸われた割合 */
    if (totalRaw > 0 && t.blocked / totalRaw >= 0.3) {
      out.push({
        k: '装甲に弾かれた',
        v: t.blocked + ' / ' + totalRaw + ' ダメージ',
        m: L.foe + ' の装甲は ' + L.armor + '。1発ごとに引かれるので、'
          + '威力の低い副砲では通らない。貫通のある武器か、重い一発を積む'
      });
    }
    /* 2. 弾切れ */
    if (t.dryT >= 3) {
      out.push({
        k: '撃てなかった時間',
        v: r1(t.dryT) + ' 秒',
        m: '弾が尽きて手が止まっていた。弾数無限の副砲を1門か、弾薬箱を武器の隣に置く'
      });
    }
    /* 3. 過積載 */
    if (L.over > 0) {
      out.push({
        k: '過積載',
        v: r1(L.over) + ' 超過（速度 ' + Math.round(L.spd * 100) + '%）',
        m: '重すぎて全体のリロードが遅くなっていた。軽量化するか、積む物を減らす'
      });
    }
    /* 4. 武器が少ない */
    if (L.guns <= 1) {
      out.push({
        k: '積んでいた武器',
        v: L.guns + ' 門',
        m: '手数が足りない。グリッドの空きに武器を足す'
      });
    }
    /* 5. 単純に火力不足（相手をほとんど削れていない） */
    if (!out.length || L.foeHp / L.foeMax > 0.5) {
      out.push({
        k: '削れた量',
        v: Math.round((1 - L.foeHp / L.foeMax) * 100) + '% しか削れていない',
        m: '火力が足りない。主砲かスペシャルを増やすか、照準装置を武器の隣に置いて底上げする'
      });
    }
    /* 6. 打たれ弱い */
    if (t.taken >= L.meMax * 0.9 && r1(t.elapsed) < 20) {
      out.push({
        k: '受けたダメージ',
        v: t.taken + '（' + r1(t.elapsed) + '秒で）',
        m: '短時間で溶けている。エンジンを足して装甲を増やすか、被弾軽減の高い車体を選ぶ'
      });
    }
    return out.slice(0, 3);
  }

  function endRun(win) {
    show('end');
    $('end-title').textContent = win ? 'クリア' : 'ゲームオーバー';
    $('end-text').textContent = win
      ? 'ゴルゴダは動かなくなった。荒野に、あんたより重い名前はもう残っていない。'
      : '砂に埋もれた。次はもっとまともな積み方をすることだ。';
    var box = $('end-result');
    clear(box);
    var oldDiag = document.querySelector('#sc-end .ss-diag');
    if (oldDiag) oldDiag.parentNode.removeChild(oldDiag);
    var b = build();
    [
      ['到達階層', (S.map.cur ? S.map.cur.f + 1 : 0) + ' / ' + D.run.floors],
      ['車体', chassis().name],
      ['積んでいた部品', placed().length + ' 個'],
      ['重量', r1(b.weight) + ' / ' + b.cap],
      ['所持金', S.gold + ' G']
    ].forEach(function (row) {
      var d = el('div');
      d.appendChild(el('i', null, row[0]));
      d.appendChild(el('b', null, String(row[1])));
      box.appendChild(d);
    });
    var adv = win ? [] : lossAdvice();
    if (adv.length) {
      var wrap = el('div', 'ss-diag');
      wrap.appendChild(el('h3', null, '何が足りなかったか'));
      adv.forEach(function (a2) {
        var row = el('div', 'ss-diag-row');
        var head = el('div', 'ss-diag-head');
        head.appendChild(el('b', null, a2.k));
        head.appendChild(el('span', null, a2.v));
        row.appendChild(head);
        row.appendChild(el('p', null, a2.m));
        wrap.appendChild(row);
      });
      box.parentNode.insertBefore(wrap, box.nextSibling);
    }

    if (win) {
      window.SFX.clear();
      META.stats.clears++;
      META.stats.clearedChassis[S.chassis] = true;
      if (!S.visitedShop) META.stats.shoplessClears++;
      saveMeta(); checkAchievements();
    }
    wipe();
  }

  /* ==========================================================
     走行の開始
     ========================================================== */
  function renderPick() {
    show('pick');
    var box = $('pick-list');
    clear(box);
    D.chassis.forEach(function (ch) {
      var b = el('button', 'ss-pick');
      var cv = document.createElement('canvas');
      var sp = window.ART.chassis(ch);
      cv.width = sp.width; cv.height = sp.height;
      cv.getContext('2d').drawImage(sp, 0, 0);
      b.appendChild(cv);
      b.appendChild(el('b', null, ch.name));
      b.appendChild(el('div', 'ss-picknums',
        ch.cols + '×' + ch.rows + 'マス　積載 ' + ch.cap + '　装甲 ' + ch.hp +
        '　被弾軽減 ' + ch.def + '　速度 ' + (ch.spd >= 0 ? '+' : '') + Math.round(ch.spd * 100) + '%'));
      b.appendChild(el('div', 'ss-picknote', ch.note));
      b.onclick = function () { startRun(ch.id); };
      box.appendChild(b);
    });
  }

  function startRun(chassisId) {
    uidSeq = 1;
    S = {
      chassis: chassisId,
      gold: D.run.startGold,
      hp: null, maxHp: null,
      parts: [],
      map: genMap(),
      shopStock: null,
      itemStock: null,
      visitedShop: false,
      items: [],
      opened: {},
      seenEvents: [],
      buff: null,
      repairCost: 55, upgCost: 90, lightCost: 75, openCost: 65
    };
    META.stats.runs = (META.stats.runs || 0) + 1;
    saveMeta();
    ['e_v6', 'm_76', 's_mg'].forEach(function (pid) {
      var inst = newInst(pid);
      S.parts.push(inst);
      autoPlace(inst);
    });
    S.maxHp = null;
    syncHp();
    window.SFX.select();
    save(); refreshStatus();
    show('garage'); renderGarage();
  }

  /* ==========================================================
     配線
     ========================================================== */
  function wire() {
    $('title-new').onclick = function () { window.SFX.unlock(); renderPick(); };
    $('title-continue').onclick = function () {
      window.SFX.unlock();
      syncHp(); refreshStatus();
      if (S.inBattle) { startBattle(S.inBattle.type, S.inBattle.floor); return; }
      show('map'); renderMap();
    };

    $('map-garage').onclick = function () { pending = null; show('garage'); renderGarage(); };

    $('garage-tut-close').onclick = function () { markTutSeen('garage'); $('garage-tut').hidden = true; };

    $('garage-done').onclick = function () {
      markTutSeen('garage');
      /* つかんだまま画面を出ると、ゴーストが他の画面に残る */
      if (held) { held.x = null; held.y = null; releaseGhost(); save(); }
      if (pending) { cancelPending(); return; }
      if (!S.map.cur) { show('map'); renderMap(); }
      else {
        var t = S.map.floors[S.map.cur.f][S.map.cur.i].type;
        if (t === 'shop') renderShop();
        else afterNode();
      }
    };

    $('battle-speed').onclick = function () {
      if (!B) return;
      B.speed = B.speed >= 4 ? 1 : B.speed * 2;
      $('battle-speed').textContent = '速度 x' + B.speed;
    };

    $('battle-next').onclick = function () {
      if (!B.win) { endRun(false); return; }
      if (B.type === 'boss') { endRun(true); return; }
      show('reward');
      renderReward(B.foe.gold, B.type === 'elite' ? 3 : 3);
    };

    $('reward-skip').onclick = function () { afterNode(); };
    $('shop-leave').onclick = function () { afterNode(); };
    $('end-again').onclick = function () { renderPick(); };

    $('title-codex').onclick = function () { window.SFX.unlock(); openCodex('title'); };
    $('end-codex').onclick = function () { openCodex('end'); };
    $('codex-close').onclick = function () { show(codexReturn); };
    document.querySelectorAll('#sc-codex .ss-tab').forEach(function (btn) {
      btn.onclick = function () {
        document.querySelectorAll('#sc-codex .ss-tab').forEach(function (t) { t.classList.remove('is-on'); });
        btn.classList.add('is-on');
        ['parts', 'enemies', 'ach'].forEach(function (t) { $('codex-' + t).hidden = (t !== btn.dataset.tab); });
      };
    });

    wireModal();
    setupGarageInput();
  }

  /* ==========================================================
     設定・あそびかた・記録のダイアログ
     ========================================================== */
  var confirmKind = null;      // 'run' | 'all'

  var modalOpener = null;      // 開く前にどこにいたか。閉じたら戻す

  function openModal(tab) {
    window.SFX.unlock();
    modalOpener = document.activeElement;
    syncOptUI();
    renderRecords();
    setModalTab(tab || 'opt');
    hideConfirm();
    $('modal').hidden = false;
    $('modal-close').focus();
  }
  function closeModal() {
    $('modal').hidden = true;
    hideConfirm();
    if (modalOpener && modalOpener.focus) modalOpener.focus();
    modalOpener = null;
  }
  function modalOpen() { return !$('modal').hidden; }

  function setModalTab(tab) {
    document.querySelectorAll('#modal .ss-tab').forEach(function (t) {
      t.classList.toggle('is-on', t.dataset.mtab === tab);
    });
    ['opt', 'help', 'rec'].forEach(function (t) { $('mtab-' + t).hidden = (t !== tab); });
  }

  function hideConfirm() { confirmKind = null; $('opt-confirm').hidden = true; }
  function askConfirm(kind, text) {
    confirmKind = kind;
    $('opt-confirm-text').textContent = text;
    $('opt-confirm').hidden = false;
  }

  /* 設定の値を画面に反映する */
  function syncOptUI() {
    $('opt-sfx').value = OPT.sfx;
    $('opt-sfx-v').textContent = OPT.sfx;
    $('opt-motion').checked = !OPT.motion;
    var note = $('opt-audio-note');
    if (MUTED) {
      note.hidden = false;
      note.textContent = '動作確認中（?debug=1）のため消音しています。設定値は保たれます。';
    } else {
      note.hidden = window.SFX.isUsable();
      note.textContent = 'この環境では音を鳴らせません。';
    }
    document.querySelectorAll('#opt-speed button').forEach(function (b) {
      b.classList.toggle('is-on', Number(b.dataset.sp) === OPT.speed);
    });
  }

  function renderRecords() {
    var s = META.stats;
    var box = $('rec-stats');
    clear(box);
    var partPct = Math.round(Object.keys(META.seenParts).length / D.parts.length * 100);
    var enemyPct = Math.round(Object.keys(META.seenEnemies).length / D.enemies.length * 100);
    [
      ['走った回数', (s.runs || 0), '回'],
      ['クリア', s.clears, '回'],
      ['最高到達', s.bestFloor, '階'],
      ['撃破した敵', s.battlesWon, '体'],
      ['最高所持金', s.maxGold, 'G'],
      ['実績', Object.keys(META.unlocked).length + ' / ' + ACHIEVEMENTS.length, ''],
      ['部品図鑑', partPct, '%'],
      ['敵図鑑', enemyPct, '%']
    ].forEach(function (row) {
      var d = el('div');
      d.appendChild(el('i', null, row[0]));
      var b = el('b', null, String(row[1]));
      if (row[2]) b.appendChild(el('span', null, row[2]));
      d.appendChild(b);
      box.appendChild(d);
    });
  }

  function wireModal() {
    $('open-opt').onclick = function () { openModal('opt'); };
    $('open-help').onclick = function () { openModal('help'); };
    $('modal-close').onclick = closeModal;
    /* 枠の外を触ったら閉じる。中を触ったときは閉じない */
    $('modal').addEventListener('pointerdown', function (ev) {
      if (ev.target === $('modal')) closeModal();
    });

    document.querySelectorAll('#modal .ss-tab').forEach(function (t) {
      t.onclick = function () { setModalTab(t.dataset.mtab); };
    });

    /* 開いている間は Tab がダイアログの外へ出ないようにする */
    $('modal').addEventListener('keydown', function (ev) {
      if (ev.key !== 'Tab') return;
      var f = [].slice.call($('modal').querySelectorAll(
        'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])'
      )).filter(function (n) { return n.offsetParent !== null && !n.disabled; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });

    $('opt-sfx').oninput = function () {
      OPT.sfx = Number(this.value);
      $('opt-sfx-v').textContent = OPT.sfx;
      applyVolume();
      saveOpt();
    };
    /* 動かした手応えが要る。離したときに一度鳴らす */
    $('opt-sfx').onchange = function () { window.SFX.select(); };

    document.querySelectorAll('#opt-speed button').forEach(function (b) {
      b.onclick = function () {
        OPT.speed = Number(b.dataset.sp);
        saveOpt(); syncOptUI();
        if (B && !B.over) { B.speed = OPT.speed; $('battle-speed').textContent = '速度 x' + B.speed; }
        window.SFX.select();
      };
    });

    $('opt-motion').onchange = function () {
      OPT.motion = !this.checked;
      applyOpt(); saveOpt();
    };

    $('opt-abandon').onclick = function () {
      askConfirm('run', 'いまの走行を捨ててタイトルに戻ります。よろしいですか？');
    };
    $('opt-wipe').onclick = function () {
      askConfirm('all', '図鑑・実績・設定を含めた全ての記録を消します。元に戻せません。');
    };
    $('opt-confirm-no').onclick = hideConfirm;
    $('opt-confirm-yes').onclick = function () {
      if (confirmKind === 'run') {
        stopLoop();
        wipe(); S = null; releaseGhost();
        $('title-continue').hidden = true;
        hideConfirm(); closeModal();
        show('title');
      } else if (confirmKind === 'all') {
        try {
          localStorage.removeItem(SAVE_KEY);
          localStorage.removeItem(META_KEY);
          localStorage.removeItem(OPT_KEY);
        } catch (e) { }
        location.reload();
      }
    };

    $('rec-codex').onclick = function () {
      var back = currentScreen();
      closeModal();
      openCodex(back === 'codex' ? 'title' : back);
    };
  }

  /* ==========================================================
     タイトルの手配書
     「何のために登るか」を一枚で見せる。最終ボスの絵と賞金だけ使う軽い枠組みで、
     シナリオは要らない（企画書どおり）
     ========================================================== */
  function renderTitleBounty() {
    var boss = D.enemies.filter(function (e) { return e.tier === 'boss'; })[0];
    if (!boss) return;
    var sp = window.ART.enemy(boss.art);
    var cv = $('bounty-art');
    cv.width = sp.width; cv.height = sp.height;
    cv.getContext('2d').drawImage(sp, 0, 0);
    $('bounty-name').textContent = boss.name;
    $('bounty-note').textContent =
      '賞金 ' + boss.gold + 'G　全' + D.run.floors + '階層の最深部に潜む。討伐して持ち帰れ。';
  }

  /* ==========================================================
     起動
     ========================================================== */
  wire();
  applyOpt();
  renderTitleBounty();
  var saved = load();
  if (saved) {
    S = saved;
    if (S.lightCost == null) S.lightCost = 75;
    if (S.visitedShop == null) S.visitedShop = false;
    if (!S.items) S.items = [];
    if (!S.opened) S.opened = {};
    if (S.openCost == null) S.openCost = 110;
    $('title-continue').hidden = false;
  }
  show('title');

  /* 動作確認用の入口。?debug=1 のときだけ生やす */
  if (/[?&]debug=1/.test(location.search)) {
    window.__garage = {
      state: function () { return S; },
      meta: function () { return META; },
      resetMeta: function () {
        META = { seenParts: {}, seenEnemies: {}, unlocked: {}, tut: {}, stats: { battlesWon: 0, clears: 0, bestFloor: 0, maxGold: 0, shoplessClears: 0, clearedChassis: {} } };
        saveMeta();
      },
      openCodex: openCodex,
      startEvent: startEvent,
      applyEvent: applyEvent,
      build: build,
      battle: function () { return B; },
      /* 画面を見ずに戦闘を進める。バランス確認用 */
      step: function (sec) {
        var n = Math.ceil(sec / 0.05);
        for (var i = 0; i < n && B && !B.over; i++) advance(0.05);
        updateBars(); updateGuns(); updateIntent();
        return B ? { me: Math.ceil(B.meHp), foe: Math.ceil(B.foeHp), over: B.over, win: B.win } : null;
      },
      simulate: function (type, floor, times) {
        var wins = 0, hpLeft = 0, secs = 0;
        for (var t = 0; t < times; t++) {
          var hp0 = S.hp;
          startBattle(type, floor);
          stopLoop();
          var s = 0;
          while (B && !B.over && s < 300) { advance(0.05); s += 0.05; }
          if (B && B.win) { wins++; hpLeft += B.meHp; }
          secs += s;
          S.hp = hp0;
        }
        return { win: wins + '/' + times, avgHpLeft: Math.round(hpLeft / Math.max(1, wins)), avgSec: r1(secs / times) };
      },
      startRun: startRun,
      enterNode: enterNode,
      renderMap: renderMap,
      renderGarage: renderGarage,
      give: function (pid) { var i = newInst(pid); S.parts.push(i); autoPlace(i); syncHp(); renderGarage(); },
      gold: function (n) { S.gold = n; refreshStatus(); },
      openNodes: openNodes,
      warpTo: function (type) {
        for (var f = 0; f < S.map.floors.length; f++) {
          for (var i = 0; i < S.map.floors[f].length; i++) {
            if (S.map.floors[f][i].type === type) { enterNode(f, i); return { f: f, i: i }; }
          }
        }
        return null;
      }
    };
  }
})();
