/* ==========================================================
   ハンター向けのショップ（プロトタイプ）

   企画書の方針
   - 選択の核は「何を作って棚に並べるか」。接客はしない
   - 販売は自動、買取だけプレイヤーが選ぶ
   - 1日＝準備 → 日を進める → 結果
   - 店レベルは4系統（酒場／ショップ／工房／宿屋）
   - エンドレス。解放率が進行軸
   - 操作はマウスのみ。場所はクリックで切り替える（キャラは歩かせない）

   素のJS・IIFE。ビルドなし。データは data.js の window.SHOP_DATA
   ========================================================== */
(function () {
  'use strict';

  var D = window.SHOP_DATA;
  var ART = window.ART;
  var SAVE_KEY = 'shop-save-v2';   // v1は棚が現物単位。v2で種類単位に変えたため互換なし
  var BP_BUY_RATE = 0.6;           // ハンターから設計図を買い取る値。商人価格に対する割合

  /* ==========================================================
     索引（データを引きやすくしておく）
     ========================================================== */
  var MAT = {};      // 素材 id → def
  var PROD = {};     // 商品 id → def（設計図の product）
  var BP = {};       // 設計図 id → def
  var DUN = {};      // ダンジョン id → def
  var HUN = {};      // ハンター id → def

  D.materials.forEach(function (m) { MAT[m.id] = m; });
  D.blueprints.forEach(function (b) { BP[b.id] = b; PROD[b.product.id] = b.product; });
  D.dungeons.forEach(function (d) { DUN[d.id] = d; });
  D.hunters.forEach(function (h) { HUN[h.id] = h; });

  var GRADE_INDEX = {};   // 部屋グレードid → 段階（0=ぼろい…）。絵の見た目分けに使う
  D.roomGrades.forEach(function (g, i) { GRADE_INDEX[g.id] = i; });

  /* 図鑑に載りうるものの総数（解放率の分母） */
  var DEX_TOTAL =
    D.materials.length + D.blueprints.length +
    D.hunters.length + D.dungeons.length +
    D.events.length + D.achievements.length;

  /* ==========================================================
     状態
     ========================================================== */
  var S = null;
  var uidSeq = 1;

  function freshState() {
    var st = {
      day: 1,
      gold: D.start.gold,
      earned: 0,
      fac: { saloon: 0, shop: 0, workshop: 0, inn: 0 },
      mats: {},                 // 素材 id → 個数
      bps: D.start.blueprints.slice(),
      stock: [],                // 作った商品の個体 {uid, id, history:[]}
      shelf: [],                // 棚に出している商品id（種類。個体ではない）
      shelfSince: {},           // 商品id → 棚に出した日（売れ残り表示用）
      hunters: {},
      pending: [],              // 買取対象 {mat, n, from, dungeon}
      bossDown: {},
      cleared: false,           // 全ダンジョンの賞金首を倒した
      dex: { mat: {}, prod: {}, hunter: {}, dungeon: {} },
      events: {},
      ach: {},
      counters: { sold: 0, craft: 0, bossKill: 0, soldItem: {}, boughtMat: {} },
      matLog: {},               // 素材id → 仕入れの出所の待ち行列（来歴のもと）
      chronicle: {},            // 商品id → 売れた品が辿った道（図鑑で読む）
      opt: { autoLog: false },  // 管理室の設定
      lastResult: null,
      uid: 1
    };
    Object.keys(D.start.materials).forEach(function (k) {
      st.mats[k] = D.start.materials[k];
      st.dex.mat[k] = true;          // 手元にある素材は最初から図鑑に載る
      st.matLog[k] = [];
      for (var i = 0; i < st.mats[k]; i++) st.matLog[k].push({ start: true });
    });
    D.hunters.forEach(function (h) {
      st.hunters[h.id] = {
        id: h.id, gold: 300, intimacy: 0,
        equip: { weapon: null, armor: null, tank: null, cannon: null, subgun: null, engine: null },
        dur: {},                // 枠 → 残りの耐久。0になると壊れて外れる
        bag: {},                // 持ち込む消耗品
        place: 'away',          // away / town / dungeon
        dungeon: null, back: 0
      };
    });
    return st;
  }

  function save() {
    S.uid = uidSeq;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
  }
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var st = JSON.parse(raw);
      if (!st || !st.hunters) return null;
      uidSeq = st.uid || 1;
      fillNewHunters(st);
      return st;
    } catch (e) { return null; }
  }

  /* data.js にハンターを足したとき、古いセーブにはまだその組がいない。
     居ないものだけ「away（まだ来ていない）」で補う。既存の進行は壊さない */
  function fillNewHunters(st) {
    D.hunters.forEach(function (h) {
      if (st.hunters[h.id]) return;
      st.hunters[h.id] = {
        id: h.id, gold: 300, intimacy: 0,
        equip: { weapon: null, armor: null, tank: null, cannon: null, subgun: null, engine: null },
        dur: {}, bag: {}, place: 'away', dungeon: null, back: 0
      };
    });
  }

  /* ==========================================================
     小道具
     ========================================================== */
  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(a) { return a[rnd(a.length)]; }
  function range(r) { return r[0] + rnd(r[1] - r[0] + 1); }
  function gold(n) { return n.toLocaleString('ja-JP') + ' G'; }

  function fac(key) { return D.facilities[key].levels[S.fac[key]]; }
  function facNext(key) {
    var L = D.facilities[key].levels;
    return S.fac[key] + 1 < L.length ? L[S.fac[key] + 1] : null;
  }

  /* 宿屋の部屋を、良いグレードから順に並べた配列にする。
     長さがそのまま「同時に滞在できる組数」になる */
  function innRooms() {
    var conf = fac('inn').rooms || {};
    var out = [];
    D.roomGrades.forEach(function (g) {
      for (var i = 0; i < (conf[g.id] || 0); i++) out.push(g);
    });
    return out.sort(function (a, b) { return b.rate - a.rate; });
  }
  function innCapacity() { return innRooms().length; }

  function matCount(id) { return S.mats[id] || 0; }
  function addMat(id, n) {
    S.mats[id] = matCount(id) + n;
    if (n > 0) S.dex.mat[id] = true;
  }

  /* ==========================================================
     来歴
     「どこから来た素材が、何に化けて、誰の手に渡ったか」を残す。
     素材は個数で持っているので、仕入れの出所だけを待ち行列にしておき、
     作るときに古い順から取り出して、商品の来歴に書き写す（企画3.1）
     ========================================================== */
  function pushMatLog(id, n, src) {
    var q = S.matLog[id] = S.matLog[id] || [];
    for (var i = 0; i < n; i++) q.push(src);
    if (q.length > 200) q.splice(0, q.length - 200);   // 際限なく溜めない
  }
  function takeMatLog(id, n) {
    var q = S.matLog[id] || [], out = [];
    for (var i = 0; i < n; i++) out.push(q.shift() || null);
    return out;
  }
  function srcText(src) {
    if (!src) return '出所の知れない';
    if (src.start) return '開店のときからあった';
    if (src.dismantle) return src.dismantle + 'を分解した';
    if (src.dun) return DUN[src.dun].name + 'から' + HUN[src.from].name + 'が持ち帰った';
    return '商人から買った';
  }

  function newItem(prodId, history) {
    var it = { uid: uidSeq++, id: prodId, history: history || [] };
    S.stock.push(it);
    S.dex.prod[prodId] = true;
    return it;
  }
  function itemById(uid) {
    for (var i = 0; i < S.stock.length; i++) if (S.stock[i].uid === uid) return S.stock[i];
    return null;
  }
  function removeItem(uid) {
    S.stock = S.stock.filter(function (i) { return i.uid !== uid; });
  }
  /* その商品idの在庫が何個あるか（棚の表示・売り切れ判定に使う） */
  function stockCount(prodId) {
    var n = 0;
    for (var i = 0; i < S.stock.length; i++) if (S.stock[i].id === prodId) n++;
    return n;
  }
  /* その商品idの在庫を1個だけ取り出す（一番古いものから減っていく） */
  function stockOne(prodId) {
    for (var i = 0; i < S.stock.length; i++) if (S.stock[i].id === prodId) return S.stock[i];
    return null;
  }

  function hunterPower(h) {
    var base = HUN[h.id].basePower, p = base;
    Object.keys(h.equip).forEach(function (slot) {
      var pid = h.equip[slot];
      if (pid && PROD[pid]) p += PROD[pid].power || 0;
    });
    return p;
  }
  function hasTank(h) { return !!h.equip.tank; }

  /* ==========================================================
     戦闘
     装備から能力を出し、ダンジョンの層を1つずつ実際に戦う。
     どこまで進めたか（到達地点）も、賞金首を倒せたかも、この結果で決まる。
     ハンターは死なない。HPが尽きたらそこで撤退して戻る（企画2章）
     ========================================================== */

  /* 武器・砲＝攻撃、防具・戦車＝防御とHP。戦車の砲は戦車を持っている時だけ効く */
  function hunterStats(h) {
    var hd = HUN[h.id], C = D.combat;
    var atk = hd.basePower, guard = 0;
    function p(slot) {
      var pid = h.equip[slot];
      return pid && PROD[pid] ? (PROD[pid].power || 0) : 0;
    }
    atk += p('weapon');
    guard += p('armor');
    if (hasTank(h)) {
      atk += p('cannon') + p('subgun');
      guard += p('tank') + Math.floor(p('engine') / 2);
    }
    var hp = C.baseHp + hd.basePower * C.hpPerBase + guard * C.hpPerGuard;
    return { atk: atk, guard: guard, maxHp: hp };
  }

  /* 商品を「ハンターの買い物の優先順」の分類に振り分ける */
  function buyGroup(p) {
    if (p.kind === 'consumable') return 'consumable';
    if (p.kind === 'tank') return 'tank';
    if (p.slot === 'cannon' || p.slot === 'subgun' || p.slot === 'engine') return 'tank';
    if (p.kind === 'fuel') return 'fuel';           // 宿泊時に別途買うので、ここでは対象外
    return 'equip';
  }

  function damage(atk, guard) {
    var d = atk - Math.floor(guard / 2);
    return Math.max(1, d + rnd(3) - 1);   // ±1のばらつき
  }

  /* 消耗品の持ち込み。棚で買ったものが、そのまま生死を分ける */
  function bagCount(h) {
    var n = 0;
    Object.keys(h.bag || {}).forEach(function (k) { n += h.bag[k]; });
    return n;
  }
  function useOnePotion(h) {
    var keys = Object.keys(h.bag || {}).filter(function (k) { return h.bag[k] > 0; });
    if (!keys.length) return null;
    var k = keys[0];
    h.bag[k]--;
    if (!h.bag[k]) delete h.bag[k];
    return PROD[k] ? PROD[k].name : k;
  }

  /* ダンジョンを1回もぐる。戻り値に到達層・討伐・ログが入る */
  function runDungeon(h, dun) {
    var C = D.combat;
    var st = hunterStats(h);
    var hp = st.maxHp;
    var log = [];
    var reached = 0, bossDown = false;
    var entered = 0;                     // 足を踏み入れた層の数。装備の摩耗はこれで決まる

    log.push('強さ ' + st.atk + ' ／ 守り ' + st.guard + ' ／ 体力 ' + hp +
             '　持ち込み ' + bagCount(h) + '個');

    for (var f = 1; f <= dun.floors; f++) {
      entered++;
      var base = pick(dun.enemies);
      var scale = 1 + (f - 1) * C.floorScale;
      var e = {
        name: base.name,
        hp: Math.round(base.hp * scale),
        atk: Math.round(base.atk * scale)
      };
      var eHp = e.hp, turns = 0;

      while (eHp > 0 && hp > 0 && turns < 40) {
        turns++;
        eHp -= damage(st.atk, 0);
        if (eHp <= 0) break;
        hp -= damage(e.atk, st.guard);
        // 消耗品で立て直す
        if (hp > 0 && hp < st.maxHp * C.healAt && bagCount(h)) {
          var used = useOnePotion(h);
          var heal = Math.round(st.maxHp * C.healRate);
          hp = Math.min(st.maxHp, hp + heal);
          log.push(f + '層：' + used + 'を使った（体力 ' + hp + '）');
        }
      }

      if (hp <= 0) {
        log.push(f + '層：' + e.name + 'に押し返された。ここで撤退');
        break;
      }
      reached = f;
      log.push(f + '層：' + e.name + 'を倒した（体力 ' + hp + '）');
    }

    // 最下層まで行けたら賞金首
    if (reached >= dun.floors && !S.bossDown[dun.id]) {
      var b = dun.boss, bHp = b.hp, t = 0;
      log.push('最下層：' + b.name + 'と対峙した');
      while (bHp > 0 && hp > 0 && t < 200) {
        t++;
        bHp -= damage(st.atk, 0);
        if (bHp <= 0) break;
        hp -= damage(b.atk, st.guard);
        if (hp > 0 && hp < st.maxHp * C.healAt && bagCount(h)) {
          var u2 = useOnePotion(h);
          hp = Math.min(st.maxHp, hp + Math.round(st.maxHp * C.healRate));
          log.push('　' + u2 + 'を使った（体力 ' + hp + '）');
        }
      }
      entered += 2;                      // 賞金首との戦いは装備を余計に痛める
      if (bHp <= 0) {
        bossDown = true;
        log.push(b.name + 'を仕留めた（体力 ' + hp + '）');
      } else {
        log.push(b.name + 'に敵わず撤退した');
      }
    }

    /* ---- 装備の摩耗。0になったものは壊れて外れる ---- */
    var broken = [];
    h.dur = h.dur || {};
    Object.keys(h.equip).forEach(function (slot) {
      var pid = h.equip[slot];
      if (!pid || !PROD[pid]) return;
      var left = (h.dur[slot] == null ? (PROD[pid].dur || 999) : h.dur[slot]) - entered;
      if (left <= 0) {
        broken.push(PROD[pid].name);
        h.equip[slot] = null;
        delete h.dur[slot];
      } else {
        h.dur[slot] = left;
        log.push('摩耗：' + PROD[pid].name + '（残り ' + left + '）');
      }
    });
    broken.forEach(function (nm) { log.push('**' + nm + 'が壊れた**'); });

    return {
      reached: reached, floors: dun.floors, bossDown: bossDown,
      log: log, hp: hp, broken: broken
    };
  }

  /* 商人は「無限在庫・数量指定」なので、日替わりで抽選する必要がない。
     代わりに「今の工房レベルで意味があるか」で出し分ける。 */

  /* 今の工房レベルで使い道がある素材だけ（企画方針：使う用途のない素材は並べない） */
  function usefulMaterials() {
    var lv = fac('workshop').craft;
    var used = {};
    D.blueprints.forEach(function (b) {
      if (b.level > lv) return;
      b.cost.forEach(function (c) { used[c.id] = true; });
    });
    return D.materials.filter(function (m) { return used[m.id]; });
  }

  /* 工房レベルが足りていて、レアではなく、まだ持っていない設計図はすべて売る */
  function merchantBlueprints() {
    var lv = fac('workshop').craft;
    return D.blueprints.filter(function (b) {
      return !b.rare && b.level <= lv && S.bps.indexOf(b.id) < 0;
    });
  }

  /* ==========================================================
     解放の判定
     ========================================================== */
  function condMet(c) {
    switch (c.type) {
      case 'sold':      return S.counters.sold >= c.n;
      case 'craft':     return S.counters.craft >= c.n;
      case 'bossKill':  return S.counters.bossKill >= c.n;
      case 'earned':    return S.earned >= c.n;
      case 'soldItem':  return (S.counters.soldItem[c.id] || 0) >= c.n;
      case 'boughtMat': return (S.counters.boughtMat[c.id] || 0) >= c.n;
      case 'intimacy':  return S.hunters[c.id] && S.hunters[c.id].intimacy >= c.n;
      case 'bossDown':  return !!S.bossDown[c.id];
      case 'facility':  return S.fac[c.key] >= c.level;
    }
    return false;
  }

  /* 解放されたものを配列で返す（結果画面で見せる） */
  function checkUnlocks() {
    var out = [];
    D.events.forEach(function (e) {
      if (S.events[e.id] || !condMet(e.cond)) return;
      S.events[e.id] = true;
      out.push({ kind: '出来事', name: e.title, text: e.text });
    });
    D.achievements.forEach(function (a) {
      if (S.ach[a.id] || !condMet(a.cond)) return;
      S.ach[a.id] = true;
      out.push({ kind: '実績', name: a.name, text: a.text });
    });
    return out;
  }

  function dexCount() {
    var n = 0;
    n += Object.keys(S.dex.mat).length;
    n += Object.keys(S.dex.prod).length;
    n += Object.keys(S.dex.hunter).length;
    n += Object.keys(S.dex.dungeon).length;
    n += Object.keys(S.events).length;
    n += Object.keys(S.ach).length;
    return n;
  }

  /* ==========================================================
     1日を進める
     ========================================================== */
  function nextDay() {
    var R = { day: S.day, sales: [], reports: [], inn: 0, buys: [], unlocks: [] };

    /* --- 1. 帰還 --- */
    D.hunters.forEach(function (hd) {
      var h = S.hunters[hd.id];
      if (h.place !== 'dungeon' || h.back > S.day) return;
      var dun = DUN[h.dungeon];
      var power = hunterPower(h);
      h.place = 'town';
      h.dungeon = null;
      h.justBack = true;      // 帰った日は宿に泊まる。翌日まで店で買い物ができる
      S.dex.dungeon[dun.id] = true;

      /* 裏で実際に潜らせる。到達層も討伐も、この戦闘の結果 */
      var res = runDungeon(h, dun);

      var line = hd.name + 'が' + dun.name + 'から戻った。' +
        res.reached + ' / ' + res.floors + '層まで進んだ。';
      if (res.bossDown) {
        S.bossDown[dun.id] = true;
        S.counters.bossKill++;
        h.gold += dun.boss.reward;
        line += '**' + dun.boss.name + 'を仕留めた。**賞金 ' + gold(dun.boss.reward) + ' を受け取っている。';
      } else if (!S.bossDown[dun.id] && res.reached < res.floors) {
        line += dun.boss.name + 'のいる最下層には届かなかった。';
      }
      // 壊れた装備は、そのまま次の売り物の需要になる
      if (res.broken.length) {
        line += '**' + res.broken.join('と') + 'が壊れた。**買い替えが要る。';
      }

      // 持ち帰り。深く進んだぶんだけ多い（層ごとに1つ、討伐でさらに追加）
      var n = Math.max(1, res.reached) + (res.bossDown ? dun.level : 0);
      var got = {};
      for (var i = 0; i < n; i++) {
        var pool = [];
        dun.drops.forEach(function (d) { for (var k = 0; k < d.w; k++) pool.push(d.id); });
        var mid = pick(pool);
        got[mid] = (got[mid] || 0) + 1;
      }
      Object.keys(got).forEach(function (mid) {
        S.pending.push({ mat: mid, n: got[mid], from: hd.id, dungeon: dun.id });
      });

      /* 設計図の持ち帰り。rare な設計図は商人に並ばないので、ここでしか手に入らない */
      (dun.bpDrops || []).forEach(function (bd) {
        if (S.bps.indexOf(bd.id) >= 0) return;                                  // もう持っている
        if (S.pending.some(function (p) { return p.bp === bd.id; })) return;    // もう買取待ちにある
        if (Math.random() >= bd.chance) return;
        S.pending.push({ bp: bd.id, n: 1, from: hd.id, dungeon: dun.id });
        line += '**' + BP[bd.id].name + 'を持ち帰っている。**';
      });

      h.gold += hd.income + dun.level * 90;
      R.reports.push({ text: line, hunter: hd.id, power: power, battle: res.log });
    });

    /* --- 2. 客が来る ---
       酒場 = この街に出入りするハンターの組数（潜行中も枠を使う）
       宿屋 = 同時に町に滞在できる組数 */
    var active = D.hunters.filter(function (hd) {
      return S.hunters[hd.id].place !== 'away';
    }).length;

    var comers = [];
    D.hunters.forEach(function (hd) {
      var h = S.hunters[hd.id];
      if (h.place === 'town') { comers.push(hd.id); return; }
      if (h.place === 'away' && active < fac('saloon').hunters && comers.length < innCapacity()) {
        h.place = 'town';
        active++;
        comers.push(hd.id);
      }
    });
    comers = comers.slice(0, innCapacity());
    comers.forEach(function (id) { S.dex.hunter[id] = true; });

    /* --- 3. ハンターが棚から買う ---
       棚は「種類」の枠。並んでいる種類ごとに、在庫がある限り売れる。
       何から見るかは組ごとの優先順（hd.buys）で決まる */
    comers.forEach(function (id) {
      var h = S.hunters[id], hd = HUN[id];
      var order = hd.buys || ['consumable', 'equip', 'tank'];

      order.forEach(function (want) {
        S.shelf.forEach(function (pid) {
          var p = PROD[pid];
          var it = stockOne(pid);
          if (!p || !it || h.gold < p.price) return;
          if (buyGroup(p) !== want) return;

          if (p.kind === 'consumable') {
            h.bag = h.bag || {};
            h.bag[p.id] = (h.bag[p.id] || 0) + 1;   // 持ち込んでダンジョンで使う
            sell(it, id, R);
          } else if (p.kind !== 'fuel') {
            // 装備・戦車・戦車部品。今より良いものだけ買う
            var cur = h.equip[p.slot];
            var curPow = cur && PROD[cur] ? PROD[cur].power : -1;
            var needTank = (p.slot === 'cannon' || p.slot === 'subgun' || p.slot === 'engine');
            if (needTank && !hasTank(h)) return;     // 戦車がないと部品は要らない
            if ((p.power || 0) > curPow) {
              h.equip[p.slot] = p.id;
              h.dur = h.dur || {};
              h.dur[p.slot] = p.dur || 999;          // 買った時点で耐久が満タンになる
              sell(it, id, R);
            }
          }
        });
      });
    });

    /* --- 4. モブが消耗品を買う --- */
    var mobs = range(fac('saloon').mobs);
    for (var m = 0; m < mobs; m++) {
      var consPid = S.shelf.find(function (pid) {
        return PROD[pid] && PROD[pid].kind === 'consumable' && stockCount(pid) > 0;
      });
      if (!consPid) break;
      sell(stockOne(consPid), null, R);
    }

    /* --- 5. 宿泊（ハンターが良い部屋から取り、空きにモブ）--- */
    var rooms = innRooms();          // 良い部屋から順に並んでいる
    var ri = 0;
    R.rooms = [];
    comers.forEach(function (id) {
      if (ri >= rooms.length) return;
      var g = rooms[ri++];
      R.inn += g.rate;
      S.hunters[id].intimacy += g.rate;
      R.rooms.push({ who: HUN[id].name, room: g.name, rate: g.rate });

      /* 戦車持ちは、泊まったときに燃料・砲弾も買っていく（企画3.4） */
      var h = S.hunters[id];
      if (!hasTank(h)) return;
      S.shelf.forEach(function (pid) {
        var p = PROD[pid], it = stockOne(pid);
        if (!p || !it || p.kind !== 'fuel' || h.gold < p.price) return;
        sell(it, id, R);
      });
    });
    for (var mi = 0; mi < mobs && ri < rooms.length; mi++) {
      var mg = rooms[ri++];
      R.inn += mg.rate;
      R.rooms.push({ who: 'モブ', room: mg.name, rate: mg.rate });
    }
    S.gold += R.inn;
    S.earned += R.inn;

    /* --- 6. 出発 ---
       帰ってきたその日は発たない。1日店にいるので、
       持ち帰った素材を買い取って何か作り、翌日それを売る余地が生まれる */
    comers.forEach(function (id) {
      var h = S.hunters[id], hd = HUN[id];
      var power = hunterPower(h);
      if (h.justBack) {
        h.justBack = false;
        R.reports.push({ text: hd.name + 'は今夜は宿に泊まる。明日また荒野へ出るらしい。', hunter: id, power: power });
        return;
      }
      var can = D.dungeons.filter(function (d) { return power >= d.reqPower; });
      if (!can.length) {
        R.reports.push({ text: hd.name + 'はまだ荒野に出られない。装備が足りていない。', hunter: id, power: power });
        return;
      }
      var dun = can[can.length - 1];
      var days = Math.max(1, dun.days - Math.floor((power - dun.reqPower) / 25) - (S.bossDown[dun.id] ? 1 : 0));
      h.place = 'dungeon';
      h.dungeon = dun.id;
      h.back = S.day + days;
      R.reports.push({
        text: hd.name + 'は' + dun.name + '（Lv' + dun.level + '）へ発った。戻りは' + days + '日後。',
        hunter: id, power: power
      });
    });

    /* --- 7. 日付を進めて解放判定 --- */
    S.day++;
    R.unlocks = checkUnlocks();

    /* 全ダンジョンの賞金首を倒したらクリア扱い。ただしそのまま続けられる（企画3.6） */
    if (!S.cleared && D.dungeons.every(function (d) { return S.bossDown[d.id]; })) {
      S.cleared = true;
      R.unlocks.unshift({
        kind: 'クリア', name: '荒野に賞金首はいなくなった',
        text: 'この店の商品が、すべての賞金首を仕留めた。店はこのまま続けられる。'
      });
    }
    R.buys = S.pending.slice();
    S.lastResult = R;
    save();
    return R;
  }

  /* 1個売る */
  function sell(it, hunterId, R) {
    var p = PROD[it.id];
    S.gold += p.price;
    S.earned += p.price;
    S.counters.sold++;
    S.counters.soldItem[p.id] = (S.counters.soldItem[p.id] || 0) + 1;
    if (hunterId) {
      S.hunters[hunterId].gold -= p.price;
      S.hunters[hunterId].intimacy += p.price;
    }
    R.sales.push({ id: p.id, name: p.name, price: p.price, to: hunterId ? HUN[hunterId].name : 'モブ' });

    /* 売れた時点で来歴が完結する。図鑑で読めるように残しておく */
    var story = (it.history || []).slice();
    story.push(S.day + '日目、' + (hunterId ? HUN[hunterId].name : '名も知らぬ客') + 'の手に渡った');
    var ch = S.chronicle[p.id] = S.chronicle[p.id] || [];
    ch.unshift(story);
    if (ch.length > 5) ch.length = 5;      // 直近5件だけ残す

    removeItem(it.uid);
    if (S.shelfSince[p.id] != null) S.shelfSince[p.id] = S.day;   // 売れた日を「最後に動いた日」として更新
  }

  /* ==========================================================
     操作
     ========================================================== */
  function craft(bpId) {
    var b = BP[bpId];
    if (fac('workshop').craft < b.level) return '工房のレベルが足りない';
    for (var i = 0; i < b.cost.length; i++) {
      if (matCount(b.cost[i].id) < b.cost[i].n) return '素材が足りない';
    }
    /* 使った素材の出所を集めて、商品の来歴の1行目にする */
    var origins = [];
    b.cost.forEach(function (c) {
      addMat(c.id, -c.n);
      takeMatLog(c.id, c.n).forEach(function (src) {
        origins.push(srcText(src) + MAT[c.id].name);
      });
    });
    var uniq = origins.filter(function (t, i) { return origins.indexOf(t) === i; });
    newItem(b.product.id, [
      uniq.join('、') + 'を使って、' + S.day + '日目に作られた'
    ]);
    S.counters.craft++;
    save();
    return null;
  }

  /* 分解：余った商品を素材に戻す。
     戻り率は1未満なので、作って分解するだけでは素材は増えない。
     ネジすら貴重品の世界なので、売れ残りを捨てるのではなく資源に戻す */
  function bpOfProduct(prodId) {
    for (var i = 0; i < D.blueprints.length; i++) {
      if (D.blueprints[i].product.id === prodId) return D.blueprints[i];
    }
    return null;
  }

  function dismantle(prodId) {
    var it = stockOne(prodId);
    if (!it) return '在庫がない';
    var b = bpOfProduct(prodId);
    if (!b) return '分解できない';

    var back = [];
    b.cost.forEach(function (c) {
      var n = Math.floor(c.n * D.craft.dismantleRate);
      if (n <= 0) return;
      addMat(c.id, n);
      pushMatLog(c.id, n, { dismantle: PROD[prodId].name, day: S.day });
      back.push(MAT[c.id].name + ' ×' + n);
    });

    /* 分解された品の来歴も、そこで終わったものとして残す */
    var story = (it.history || []).slice();
    story.push(S.day + '日目、売れないまま分解された');
    var ch = S.chronicle[prodId] = S.chronicle[prodId] || [];
    ch.unshift(story);
    if (ch.length > 5) ch.length = 5;

    removeItem(it.uid);
    if (!stockCount(prodId)) takeOffShelf(prodId);   // 最後の1個なら棚からも下げる
    save();
    return back.length ? null : '戻る素材がなかった';
  }

  /* 棚は「種類」の枠。1種類につき1枠を使う。個数は在庫からそのつど供給される */
  function putOnShelf(prodId) {
    if (S.shelf.indexOf(prodId) >= 0) return null;   // 既に並んでいる
    if (S.shelf.length >= fac('shop').slots) return '棚がいっぱい';
    S.shelf.push(prodId);
    S.shelfSince[prodId] = S.day;
    save();
    return null;
  }
  function takeOffShelf(prodId) {
    S.shelf = S.shelf.filter(function (id) { return id !== prodId; });
    delete S.shelfSince[prodId];
    save();
  }

  /* 商人の在庫は無限。数量を指定して買う */
  function buyFromMerchant(kind, id, n) {
    if (kind === 'mat') {
      n = Math.max(1, n || 1);
      var md = MAT[id], cost = md.sell * n;
      if (S.gold < cost) return '金が足りない';
      S.gold -= cost;
      addMat(id, n);
      pushMatLog(id, n, { day: S.day });   // 商人仕入れ（出所なし）
    } else {
      var b = BP[id];
      if (S.bps.indexOf(id) >= 0) return null;   // 既に持っている
      if (S.gold < b.price) return '金が足りない';
      S.gold -= b.price;
      S.bps.push(id);
    }
    save();
    return null;
  }

  /* 買取リストは素材と設計図の2種類を扱う。表示と値段をここで揃える */
  function pendingInfo(p) {
    if (p.bp) {
      var b = BP[p.bp];
      return {
        name: b.name, icon: 'blueprint',
        desc: '作れる：' + b.product.name + '（設計図Lv' + b.level + '）',
        cost: Math.round(b.price * BP_BUY_RATE)
      };
    }
    var m = MAT[p.mat];
    return { name: m.name + ' ×' + p.n, icon: m.icon, desc: m.desc, cost: m.buy * p.n };
  }

  function buyPending(idx) {
    var p = S.pending[idx];
    if (!p) return '対象がない';
    var info = pendingInfo(p);
    if (S.gold < info.cost) return '金が足りない';
    S.gold -= info.cost;
    if (p.bp) {
      if (S.bps.indexOf(p.bp) < 0) S.bps.push(p.bp);
    } else {
      addMat(p.mat, p.n);
      S.counters.boughtMat[p.mat] = (S.counters.boughtMat[p.mat] || 0) + p.n;
      pushMatLog(p.mat, p.n, { from: p.from, dun: p.dungeon, day: S.day });
    }
    S.pending.splice(idx, 1);
    save();
    return null;
  }

  /* 買えるだけ買う。買えなかったものは飛ばして先へ進む
     （高い設計図が先頭にあっても、後ろの安い素材が買えなくならないように） */
  function buyAllPending() {
    var n = 0, i = 0;
    while (i < S.pending.length) {
      if (buyPending(i)) i++;
      else n++;
    }
    return n;
  }

  function upgrade(key) {
    var nx = facNext(key);
    if (!nx) return 'これ以上は広げられない';
    if (S.gold < nx.cost) return '金が足りない';
    S.gold -= nx.cost;
    S.fac[key]++;
    save();
    return null;
  }

  /* ==========================================================
     画面
     絵（scene.js）の上に部屋を重ね、押すとその部屋の窓が開く。
     窓の中身は以前のタブの中身をそのまま使い回す（elMain＝窓の本体）
     ========================================================== */
  var elMain   = document.getElementById('winBody');   // 窓の中身
  var elHud    = document.getElementById('hud');
  var elOverlay = document.getElementById('overlay');
  var elScene  = document.getElementById('scene');
  var elStage  = document.getElementById('stage');
  var elCv     = document.getElementById('cv');
  var elWindow = document.getElementById('window');
  var elWinTitle = document.getElementById('winTitle');

  var ROOM_TITLES = {
    shop: 'ショップ', workshop: '工房', inn: '宿屋', saloon: '酒場',
    office: '帳場', bedroom: '自室', library: '資料室',
    data: 'データルーム', admin: '管理室', merchant: '商人'
  };
  var currentWindow = null;   // 開いている部屋の窓。nullなら絵だけ

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(label, fn, cls) {
    var b = el('button', 'sp-btn' + (cls ? ' ' + cls : ''), label);
    b.addEventListener('click', fn);
    return b;
  }
  function advanceDay() {
    var R = nextDay();
    showResult(R);
  }

  function toast(msg) {
    if (!msg) return;
    var t = el('div', 'sp-toast', msg);
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1600);
  }

  var VIEWS = {
    shop: viewShop, workshop: viewWorkshop, merchant: viewMerchant,
    inn: viewInn, saloon: viewSaloon, library: viewLibrary,
    office: viewOffice, bedroom: viewBedroom, data: viewData, admin: viewAdmin
  };

  function render() {
    renderHud();
    drawScene();
    if (currentWindow) renderWindow(currentWindow);
  }

  function renderWindow(key) {
    elWinTitle.textContent = ROOM_TITLES[key] || '';
    elMain.innerHTML = '';
    (VIEWS[key] || function () {})();
    elMain.scrollTop = 0;
  }
  function openWindow(key) {
    currentWindow = key;
    elWindow.hidden = false;
    renderWindow(key);
  }
  function closeWindow() {
    currentWindow = null;
    elWindow.hidden = true;
  }
  document.getElementById('winClose').addEventListener('click', closeWindow);

  /* 絵に渡す状態。細かい数はここで拾って scene.js に渡すだけ（見た目用の近似でよい） */
  function sceneState() {
    var townHunters = D.hunters.filter(function (hd) { return S.hunters[hd.id].place === 'town'; });
    var rooms = innRooms().map(function (g, i) {
      return { grade: GRADE_INDEX[g.id] || 0, who: i < townHunters.length ? 'hunter' : null };
    });
    function fillOf(pid) { return Math.min(1, stockCount(pid) / 4); }
    var fill = S.shelf.length
      ? S.shelf.reduce(function (a, pid) { return a + fillOf(pid); }, 0) / S.shelf.length
      : 0;
    var mobRange = fac('saloon').mobs;
    return {
      slots: fac('shop').slots,
      racksFilled: fill,
      rooms: rooms,
      mobs: Math.round((mobRange[0] + mobRange[1]) / 2),
      hunters: townHunters,
      fac: S.fac
    };
  }

  /* canvasを画面いっぱいに収め、当たり判定・名札を絵の上に重ねる */
  function drawScene() {
    elCv.width = SCENE.W;
    elCv.height = SCENE.H;
    var g = elCv.getContext('2d');
    var hits = SCENE.draw(g, sceneState());
    fitStage();

    Array.prototype.slice.call(elScene.querySelectorAll('.sp-hot, .sp-tag')).forEach(function (e) { e.remove(); });
    function pct(v, total) { return (v / total * 100) + '%'; }
    hits.forEach(function (h) {
      var hot = el('div', 'sp-hot');
      hot.style.left = pct(h.x, SCENE.W); hot.style.top = pct(h.y, SCENE.H);
      hot.style.width = pct(h.w, SCENE.W); hot.style.height = pct(h.h, SCENE.H);
      hot.title = h.label;
      hot.addEventListener('click', function () { openWindow(h.place); });
      elStage.appendChild(hot);

      var tag = el('div', 'sp-tag', h.label);
      tag.style.left = pct(h.x + 2, SCENE.W); tag.style.top = pct(h.y + 2, SCENE.H);
      if (h.place === 'office' && S.pending.length) tag.appendChild(el('i', 'sp-dot'));
      elStage.appendChild(tag);
    });
  }

  /* .sp-stage をcanvasと同じ比率・実寸にして、%指定のホットスポットが絵とずれないようにする */
  function fitStage() {
    var cw = elScene.clientWidth, ch = elScene.clientHeight;
    var scale = Math.min(cw / SCENE.W, ch / SCENE.H);
    elStage.style.width = Math.floor(SCENE.W * scale) + 'px';
    elStage.style.height = Math.floor(SCENE.H * scale) + 'px';
  }
  window.addEventListener('resize', fitStage);

  function renderHud() {
    elHud.innerHTML = '';
    var d = el('div', 'sp-hud-item');
    d.appendChild(el('span', 'sp-k', '日'));
    d.appendChild(el('b', null, String(S.day)));
    var g = el('div', 'sp-hud-item');
    g.appendChild(el('span', 'sp-k', '所持金'));
    g.appendChild(el('b', 'sp-gold', gold(S.gold)));
    var r = el('div', 'sp-hud-item');
    r.appendChild(el('span', 'sp-k', '解放'));
    r.appendChild(el('b', null, dexCount() + ' / ' + DEX_TOTAL));
    elHud.appendChild(d); elHud.appendChild(g); elHud.appendChild(r);

    /* どの場所にいても押せる。オフィスまで行かなくても日を進められるように */
    var dayBtn = btn('次の日へ', advanceDay, 'sp-hud-day');
    if (S.pending.length) dayBtn.appendChild(el('i', 'sp-dot'));
    elHud.appendChild(dayBtn);
  }

  function section(title, note) {
    var s = el('section', 'sp-sec');
    var h = el('h2', null, title);
    s.appendChild(h);
    if (note) s.appendChild(el('p', 'sp-note', note));
    elMain.appendChild(s);
    return s;
  }

  function itemRow(prod, right, count) {
    var row = el('div', 'sp-row');
    row.appendChild(ART.img(prod.icon || 'scrap'));
    var mid = el('div', 'sp-row-mid');
    mid.appendChild(el('div', 'sp-row-name', prod.name));
    var sub = [];
    if (prod.kind === 'equip' || prod.kind === 'tank') sub.push('攻+' + prod.power);
    if (prod.dur) sub.push('耐久 ' + prod.dur);
    if (prod.price) sub.push(gold(prod.price));
    mid.appendChild(el('div', 'sp-row-sub', sub.join('　')));
    if (prod.desc) mid.appendChild(el('div', 'sp-row-desc', prod.desc));
    row.appendChild(mid);
    if (count != null) row.appendChild(el('span', 'sp-num', '×' + count));
    if (right) row.appendChild(right);
    return row;
  }

  /* 商人の素材：数量を指定して買う */
  function buyMatControl(m) {
    var wrap = el('div', 'sp-qtywrap');
    var qty = document.createElement('input');
    qty.type = 'number'; qty.min = '1'; qty.value = '1'; qty.className = 'sp-qty';
    var buyBtn = btn('買う ' + gold(m.sell), function () {
      var n = Math.max(1, parseInt(qty.value, 10) || 1);
      toast(buyFromMerchant('mat', m.id, n)); render();
    }, 'sp-btn-s is-main');
    function upd() {
      var n = Math.max(1, parseInt(qty.value, 10) || 1);
      buyBtn.textContent = '買う ' + gold(m.sell * n);
    }
    qty.addEventListener('input', upd);
    wrap.appendChild(qty);
    wrap.appendChild(buyBtn);
    return wrap;
  }

  /* ---------- ショップ（棚に並べる） ----------
     棚は「種類」の枠。1枠＝1商品ライン。個数は在庫からそのつど供給される */
  function viewShop() {
    var slots = fac('shop').slots;
    var s1 = section('棚', '種類を並べる。在庫がある限り、翌日そのまま売れていく。枠 ' + S.shelf.length + ' / ' + slots);
    var grid = el('div', 'sp-shelf');
    for (var i = 0; i < slots; i++) {
      var pid = S.shelf[i];
      var cell = el('div', 'sp-slot');
      if (pid != null) {
        var p = PROD[pid], n = stockCount(pid);
        cell.appendChild(ART.img(p.icon, 3));
        cell.appendChild(el('span', 'sp-slot-name', p.name));
        cell.appendChild(el('span', 'sp-slot-price', gold(p.price)));
        if (n > 0) {
          cell.appendChild(el('span', 'sp-slot-count', '在庫 ×' + n));
        } else {
          cell.appendChild(el('span', 'sp-slot-count is-zero', '在庫切れ'));
        }
        // 何日も売れていない種類は、置き場所を間違えているということ
        var since = S.shelfSince[pid] != null ? S.shelfSince[pid] : S.day;
        var stale = S.day - since;
        if (n > 0 && stale >= 2) {
          cell.appendChild(el('span', 'sp-stale', stale + '日 売れ残り'));
          cell.classList.add('is-stale');
        }
        (function (id) {
          cell.addEventListener('click', function () { takeOffShelf(id); render(); });
        })(pid);
        cell.classList.add('is-filled');
      } else {
        cell.appendChild(el('span', 'sp-slot-empty', '空き'));
      }
      grid.appendChild(cell);
    }
    s1.appendChild(grid);

    /* 在庫は種類ごとに個数でまとめて出す（現物の来歴は図鑑の裏側で個別に持ち続ける） */
    var grouped = {};
    S.stock.forEach(function (it) { grouped[it.id] = (grouped[it.id] || 0) + 1; });
    var kinds = Object.keys(grouped);
    var s2 = section('在庫', kinds.length ? '棚に出すと、同じ種類はまとめて売れるようになる' : '在庫がない。工房で作る');
    kinds.forEach(function (pid) {
      var p = PROD[pid];
      var onShelf = S.shelf.indexOf(pid) >= 0;
      var right = onShelf
        ? el('span', 'sp-tag', '陳列中')
        : btn('棚に出す', function () { toast(putOnShelf(pid)); render(); }, 'sp-btn-s');
      s2.appendChild(itemRow(p, right, grouped[pid]));
    });

    var s3 = section('素材');
    var mats = D.materials.filter(function (m) { return matCount(m.id) > 0; });
    if (!mats.length) s3.appendChild(el('p', 'sp-note', 'なし'));
    mats.forEach(function (m) {
      s3.appendChild(itemRow({ name: m.name, icon: m.icon }, el('b', 'sp-num', '×' + matCount(m.id))));
    });

    section('増築');
    elMain.appendChild(buildFacilityCard('shop'));
  }

  /* ---------- 工房（作る） ---------- */
  function viewWorkshop() {
    var lv = fac('workshop').craft;
    section('工房', '作れる設計図レベル：' + lv + '　（工房を上げると増える）');
    S.bps.forEach(function (id) {
      var b = BP[id], p = b.product;
      var can = lv >= b.level && b.cost.every(function (c) { return matCount(c.id) >= c.n; });
      var box = el('div', 'sp-card' + (can ? '' : ' is-off'));
      box.appendChild(itemRow(p, btn('作る', function () {
        toast(craft(id)); render();
      }, 'sp-btn-s' + (can ? ' is-main' : ''))));
      var cost = el('div', 'sp-cost');
      cost.appendChild(el('span', 'sp-k', 'Lv' + b.level + '　素材'));
      b.cost.forEach(function (c) {
        var ok = matCount(c.id) >= c.n;
        cost.appendChild(el('span', 'sp-tag' + (ok ? '' : ' is-lack'),
          MAT[c.id].name + ' ' + matCount(c.id) + '/' + c.n));
      });
      box.appendChild(cost);
      elMain.appendChild(box);
    });

    /* 売れ残った品を素材に戻す。捨てるよりはるかに世界観に合う */
    var grouped = {};
    S.stock.forEach(function (it) { grouped[it.id] = (grouped[it.id] || 0) + 1; });
    var held = Object.keys(grouped);
    var rate = Math.round(D.craft.dismantleRate * 100);
    var s2 = section('分解', held.length
      ? '売れ残りを素材に戻す。戻るのは素材の' + rate + '%（切り捨て）'
      : '分解できる在庫がない');
    held.forEach(function (pid) {
      var b = bpOfProduct(pid);
      if (!b) return;
      var backs = b.cost.map(function (c) {
        return MAT[c.id].name + ' ×' + Math.floor(c.n * D.craft.dismantleRate);
      }).filter(function (t) { return !/×0$/.test(t); });
      var btnEl = btn('分解', function () {
        toast(dismantle(pid)); render();
      }, 'sp-btn-s');
      var row = itemRow({
        name: PROD[pid].name, icon: PROD[pid].icon,
        desc: backs.length ? '戻る：' + backs.join('、') : '戻る素材なし'
      }, btnEl, grouped[pid]);
      s2.appendChild(row);
    });

    section('増築');
    elMain.appendChild(buildFacilityCard('workshop'));
  }

  /* ---------- 商人 ---------- */
  function viewMerchant() {
    section('商人', '在庫は無限。数量を指定して買える。今の工房レベルで使い道がある素材だけを置いている');
    var mats = usefulMaterials();
    if (!mats.length) elMain.appendChild(el('p', 'sp-note', '今のところ使い道のある素材はない'));
    mats.forEach(function (m) {
      elMain.appendChild(itemRow({ name: m.name, icon: m.icon, desc: m.desc }, buyMatControl(m)));
    });

    section('設計図', '工房レベルが足りている物は、レアな物を除いてすべて並ぶ');
    var bps = merchantBlueprints();
    if (!bps.length) elMain.appendChild(el('p', 'sp-note', '今買える新しい設計図はない'));
    bps.forEach(function (b) {
      var buy = btn('買う ' + gold(b.price), function () {
        toast(buyFromMerchant('bp', b.id)); render();
      }, 'sp-btn-s is-main');
      var desc = '作れる：' + b.product.name + '（設計図Lv' + b.level + '）' +
        (b.product.desc ? '　' + b.product.desc : '');
      elMain.appendChild(itemRow({ name: b.name, icon: 'blueprint', desc: desc }, buy));
    });
  }

  /* ---------- 増築カード（店レベル4系統） ----------
     以前は「増築」という独立した部屋だったが、各部屋（ショップ／工房／酒場／宿屋）の
     窓の中に、その部屋自身の増築カードを置く形に変えた */
  function buildFacilityCard(key) {
    var f = D.facilities[key], cur = fac(key), nx = facNext(key);
    var card = el('div', 'sp-card');
    var head = el('div', 'sp-fac-head');
    head.appendChild(el('b', null, f.name + 'の設備'));
    head.appendChild(el('span', 'sp-lv', 'Lv' + (S.fac[key] + 1)));
    card.appendChild(head);
    card.appendChild(el('p', 'sp-note', f.desc));
    card.appendChild(el('div', 'sp-fac-now', facText(key, cur)));
    if (nx) {
      var can = S.gold >= nx.cost;
      var b = btn('広げる ' + gold(nx.cost), function () {
        toast(upgrade(key)); render();
      }, 'sp-btn-s' + (can ? ' is-main' : ''));
      if (!can) b.disabled = true;
      card.appendChild(el('div', 'sp-fac-next', '次：' + facText(key, nx)));
      card.appendChild(b);
    } else {
      card.appendChild(el('div', 'sp-fac-next', 'これ以上は広げられない'));
    }
    return card;
  }

  function facText(key, L) {
    if (key === 'saloon')   return 'ハンター ' + L.hunters + '組 ／ モブ ' + L.mobs[0] + '〜' + L.mobs[1] + '人';
    if (key === 'shop')     return '棚 ' + L.slots + '枠';
    if (key === 'workshop') return '設計図 Lv' + L.craft + ' まで';
    // 宿屋はグレードごとの部屋数を出す
    var parts = [], total = 0;
    D.roomGrades.forEach(function (g) {
      var n = (L.rooms || {})[g.id] || 0;
      if (!n) return;
      total += n;
      parts.push(g.name + '×' + n + '（' + gold(g.rate) + '）');
    });
    return '滞在 ' + total + '組　' + parts.join('／');
  }

  /* ---------- 資料室（図鑑） ----------
     出来事は独立した分類にせず、アイテム／ハンター／ダンジョンの各項目に
     ぶら下げる（企画3.9「4つ目の分類にはしない」）。項目を押すと開く */
  var openDex = null;   // 開いている図鑑項目のキー

  function viewLibrary() {
    section('資料室', '解放 ' + dexCount() + ' / ' + DEX_TOTAL +
      (S.cleared ? '　／　賞金首はすべて討伐済み' : ''));

    var s = section('アイテム');
    D.materials.forEach(function (m) {
      s.appendChild(dexEntry('mat:' + m.id, !!S.dex.mat[m.id], m.name, m.icon, m.desc, 'item', m.id));
    });
    D.blueprints.forEach(function (b) {
      var p = b.product;
      s.appendChild(dexEntry('prod:' + p.id, !!S.dex.prod[p.id], p.name, p.icon, p.desc, 'item', p.id));
    });

    var s2 = section('ハンター');
    D.hunters.forEach(function (h) {
      var known = !!S.dex.hunter[h.id];
      var extra = known ? '親密 ' + S.hunters[h.id].intimacy : null;
      s2.appendChild(dexEntry('hunter:' + h.id, known, h.name, h.icon, h.intro, 'hunter', h.id, extra));
    });

    var s3 = section('ダンジョン');
    D.dungeons.forEach(function (d) {
      var known = !!S.dex.dungeon[d.id];
      var desc = 'Lv' + d.level + '　' + d.floors + '層　賞金首：' + d.boss.name;
      var extra = known && S.bossDown[d.id] ? '討伐済' : null;
      s3.appendChild(dexEntry('dun:' + d.id, known, d.name, 'scrap', desc, 'dungeon', d.id, extra));
    });

    var s5 = section('実績');
    D.achievements.forEach(function (a) {
      var got = !!S.ach[a.id];
      var c = el('div', 'sp-ev' + (got ? '' : ' is-locked'));
      c.appendChild(el('b', null, got ? a.name : '？？？'));
      if (got) c.appendChild(el('p', null, a.text));
      s5.appendChild(c);
    });
  }

  /* 図鑑の1項目。開くと、その項目にぶら下がる出来事と来歴が出る */
  function dexEntry(key, known, name, icon, desc, on, target, extra) {
    var wrap = el('div');
    var row = el('div', 'sp-row' + (known ? ' is-open-able' : ' is-locked'));
    row.appendChild(ART.img(known ? icon : 'scrap'));
    var mid = el('div', 'sp-row-mid');
    mid.appendChild(el('div', 'sp-row-name', known ? name : '？？？'));
    if (known && desc) mid.appendChild(el('div', 'sp-row-desc', desc));
    row.appendChild(mid);
    if (extra) row.appendChild(el('span', 'sp-num' + (extra === '討伐済' ? ' is-done' : ''), extra));

    var evs = D.events.filter(function (e) { return e.on === on && e.target === target; });
    var chron = (on === 'item' && S.chronicle[target]) ? S.chronicle[target] : [];
    var hasMore = known && (evs.length || chron.length);
    if (hasMore) {
      var got = evs.filter(function (e) { return S.events[e.id]; }).length;
      row.appendChild(el('span', 'sp-more', (openDex === key ? '▼ ' : '▶ ') +
        (evs.length ? '出来事 ' + got + '/' + evs.length : '来歴')));
      row.addEventListener('click', function () {
        openDex = (openDex === key) ? null : key;
        render();
      });
    }
    wrap.appendChild(row);

    if (hasMore && openDex === key) {
      var box = el('div', 'sp-dexopen');
      evs.forEach(function (e) {
        var c = el('div', 'sp-ev' + (S.events[e.id] ? '' : ' is-locked'));
        c.appendChild(el('b', null, S.events[e.id] ? e.title : '？？？'));
        if (S.events[e.id]) c.appendChild(el('p', null, e.text));
        box.appendChild(c);
      });
      if (chron.length) {
        box.appendChild(el('div', 'sp-chron-h', 'この品が辿った道'));
        chron.forEach(function (story) {
          var c = el('div', 'sp-chron');
          story.forEach(function (lineText) { c.appendChild(el('p', null, lineText)); });
          box.appendChild(c);
        });
      }
      wrap.appendChild(box);
    }
    return wrap;
  }

  /* ---------- データルーム（セーブ・ロード） ---------- */
  function viewData() {
    section('データルーム', '進行は自動で保存されている。ここでは書き出しと読み込みができる');

    var card = el('div', 'sp-card');
    card.appendChild(el('div', 'sp-fac-now',
      S.day + '日目　' + gold(S.gold) + '　解放 ' + dexCount() + ' / ' + DEX_TOTAL));
    card.appendChild(el('div', 'sp-fac-next', '保存先：このブラウザ（localStorage）'));
    elMain.appendChild(card);

    var ta = document.createElement('textarea');
    ta.className = 'sp-ta';
    ta.rows = 5;
    ta.placeholder = 'ここにデータを貼り付けて「読み込む」';

    elMain.appendChild(btn('書き出す', function () {
      ta.value = JSON.stringify(S);
      ta.select();
      toast('書き出した。全選択してコピー');
    }, 'sp-btn-big'));
    elMain.appendChild(ta);
    elMain.appendChild(btn('読み込む', function () {
      try {
        var st = JSON.parse(ta.value);
        if (!st || !st.hunters) return toast('データの形が違う');
        S = st; save(); closeWindow(); render();
        toast('読み込んだ');
      } catch (e) { toast('読み込めなかった'); }
    }, 'sp-btn-big'));

    elMain.appendChild(btn('最初からやり直す', function () {
      if (!confirmReset()) return;
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      S = freshState(); save(); closeWindow(); render();
    }, 'sp-btn-ghost'));
  }

  /* ---------- 管理室（設定） ---------- */
  function viewAdmin() {
    section('管理室', '表示の設定');
    S.opt = S.opt || {};

    var card = el('div', 'sp-card');
    var label = el('label', 'sp-opt');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!S.opt.autoLog;
    cb.addEventListener('change', function () {
      S.opt.autoLog = cb.checked; save();
    });
    label.appendChild(cb);
    label.appendChild(el('span', null, '戦闘の詳細ログを最初から開いておく'));
    card.appendChild(label);
    elMain.appendChild(card);

    elMain.appendChild(el('p', 'sp-note', '音はまだ入れていないので、音量の設定は置いていない。'));
  }

  /* ---------- 帳場（買取・売上の明細） ---------- */
  function viewOffice() {
    section('帳場', '買取を選ぶ。日を進める前ならいつでも変えられる');

    if (S.pending.length) {
      var s1 = section('買取待ち', 'ハンターが持ち帰ったもの。買わずに日を進めると流れる');
      renderPending(s1);
    } else {
      section('買取待ち').appendChild(el('p', 'sp-note', '今はない'));
    }

    if (S.lastResult) {
      var R = S.lastResult;
      var total = R.sales.reduce(function (a, s) { return a + s.price; }, 0);
      var s2 = section('前日の売上', R.day + '日目　合計 ' + gold(total + R.inn));
      if (R.sales.length) {
        var counted = {};
        R.sales.forEach(function (s) {
          counted[s.name] = counted[s.name] || { n: 0, sum: 0 };
          counted[s.name].n++; counted[s.name].sum += s.price;
        });
        Object.keys(counted).forEach(function (k) {
          var row = el('div', 'sp-line');
          row.appendChild(el('span', null, k + ' ×' + counted[k].n));
          row.appendChild(el('b', null, gold(counted[k].sum)));
          s2.appendChild(row);
        });
      } else {
        s2.appendChild(el('p', 'sp-note', '何も売れなかった'));
      }
    }
  }

  /* ---------- 宿屋（滞在中のハンターと部屋） ---------- */
  function viewInn() {
    section('宿屋', 'ハンターが良い部屋から取り、余った部屋にモブが泊まる');

    var s1 = section('ハンター');
    var any = false;
    D.hunters.forEach(function (h) {
      var st2 = S.hunters[h.id];
      any = true;
      var card = el('div', 'sp-card');
      var head = el('div', 'sp-fac-head');
      head.appendChild(el('b', null, h.name));
      head.appendChild(el('span', 'sp-lv', '強さ ' + hunterPower(st2)));
      head.appendChild(el('span', 'sp-num', gold(st2.gold)));
      card.appendChild(head);
      var stats = hunterStats(st2);
      card.appendChild(el('div', 'sp-fac-next',
        st2.place === 'town'
          ? '滞在中。今日の棚から買っていく（買う順：' +
            (h.buys || []).map(function (k) {
              return { consumable: '消耗品', equip: '装備', tank: '戦車' }[k] || k;
            }).join('→') + '）'
          : st2.place === 'dungeon'
            ? DUN[st2.dungeon].name + 'へ潜行中。' + st2.back + '日目に戻る'
            : 'まだ荒野から戻っていない'));
      card.appendChild(el('div', 'sp-fac-now',
        '攻撃 ' + stats.atk + '　守り ' + stats.guard + '　体力 ' + stats.maxHp +
        '　持ち込み ' + bagCount(st2) + '個'));
      var eq = el('div', 'sp-cost');
      [['weapon', '武器'], ['armor', '防具'], ['tank', '戦車'],
       ['cannon', '主砲'], ['subgun', '副砲'], ['engine', '機関']].forEach(function (pair) {
        var pid = st2.equip[pair[0]];
        if (!pid || !PROD[pid]) {
          eq.appendChild(el('span', 'sp-tag is-empty', pair[1] + '：なし'));
          return;
        }
        /* 残り耐久は「次に何が売れるか」の予告になる。少ないものは目立たせる */
        var max = PROD[pid].dur || 0;
        var left = st2.dur && st2.dur[pair[0]] != null ? st2.dur[pair[0]] : max;
        var low = max && left <= max * 0.34;
        eq.appendChild(el('span', 'sp-tag' + (low ? ' is-lack' : ''),
          pair[1] + '：' + PROD[pid].name + (max ? '（残り ' + left + '）' : '')));
      });
      card.appendChild(eq);
      elMain.appendChild(card);
    });
    if (!any) s1.appendChild(el('p', 'sp-note', 'ハンターはいない'));

    section('部屋');
    elMain.appendChild(buildFacilityCard('inn'));
  }

  /* ---------- 酒場（客数・増築） ---------- */
  function viewSaloon() {
    var L = fac('saloon');
    section('酒場', 'ここに来る客の数が、店の毎日の回転を決める');
    var card = el('div', 'sp-card');
    card.appendChild(el('div', 'sp-fac-now',
      'ハンター ' + L.hunters + '組　／　モブ ' + L.mobs[0] + '〜' + L.mobs[1] + '人（日によって変わる）'));
    elMain.appendChild(card);

    section('増築');
    elMain.appendChild(buildFacilityCard('saloon'));
  }

  /* ---------- 自室（寝ると次の日へ） ---------- */
  function viewBedroom() {
    section('自室', '準備ができたら、ここで寝て次の日へ進む');
    var card = el('div', 'sp-card');
    card.appendChild(el('div', 'sp-fac-now', '棚 ' + S.shelf.length + ' / ' + fac('shop').slots + ' 枠'));
    if (S.pending.length) card.appendChild(el('div', 'sp-fac-next', '買取待ちが ' + S.pending.length + ' 件、帳場に残っている'));
    elMain.appendChild(card);
    elMain.appendChild(btn('寝る（次の日へ）', function () {
      closeWindow();
      advanceDay();
    }, 'sp-btn-big is-main'));
  }

  var resetArmed = false;
  function confirmReset() {
    if (resetArmed) { resetArmed = false; return true; }
    resetArmed = true;
    toast('もう一度押すと消えます');
    setTimeout(function () { resetArmed = false; }, 2500);
    return false;
  }

  function renderPending(parent) {
    if (S.pending.length > 1) {
      parent.appendChild(btn('全部買う', function () {
        var n = buyAllPending();
        toast(n ? n + '件買った' : '資金が足りない');
        render();
        if (elOverlay.classList.contains('is-open')) refreshOverlayBuys();
      }, 'sp-btn-s is-main'));
    }
    S.pending.forEach(function (p, i) {
      var info = pendingInfo(p);
      var b = btn('買う ' + gold(info.cost), function () {
        toast(buyPending(i)); render();
        if (elOverlay.classList.contains('is-open')) refreshOverlayBuys();
      }, 'sp-btn-s is-main');
      var row = itemRow({ name: info.name, icon: info.icon, desc: info.desc }, b);
      row.appendChild(el('span', 'sp-from', HUN[p.from].name));
      parent.appendChild(row);
    });
  }

  /* ---------- 結果（日を進めた直後） ---------- */
  function showResult(R) {
    elOverlay.innerHTML = '';
    elOverlay.classList.add('is-open');
    var box = el('div', 'sp-result');

    box.appendChild(el('h2', null, R.day + '日目の結果'));

    // 売上
    var total = R.sales.reduce(function (a, s) { return a + s.price; }, 0);
    var sec = el('div', 'sp-rsec');
    sec.appendChild(el('h3', null, '売上　' + gold(total + R.inn)));
    if (R.sales.length) {
      var counted = {};
      R.sales.forEach(function (s) {
        var k = s.name;
        counted[k] = counted[k] || { n: 0, sum: 0 };
        counted[k].n++; counted[k].sum += s.price;
      });
      Object.keys(counted).forEach(function (k) {
        var line = el('div', 'sp-line');
        line.appendChild(el('span', null, k + ' ×' + counted[k].n));
        line.appendChild(el('b', null, gold(counted[k].sum)));
        sec.appendChild(line);
      });
    } else {
      sec.appendChild(el('p', 'sp-note', '何も売れなかった。棚に何か置いておく'));
    }
    if (R.inn) {
      (R.rooms || []).forEach(function (rm) {
        var rl = el('div', 'sp-line');
        rl.appendChild(el('span', null, rm.room + '（' + rm.who + '）'));
        rl.appendChild(el('b', null, gold(rm.rate)));
        sec.appendChild(rl);
      });
      var l = el('div', 'sp-line');
      l.appendChild(el('span', null, '宿泊料 合計'));
      l.appendChild(el('b', null, gold(R.inn)));
      sec.appendChild(l);
    }
    box.appendChild(sec);

    // ハンターの報告
    if (R.reports.length) {
      var s2 = el('div', 'sp-rsec');
      s2.appendChild(el('h3', null, 'ハンターの報告'));
      R.reports.forEach(function (r) {
        var p = el('p', 'sp-report');
        p.innerHTML = escapeHtml(r.text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        p.appendChild(el('span', 'sp-power', '強さ ' + r.power));
        s2.appendChild(p);

        /* 戦闘の中身は畳んでおく。見たい人だけ開く */
        if (!r.battle || !r.battle.length) return;
        var open = !!(S.opt && S.opt.autoLog);
        var detail = el('div', 'sp-battle');
        r.battle.forEach(function (lineText) { detail.appendChild(el('div', null, lineText)); });
        detail.hidden = !open;
        var tg = btn(open ? '戦闘の詳細を閉じる' : '戦闘の詳細を見る', function () {
          detail.hidden = !detail.hidden;
          tg.textContent = detail.hidden ? '戦闘の詳細を見る' : '戦闘の詳細を閉じる';
        }, 'sp-btn-s sp-battle-toggle');
        s2.appendChild(tg);
        s2.appendChild(detail);
      });
      box.appendChild(s2);
    }

    // 買取
    var s3 = el('div', 'sp-rsec sp-buys');
    s3.appendChild(el('h3', null, '買取'));
    box.appendChild(s3);

    // 解放
    if (R.unlocks.length) {
      var s4 = el('div', 'sp-rsec');
      s4.appendChild(el('h3', null, '解放'));
      R.unlocks.forEach(function (u) {
        var c = el('div', 'sp-unlock');
        c.appendChild(el('span', 'sp-unlock-k', u.kind));
        c.appendChild(el('b', null, u.name));
        c.appendChild(el('p', null, u.text));
        s4.appendChild(c);
      });
      box.appendChild(s4);
    }

    box.appendChild(btn('閉じる', function () {
      elOverlay.classList.remove('is-open');
      elOverlay.innerHTML = '';
      render();
    }, 'sp-btn-big'));

    elOverlay.appendChild(box);
    refreshOverlayBuys();
  }

  function refreshOverlayBuys() {
    var s3 = elOverlay.querySelector('.sp-buys');
    if (!s3) return;
    s3.innerHTML = '';
    s3.appendChild(el('h3', null, '買取'));
    if (!S.pending.length) {
      s3.appendChild(el('p', 'sp-note', '買取対象はない'));
      return;
    }
    s3.appendChild(el('p', 'sp-note', '買うものを選ぶ。買わなかった分は流れる'));
    renderPending(s3);
    renderHud();
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ==========================================================
     起動
     ========================================================== */
  S = load();
  if (!S) { S = freshState(); save(); }
  render();

})();
