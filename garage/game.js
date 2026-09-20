/* ==========================================================
   荒野の車載工房（ベータ 0.7）

   企画書の方針
   - Slay the Spire のフロー（マップでノードを選んで登る）
   - backpack battles の配置（車体グリッドに部品を敷き詰める）
   - 戦闘はオート。プレイヤーは戦闘中に何もしない
   - 車体＝キャラ。重量制限が装備選択の制約になる

   ビルドなし。file:// でもそのまま動く。
   絵は art.js、音は sfx.js が実行時に作る。画像・音声ファイルは持たない。
   ========================================================== */
(function () {
  'use strict';

  var D = window.GAME_DATA;

  var TEST_MODE = false;
  /* dev:start */
  /* 自動テスト（_test.js, ?test=1）は本物の保存データを壊さないよう、
     別のキーを使い、そのキーだけを開始時に必ず空にする */
  TEST_MODE = /[?&]test=1/.test(location.search);
  if (TEST_MODE) {
    try {
      localStorage.removeItem('garage-run-v1-test');
      localStorage.removeItem('garage-meta-v1-test');
      localStorage.removeItem('garage-opt-v1-test');
    } catch (e) { /* 保存できない設定でも遊べるようにする */ }
  }
  /* dev:end */
  var SAVE_KEY = 'garage-run-v1' + (TEST_MODE ? '-test' : '');

  var PART_BY_ID = {};
  D.parts.forEach(function (p) { PART_BY_ID[p.id] = p; });
  var CHASSIS_BY_ID = {};
  D.chassis.forEach(function (c) { CHASSIS_BY_ID[c.id] = c; });
  var ITEM_BY_ID = {};
  (D.items || []).forEach(function (i) { ITEM_BY_ID[i.id] = i; });
  var MOD_BY_ID = {};
  (D.mods || []).forEach(function (m) { MOD_BY_ID[m.id] = m; });
  var ENEMY_BY_ID = {};
  D.enemies.forEach(function (e) { ENEMY_BY_ID[e.id] = e; });
  var ITEM_CAP = 5;                 // 持ち物の上限

  var KIND_LABEL = {
    engine: 'エンジン', cunit: 'Cユニット', main: '主砲',
    sub: '副砲', special: 'スペシャル', support: '補助'
  };
  var NODE_LABEL = {
    battle: '戦闘', elite: '賞金首', boss: 'ボス', rest: '焚き火', shop: '行商', event: '？'
  };
  var NODE_DESC = {
    battle: '出てくる相手はマップに出ている', elite: '手強い中ボス。勝てば改造を1つ選べる',
    boss: '最上階。倒せばクリア', rest: '装甲を回復か、部品を強化',
    shop: '部品の購入・強化・修理', event: '何が起きるかは入るまで分からない'
  };

  /* ==========================================================
     永続データ（図鑑・実績）
     ラン単体のセーブ（SAVE_KEY）とは別に持つ。リセットしても消えない。
     ========================================================== */
  var META_KEY = 'garage-meta-v1' + (TEST_MODE ? '-test' : '');

  function loadMeta() {
    try {
      var raw = localStorage.getItem(META_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 保存できない設定でも遊べるようにする */ }
    return {
      seenParts: {}, seenEnemies: {}, seenMods: {}, unlocked: {}, tut: {},
      stats: { battlesWon: 0, clears: 0, bestFloor: 0, maxGold: 0, shoplessClears: 0, clearedChassis: {} }
    };
  }
  var META = loadMeta();
  if (!META.tut) META.tut = {};   // 古いセーブ（tut を持たない）を引き継いだとき用
  if (!META.seenMods) META.seenMods = {};
  if (META.stats.runs == null) META.stats.runs = 0;

  /* ==========================================================
     設定
     音量・戦闘速度の初期値・演出の量。走行とは無関係なので別に持つ
     ========================================================== */
  var OPT_KEY = 'garage-opt-v1' + (TEST_MODE ? '-test' : '');

  function loadOpt() {
    var o = { sfx: 70, bgm: 30, speed: 1, motion: true };
    try {
      var raw = localStorage.getItem(OPT_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          if (typeof saved.sfx === 'number') o.sfx = saved.sfx;
          if (typeof saved.bgm === 'number') o.bgm = saved.bgm;
          if (saved.speed === 1 || saved.speed === 2 || saved.speed === 4) o.speed = saved.speed;
          if (typeof saved.motion === 'boolean') o.motion = saved.motion;
        }
      }
    } catch (e) { /* 保存できない設定でも遊べるようにする */ }
    return o;
  }
  var OPT = loadOpt();

  var DEBUG = false;
  /* dev:start */
  /* 動作確認中に音が鳴り続けると邪魔なので、?debug=1 のあいだは黙らせる。
     設定値そのものは触らない（保存も表示もいつもどおり）。出力だけ 0 にする */
  DEBUG = /[?&]debug=1/.test(location.search);
  /* dev:end */
  var MUTED = DEBUG;

  function saveOpt() {
    try { localStorage.setItem(OPT_KEY, JSON.stringify(OPT)); } catch (e) { }
  }
  /* 音量の反映はここ一箇所に通す。消音中でも設定値は保ったままにする */
  function applyVolume() {
    window.SFX.setVolume('sfx', MUTED ? 0 : OPT.sfx / 100);
    window.SFX.setVolume('bgm', MUTED ? 0 : OPT.bgm / 100);
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
  /* 切り札は「戦って見たものだけ」図鑑に出す。先に全部見せると予想外でなくなる */
  function markTrumpSeen(enemyId, trumpId) {
    if (!META.seenTrumps) META.seenTrumps = {};
    var k = enemyId + ':' + trumpId;
    if (META.seenTrumps[k]) return;
    META.seenTrumps[k] = true;
    saveMeta();
  }
  function trumpSeen(enemyId, trumpId) {
    return !!(META.seenTrumps && META.seenTrumps[enemyId + ':' + trumpId]);
  }

  function markModSeen(id) {
    if (!META.seenMods) META.seenMods = {};
    if (META.seenMods[id]) return;
    META.seenMods[id] = true;
    saveMeta(); checkAchievements();
  }

  /* 一度だけ出す案内を見たかどうか。実績とは違い達成度ではないので checkAchievements は呼ばない */
  function tutSeen(key) { return !!META.tut[key]; }
  function markTutSeen(key) {
    if (META.tut[key]) return;
    META.tut[key] = true;
    saveMeta();
  }

  /* ----------------------------------------------------------
     遊びの中で1度だけ出す案内

     以前は「覚えておくこと」をタイトルに5行、あそびかたに22見出し置いていた。
     仕組みを足すたびに文章が増え、読まない人には何も伝わらず、
     読む人には説明書になっていた。読ませるのをやめて、
     必要になった瞬間に1つだけ出す。

     条件と文面をこの表に集めてある。散らばると「同時に2つ出る」
     「戦闘の山場でダイアログが出る」といった事故が起きるため。
     at: garage / map … その画面の帯。log … 戦闘ログの1行（画面を止めない）

     **案内は減らす方向で維持する。** 説明が要るのは、行動の影響が
     その場で返っていない印。「弾（dry）」と「塞がったマス（blocked）」は
     盤を見れば分かるので案内を置かない。
     新しい仕組みを足すときも、まず**見せて分かるか**を試すこと。
     ---------------------------------------------------------- */
  var TIPS = {
    heat: {
      at: 'garage',
      text: '盤の色は熱です。赤いマスの武器は発射が遅くなります。武器どうしを離すか、あいだにエンジンや冷却器を挟んでください。'
    },
    map: {
      at: 'map',
      text: '線をたどって登る道を選びます。戦闘ノードには出てくる相手が描いてあるので、戦う前に相手を見て道を決められます。'
    },
    elite: {
      at: 'map',
      text: '賞金首が現れました。手強いかわりに、勝てば車そのものを作り替える「改造」を1つ選べます。走行中に2つまで。'
    },
    behavior: {
      at: 'log',
      text: '敵はそれぞれ違う戦い方をしてくる。何をしてくる相手かは、敵の名前の下に書いてある。'
    }
  };
  /* 同時に条件を満たしたときに、どれを先に出すか */
  var TIP_ORDER = ['heat', 'map', 'elite'];

  function tipKey(k) { return 'tip_' + k; }

  /* 戦闘ログに出すもの。1度きり。画面は止めない */
  function tipLog(k) {
    if (tutSeen(tipKey(k))) return false;
    markTutSeen(tipKey(k));
    logLine('sys is-tip', '◆ ' + TIPS[k].text);
    return true;
  }

  /* 帯で出すものを1つだけ選ぶ。条件を満たしていて、まだ閉じていないもの。
     同時にいくつ満たしても出すのは1つ。残りは次の機会に回る */
  function pickTip(at, cond) {
    for (var i = 0; i < TIP_ORDER.length; i++) {
      var k = TIP_ORDER[i];
      if (TIPS[k].at !== at) continue;
      if (!cond[k]) continue;
      if (tutSeen(tipKey(k))) continue;
      return k;
    }
    return null;
  }
  function renderTip(at, cond) {
    var box = $(at + '-tip');
    if (!box) return null;
    var k = cond ? pickTip(at, cond) : null;
    box.hidden = !k;
    if (!k) return null;
    $(at + '-tip-text').textContent = TIPS[k].text;
    box.dataset.tip = k;
    return k;
  }
  function closeTip(at) {
    var box = $(at + '-tip');
    if (!box || box.hidden) return;
    if (box.dataset.tip) markTutSeen(tipKey(box.dataset.tip));
    box.hidden = true;
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
    var v = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell'), 10) || 40;
    /* 盤を大きくしたら、重戦車（5列）が列からはみ出して
       ページ全体に横スクロールが出た。入る大きさまで落とす。
       ドラッグの当たり判定もこの値を使うので、描画と必ず同じ数を返すこと */
    var g = $('grid');
    var host = g && g.parentNode;
    var avail = host ? host.clientWidth : 0;
    var cols = (S && S.chassis && CHASSIS_BY_ID[S.chassis]) ? CHASSIS_BY_ID[S.chassis].cols : 4;
    if (avail > 40 && cols > 0) v = Math.max(24, Math.min(v, Math.floor(avail / cols)));
    return v;
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
     改造

     賞金首の報酬。車そのものへの恒久変更で、マスを使わない。
     効果はここで1つに合算して、build() と heatMap() が読む。
     ========================================================== */
  function modSum() {
    var out = {
      hp: 0, def: 0, spd: 0, cellCool: 0,
      ammoFlat: 0, ammoPct: 0, healPct: 0, openAll: false
    };
    if (!S || !S.mods) return out;
    S.mods.forEach(function (id) {
      var m = MOD_BY_ID[id];
      if (!m) return;
      Object.keys(m.effect).forEach(function (k) {
        if (k === 'openAll') out.openAll = out.openAll || !!m.effect[k];
        else if (out[k] != null) out[k] += m.effect[k];
      });
    });
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
      heat: s.heat || 0,
      /* 冷却器は強化すると排熱が伸びる */
      cool: p.cool ? p.cool + D.heat.perLevel * k : 0,
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
    if (modSum().openAll) return false;   // 拡張ベイ
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

  /* 落とした先で邪魔をしている部品を全部返す。
     盤からはみ出す・塞がったマスに掛かる場合は null（どうやっても置けない）。
     空配列なら canPlace と同じ意味＝そのまま置ける */
  function blockersAt(inst, gx, gy, occ) {
    var ch = chassis(), cells = instCells(inst), seen = {}, list = [];
    for (var i = 0; i < cells.length; i++) {
      var x = gx + cells[i][0], y = gy + cells[i][1];
      if (x < 0 || y < 0 || x >= ch.cols || y >= ch.rows) return null;
      if (isBlocked(x, y)) return null;
      var o = occ[x + ',' + y];
      if (o && !seen[o.uid]) { seen[o.uid] = true; list.push(o); }
    }
    return list;
  }

  /* 置ける場所のうち、車がいちばん強くなる場所を選ぶ。
     同点なら左上から先に埋める（効果が関係ない部品は今までどおりの並びになる） */
  function autoPlace(inst) {
    var ch = chassis(), occ = occupancy(inst.uid);
    var rot0 = inst.rot, best = null;
    for (var rot = 0; rot < 4; rot++) {
      inst.rot = rot;
      for (var y = 0; y < ch.rows; y++) {
        for (var x = 0; x < ch.cols; x++) {
          if (!canPlace(inst, x, y, occ)) continue;
          inst.x = x; inst.y = y;
          var score = placementScore();
          if (best == null || score > best.score + 0.0001) {
            best = { rot: rot, x: x, y: y, score: score };
          }
        }
      }
    }
    inst.x = null; inst.y = null;
    inst.rot = rot0;
    if (!best) return false;
    inst.rot = best.rot; inst.x = best.x; inst.y = best.y;
    return true;
  }

  /* 置き方の採点。大きいほど良い。
     熱だけを見ていたころは、照準装置も弾薬箱も武器に接しない場所へ置かれていて、
     補助部品の効果をまるごと捨てていた。
     毎秒火力は威力・リロード・熱をまとめて反映するので、これを主に見る。
     弾は火力に出ないぶん、同点のときの決め手として足す */
  function placementScore() {
    var b = build(), dps = 0, ammo = 0;
    b.weapons.forEach(function (w) {
      dps += w.dmg / w.reload;
      if (w.ammo != null) ammo += w.ammo;
    });
    return dps * 100 + ammo;
  }

  /* ==========================================================
     積み替えの提案

     走行を75本（車体3種×25本）測ったところ、戦利品の22〜51%が倉庫行きになり、
     その多くは「盤の1個を降ろせば載る」ものだった。降ろす相手はたいてい
     初期装備で、積み替えると毎秒火力が2〜3割伸びる。
     それが一度も画面に出ていなかったので、ここで計算して見せる。

     **自動では積み替えない。** できることと、どう変わるかを出すだけ。
     置き方を決めるのがこのゲームの中身なので、そこは奪わない。
     ========================================================== */

  /* そのまま空きマスに入るか。autoPlace と違って盤を動かさない */
  function fitsAsIs(inst) {
    var ch = chassis(), occ = occupancy(inst.uid), rot0 = inst.rot, hit = false;
    for (var rot = 0; rot < 4 && !hit; rot++) {
      inst.rot = rot;
      for (var y = 0; y < ch.rows && !hit; y++) {
        for (var x = 0; x < ch.cols; x++) {
          var bl = blockersAt(inst, x, y, occ);
          if (bl && !bl.length) { hit = true; break; }
        }
      }
    }
    inst.rot = rot0;
    return hit;
  }

  /* 盤から1個だけ降ろせば載るか。**形だけ**を見る（強さは測らない）。
     倉庫の全部に対して毎回走るので、build() を呼ぶ重い計算は入れない */
  function canSwapIn(inst) {
    var ch = chassis(), occ = occupancy(inst.uid), rot0 = inst.rot, hit = false;
    for (var rot = 0; rot < 4 && !hit; rot++) {
      inst.rot = rot;
      for (var y = 0; y < ch.rows && !hit; y++) {
        for (var x = 0; x < ch.cols; x++) {
          var bl = blockersAt(inst, x, y, occ);
          if (bl && bl.length === 1) { hit = true; break; }
        }
      }
    }
    inst.rot = rot0;
    return hit;
  }

  /* いまの車の要点。積み替えの前後を比べて見せるために使う */
  function snapshot() {
    var b = build(), dps = 0;
    b.weapons.forEach(function (w) { dps += w.dmg / w.reload; });
    return { dps: dps, hp: b.maxHp, over: b.over, guns: b.weapons.length };
  }

  /* 「どれを降ろすか」を選ぶための、車ぜんたいの良さ。

     placementScore（毎秒火力＋弾）は "同じ部品をどこへ置くか" の基準で、
     装甲を見ていない。降ろす相手を選ぶのにそのまま使うと、火力を持たない
     エンジンばかり降ろす提案になる（実測で 火力 30.6→38.4 の裏で 装甲 128→88）。
     ここでは装甲も込みで測る。

     火力と装甲は単位が違うので、戦闘の長さを物差しにする。
     実測は雑魚 7〜12秒・賞金首 18〜22秒・ボス 25秒なので、20秒を使う。
     「毎秒火力1」＝「20秒で通す20ダメージ」と「装甲20点」を釣り合わせる */
  function carScore() {
    var b = build(), dps = 0, ammo = 0;
    b.weapons.forEach(function (w) {
      dps += w.dmg / w.reload;
      if (w.ammo != null) ammo += w.ammo;
    });
    return dps * 20 + b.maxHp + ammo * 0.25;
  }

  /* 盤の1個と引き換えに載せる。いちばん車が強くなる組み合わせを返す。
     計算量は 盤の部品数 × マス数 × 回転4 × build()。重いので、
     倉庫ぜんぶに対してではなく「1個について聞かれたとき」だけ呼ぶ
     （形だけ見る canSwapIn のほうは倉庫ぜんぶに回してよい） */
  function swapPlan(inst) {
    if (inst.x != null) return null;
    var before = snapshot(), base = carScore();
    var onBoard = placed(), rot0 = inst.rot, best = null;
    for (var i = 0; i < onBoard.length; i++) {
      var a = onBoard[i], ax = a.x, ay = a.y;
      a.x = null; a.y = null;
      if (autoPlace(inst)) {
        var sc = carScore();
        if (best == null || sc > best.score) {
          best = { drop: a, score: sc, after: snapshot(), x: inst.x, y: inst.y, rot: inst.rot };
        }
      }
      inst.x = null; inst.y = null; inst.rot = rot0;
      a.x = ax; a.y = ay;
    }
    if (!best) return null;
    return {
      drop: best.drop, at: { x: best.x, y: best.y, rot: best.rot },
      before: before, after: best.after, gain: best.score - base
    };
  }

  /* 提案を実際に行う。降ろした部品は倉庫へ */
  function applySwap(inst, plan) {
    plan.drop.x = null; plan.drop.y = null;
    inst.rot = plan.at.rot; inst.x = plan.at.x; inst.y = plan.at.y;
  }

  /* 入れ替えると何がどう動くか。火力が上がって装甲が落ちる形が多いので、
     ひとまとめの文字列にせず、項目ごとに良し悪しを付けて出す */
  function swapDeltas(plan) {
    var out = [];
    function add(label, a, b, upIsGood) {
      if (a === b) return;
      out.push({ t: label + ' ' + a + ' → ' + b, good: upIsGood ? b > a : b < a });
    }
    add('毎秒火力', r1(plan.before.dps), r1(plan.after.dps), true);
    add('装甲', plan.before.hp, plan.after.hp, true);
    if (plan.after.over > 0 && !plan.before.over) out.push({ t: '過積載になる', good: false });
    if (!out.length) out.push({ t: '性能は変わらない', good: null });
    return out;
  }
  /* 増減の札。good が null のときは「良くも悪くもない」 */
  function deltaChip(d) {
    return el('em', d.good == null ? 'is-flat' : d.good ? 'is-up' : 'is-down', d.t);
  }

  /* まだ S.parts に入っていない部品（戦利品のカードなど）を調べる。
     build() は S.parts を見るので、混ぜずに測ると効果が反映されない */
  function withTempPart(pid, fn) {
    var tmp = { uid: 'tmp', pid: pid, lvl: 1, wcut: 0, rot: 0, x: null, y: null };
    S.parts.push(tmp);
    try { return fn(tmp); }
    finally {
      var i = S.parts.indexOf(tmp);
      if (i >= 0) S.parts.splice(i, 1);
    }
  }

  /* 買う・もらう前に「いまの車にどう載るか」を出すための一行 */
  function fitInfo(pid) {
    if (!S || !S.chassis) return null;
    return withTempPart(pid, function (tmp) {
      if (fitsAsIs(tmp)) return { kind: 'fit', text: 'いまの車にそのまま載る' };
      var plan = swapPlan(tmp);
      if (!plan) return { kind: 'no', text: 'いまの車には載らない（1個降ろしても入らない）' };
      /* 同じ部品を持っているときなど、入れ替えても何も変わらない案が出る。
         それを「○○を降ろせば載る」と書くと勧めているように読めるので分ける */
      if (plan.gain <= 0) {
        return {
          kind: 'swapdown',
          text: '空きが無い。' + PART_BY_ID[plan.drop.pid].name + ' と入れ替えられるが、強くはならない',
          deltas: swapDeltas(plan)
        };
      }
      return {
        kind: 'swap',
        text: PART_BY_ID[plan.drop.pid].name + ' を降ろせば載る',
        deltas: swapDeltas(plan)
      };
    });
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

  /* ----------------------------------------------------------
     効いている組み合わせ

     熱はマスの色で盤に描く。隣接（どの補助がどの武器に効いているか）は線で描く。

     **どの補助が効いているかも、補助の側が効いているかも、盤の上で分かること。**
     自動配置に任せても、どの武器にも効いていない補助は出る。
     2門に効いている補助と1門にも効いていない補助を、同じ見た目にしない。
     ---------------------------------------------------------- */

  /* 補助部品が効く相手になりうるか（弾薬箱・照準装置＝武器を強化するもの） */
  function isHelper(inst) { return !!eff(inst).aura; }

  /* [{ from: 補助, to: 武器 }] を全部返す。auraFor は武器1つぶんの合計しか持たず、
     「どの補助が、どの武器に」までは分からないので、ここで組み合わせを作る */
  function auraLinks() {
    var out = [];
    var ps = placed();
    var weapons = ps.filter(function (i) { return isWeapon(PART_BY_ID[i.pid].kind); });
    var helpers = ps.filter(isHelper);
    weapons.forEach(function (w) {
      helpers.forEach(function (h) {
        if (h.uid !== w.uid && touching(w, h)) out.push({ from: h, to: w });
      });
    });
    return out;
  }

  /* 補助部品（冷却器を含む）が、隣の武器に届いているか。
     届いていないものは盤の上で無言のまま死んでいた */
  function helperWorking(inst) {
    var e = eff(inst);
    if (!e.aura && !e.cool) return null;   // 補助ではない
    var n = 0;
    placed().forEach(function (i) {
      if (i.uid === inst.uid) return;
      if (!isWeapon(PART_BY_ID[i.pid].kind)) return;
      if (touching(i, inst)) n++;
    });
    return n;
  }

  /* 接している辺を1つ見つけて、そこを跨ぐ短い線の両端を返す。
     部品の中心どうしを結ぶと盤が線だらけになるので、
     「触れている辺に留め具を打つ」形にする */
  function linkMark(h, w, cell) {
    var hc = {};
    instCells(h).forEach(function (c) { hc[(h.x + c[0]) + ',' + (h.y + c[1])] = true; });
    var hit = null;
    instCells(w).forEach(function (c) {
      if (hit) return;
      var x = w.x + c[0], y = w.y + c[1];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        if (hit) return;
        if (hc[(x + d[0]) + ',' + (y + d[1])]) hit = { x: x, y: y, d: d };
      });
    });
    if (!hit) return null;
    var ex = (hit.x + 0.5 + hit.d[0] * 0.5) * cell;
    var ey = (hit.y + 0.5 + hit.d[1] * 0.5) * cell;
    var len = cell * 0.26;
    return { x1: ex - hit.d[0] * len, y1: ey - hit.d[1] * len,
             x2: ex + hit.d[0] * len, y2: ey + hit.d[1] * len, cx: ex, cy: ey };
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
     熱

     武器は自分の乗っているマス全部に熱を出す（毎秒 heat/リロード）。
     マスは「基本 + 外気に触れている辺 + 隣の冷却器」のぶんだけ熱を捨てる。
     捨てきれない量（net）が、そのマスに乗っている武器のリロードを伸ばす。

     この作りで何が起きるか
     - 強い武器ほど熱いので、主砲を固めると隣同士で熱を回し合って共倒れする
     - 外周のマスは外気で冷えるが、内側はこもる。大きい車体ほど内側が多い
     - 塞がったマスは穴＝通気口として働く。開けると置ける代わりに排熱が減る
     - 武器でない部品（エンジン等）は熱を出さないので、武器の間の壁になる
     ========================================================== */
  var NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function heatMap() {
    var H = D.heat, ch = chassis(), md = modSum();
    var own = {}, cool = {}, uid = {}, x, y, key;

    /* 素の排熱。外へ face している辺の数だけ上がる
       （車体の外側と、まだ塞がっているマスは「外気」として数える） */
    for (y = 0; y < ch.rows; y++) {
      for (x = 0; x < ch.cols; x++) {
        if (isBlocked(x, y)) continue;
        key = x + ',' + y;
        var open = 0;
        for (var d = 0; d < NB.length; d++) {
          var nx = x + NB[d][0], ny = y + NB[d][1];
          if (nx < 0 || ny < 0 || nx >= ch.cols || ny >= ch.rows || isBlocked(nx, ny)) open++;
        }
        cool[key] = H.cellBase + (ch.cool || 0) + md.cellCool + H.openSide * open;
        own[key] = 0;
      }
    }

    /* 武器の発熱と、冷却器の排熱を配る */
    placed().forEach(function (inst) {
      var e = eff(inst);
      var cells = instCells(inst).map(function (c) {
        return (inst.x + c[0]) + ',' + (inst.y + c[1]);
      });
      if (e.heat && e.reload) {
        /* 発熱は武器の性質だけで決まる。車体速度は混ぜない
           （速い車体ほど熱いことにすると、速さが持ち味のジープだけ
           二重に損をするうえ、なぜ熱いのかが画面から読み取れなくなる） */
        var perSec = e.heat / e.reload;
        cells.forEach(function (k) {
          if (own[k] == null) return;
          own[k] += perSec;
          uid[k] = inst.uid;
        });
      }
      if (e.cool) {
        var given = {};
        cells.forEach(function (k) {
          var p = k.split(',');
          NB.forEach(function (dd) {
            var nk = (Number(p[0]) + dd[0]) + ',' + (Number(p[1]) + dd[1]);
            /* 同じマスへ二重に配らない */
            if (cool[nk] == null || given[nk]) return;
            given[nk] = true;
            cool[nk] += e.cool;
          });
        });
      }
    });

    /* 隣のマスの熱が回り込む。これが武器どうしの反発になる。
       同じ武器の自分のマスからは回り込ませない（大きい武器が自分の大きさで
       損をするだけになり、「隣に何を置くか」という判断が薄れるため） */
    var load = {}, net = {};
    Object.keys(own).forEach(function (k) {
      var p = k.split(','), v = own[k];
      NB.forEach(function (d) {
        var nk = (Number(p[0]) + d[0]) + ',' + (Number(p[1]) + d[1]);
        if (!own[nk] || (uid[k] && uid[nk] === uid[k])) return;
        v += H.spill * own[nk];
      });
      load[k] = v;
      net[k] = v - cool[k];
    });
    return { own: own, cool: cool, load: load, net: net };
  }

  /* 武器の熱は、乗っているマスのうち一番苦しいマスで決まる */
  function weaponHeat(inst, map) {
    var H = D.heat, worst = null;
    instCells(inst).forEach(function (c) {
      var k = (inst.x + c[0]) + ',' + (inst.y + c[1]);
      if (map.net[k] == null) return;
      if (worst == null || map.net[k] > worst) worst = map.net[k];
    });
    if (worst == null) worst = 0;
    var over = Math.max(0, worst - H.softAt);
    return {
      net: worst,
      tier: worst > H.hardAt ? 'hot' : (worst > H.softAt ? 'warm' : ''),
      mult: 1 + Math.min(H.slowMax, over * H.slowPer)
    };
  }

  /* ==========================================================
     組み上がった車の性能
     ========================================================== */
  function build() {
    var ch = chassis(), md = modSum();
    /* 改造は車体の素の数値に足し引きする。装甲と被弾軽減は0未満にしない */
    var b = {
      maxHp: ch.hp + md.hp, cap: ch.cap, weight: 0,
      spd: 1 + ch.spd + md.spd,
      def: Math.max(0, ch.def + md.def), weapons: [], over: 0, mod: md
    };
    placed().forEach(function (i) {
      var e = eff(i);
      b.weight += e.weight;
      b.maxHp += e.hp;
      b.cap += e.cap;
      b.spd += e.spd;
    });
    b.maxHp = Math.max(1, b.maxHp);
    b.over = Math.max(0, b.weight - b.cap);
    /* 過積載は速度で払う。1超過につき5%、下限は25% */
    b.spd = Math.max(0.25, b.spd - b.over * 0.05);

    b.heat = heatMap();
    placed().forEach(function (i) {
      var e = eff(i);
      if (!isWeapon(e.kind)) return;
      var a = auraFor(i);
      var h = weaponHeat(i, b.heat);
      b.weapons.push({
        uid: i.uid, name: e.name, kind: e.kind,
        dmg: Math.round(e.dmg * (1 + a.dmgPct)),
        /* 弾の改造は弾数のある武器だけ。弾無限の副砲には効かない */
        ammo: e.ammo == null ? null
          : Math.round((e.ammo + a.ammo + md.ammoFlat + (ch.ammo || 0)) * (1 + md.ammoPct)),
        /* 熱で伸びたぶんはここで効く。整備画面の予測と戦闘で同じ数字になる */
        reload: Math.max(0.15, e.reload * (1 + a.reload) / b.spd * h.mult),
        pierce: e.pierce,
        aura: a,
        heatNet: h.net, heatTier: h.tier, heatMult: h.mult
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
  function rollNodeType() {
    var r = Math.random();
    if (r < 0.16) return 'shop';
    if (r < 0.34) return 'rest';
    if (r < 0.52) return 'event';
    return 'battle';
  }

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

    for (var f2 = 2; f2 <= N - 3; f2++) {
      floors[f2].forEach(function (n) { n.type = rollNodeType(); });
    }
    /* 中ボスを置く階 */
    D.run.eliteFloors.forEach(function (fl) {
      var f3 = Math.min(N - 3, fl - 1);
      if (f3 < 1) return;
      floors[f3][rint(floors[f3].length)].type = 'elite';
    });

    /* 枝。近い位置どうしをつなぐ。
       **行き先が複数ある階では、必ず2つ以上へ分岐させる。**
       一本道は「選んでいる」ように見えて選択ではないため */
    var edges = [];
    for (var f4 = 0; f4 < N - 1; f4++) {
      var a = floors[f4].length, b = floors[f4 + 1].length;
      var e = [];
      for (var i2 = 0; i2 < a; i2++) {
        var set = {};
        if (b === 1) {
          set[0] = true;                       // 最上階（ボス）へは1本しかない
        } else {
          var j = a === 1 ? Math.floor(b / 2) : Math.round(i2 * (b - 1) / (a - 1));
          set[j] = true;
          var cands = [];
          if (j - 1 >= 0) cands.push(j - 1);
          if (j + 1 < b) cands.push(j + 1);
          set[pick(cands)] = true;             // 2本目は必ず作る
          if (cands.length > 1 && Math.random() < 0.3) {
            cands.forEach(function (c) { set[c] = true; });
          }
        }
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

    /* 戦う相手をここで決めておく。マップ上で先に見せるため
       （入ってから抽選すると「見えていたもの」と違う敵が出る）。

       **種類の入れ替えはしない。** 一度は「分岐の行き先が全部同じ種類なら
       片方を別の種類に変える」ようにしたが、そうすると
       **どの分岐にも必ず戦闘以外の逃げ道ができて、戦闘を避けて登れてしまった**
       （欲張りに避ける進み方で 1走行の戦闘が 4.2回 → 1.0回）。
       敵をマップに出すようにした以上、「戦闘か戦闘か」はもう同じ選択ではない。
       固い相手と手数の多い相手のどちらを受けるか、という中身のある分岐になる。
       なので同じ階の敵だけ、なるべく違う相手にする */
    floors.forEach(function (row, f6) {
      var used = {};
      row.forEach(function (n) {
        if (n.type !== 'battle' && n.type !== 'elite' && n.type !== 'boss') return;
        var id = pickEnemy(n.type, f6).id;
        for (var k = 0; k < 6 && used[id]; k++) id = pickEnemy(n.type, f6).id;
        used[id] = true;
        n.foe = id;
      });
    });

    return { floors: floors, edges: edges, cur: null, floor: 0, cleared: [] };
  }

  /* いま居るところから、まだ辿り着ける場所 */
  function reachable(m) {
    var seen = {}, stack = [];
    if (!m.cur) m.floors[0].forEach(function (_, i) { stack.push({ f: 0, i: i }); });
    else stack.push({ f: m.cur.f, i: m.cur.i });
    stack.forEach(function (n) { seen[n.f + ':' + n.i] = true; });
    while (stack.length) {
      var n = stack.pop();
      if (n.f >= m.edges.length) continue;
      (m.edges[n.f][n.i] || []).forEach(function (j) {
        var k = (n.f + 1) + ':' + j;
        if (seen[k]) return;
        seen[k] = true;
        stack.push({ f: n.f + 1, i: j });
      });
    }
    return seen;
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
  var SCREENS = ['title', 'pick', 'map', 'garage', 'battle', 'reward', 'mod', 'shop', 'rest', 'event', 'end', 'codex'];
  function show(name) {
    SCREENS.forEach(function (s) { $('sc-' + s).hidden = (s !== name); });
    $('status').hidden = (name === 'title' || name === 'pick' || name === 'codex');
    /* 戦闘に入るときは startBattle 側で fight / boss に上書きする */
    if (name !== 'battle') window.SFX.bgmMood('calm');
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
    renderModBadges();
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
        /* 熱の予測で色づけする */
        var hk = x + ',' + y, hn = b.heat.net[hk];
        if (hn != null) {
          if (hn > D.heat.hardAt) c.classList.add('is-hot');
          else if (hn > D.heat.softAt) c.classList.add('is-warm');
          else if (hn <= -1) c.classList.add('is-cold');
          c.title = '発熱 ' + r1(b.heat.load[hk]) + ' / 排熱 ' + r1(b.heat.cool[hk]) +
            (hn > 0 ? '　→ 捨てきれない ' + r1(hn) : '　→ 余裕 ' + r1(-hn));
        }
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
    /* 効いている隣接を盤に描く。部品より下に敷いて、絵を隠さない */
    grid.appendChild(auraLayer(cell));

    placed().forEach(function (inst) {
      var node = makeItemNode(inst, cell, b.heat);
      node.style.left = (inst.x * cell) + 'px';
      node.style.top = (inst.y * cell) + 'px';
      grid.appendChild(node);
    });

    renderBag();

    /* --- 倉庫 --- */
    var stash = $('stash');
    clear(stash);
    var st = stashed();
    /* 倉庫は画面の下のほうにあって「N 個」としか出ていなかった。
       走行の後半、そこに眠っている部品と入れ替えるだけで毎秒火力が2〜3割伸びる。
       何個が載せられるのかを見出しに出す */
    var swapNum = st.filter(function (i) { return canSwapIn(i); }).length;
    var sc = $('stash-count');
    sc.textContent = st.length + ' 個' + (swapNum ? '（うち ' + swapNum + ' 個は入れ替えれば載る）' : '');
    sc.classList.toggle('is-swap', swapNum > 0);
    stash.classList.toggle('is-empty', !st.length);
    if (!st.length) stash.appendChild(el('p', 'ss-stash-empty', '空。戦利品はここに入る。'));
    st.forEach(function (inst) { stash.appendChild(makeItemNode(inst, STASH_CELL)); });

    /* --- 合計 --- */
    var sum = $('grid-summary');
    clear(sum);
    var dps = 0;
    b.weapons.forEach(function (wp) { dps += wp.dmg / wp.reload; });
    var hotGuns = b.weapons.filter(function (wp) { return wp.heatTier; });
    [
      ['装甲（体力）', S.hp + ' / ' + b.maxHp],
      ['積載', r1(b.weight) + ' / ' + b.cap + (b.over > 0 ? '（超過 ' + r1(b.over) + '）' : '')],
      ['速度', Math.round(b.spd * 100) + '%'],
      ['被弾軽減', b.def],
      ['使えるマス', usableCells() + ' / ' + (chassis().cols * chassis().rows)],
      ['武器', b.weapons.length + ' 門'],
      ['熱', hotGuns.length ? hotGuns.length + ' 門が過熱ぎみ' : '問題なし'],
      ['弾が尽きるまで', dryLabel(b)],
      ['目安 毎秒火力', r1(dps)]
    ].forEach(function (row) {
      var d = el('div');
      d.appendChild(el('i', null, row[0]));
      var v = el('b', null, String(row[1]));
      if (row[0] === '熱' && hotGuns.length) v.classList.add('is-hotnum');
      d.appendChild(v);
      sum.appendChild(d);
    });

    /* どの武器が、どれだけ遅くなっているかを名指しで出す。
       盤が赤いだけでは「何をどうすればいいか」まで伝わらない */
    var warn = $('grid-heatwarn');
    clear(warn);
    warn.hidden = !hotGuns.length;
    if (hotGuns.length) {
      warn.appendChild(el('b', null, '熱がこもっています'));
      hotGuns.forEach(function (wp) {
        warn.appendChild(el('p', null,
          wp.name + '：発射間隔が ' + Math.round((wp.heatMult - 1) * 100) + '% 伸びています'));
      });
      warn.appendChild(el('p', 'ss-heatwarn-tip',
        '武器どうしを離すか、あいだにエンジンを挟むか、冷却器を隣に置く。' +
        '青いマス（外周や穴のそば）は熱がよく逃げます。'));
    }

    /* --- 遊びの中で1つだけ教える ---
       最初の案内（garage-tut）や部品選択中と重ねない。同時に出すと読まれない。
       塞がったマスの案内は、車体選択で盤の形と「◯マス使える」を出したので消した */
    var hasHeat = false;
    for (var hk2 in b.heat.net) { if (b.heat.net[hk2] > D.heat.softAt) { hasHeat = true; break; } }
    renderTip('garage', (pending || !$('garage-tut').hidden) ? null : { heat: hasHeat });

    renderDetail();
  }

  /* 弾数のある武器が何秒もつか。長い戦いでは必ず尽きるので、
     戦う前に分かっていないと構成を組めない（熱を色で見せるのと同じ理由） */
  function dryTime(w) {
    return w.ammo == null ? null : w.ammo * w.reload;
  }
  function firstDry(b) {
    var min = null;
    b.weapons.forEach(function (w) {
      var t = dryTime(w);
      if (t == null) return;
      if (min == null || t < min.t) min = { t: t, name: w.name };
    });
    return min;
  }
  function dryLabel(b) {
    var d = firstDry(b);
    if (!d) return '弾切れなし';
    return '約' + Math.round(d.t) + '秒（' + d.name + '）';
  }

  function makeItemNode(inst, cell, heat) {
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
    /* 武器／補助／機関を絵で見分けられるようにする。
       色つきの四角が並んでいるだけでは、どれが何なのか分からなかった */
    node.classList.add('is-kind-' + PART_BY_ID[inst.pid].kind);

    if (inst.x != null && isWeapon(PART_BY_ID[inst.pid].kind)) {
      var a = auraFor(inst);
      if (a.list.length) {
        /* ★の数だけでは「何が効いているか」が分からない。中身を持たせる */
        var lk = el('span', 'ss-linked', '★' + a.list.length);
        lk.title = '効いている補助：' + a.list.join('・');
        node.appendChild(lk);
      }
      /* 過熱している武器は盤の上で一目で分かるようにする */
      if (heat) {
        var hw = weaponHeat(inst, heat);
        if (hw.tier) {
          /* マスの色は部品の絵で隠れてしまうので、部品自体にも枠を出す */
          node.classList.add('is-' + hw.tier);
          node.appendChild(el('span', 'ss-heatmark is-' + hw.tier, '熱'));
        }
      }
    }
    /* 補助部品が隣の武器に届いているか。届いていないものは、
       いままで盤の上で無言のまま死んでいた（自動配置でも3〜4割） */
    if (inst.x != null) {
      var hw = helperWorking(inst);
      if (hw === 0) {
        node.classList.add('is-idle');
        var idle = el('span', 'ss-idle', '効いていない');
        idle.title = '隣に武器がないので、この部品は何も強化していない';
        node.appendChild(idle);
      } else if (hw > 0) {
        node.classList.add('is-helping');
      }
    }

    /* 倉庫で眠っているが、盤の1個と入れ替えれば載るもの。
       印が無いと、下までスクロールしても「置けない部品の山」にしか見えない */
    if (inst.x == null && canSwapIn(inst)) {
      node.classList.add('is-swappable');
      node.appendChild(el('span', 'ss-swapmark', '替'));
    }
    node.title = PART_BY_ID[inst.pid].name;
    return node;
  }

  /* ==========================================================
     盤を描く（読むだけ・操作なし）

     プレイヤーがこのゲームで作るものは盤そのもの。
     ところが戦闘画面には盤が無く、武器名のリストになっていた。
     「自分が置いたものが、こう働いた」が文字でしか返ってこない状態だったので、
     整備画面の外でも同じ絵で見せる。

     整備画面の #grid とは分けてある。あちらはドラッグの当たり判定・pending 状態・
     キーボード操作を抱えていて、使い回すと壊れやすい。
     ========================================================== */
  function staticGrid(ch, insts, cell, heat, blockedFn) {
    var wrap = el('div', 'ss-sgrid');
    wrap.style.width = (ch.cols * cell) + 'px';
    wrap.style.height = (ch.rows * cell) + 'px';
    for (var y = 0; y < ch.rows; y++) {
      for (var x = 0; x < ch.cols; x++) {
        var c = el('div', 'ss-sgridcell');
        c.style.left = (x * cell) + 'px';
        c.style.top = (y * cell) + 'px';
        c.style.width = cell + 'px';
        c.style.height = cell + 'px';
        if (blockedFn ? blockedFn(x, y) : false) {
          c.classList.add('is-blocked');
          var bc = document.createElement('canvas');
          bc.width = cell; bc.height = cell;
          var bg = bc.getContext('2d');
          bg.imageSmoothingEnabled = false;
          bg.drawImage(window.ART.blocked(), 0, 0, cell, cell);
          c.appendChild(bc);
        }
        wrap.appendChild(c);
      }
    }
    (insts || []).forEach(function (inst) {
      var node = makeItemNode(inst, cell, heat);
      node.tabIndex = -1;
      node.style.left = (inst.x * cell) + 'px';
      node.style.top = (inst.y * cell) + 'px';
      wrap.appendChild(node);
    });
    return wrap;
  }

  /* 車体そのものの形。まだ走行が始まっていない車体選択でも描けるよう、
     S（走行の状態）に触らない */
  function chassisBlocked(ch) {
    return function (x, y) {
      return !!(ch.blocked && ch.blocked.indexOf(x + ',' + y) >= 0);
    };
  }

  /* 触れている辺に留め具を打つ。線が部品の絵を横切らないので、
     熱のマス色と喧嘩しない */
  function auraLayer(cell) {
    var ch = chassis();
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ss-links');
    svg.setAttribute('viewBox', '0 0 ' + (ch.cols * cell) + ' ' + (ch.rows * cell));
    svg.setAttribute('width', ch.cols * cell);
    svg.setAttribute('height', ch.rows * cell);
    auraLinks().forEach(function (L) {
      var m = linkMark(L.from, L.to, cell);
      if (!m) return;
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', m.x1); line.setAttribute('y1', m.y1);
      line.setAttribute('x2', m.x2); line.setAttribute('y2', m.y2);
      line.setAttribute('class', 'ss-link');
      line.dataset.from = L.from.uid; line.dataset.to = L.to.uid;
      svg.appendChild(line);
      var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', m.cx); dot.setAttribute('cy', m.cy);
      dot.setAttribute('r', Math.max(2, cell * 0.055));
      dot.setAttribute('class', 'ss-linkdot');
      dot.dataset.from = L.from.uid; dot.dataset.to = L.to.uid;
      svg.appendChild(dot);
    });
    return svg;
  }

  function renderDetail() {
    var box = $('detail');
    clear(box);
    var inst = selUid ? instById(selUid) : null;
    box.classList.toggle('is-empty', !inst);
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
      /* 倉庫にある部品は隣接の相手がいないので、効果ゼロの器を渡す */
      var a = inst.x != null ? auraFor(inst) : { dmgPct: 0, ammo: 0, reload: 0, list: [] };
      var b = build();
      var dmgNow = Math.round(e.dmg * (1 + a.dmgPct));
      li('威力 ' + dmgNow + (a.dmgPct ? '（+' + Math.round(a.dmgPct * 100) + '%）' : ''));
      if (e.ammo == null) {
        li('弾 ∞（尽きない。主砲が黙ったあとを支える）');
      } else {
        var mine = b.weapons.filter(function (w) { return w.uid === inst.uid; })[0];
        li('弾 ' + (e.ammo + a.ammo) + (a.ammo ? '（弾薬箱で+' + a.ammo + '）' : '') +
          (mine ? '　＝ 撃ち続けて約' + Math.round(dryTime(mine)) + '秒ぶん' : ''));
      }
      var h = inst.x != null ? weaponHeat(inst, b.heat) : null;
      li('発射間隔 ' + r1(e.reload * (1 + a.reload)) + ' 秒' +
        (inst.x != null ? '（車体速度と熱こみ ' +
          r1(Math.max(0.15, e.reload * (1 + a.reload) / b.spd * h.mult)) + ' 秒）' : ''));
      if (e.pierce) li('貫通 ' + (e.pierce >= 99 ? '完全' : e.pierce));
      if (e.heat) {
        li('発熱 ' + r1(e.heat) + ' /発（毎秒 ' + r1(e.heat / e.reload) + '）',
          h && h.tier ? 'ss-heat is-' + h.tier : 'ss-heat');
        if (h) {
          li(h.tier
            ? '置き場所の排熱が ' + r1(h.net) + ' 足りず、発射間隔が ' +
              Math.round((h.mult - 1) * 100) + '% 伸びている'
            : '置き場所の排熱は足りている（余裕 ' + r1(-h.net) + '）',
            h.tier ? 'ss-heat is-' + h.tier : 'ss-heat');
        }
      }
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
    if (e.cool) {
      li('隣接するマスの排熱 +' + r1(e.cool), 'ss-heat');
      if (inst.x != null) li('熱の逃げ場を作る。武器と武器の間に挟むのが効く', 'ss-heat');
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
      /* 倉庫の部品。そのまま載るなら「車体へ」、載らないなら
         「どれを降ろせば載って、どう変わるか」まで出す。
         ここが出ていなかったので、終盤の目玉部品が倉庫で眠ったままだった */
      var canFit = fitsAsIs(inst);
      var plan = canFit ? null : swapPlan(inst);
      if (!canFit) {
        var pl = el('p', 'ss-swaptip');
        if (plan) {
          pl.appendChild(el('b', null, plan.gain > 0
            ? PART_BY_ID[plan.drop.pid].name + ' を降ろせば載ります'
            : PART_BY_ID[plan.drop.pid].name + ' と入れ替えられますが、強くはなりません'));
          var row = el('span');
          swapDeltas(plan).forEach(function (d) { row.appendChild(deltaChip(d)); });
          pl.appendChild(row);
        } else {
          pl.appendChild(el('b', null, '空きマスが足りません'));
          pl.appendChild(el('span', null, '1個降ろしても入らない大きさです。増設で使えるマスを増やすか、売ることもできます'));
        }
        box.appendChild(pl);
      }
      var on = el('button', 'ss-btn', canFit ? '車体へ' : '入れ替える');
      if (!canFit && plan && plan.gain > 0) on.className = 'ss-btn ss-btn-main';
      on.disabled = !canFit && !plan;
      on.onclick = function () {
        if (canFit) {
          if (autoPlace(inst)) { window.SFX.place(); save(); renderGarage(); }
          else { window.SFX.deny(); toast('空きマスが足りない'); }
          return;
        }
        applySwap(inst, plan);
        window.SFX.place();
        toast(PART_BY_ID[plan.drop.pid].name + ' を倉庫へ降ろして入れ替えた');
        save(); renderGarage();
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
    box.classList.toggle('is-empty', !S.items.length);
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

  /* ヒントだけ消す。className ごと入れ替えると、塞がったマスや熱の色まで消える */
  function hintClear() {
    var cells = $('grid').querySelectorAll('.ss-gridcell');
    for (var i = 0; i < cells.length; i++) {
      cells[i].classList.remove('is-hint', 'is-bad', 'is-swap');
    }
    var items = $('grid').querySelectorAll('.ss-item.is-victim, .ss-item.is-reach');
    for (var j = 0; j < items.length; j++) items[j].classList.remove('is-victim', 'is-reach');
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
    /* 3通りある。そのまま置ける／1個降ろせば置ける／どうやっても置けない。
       以前は「置ける／置けない」の2色で、積み替えられることが見えなかった */
    var bl = blockersAt(held, t.x, t.y, occupancy(held.uid));
    var cls = !bl ? 'is-bad' : bl.length === 0 ? 'is-hint' : bl.length === 1 ? 'is-swap' : 'is-bad';
    var ch = chassis();
    instCells(held).forEach(function (c) {
      var x = t.x + c[0], y = t.y + c[1];
      if (x < 0 || y < 0 || x >= ch.cols || y >= ch.rows) return;
      var node = $('grid').querySelector('.ss-gridcell[data-gx="' + x + '"][data-gy="' + y + '"]');
      if (node) node.classList.add(cls);
    });
    /* 補助部品をつかんでいる間、そこへ置いたら効く武器を光らせる。
       置いたあとに ★ の数字が変わるだけでは、動かす理由が生まれない */
    var he = eff(held);
    if (he.aura || he.cool) {
      var probe = { uid: held.uid, pid: held.pid, lvl: held.lvl, wcut: held.wcut,
                    rot: held.rot, x: t.x, y: t.y };
      placed().forEach(function (i) {
        if (i.uid === held.uid || !isWeapon(PART_BY_ID[i.pid].kind)) return;
        if (!touching(i, probe)) return;
        var n = $('grid').querySelector('.ss-item[data-uid="' + i.uid + '"]');
        if (n) n.classList.add('is-reach');
      });
    }

    /* 降ろされる相手も光らせる。どれが倉庫へ行くのか分からないまま落とさせない */
    if (bl && bl.length === 1) {
      var victim = $('grid').querySelector('.ss-item[data-uid="' + bl[0].uid + '"]');
      if (victim) victim.classList.add('is-victim');
    }
  }

  function tryDrop(px, py) {
    if (!held) return false;
    var grid = $('grid'), stash = $('stash');
    var gr = grid.getBoundingClientRect(), sr = stash.getBoundingClientRect();
    var inGrid = px >= gr.left && px <= gr.right && py >= gr.top && py <= gr.bottom;
    var inStash = px >= sr.left && px <= sr.right && py >= sr.top && py <= sr.bottom;

    if (inGrid) {
      var t = targetCell(px, py);
      var bl = blockersAt(held, t.x, t.y, occupancy(held.uid));
      if (bl && !bl.length) {
        held.x = t.x; held.y = t.y;
        window.SFX.place();
        releaseGhost(); save(); renderGarage();
        return true;
      }
      /* 埋まったマスへ落としたとき、下にいるのが1個だけなら入れ替える。
         以前は拒否音が鳴るだけで、積み替えに4手（倉庫を見る→降ろす相手を決める
         →ドラッグで倉庫へ→新しいのをドラッグ）かかっていた */
      if (bl && bl.length === 1) {
        var out = bl[0];
        out.x = null; out.y = null;
        held.x = t.x; held.y = t.y;
        window.SFX.place();
        toast(PART_BY_ID[out.pid].name + ' を倉庫へ降ろして入れ替えた');
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
      if (ev.key === 'Escape' && !$('swap-ask').hidden) { closeSwapAsk(false); return; }
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
      /* 線はピクセルで引いているので、幅が変わったら引き直さないとずれる */
      if (!$('sc-map').hidden) drawMapLines();
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

  /* ノードの見た目。戦う相手が決まっているものは、その敵を出す。
     「何が待っているか」が見えないと、道を選ぶ理由が作れない */
  function nodeIcon(n) {
    var cv = document.createElement('canvas');
    var g = cv.getContext('2d');
    var foe = n.foe && ENEMY_BY_ID[n.foe];
    if (foe) {
      var sp = window.ART.enemy(foe.art);
      cv.width = 32; cv.height = Math.round(32 * sp.height / sp.width);
      g.imageSmoothingEnabled = false;
      g.drawImage(sp, 0, 0, cv.width, cv.height);
    } else {
      var ns = window.ART.node(n.type);
      cv.width = 16; cv.height = 16;
      g.drawImage(ns, 0, 0);
    }
    return cv;
  }

  /* 名前を出すのは図鑑で見たことのある敵だけ。初見は種別のまま
     （絵は出るので「丸いやつは固い」は覚えられる） */
  function nodeLabel(n) {
    var foe = n.foe && ENEMY_BY_ID[n.foe];
    if (foe && META.seenEnemies[foe.id]) return foe.name.replace(/^賞金首「(.+)」$/, '$1');
    return NODE_LABEL[n.type];
  }

  function nodeDetail(n, f) {
    var foe = n.foe && ENEMY_BY_ID[n.foe];
    if (!foe) return NODE_DESC[n.type];
    if (!META.seenEnemies[foe.id]) return NODE_DESC[n.type] + '（まだ見たことのない相手）';
    var s = scaleEnemy(foe, f);
    /* 切り札は「持っている」ことだけ出す。中身を書くと予想外でなくなる。
       戦って見たものだけ、何枚めくったかを出す */
    var tr = '';
    if (foe.trumps && foe.trumps.length) {
      var seen = foe.trumps.filter(function (t) { return trumpSeen(foe.id, t.id); }).length;
      tr = '\n切り札を隠している（見たことがあるのは ' + seen + ' / ' + foe.trumps.length + '）';
    }
    return foe.name + '\n装甲 ' + s.armor + '　攻撃 ' + s.atk + '　体力 ' + s.hp +
      (foe.trait ? '\n' + foe.trait : '') + tr +
      (n.type === 'elite' ? '\n勝てば改造を1つ選べる' : '');
  }

  function renderMap() {
    renderMapLegend();
    var m = S.map;
    var wrap = $('map-nodes');
    clear(wrap);
    var open = openNodes();
    var openKey = {};
    open.forEach(function (o) { openKey[o.f + ':' + o.i] = true; });
    var reach = reachable(m);

    for (var f = m.floors.length - 1; f >= 0; f--) {
      var row = el('div', 'ss-mapfloor');
      row.dataset.f = f;
      m.floors[f].forEach(function (n, i) {
        var b = el('button', 'ss-node');
        b.dataset.f = f; b.dataset.i = i;
        b.appendChild(nodeIcon(n));
        b.appendChild(el('span', 'ss-nodetag', nodeLabel(n)));
        b.title = nodeDetail(n, f);
        var isHere = m.cur && m.cur.f === f && m.cur.i === i;
        if (isHere) b.classList.add('is-here');
        else if (openKey[f + ':' + i]) {
          b.classList.add('is-open');
          /* f は外側のループ変数なので、閉じ込めずに dataset から読み直す */
          b.onclick = function () {
            enterNode(parseInt(this.dataset.f, 10), parseInt(this.dataset.i, 10));
          };
        } else if (m.cleared.indexOf(f + ':' + i) >= 0) b.classList.add('is-done');
        /* もう辿り着けない枝は沈める。どこへ行けるかが一目で分かるように */
        else if (!reach[f + ':' + i]) b.classList.add('is-far');
        row.appendChild(b);
      });
      wrap.appendChild(row);
    }
    $('map-hint').textContent = m.cur
      ? '光っている行き先から選ぶ。線をたどれば、その先どこへ行けるかが分かる。'
      : '好きなところから走り出せる。線をたどって、どこを通って登るか決める。';

    /* 賞金首は序盤の階には出ない。マップの案内を出した次の機会に回るのが自然な順 */
    var hasElite = false;
    m.floors.forEach(function (fr, f2) {
      fr.forEach(function (n2, i2) {
        if (n2.type === 'elite' && reach[f2 + ':' + i2] &&
            m.cleared.indexOf(f2 + ':' + i2) < 0) hasElite = true;
      });
    });
    renderTip('map', { map: true, elite: hasElite });
    /* 12階ぶんの縦長になるので、選べるところが画面に入るまで送る */
    setTimeout(function () {
      drawMapLines();
      var n = $('map-nodes').querySelector('.ss-node.is-open');
      if (n && n.scrollIntoView) n.scrollIntoView({ block: 'center' });
    }, 0);
  }

  function drawMapLines(tries) {
    var svg = $('map-lines');
    var box = $('map-body');
    var br = box.getBoundingClientRect();
    /* レイアウトが決まる前に測ると幅0の viewBox ができて、線が1本も見えなくなる。
       実際それで長いあいだ「道が見えないマップ」になっていた */
    if (br.width < 1) {
      if ((tries || 0) < 10) setTimeout(function () { drawMapLines((tries || 0) + 1); }, 30);
      return;
    }
    svg.setAttribute('viewBox', '0 0 ' + br.width + ' ' + br.height);
    clear(svg);
    var m = S.map;
    function center(f, i) {
      var n = $('map-nodes').querySelector('.ss-node[data-f="' + f + '"][data-i="' + i + '"]');
      if (!n) return null;
      var r = n.getBoundingClientRect();
      return { x: r.left - br.left + r.width / 2, y: r.top - br.top + r.height / 2 };
    }
    /* 線は3段階。いま選べる道／この先まだ通れる道／もう通れない道。
       以前は現在地から出る線以外が地色と同化していて、走り出す前は
       1本も見えなかった（＝どこへ繋がるか分からないまま選んでいた） */
    var reach = reachable(m);
    for (var f = 0; f < m.edges.length; f++) {
      for (var i = 0; i < m.edges[f].length; i++) {
        m.edges[f][i].forEach(function (j) {
          var a = center(f, i), b = center(f + 1, j);
          if (!a || !b) return;
          var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
          line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
          var live = m.cur && m.cur.f === f && m.cur.i === i;
          var open = reach[f + ':' + i];
          line.setAttribute('stroke', live ? '#d9a441' : (open ? '#5c6b7a' : '#232a31'));
          line.setAttribute('stroke-width', live ? 2.5 : (open ? 1.8 : 1));
          if (!live && !open) line.setAttribute('stroke-dasharray', '3 4');
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
    else startBattle(type, f, S.map.floors[f][i].foe);
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

  function startBattle(type, floor, foeId) {
    var b = syncHp();
    /* マップで見せていた相手をそのまま出す。見えていたものと違う敵が出ると、
       経路を選んだ意味が無くなる */
    var foe = (foeId && ENEMY_BY_ID[foeId])
      ? scaleEnemy(ENEMY_BY_ID[foeId], floor)
      : pickEnemy(type, floor);
    markEnemySeen(foe.id);
    /* 途中で閉じても、再開したときに同じ戦闘からやり直せるようにする */
    S.inBattle = { type: type, floor: floor, foe: foe.id };
    save();

    B = {
      type: type, foe: foe, foeHp: foe.hp, foeMax: foe.hp, foeT: 0, salvoT: 0,
      me: b, meHp: S.hp, meMax: b.maxHp,
      guns: b.weapons.map(function (w) {
        var bf = S.buff || { pierce: 0, ammo: 0 };
        return {
          uid: w.uid, name: w.name, kind: w.kind, dmg: w.dmg,
          pierce: w.pierce + (bf.pierce || 0),
          reload: w.reload,
          /* 弾無限の武器に弾数を足しても意味がないので、有限のものだけ */
          ammo: w.ammo == null ? null : w.ammo + (bf.ammo || 0),
          ammoMax: w.ammo == null ? null : w.ammo + (bf.ammo || 0),
          heatTier: w.heatTier, heatMult: w.heatMult,
          t: 0
        };
      }),
      ramT: 0, over: false, speed: OPT.speed, last: 0,
      /* 敵の挙動で動く値。素の数値は foe に残したまま、ここに差分を持つ */
      bv: foe.behavior || {}, armorAdd: 0, hits: 0, baseInterval: foe.interval, dodged: 0,
      /* 切り札。戦闘ごとに1枚だけ引く。何を引いたかは戦ってみるまで分からない。
         これが戦闘に入った唯一の乱数（以前は戦闘中に乱数が一つも無かった） */
      trump: (foe.trumps && foe.trumps.length) ? pick(foe.trumps) : null,
      trumpDone: false, missUntil: -1, atkMult: 1,
      /* 負けたときに何が足りなかったか言うための記録 */
      tally: { dealt: 0, blocked: 0, taken: 0, shots: 0, dryT: 0, elapsed: 0 }
    };

    show('battle');
    window.SFX.bgmMood(type === 'boss' ? 'boss' : type === 'elite' ? 'elite' : 'fight');
    $('battle-title').textContent = type === 'boss' ? 'ボス戦' : (type === 'elite' ? '賞金首' : '遭遇');
    $('battle-end').hidden = true;
    $('battle-trump').hidden = true;
    $('battle-speed').textContent = '速度 x' + B.speed;

    renderBattleBoard();
    $('battle-mename').textContent = chassis().name;

    var foeC = $('battle-foe');
    var foeSp = window.ART.enemy(foe.art);
    foeC.width = foeSp.width; foeC.height = foeSp.height;
    foeC.getContext('2d').drawImage(foeSp, 0, 0);
    $('battle-foename').textContent = foe.name;
    /* 素の数値は上の行（battle-foestate）が毎秒出すので、ここは
       「何をしてくる相手か」だけにする */
    $('battle-foeinfo').textContent = (foe.bnote || foe.trait || '') +
      (foe.trumps && foe.trumps.length ? '／切り札を隠している' : '');

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

  /* ==========================================================
     戦闘中の盤

     組んだ配置をそのまま出す。整備画面と同じ絵・同じ色にする
     （別の絵にすると「これが自分の組んだ車だ」と結びつかない）。
     ここで、撃った部品が光り、リロードが溜まり、弾が減り、熱で赤くなる。
     ========================================================== */
  /* 盤が主役なので、戦闘中も部品が何なのか見える大きさにする。
     いちばん大きい重戦車（5×4）でも 220×176px で、戦闘画面の片側に収まる */
  var BATTLE_CELL = 44;

  function renderBattleBoard() {
    var box = $('battle-me');
    clear(box);
    var b = B ? B.me : build();
    /* 整備画面と同じ理由で、入る大きさまで落とす。
       はみ出すとページ全体に横スクロールが出る */
    var ch = chassis();
    var avail = box.clientWidth || 0;
    var cell = avail > 40 ? Math.max(22, Math.min(BATTLE_CELL, Math.floor(avail / ch.cols))) : BATTLE_CELL;
    box.appendChild(staticGrid(ch, placed(), cell, b.heat, isBlocked));
    /* 武器のマスにだけ、弾とリロードの器を足す */
    (B ? B.guns : []).forEach(function (g) {
      var n = boardNode(g.uid);
      if (!n) return;
      n.classList.add('ss-bgun');
      n.appendChild(el('span', 'ss-bammo'));
    });
    updateBoard();
  }

  function boardNode(uid) {
    if (uid == null) return null;
    return $('battle-me').querySelector('.ss-item[data-uid="' + uid + '"]');
  }

  /* 毎フレーム走る。リロードの進み具合と残弾を盤の上で見せる */
  function updateBoard() {
    if (!B) return;
    B.guns.forEach(function (g) {
      var n = boardNode(g.uid);
      if (!n) return;
      n.style.setProperty('--rl', Math.min(1, g.t / g.reload));
      n.classList.toggle('is-ready', g.t >= g.reload);
      n.classList.toggle('is-dry', g.ammo === 0);
      var tag = n.querySelector('.ss-bammo');
      if (tag) {
        tag.textContent = g.ammo == null ? '∞' : String(g.ammo);
        tag.classList.toggle('is-low', g.ammo != null && g.ammo > 0 && g.ammo <= 2);
        tag.classList.toggle('is-empty', g.ammo === 0);
      }
    });
  }

  /* 撃った部品を盤の上で光らせる。どれが働いたのかが分からないと、
     置き方を変える理由が生まれない */
  function markFire(uid) {
    var n = boardNode(uid);
    if (!n) return;
    n.classList.remove('is-firing');
    void n.offsetWidth;
    n.classList.add('is-firing');
  }

  /* 着弾。撃った → 当たった → 減った、の因果を絵にする */
  function impact(big, missed) {
    var host = $('battle-foe').parentNode;
    if (!host) return;
    var e = el('span', 'ss-impact' + (big ? ' is-big' : '') + (missed ? ' is-miss' : ''));
    var sp = $('battle-foe');
    e.style.top = (sp.offsetTop + sp.offsetHeight * 0.45) + 'px';
    e.style.marginLeft = (rint(45) - 22) + 'px';
    host.appendChild(e);
    setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 420);
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
      if (g.heatTier) row.classList.add('is-' + g.heatTier);
      var bar = el('div', 'ss-gunbar');
      bar.appendChild(el('i'));
      bar.appendChild(el('span', null, g.name +
        (g.heatTier ? '（熱で ' + Math.round((g.heatMult - 1) * 100) + '% 遅い）' : '')));
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
      /* 残りが少ない武器は戦闘中に分かるようにする。尽きる瞬間が山場になる */
      row.classList.toggle('is-low', g.ammo != null && g.ammo > 0 && g.ammo <= 2);
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

    /* 挙動で動いている値をそのまま見せる。
       何が起きたか分からないまま負けるのがいちばん悪い */
    var st = $('battle-foestate');
    var bits = ['装甲 ' + foeArmor() + (B.armorAdd >= 1 ? '（+' + Math.floor(B.armorAdd) + '）' : ''),
      '攻撃 ' + B.foe.atk,
      '間隔 ' + r1(B.foe.interval) + '秒' + (B.bv.speedUp && B.foe.interval < B.baseInterval - 0.05 ? '（加速中）' : '')];
    if (B.bv.regen) bits.push('毎秒 +' + B.bv.regen + ' 回復');
    if (B.dodged) bits.push('回避 ' + B.dodged + ' 回');
    st.textContent = bits.join('　');
    st.classList.toggle('is-bad', B.armorAdd >= 1 || (B.bv.speedUp && B.foe.interval < B.baseInterval - 0.05));

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

  /* 当たった数字をその場に飛ばす。
     速度x4だと数が増えるので、溜まりすぎたら古いものから捨てる */
  function popDamage(which, amount, big) {
    var canvas = $(which === 'me' ? 'battle-me' : 'battle-foe');
    var host = canvas.parentNode;
    var live = host.querySelectorAll('.ss-pop');
    for (var i = 0; i + 3 < live.length; i++) {
      if (live[i].parentNode) live[i].parentNode.removeChild(live[i]);
    }
    var e = el('span', 'ss-pop ' + (which === 'me' ? 'is-me' : 'is-foe') + (big ? ' is-big' : ''),
      (which === 'me' ? '-' : '') + amount);
    /* CSSの `top:34%` は箱（.ss-fighter）の高さに対する割合。敵側は次の攻撃ゲージ分
       箱が縦に長く、同じ割合だと名前や体力の上に数字が重なってしまう。
       車の絵（canvas）そのものの位置を基準にして、両側で同じ見え方にする */
    e.style.top = (canvas.offsetTop + canvas.offsetHeight * 0.34) + 'px';
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
    updateBoard();
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
    foeBehavior(dt);
    /* 切り札は装甲が半分を切ったら発動。撃って削った経路でも、
       回復で戻ったあと再び切った経路でも拾えるよう、毎回ここで見る */
    checkTrump();
    if (B.over) return;
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
        var d = Math.max(1, 4 - foeArmor());
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

  /* 挙動で増えたぶんを足した、いまの装甲 */
  function foeArmor() {
    return B.foe.armor + Math.floor(B.armorAdd);
  }

  /* 時間の経過で変わる敵の挙動。毎フレーム呼ぶ */
  /* 切り札の発動。装甲が半分を切った瞬間に1回だけ。
     短い戦闘でも必ず1回は起きるよう、時間ではなくHPで引く */
  function checkTrump() {
    if (!B.trump || B.trumpDone || B.over) return;
    if (B.foeHp > B.foeMax * 0.5) return;
    B.trumpDone = true;
    fireTrump(B.trump);
  }

  function fireTrump(t) {
    var e = t.effect || {};
    if (e.heal) B.foeHp = Math.min(B.foeMax, B.foeHp + B.foeMax * e.heal);
    if (e.hasten) { B.baseInterval *= e.hasten; B.foe.interval *= e.hasten; }
    if (e.atkMult) B.atkMult *= e.atkMult;
    if (e.armorAdd) B.armorAdd += e.armorAdd;
    if (e.missFor) B.missUntil = B.tally.elapsed + e.missFor;
    if (e.salvoFaster && B.foe.salvo) B.foe.salvo.every *= e.salvoFaster;
    if (e.selfCut) B.foeHp = Math.max(1, B.foeHp * (1 - e.selfCut));

    markTrumpSeen(B.foe.id, t.id);
    announceTrump(t);
    /* 特攻はその場で殴ってくる。宣言してから当てる（何をされたか分かるように） */
    if (e.bigHit) foeAttack(e.bigHit, false, t.name);
    updateIntent();
    checkEnd();
  }

  /* 切り札を、ログ・盤・帯の3つで名乗る */
  function announceTrump(t) {
    logLine('trump', '★ ' + B.foe.name + ' の切り札「' + t.name + '」　' + t.log);
    var bar = $('battle-trump');
    if (bar) {
      clear(bar);
      bar.appendChild(el('b', null, '切り札「' + t.name + '」'));
      bar.appendChild(el('span', null, t.log));
      bar.hidden = false;
      bar.classList.remove('is-in');
      void bar.offsetWidth;
      bar.classList.add('is-in');
    }
    flash('foe');
    impact(true);
    window.SFX.special();
  }

  function foeBehavior(dt) {
    var bv = B.bv;
    /* 加速・自己修復・じわじわ硬くなる相手はログに出ないまま効く。
       効きはじめが分かる頃（3秒）に一度だけ知らせる */
    if ((bv.speedUp || bv.armorPerSec || bv.regen) && B.tally.elapsed > 3) tipLog('behavior');
    if (bv.speedUp) {
      /* 放っておくと加速する。下限は元の45% */
      var f = Math.max(0.45, 1 - bv.speedUp * B.tally.elapsed);
      B.foe.interval = B.baseInterval * f;
    }
    if (bv.armorPerSec) {
      B.armorAdd = Math.min(bv.armorMax || 99, B.armorAdd + bv.armorPerSec * dt);
    }
    if (bv.regen && B.foeHp > 0 && B.foeHp < B.foeMax) {
      B.foeHp = Math.min(B.foeMax, B.foeHp + bv.regen * dt);
    }
  }

  function fireGun(g) {
    var raw = g.dmg;
    if (g.ammo != null) g.ammo--;

    markFire(g.uid);

    /* 煙幕・粘液のあいだは当たらない。切り札の効き目が目に見えるように、
       回避と同じ書き方でログに出す */
    if (B.tally.elapsed < B.missUntil) {
      B.tally.blocked += raw;
      logLine('sys', g.name + ' は煙に阻まれた');
      impact(false, true);
      if (g.ammo === 0) logLine('sys', g.name + ' は弾切れ');
      return;
    }

    /* 回避する敵。重い一撃ほど損をするので、手数の構成が有利になる */
    B.hits++;
    if (B.bv.dodgeEvery && B.hits % B.bv.dodgeEvery === 0) {
      B.dodged++;
      logLine('sys', B.foe.name + ' は身をかわした（' + g.name + ' の一撃）');
      impact(false, true);
      tipLog('behavior');
      B.tally.blocked += raw;
      if (g.ammo === 0) logLine('sys', g.name + ' は弾切れ');
      return;
    }

    var armor = Math.max(0, foeArmor() - g.pierce);
    var dealt = Math.max(1, raw - armor);
    B.foeHp -= dealt;

    /* 撃たれるたびに硬くなる敵。手数で殴るほど自分で不利を作る */
    if (B.bv.armorPerHit) {
      var before = foeArmor();
      B.armorAdd = Math.min(B.bv.armorMax || 99, B.armorAdd + B.bv.armorPerHit);
      if (foeArmor() > before) {
        logLine('sys', B.foe.name + ' の装甲が厚くなった（' + foeArmor() + '）');
        tipLog('behavior');
      }
    }

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
    impact(g.kind === 'special' || dealt >= 40);
    popDamage('foe', dealt, g.kind === 'special');
    if (g.ammo === 0) logLine('sys', g.name + ' は弾切れ');
    checkEnd();
  }

  function foeAttack(mult, salvo, why) {
    var raw = Math.round(B.foe.atk * mult * (B.atkMult || 1));
    var dealt = Math.max(1, raw - B.me.def);
    B.meHp -= dealt;
    B.tally.taken += dealt;
    logLine('foe', (salvo ? '★一斉射撃！　' : why ? '★' + why + '！　' : '') +
      B.foe.name + 'の攻撃　' + dealt + ' ダメージ' +
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
      /* 補修キット：勝つたびに自分で継ぐ */
      var heal = Math.round(B.meMax * modSum().healPct);
      if (heal > 0 && S.hp < B.meMax) {
        S.hp = Math.min(B.meMax, S.hp + heal);
        logLine('sys', '補修キットで装甲を ' + heal + ' 継いだ');
      }
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
        spd: B.me.spd, over: B.me.over, guns: B.guns.length,
        hotGuns: B.guns.filter(function (g) { return g.heatTier; }).length
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
  /* 手に入れた部品を積む。入らなければ、その場で入れ替えを聞く。
     黙って倉庫へ落としていたころは、終盤の目玉部品ほど倉庫で眠っていた */
  function takePart(pid, after) {
    var inst = newInst(pid);
    S.parts.push(inst);
    var name = PART_BY_ID[pid].name;
    window.SFX.coin();
    if (autoPlace(inst)) {
      toast(name + ' を積んだ');
      syncHp(); save(); refreshStatus();
      after();
      return;
    }
    var plan = swapPlan(inst);
    syncHp(); save(); refreshStatus();
    /* 強くならない入れ替えでわざわざ手を止めさせない。
       倉庫に入れておけば、整備画面でいつでも入れ替えられる */
    if (!plan || plan.gain <= 0) {
      toast(name + ' を倉庫に入れた');
      after();
      return;
    }
    askSwap(inst, plan, after);
  }

  var swapAsk = null;
  function askSwap(inst, plan, after) {
    swapAsk = { inst: inst, plan: plan, after: after };
    $('swap-ask-title').textContent = PART_BY_ID[inst.pid].name + ' は、いまの車に空きがない';
    $('swap-ask-body').textContent =
      PART_BY_ID[plan.drop.pid].name + ' を降ろせば載る。降ろしたほうは倉庫に入る。';
    var d = $('swap-ask-delta');
    clear(d);
    swapDeltas(plan).forEach(function (x) { d.appendChild(deltaChip(x)); });
    $('swap-ask').hidden = false;
    $('swap-ask-yes').focus();
  }
  /* 押しつけない。「倉庫に置いておく」も Esc も、それまでどおり倉庫行きにする */
  function closeSwapAsk(doIt) {
    var a = swapAsk;
    swapAsk = null;
    $('swap-ask').hidden = true;
    if (!a) return;
    if (doIt) {
      applySwap(a.inst, a.plan);
      window.SFX.place();
      toast(PART_BY_ID[a.plan.drop.pid].name + ' を倉庫へ降ろして入れ替えた');
    } else {
      toast(PART_BY_ID[a.inst.pid].name + ' を倉庫に入れた');
    }
    syncHp(); save(); refreshStatus();
    a.after();
  }

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
        takePart(p.id, afterNode);
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

    /* 「いまの車にどう載るか」を選ぶ前に出す。
       これが無かったので、終盤の目玉部品を取っても倉庫へ落ちるだけで、
       プレイヤーには何が起きたのか分からなかった */
    var fi = fitInfo(part.id);
    if (fi) {
      var f = el('div', 'ss-fit is-' + fi.kind);
      f.appendChild(el('b', null, fi.text));
      if (fi.deltas) {
        var dr = el('span');
        fi.deltas.forEach(function (d) { dr.appendChild(deltaChip(d)); });
        f.appendChild(dr);
      }
      b.appendChild(f);
    }

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
     改造（賞金首の報酬）

     3択から1つ。どれにも代償があるので「強いほうを取る」では決まらない。
     数値が抽象的なままだと選べないので、**いまの車に当てた結果**を各カードに出す。
     ========================================================== */
  var modGold = 0;

  function modThumb(mod, px) {
    var c = document.createElement('canvas');
    var sp = window.ART.mod(mod);
    c.width = sp.width; c.height = sp.height;
    c.getContext('2d').drawImage(sp, 0, 0);
    c.style.width = (px || 22) + 'px';
    c.style.height = (px || 22) + 'px';
    return c;
  }

  function hotCount(b) {
    return b.weapons.filter(function (w) { return w.heatTier; }).length;
  }
  function totalAmmo(b) {
    var n = 0;
    b.weapons.forEach(function (w) { if (w.ammo != null) n += w.ammo; });
    return n;
  }

  /* この改造を入れると、いまの車がどう変わるか。
     実際に S.mods へ入れて build() し直すので、表示と中身がずれない */
  function modPreview(id) {
    var b0 = build(), cells0 = usableCells(), hot0 = hotCount(b0), ammo0 = totalAmmo(b0);
    S.mods.push(id);
    var b1 = build(), cells1 = usableCells(), hot1 = hotCount(b1), ammo1 = totalAmmo(b1);
    S.mods.pop();

    var out = [];
    /* good は true=得 / false=損 / null=動くが今の車には効いていない。
       「数値が変わる」と「得をする」は別物で、そこを混ぜると罠になる
       （積載に余裕がある車の積載+10 は、緑で出すと嘘になる） */
    function cmp(key, label, a, b, good, suffix) {
      if (a === b) return;
      out.push({
        key: key, a: a, b: b, good: good,
        t: label + ' ' + a + (suffix || '') + ' → ' + b + (suffix || '')
      });
    }
    function dir(a, b, upIsGood) { return upIsGood ? b > a : b < a; }
    /* 積載と重量は「超過しているか」でしか効かない */
    var overGood = b1.over < b0.over ? true : (b1.over > b0.over ? false : null);

    cmp('maxHp', '最大装甲', b0.maxHp, b1.maxHp, dir(b0.maxHp, b1.maxHp, true));
    cmp('def', '被弾軽減', b0.def, b1.def, dir(b0.def, b1.def, true));
    cmp('dps', '毎秒火力', r1(dps(b0)), r1(dps(b1)), dir(dps(b0), dps(b1), true));
    cmp('spd', '速度', Math.round(b0.spd * 100), Math.round(b1.spd * 100),
      dir(b0.spd, b1.spd, true), '%');
    cmp('cap', '積載', b0.cap, b1.cap, overGood);
    cmp('weight', '重量', r1(b0.weight), r1(b1.weight), overGood);
    cmp('cells', '使えるマス', cells0, cells1, dir(cells0, cells1, true));
    cmp('ammo', '弾の合計', ammo0, ammo1, dir(ammo0, ammo1, true));
    cmp('hot', '過熱する武器', hot0, hot1, dir(hot0, hot1, false), '門');

    /* 走行をまたいで効くものは、build() を1回比べても出てこない。
       いまの車に当てた具体的な数字にして出す */
    var m = MOD_BY_ID[id];
    if (m && m.effect.healPct) {
      out.push({
        key: 'heal', good: true,
        t: '戦闘に勝つたび 装甲+' + Math.round(b1.maxHp * m.effect.healPct)
      });
    }

    /* 得が一つも無いなら、はっきりそう言う。罠にしない */
    if (!out.some(function (x) { return x.good === true; })) {
      out.push({ key: 'none', good: false, t: 'いまの車には効き目がない' });
    }
    return out;
  }

  function dps(b) {
    var n = 0;
    b.weapons.forEach(function (w) { n += w.dmg / w.reload; });
    return n;
  }

  function modCard(m) {
    var b = el('button', 'ss-goods');
    var top = el('div', 'ss-goodstop');
    top.appendChild(modThumb(m, 22));
    var nm = el('div');
    nm.appendChild(el('span', 'ss-kind', '改造'));
    nm.appendChild(el('b', null, m.name));
    top.appendChild(nm);
    b.appendChild(top);
    b.appendChild(el('div', 'ss-note', m.note));

    var eb = el('div', 'ss-modeff');
    eb.appendChild(el('em', 'is-up', m.good));
    eb.appendChild(el('em', 'is-down', m.bad));
    b.appendChild(eb);

    var pv = modPreview(m.id);
    if (pv.length) {
      var c = el('div', 'ss-cmp');
      c.appendChild(el('i', null, 'いまの車がどうなるか'));
      var row = el('span');
      pv.forEach(function (x) {
        row.appendChild(el('em', x.good === true ? 'is-up' : (x.good === false ? 'is-down' : 'is-flat'), x.t));
      });
      c.appendChild(row);
      b.appendChild(c);
    }
    b.onclick = function () { applyMod(m.id); };
    return b;
  }

  function renderMods(gold) {
    modGold = gold;
    var pool = (D.mods || []).filter(function (m) { return S.mods.indexOf(m.id) < 0; });
    if (!pool.length) { toModReward(); return; }
    show('mod');
    var box = $('mod-offer');
    clear(box);
    shuffled(pool).slice(0, 3).forEach(function (m) { box.appendChild(modCard(m)); });
    refreshStatus();
  }

  function applyMod(id) {
    S.mods.push(id);
    markModSeen(id);
    window.SFX.upgrade();
    toast(MOD_BY_ID[id].name + ' を施した');
    /* 装甲の上限が動くので、いまの装甲を合わせ直す */
    syncHp(); save(); refreshStatus();
    toModReward();
  }

  function toModReward() {
    show('reward');
    renderReward(modGold, 3);
  }

  /* 何を背負っているかを整備画面で常に見せる */
  function renderModBadges() {
    var box = $('grid-mods');
    clear(box);
    box.hidden = !S.mods.length;
    S.mods.forEach(function (id) {
      var m = MOD_BY_ID[id];
      if (!m) return;
      var b = el('span', 'ss-modbadge');
      b.appendChild(modThumb(m, 14));
      b.appendChild(el('b', null, m.name));
      b.title = m.good + ' / ' + m.bad;
      box.appendChild(b);
    });
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
        S.shopStock[idx] = null;
        takePart(p.id, renderShop);
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
        (e.tier === 'mob' ? '（階層で上がる）' : '');
    }
    b.appendChild(el('div', 'ss-note', note));
    /* 何をしてくる敵かは、次にどう組むかの材料になる */
    if (seen && e.bnote) {
      var bn = el('div', 'ss-modeff');
      bn.appendChild(el('em', 'is-down', e.bnote));
      b.appendChild(bn);
    }
    /* 切り札は「戦って見たもの」だけ載せる。
       全部先に載せると、次に戦うときの予想外が消える */
    if (seen && e.trumps && e.trumps.length) {
      var got = e.trumps.filter(function (t) { return trumpSeen(e.id, t.id); });
      var tb = el('div', 'ss-trumplist');
      tb.appendChild(el('i', null, '切り札　' + got.length + ' / ' + e.trumps.length + ' 枚を見た'));
      e.trumps.forEach(function (t) {
        tb.appendChild(el('em', trumpSeen(e.id, t.id) ? 'is-got' : '', 
          trumpSeen(e.id, t.id) ? t.name : '？'));
      });
      b.appendChild(tb);
    }
    return b;
  }

  /* 改造は一度施したものだけ中身が見える。次の走行で何を狙うかの材料になる */
  function codexModCard(m) {
    var seen = !!(META.seenMods && META.seenMods[m.id]);
    var b = el('div', 'ss-goods' + (seen ? '' : ' is-locked'));
    var top = el('div', 'ss-goodstop');
    top.appendChild(seen ? modThumb(m, 22) : lockedThumb(22, 22));
    var nm = el('div');
    nm.appendChild(el('span', 'ss-kind', seen ? '改造' : '？？？'));
    nm.appendChild(el('b', null, seen ? m.name : '？？？'));
    top.appendChild(nm);
    b.appendChild(top);
    b.appendChild(el('div', 'ss-note', seen ? m.note : 'まだ施していない'));
    if (seen) {
      var eb = el('div', 'ss-modeff');
      eb.appendChild(el('em', 'is-up', m.good));
      eb.appendChild(el('em', 'is-down', m.bad));
      b.appendChild(eb);
    }
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

    var mBox = $('codex-mods'); clear(mBox);
    (D.mods || []).forEach(function (m) { mBox.appendChild(codexModCard(m)); });
    $('codex-mods-count').textContent =
      Object.keys(META.seenMods || {}).length + '/' + (D.mods || []).length;

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
    /* 焚き火でできることは一つだけ。満タンで「修理する」を選ぶと、
       その1回を何も起きずに捨てることになるので選べなくする（店と同じ扱い） */
    var missing = S.maxHp - S.hp;
    var heal = Math.min(missing, Math.ceil(S.maxHp * 0.65));
    box.appendChild(serviceButton0('修理する',
      missing > 0 ? '装甲を ' + heal + ' 回復（最大 ' + S.maxHp + '）' : '装甲は満タン。回復するものがない',
      function () {
        S.hp = Math.min(S.maxHp, S.hp + heal);
        window.SFX.repair(); toast('装甲を張り直した');
        save(); refreshStatus(); afterNode();
      }, missing > 0));
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
  function serviceButton0(title, note, onClick, enabled) {
    var b = el('button', 'ss-goods');
    var top = el('div', 'ss-goodstop');
    top.appendChild(el('b', null, title));
    b.appendChild(top);
    b.appendChild(el('div', 'ss-note', note));
    if (enabled === false) b.disabled = true;
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
    /* 3. 熱 */
    if (L.hotGuns > 0) {
      out.push({
        k: '熱でリロードが伸びていた武器',
        v: L.hotGuns + ' 門',
        m: '武器を固めて置くと熱がこもって遅くなる。間にエンジンなどを挟んで離すか、'
          + '冷却器を隣に置くか、外周のマスへ寄せる'
      });
    }
    /* 4. 過積載 */
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

      /* このゲームで選んでいるのは「盤の形」。
         「4×3マス」と文字で書いても、何を選んでいるのかが分からない。
         実物の盤を描く（塞がったマスも含めて、走り出したときそのままの形） */
      var gw = el('div', 'ss-pickgrid');
      gw.appendChild(staticGrid(ch, [], 26, null, chassisBlocked(ch)));
      var blocked = (ch.blocked || []).length;
      gw.appendChild(el('span', 'ss-pickcells',
        (ch.cols * ch.rows - blocked) + ' マス使える' +
        (blocked ? '（' + blocked + ' マスは塞がっている）' : '')));
      b.appendChild(gw);

      /* 1行に流すと4つの数値が同じ重さで並んで、どれが効くのか分からない。
         項目と値に分けて、値だけを目立たせる */
      var nums = el('div', 'ss-picknums');
      [['積載', ch.cap], ['装甲', ch.hp], ['被弾軽減', ch.def],
       ['速度', (ch.spd >= 0 ? '+' : '') + Math.round(ch.spd * 100) + '%']
      ].forEach(function (row) {
        var d = el('div');
        d.appendChild(el('i', null, row[0]));
        d.appendChild(el('b', null, String(row[1])));
        nums.appendChild(d);
      });
      b.appendChild(nums);
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
      mods: [],
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
      if (S.inBattle) { startBattle(S.inBattle.type, S.inBattle.floor, S.inBattle.foe); return; }
      show('map'); renderMap();
    };

    $('map-garage').onclick = function () { pending = null; show('garage'); renderGarage(); };

    $('garage-tut-close').onclick = function () {
      markTutSeen('garage'); $('garage-tut').hidden = true;
      renderGarage();   // 最初の案内を閉じた直後から、次の案内が出られるようにする
    };
    $('swap-ask-yes').onclick = function () { closeSwapAsk(true); };
    $('swap-ask-no').onclick = function () { closeSwapAsk(false); };
    $('garage-tip-close').onclick = function () { closeTip('garage'); };
    $('map-tip-close').onclick = function () { closeTip('map'); };

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
      /* 賞金首だけは、戦利品の前に改造を選ばせる。
         ここが「この走行が何者になるか」を決める1手 */
      if (B.type === 'elite') { renderMods(B.foe.gold); return; }
      show('reward');
      renderReward(B.foe.gold, 3);
    };

    $('mod-skip').onclick = function () { window.SFX.select(); toModReward(); };

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
        ['parts', 'enemies', 'mods', 'ach'].forEach(function (t) { $('codex-' + t).hidden = (t !== btn.dataset.tab); });
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
    $('opt-bgm').value = OPT.bgm;
    $('opt-bgm-v').textContent = OPT.bgm;
    $('opt-motion').checked = !OPT.motion;
    var note = $('opt-audio-note');
    if (MUTED) {
      /* dev:start */
      note.hidden = false;
      note.textContent = '動作確認中（?debug=1）のため消音しています。設定値は保たれます。';
      /* dev:end */
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
    /* 離したときに一度鳴らす */
    $('opt-sfx').onchange = function () { window.SFX.select(); };

    $('opt-bgm').oninput = function () {
      OPT.bgm = Number(this.value);
      $('opt-bgm-v').textContent = OPT.bgm;
      applyVolume();
      saveOpt();
    };

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
    if (!S.mods) S.mods = [];
    if (!S.opened) S.opened = {};
    if (S.openCost == null) S.openCost = 110;
    $('title-continue').hidden = false;
  }
  show('title');

  /* dev:start */
  /* 動作確認用の入口。?debug=1 のときだけ生やす */
  if (/[?&]debug=1/.test(location.search)) {
    window.__garage = {
      state: function () { return S; },
      meta: function () { return META; },
      resetMeta: function () {
        META = { seenParts: {}, seenEnemies: {}, seenTrumps: {}, unlocked: {}, tut: {}, stats: { battlesWon: 0, clears: 0, bestFloor: 0, maxGold: 0, shoplessClears: 0, clearedChassis: {} } };
        saveMeta();
      },
      openCodex: openCodex,
      startEvent: startEvent,
      applyEvent: applyEvent,
      addItem: addItem,
      useItem: useItem,
      modPreview: modPreview,
      fitsAsIs: fitsAsIs,
      canSwapIn: canSwapIn,
      swapPlan: swapPlan,
      swapDeltas: swapDeltas,
      carScore: carScore,
      applySwap: applySwap,
      fitInfo: fitInfo,
      auraLinks: auraLinks,
      helperWorking: helperWorking,
      takePart: takePart,
      closeSwapAsk: closeSwapAsk,
      autoPlace: autoPlace,
      blockersAt: blockersAt,
      occupancy: occupancy,
      snapshot: snapshot,
      tips: TIPS,
      tipOrder: TIP_ORDER,
      pickTip: pickTip,
      tipLog: tipLog,
      renderTip: renderTip,
      trumpSeen: trumpSeen,
      fireTrump: fireTrump,
      checkAchievements: checkAchievements,
      save: save,
      build: build,
      battle: function () { return B; },
      /* 画面を見ずに戦闘を進める。バランス確認用 */
      step: function (sec) {
        var n = Math.ceil(sec / 0.05);
        for (var i = 0; i < n && B && !B.over; i++) advance(0.05);
        updateBars(); updateGuns(); updateIntent(); updateBoard();
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
      /* 階を指定して戦闘を始める。warpTo はマップ上の最初のノードしか取れず、
         階層別のバランスが測れなかった */
      startBattle: startBattle,
      stopLoop: stopLoop,
      enterNode: enterNode,
      renderMap: renderMap,
      renderPick: renderPick,
      renderBattleBoard: renderBattleBoard,
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
  /* dev:end */
})();
