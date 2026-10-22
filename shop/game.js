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
      counters: { sold: 0, craft: 0, bossKill: 0, request: 0, soldItem: {}, boughtMat: {},
                  visit: {}, bossByShop: 0, dismantle: 0, upset: 0, maxKills: 0 },
      matLog: {},               // 素材id → 仕入れの出所の待ち行列（来歴のもと）
      chronicle: {},            // 商品id → 売れた品が辿った道（図鑑で読む）
      opt: { autoLog: false },  // オプションの表示設定
      tut: 0,                   // はじめのてびきの手順。-1 で閉じている
      tutSeen: {},              // てびきの手順を進める目印（結果を見た・宿屋を開いた）
      lastResult: null,
      uid: 1
    };
    Object.keys(D.start.materials).forEach(function (k) {
      st.mats[k] = D.start.materials[k];
      st.dex.mat[k] = true;          // 手元にある素材は最初から図鑑に載る
      st.matLog[k] = [];
      for (var i = 0; i < st.mats[k]; i++) st.matLog[k].push({ start: true });
    });
    D.hunters.forEach(function (h) { st.hunters[h.id] = newHunter(h.id); });
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
      if (!st.hunters[h.id]) { st.hunters[h.id] = newHunter(h.id); return; }
      var hs = st.hunters[h.id];
      if (!hs.gear) hs.gear = {};
      if (!hs.pack) {
        hs.pack = [];
        Object.keys(hs.bag || {}).forEach(function (k) {
          for (var i = 0; i < hs.bag[k]; i++) hs.pack.push({ uid: 0, id: k, history: [] });
        });
      }
      delete hs.bag;
      if (hs.request === undefined) hs.request = null;
    });
    ['request', 'bossByShop', 'dismantle', 'upset', 'maxKills'].forEach(function (k) {
      st.counters[k] = st.counters[k] || 0;
    });
    st.counters.visit = st.counters.visit || {};
    if (st.tut === undefined) st.tut = -1;       // てびきより前の保存は、もう遊び方を知っている
    st.tutSeen = st.tutSeen || {};
  }

  function newHunter(id) {
    return {
      id: id, gold: 300, intimacy: 0,
      equip: { weapon: null, armor: null, tank: null, cannon: null, subgun: null, engine: null },
      gear: {},               // 枠 → 店で買った現物（来歴と戦歴を持つ）
      dur: {},                // 枠 → 残りの耐久。0になると壊れて外れる
      pack: [],               // 持ち込む消耗品（現物）
      request: null,          // 頼みごと
      place: 'away',          // away / town / dungeon
      dungeon: null, back: 0
    };
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
    var it = { uid: uidSeq++, id: prodId, history: history || [], made: S.day };
    S.stock.push(it);
    if (!S.dex.prod[prodId]) {
      S.dex.prod[prodId] = true;
      var p = PROD[prodId];
      discover({ ribbon: '図鑑に登録', icon: p.icon, name: p.name, flavor: p.desc,
        meta: (p.power ? '強さ +' + p.power + '　' : '') + '売値 ' + gold(p.price) });
    }
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
  function bagCount(h) { return (h.pack || []).length; }

  /* ---------- 文面 ---------- */
  var SLOT_NAMES = { weapon: '武器', armor: '防具', tank: '戦車', cannon: '主砲', subgun: '副砲', engine: '機関' };

  function fill(tpl, v) {
    return String(tpl || '').replace(/\{(\w+)\}/g, function (_, k) { return v[k] != null ? v[k] : ''; });
  }
  function say(hid, key, v) {
    var own = HUN[hid].talk || {};
    return fill(own[key] || D.talk[key], v || {});
  }
  function story(key, v) { return fill(D.story[key], v || {}); }
  function dayText(d) { return d != null ? d + '日目' : 'いつか'; }

  /* 品が積み上げてきた働き。武器は倒した数、防具は受け止めた数で語る */
  function deeds(it) {
    var slot = PROD[it.id] && PROD[it.id].slot;
    var t = slot === 'armor' || slot === 'tank' || slot === 'engine'
      ? '通算' + (it.blocks || 0) + '回の攻撃を受け止めた'
      : '通算' + (it.kills || 0) + '体を倒した';
    return t + (it.boss ? '（' + it.boss.join('、') + 'を仕留めた）' : '');
  }

  /* 品の一生が終わったら図鑑に残す（直近5件） */
  function endLife(it, lastLine) {
    var lines = (it.history || []).slice();
    lines.push(lastLine);
    var ch = S.chronicle[it.id] = S.chronicle[it.id] || [];
    ch.unshift(lines);
    if (ch.length > 5) ch.length = 5;
  }

  /* ダンジョンを1回もぐる。戻り値に到達層・討伐・ログ・店の品の活躍が入る */
  function runDungeon(h, dun) {
    var C = D.combat;
    var st = hunterStats(h);
    var hp = st.maxHp;
    var log = [];
    var reached = 0, bossDown = false, bossFail = false;
    var entered = 0;                     // 足を踏み入れた層の数。装備の摩耗はこれで決まる
    var weapon = h.gear.weapon, armor = h.gear.armor;
    var kills = 0, hits = 0, used = [], retreat = null, finish = null;

    log.push('強さ ' + st.atk + ' ／ 守り ' + st.guard + ' ／ 体力 ' + hp +
             '　持ち込み ' + bagCount(h) + '個');

    function drink(where) {
      var it = h.pack.shift();
      hp = Math.min(st.maxHp, hp + Math.round(st.maxHp * C.healRate));
      used.push({ it: it, where: where });
      endLife(it, S.day + '日目、' + dun.name + 'の' + where + 'で' + HUN[h.id].name + 'を立ち直らせた');
      log.push(where + '：' + PROD[it.id].name + 'を使った（体力 ' + hp + '）');
    }

    function fight(e, where, limit) {
      var eHp = e.hp, t = 0;
      while (eHp > 0 && hp > 0 && t < limit) {
        t++;
        eHp -= damage(st.atk, 0);
        if (eHp <= 0) break;
        hp -= damage(e.atk, st.guard);
        hits++;
        if (hp > 0 && hp < st.maxHp * C.healAt && bagCount(h)) drink(where);
      }
      return eHp <= 0 && hp > 0;
    }

    for (var f = 1; f <= dun.floors; f++) {
      entered++;
      var base = pick(dun.enemies);
      var scale = 1 + (f - 1) * C.floorScale;
      var e = { name: base.name, hp: Math.round(base.hp * scale), atk: Math.round(base.atk * scale) };
      if (!fight(e, f + '層', 40)) {
        retreat = { floor: f, enemy: e.name, dry: used.length > 0 && !bagCount(h) };
        log.push(f + '層：' + e.name + 'に押し返された。ここで撤退');
        break;
      }
      kills++;
      reached = f;
      log.push(f + '層：' + e.name + 'を倒した（体力 ' + hp + '）');
    }

    // 最下層まで行けたら賞金首
    if (reached >= dun.floors && !S.bossDown[dun.id]) {
      var b = dun.boss;
      log.push('最下層：' + b.name + 'と対峙した');
      entered += 2;                      // 賞金首との戦いは装備を余計に痛める
      if (fight(b, '最下層', 200)) {
        bossDown = true;
        kills++;
        if (weapon) { weapon.boss = (weapon.boss || []).concat([b.name]); finish = weapon; }
        log.push(b.name + 'を仕留めた（体力 ' + hp + '）');
      } else {
        bossFail = true;
        log.push(b.name + 'に敵わず撤退した');
      }
    }

    /* ---- 店の品の活躍 ---- */
    var mine = [];
    if (finish) mine.push({ big: true, text: story('finish', { boss: dun.boss.name, item: PROD[finish.id].name }) });
    if (weapon && kills) {
      weapon.kills = (weapon.kills || 0) + kills;
      S.counters.maxKills = Math.max(S.counters.maxKills || 0, weapon.kills);
      if (!finish) mine.push({ text: story('kills', { item: PROD[weapon.id].name, n: kills }) });
    }
    if (armor && hits) {
      armor.blocks = (armor.blocks || 0) + hits;
      mine.push({ text: story('guarded', { item: PROD[armor.id].name, n: hits }) });
    }
    if (used.length) {
      mine.push({ text: story('saved', {
        item: PROD[used[0].it.id].name + (used.length > 1 ? 'など' + used.length + '個' : ''),
        floors: used.map(function (u) { return u.where.replace('層', ''); }).join('・')
      }) });
    }

    /* ---- 装備の摩耗。0になったものは壊れて外れる ---- */
    var broken = [];
    h.dur = h.dur || {};
    Object.keys(h.equip).forEach(function (slot) {
      var pid = h.equip[slot];
      if (!pid || !PROD[pid]) return;
      var left = (h.dur[slot] == null ? (PROD[pid].dur || 999) : h.dur[slot]) - entered;
      if (left <= 0) {
        broken.push({ slot: slot, name: PROD[pid].name });
        var g = h.gear[slot];
        if (g) {
          mine.push({ text: story('broke', {
            item: PROD[pid].name, made: dayText(g.made), sold: dayText(g.soldDay), deeds: deeds(g)
          }) });
          endLife(g, S.day + '日目、' + dun.name + 'で壊れた。' + deeds(g));
        }
        h.equip[slot] = null;
        delete h.gear[slot];
        delete h.dur[slot];
      } else {
        h.dur[slot] = left;
        log.push('摩耗：' + PROD[pid].name + '（残り ' + left + '）');
      }
    });
    broken.forEach(function (bk) { log.push('**' + bk.name + 'が壊れた**'); });

    return {
      reached: reached, floors: dun.floors, bossDown: bossDown, bossFail: bossFail,
      log: log, hp: hp, broken: broken, retreat: retreat, mine: mine,
      finish: finish ? PROD[finish.id].name : null,
      finishIcon: finish ? PROD[finish.id].icon : null,
      used: used.length, usedName: used.length ? PROD[used[0].it.id].name : null,
      weaponName: weapon ? PROD[weapon.id].name : null
    };
  }

  /* ==========================================================
     見込み
     出発前に、今の装備と持ち込みで何度か試しに潜らせてみる（状態は変えない）。
     ハンターはこの見込みで行き先を選び、店はこの見込みを見て品を揃える
     ========================================================== */
  var SIM_RUNS = 30;

  function simulate(h, dun) {
    var C = D.combat, st = hunterStats(h);
    var full = 0, boss = 0, sum = 0;
    var bossAlive = !S.bossDown[dun.id];
    for (var r = 0; r < SIM_RUNS; r++) {
      var hp = st.maxHp, pots = bagCount(h), reached = 0;
      var fight = function (e, limit) {
        var eHp = e.hp, t = 0;
        while (eHp > 0 && hp > 0 && t < limit) {
          t++;
          eHp -= damage(st.atk, 0);
          if (eHp <= 0) break;
          hp -= damage(e.atk, st.guard);
          if (hp > 0 && hp < st.maxHp * C.healAt && pots) {
            pots--;
            hp = Math.min(st.maxHp, hp + Math.round(st.maxHp * C.healRate));
          }
        }
        return eHp <= 0 && hp > 0;
      };
      for (var f = 1; f <= dun.floors; f++) {
        var base = pick(dun.enemies), scale = 1 + (f - 1) * C.floorScale;
        if (!fight({ hp: Math.round(base.hp * scale), atk: Math.round(base.atk * scale) }, 40)) break;
        reached = f;
      }
      sum += reached;
      if (reached >= dun.floors) {
        full++;
        if (bossAlive && fight(dun.boss, 200)) boss++;
      }
    }
    return {
      dungeon: dun.id, full: full / SIM_RUNS, boss: bossAlive ? boss / SIM_RUNS : null,
      avg: Math.round(sum / SIM_RUNS * 10) / 10
    };
  }

  /* 行き先選び。最下層まで五分以上で届く中で一番深い所へ行く。
     そこの賞金首がもういなければ、一段深くへ腕試しに行く。
     どこも届かないなら、一番深くまで進めそうな所で腕を磨く */
  function chooseDungeon(h) {
    return seeded(function () { return chooseDungeon_(h); });
  }
  /* 見込みは同じ状態なら同じ結果になるよう、乱数を固定して回す */
  function seeded(fn) {
    var orig = Math.random, a = 20260927;
    Math.random = function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    try { return fn(); } finally { Math.random = orig; }
  }
  function chooseDungeon_(h) {
    var power = hunterPower(h);
    var can = D.dungeons.filter(function (d) { return power >= d.reqPower; });
    if (!can.length) return null;
    var sims = can.map(function (d) { return simulate(h, d); });
    var ok = sims.filter(function (s) { return s.full >= 0.5; });
    if (ok.length) {
      var target = ok[ok.length - 1];
      /* 賞金首のいない所に通っても腕は上がらない。1層でも進めるなら一段深くへ腕試しに行く */
      if (S.bossDown[target.dungeon]) {
        var deeper = sims.slice(sims.indexOf(target) + 1).filter(function (s) { return s.avg >= 1; })[0];
        if (deeper) return deeper;
      }
      return target;
    }
    return sims.slice().sort(function (a, b) {
      return b.avg / DUN[b.dungeon].floors - a.avg / DUN[a.dungeon].floors;
    })[0];
  }

  /* 頼みに応えたら見込みがどう変わるか。応えられる品の中で一番強い物を持たせて試す */
  function whatIf(h) {
    var req = h.request;
    if (!req || req.fuel) return null;
    var keepEq = {}, keepPack = h.pack, fc;
    Object.keys(h.equip).forEach(function (k) { keepEq[k] = h.equip[k]; });
    if (req.cons) {
      h.pack = h.pack.concat(new Array(req.need).fill({ id: 'potion' }));
    } else {
      var reach = D.blueprints.filter(function (b) {
        return reqMatch(req, h, b.product) &&
          (S.bps.indexOf(b.id) >= 0 || merchantBlueprints().indexOf(b) >= 0);
      }).sort(function (a, b) { return b.product.power - a.product.power; })[0];
      if (!reach) return null;
      h.equip[req.slot] = reach.product.id;
    }
    try { fc = chooseDungeon(h); } finally { h.equip = keepEq; h.pack = keepPack; }
    return fc;
  }

  /* 準備中に出す見込みの行。今のまま／頼みに応えたら */
  function forecastLines(h) {
    var box = el('div', 'sp-fc');
    var now = chooseDungeon(h);
    box.appendChild(fcLine('明日の見込み', now));
    var alt = whatIf(h);
    if (alt && (!now || alt.dungeon !== now.dungeon || forecastText(alt) !== forecastText(now))) {
      box.appendChild(fcLine('頼みに応えれば', alt, true));
    }
    return box;
  }
  function fcLine(label, fc, good) {
    var row = el('div', 'sp-fc-row' + (good ? ' is-good' : ''));
    row.appendChild(el('span', 'sp-k', label));
    row.appendChild(el('span', null, fc ? DUN[fc.dungeon].name + '　' + forecastText(fc) : '荒野に出られない'));
    return row;
  }

  /* 帰還の答え合わせ。出発時の見込みと実際を比べる */
  function judge(fc, res) {
    if (!fc) return null;
    var full = res.reached >= res.floors, v;
    if (res.bossDown && fc.boss != null && fc.boss < 0.35) v = { kind: 'up', text: '見込みを覆して、賞金首を仕留めた' };
    else if (full && fc.full < 0.4) v = { kind: 'up', text: '予想以上。最下層まで届いた' };
    else if (!full && res.reached >= Math.round(fc.avg) + 2) v = { kind: 'up', text: '予想より' + (res.reached - Math.round(fc.avg)) + '層深く進んだ' };
    else if (!full && fc.full >= 0.8) v = { kind: 'down', text: '予想外。' + (res.reached + 1) + '層で押し返された' };
    else if (res.bossFail && fc.boss >= 0.6) v = { kind: 'down', text: '仕留めきれなかった。見込みより手強かった' };
    else return { kind: 'even', text: '見込みどおり' };
    if (v.kind === 'up') {
      if (res.used) v.why = '決め手は、持ち込んだ' + res.usedName + (res.used > 1 ? 'など' + res.used + '個' : '');
      else if (res.weaponName) v.why = '決め手は、この店の' + res.weaponName;
    } else if (res.retreat && res.retreat.dry) {
      v.why = '薬が尽きたのが響いた';
    } else if (!res.used) {
      v.why = '薬をひとつも持っていなかった';
    }
    return v;
  }

  function forecastText(fc) {
    var dun = DUN[fc.dungeon], t;
    if (fc.full >= 0.8) t = '最下層まで行けそう';
    else if (fc.full >= 0.4) t = '最下層は五分五分';
    else t = fc.avg < 1 ? '1層目から厳しい' : Math.max(1, Math.round(fc.avg)) + '層あたりで引き返しそう';
    if (fc.boss != null && fc.full >= 0.4) {
      if (fc.boss >= 0.6) t += '。' + dun.boss.name + 'を仕留められそう';
      else if (fc.boss >= 0.2) t += '。' + dun.boss.name + 'は分の悪い賭け';
      else t += '。' + dun.boss.name + 'には歯が立たなそう';
    }
    return t;
  }

  /* ==========================================================
     頼みごと
     帰還のたびに、潜った結果から「次に欲しい物」を1つ頼む。
     頼みは次に発つ日まで有効
     ========================================================== */
  function curPow(h, slot) {
    var pid = h.equip[slot];
    return pid && PROD[pid] ? (PROD[pid].power || 0) : 0;
  }
  /* 今より強い物が、設計図として世界に存在するか */
  function slotHasBetter(h, slot) {
    var c = curPow(h, slot);
    return D.blueprints.some(function (b) { return b.product.slot === slot && (b.product.power || 0) > c; });
  }
  /* 今いちばん弱い枠。戦車持ちなら砲・機関も候補 */
  function weakSlot(h) {
    var cand = ['weapon', 'armor'];
    if (hasTank(h)) cand = cand.concat(['cannon', 'subgun', 'engine']);
    cand = cand.filter(function (s) { return slotHasBetter(h, s); });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return curPow(h, a) - curPow(h, b); });
    return cand[0];
  }
  function reqFor(h, slot, key, v) {
    v = v || {};
    if (slot && slotHasBetter(h, slot)) {
      v.slot = SLOT_NAMES[slot];
      return { slot: slot, say: say(h.id, key, v) };
    }
    return consReq(h);
  }
  function consReq(h, key) {
    if (hasTank(h) && !key) return { fuel: true, say: say(h.id, 'fuel') };
    return { cons: true, need: D.request.consumables, say: say(h.id, key || 'supply') };
  }

  function makeRequest(h, res, dun) {
    var r = pickRequest(h, res, dun);
    if (h.lastReq && h.lastReq === r.say && r.cons) {
      var alt = reqFor(h, weakSlot(h), 'pushed', res.retreat ? { floor: res.retreat.floor, enemy: res.retreat.enemy } : {});
      if (!alt.cons && res.retreat) r = alt;
    }
    h.lastReq = r.say;
    return r;
  }
  function pickRequest(h, res, dun) {
    if (res.broken.length) return reqFor(h, res.broken[0].slot, 'broke', { item: res.broken[0].name });
    if (res.retreat) {
      if (res.retreat.dry) return consReq(h, 'dry');
      return reqFor(h, weakSlot(h), 'pushed', { floor: res.retreat.floor, enemy: res.retreat.enemy });
    }
    if (res.bossFail) return reqFor(h, weakSlot(h), 'boss', { boss: dun.boss.name });
    var nx = D.dungeons.filter(function (d) { return d.level > dun.level; })[0];
    if (nx) return reqFor(h, weakSlot(h), 'next', { dungeon: nx.name });
    return consReq(h);
  }
  function firstRequest(h) {
    if (!h.equip.weapon) return reqFor(h, 'weapon', 'first');
    return consReq(h);
  }

  function isTankPart(p) { return p.slot === 'cannon' || p.slot === 'subgun' || p.slot === 'engine'; }
  function reqMatch(req, h, p) {
    if (!req || !p) return false;
    if (req.cons) return p.kind === 'consumable';
    if (req.fuel) return p.kind === 'fuel';
    if (p.slot !== req.slot || (p.power || 0) <= curPow(h, req.slot)) return false;
    return !isTankPart(p) || hasTank(h);
  }
  function reqLabel(req, h) {
    if (!req) return '';
    if (req.cons) return '消耗品 ×' + req.need;
    if (req.fuel) return '燃料・砲弾';
    var cur = h.equip[req.slot];
    return SLOT_NAMES[req.slot] + (cur ? '（今の' + PROD[cur].name + 'より強いもの）' : '（今は持っていない）');
  }
  /* 町にいて頼みを持っている組 */
  function openRequests() {
    return D.hunters.map(function (hd) { return S.hunters[hd.id]; })
      .filter(function (h) { return h.place === 'town' && h.request; });
  }
  function requestersOf(pid) {
    return openRequests().filter(function (h) { return reqMatch(h.request, h, PROD[pid]); });
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
      case 'request':   return (S.counters.request || 0) >= c.n;
      case 'visit':     return (S.counters.visit[c.id] || 0) >= c.n;
      case 'bossByShop':
      case 'dismantle':
      case 'upset':
      case 'maxKills':  return (S.counters[c.type] || 0) >= c.n;
      case 'hunterAll': return D.hunters.every(function (h) { return S.dex.hunter[h.id]; });
      case 'facAll':    return Object.keys(D.facilities).every(function (k) { return !facNext(k); });
      case 'fullTank':  return D.hunters.some(function (hd) {
        var g = S.hunters[hd.id].gear || {};
        return g.tank && g.cannon && g.subgun && g.engine;
      });
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
    var R = { day: S.day, sales: [], cards: [], inn: 0, tips: 0, buys: [], unlocks: [], boss: [] };

    /* 報告はハンターごとの1枚にまとめる */
    var cardOf = {};
    function card(id) {
      if (!cardOf[id]) {
        cardOf[id] = { hunter: id, lines: [], mine: [], talk: [], battle: null, req: null };
        R.cards.push(cardOf[id]);
      }
      return cardOf[id];
    }

    /* --- 1. 帰還 --- */
    D.hunters.forEach(function (hd) {
      var h = S.hunters[hd.id];
      if (h.place !== 'dungeon' || h.back > S.day) return;
      var dun = DUN[h.dungeon];
      h.place = 'town';
      h.dungeon = null;
      h.justBack = true;      // 帰った日は宿に泊まる。翌日まで店で買い物ができる
      S.dex.dungeon[dun.id] = true;

      /* 裏で実際に潜らせる。到達層も討伐も、この戦闘の結果 */
      var res = runDungeon(h, dun);
      var c = card(hd.id);
      c.battle = res.log;
      c.mine = res.mine;
      c.verdict = judge(h.fc, res);
      h.fc = null;
      S.counters.visit[dun.id] = (S.counters.visit[dun.id] || 0) + 1;
      if (c.verdict && c.verdict.kind === 'up') S.counters.upset++;
      if (res.bossDown && res.finish) S.counters.bossByShop++;

      var line = dun.name + 'から戻った。' + res.reached + ' / ' + res.floors + '層まで進んだ。';
      if (res.bossDown) {
        S.bossDown[dun.id] = true;
        S.counters.bossKill++;
        h.gold += dun.boss.reward;
        line += '**' + dun.boss.name + 'を仕留めた。**賞金 ' + gold(dun.boss.reward) + ' を受け取っている。';
        R.boss.push({ hunter: hd.id, boss: dun.boss.name, dungeon: dun.name,
          item: res.finish, icon: res.finishIcon, reward: dun.boss.reward });
      } else if (!S.bossDown[dun.id] && res.reached < res.floors) {
        line += dun.boss.name + 'のいる最下層には届かなかった。';
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

      /* 稼ぎ。組ごとの決まった額に、深く進んだぶんの稼ぎ（ダンジョンの pay を到達層で割り引く）を足す */
      h.gold += hd.income + Math.round((dun.pay || dun.level * 90) * Math.max(1, res.reached) / dun.floors);
      c.lines.push(line);

      h.request = makeRequest(h, res, dun);
      c.talk.push(h.request.say);
      c.req = h.request;
    });

    /* --- 2. 客が来る ---
       酒場 = この街に出入りするハンターの組数（潜行中も枠を使う）
       宿屋 = 同時に町に滞在できる組数 */
    var active = D.hunters.filter(function (hd) {
      return S.hunters[hd.id].place !== 'away';
    }).length;

    var comers = [], arrived = false;
    D.hunters.forEach(function (hd) {
      var h = S.hunters[hd.id];
      if (h.place === 'town') { comers.push(hd.id); return; }
      /* 新顔は1日に1組まで。1組ずつ顔と名前を覚えられるように */
      if (h.place === 'away' && !arrived && active < fac('saloon').hunters && comers.length < innCapacity()) {
        arrived = true;
        h.place = 'town';
        h.justBack = true;    // 初めて来た日も一晩泊まる。頼みに応える間を作る
        active++;
        comers.push(hd.id);
        h.request = firstRequest(h);
        var c = card(hd.id);
        c.lines.push('初めて店に来た。' + (hd.intro || ''));
        c.talk.push(h.request.say);
        c.req = h.request;
      }
    });
    comers.forEach(function (id) { S.dex.hunter[id] = true; });

    /* --- 3. ハンターが棚から買う ---
       頼んだ物を真っ先に探す。そのあと組ごとの優先順（hd.buys）で見ていく */
    comers.forEach(function (id) {
      var h = S.hunters[id], hd = HUN[id];
      var order = hd.buys || ['consumable', 'equip', 'tank'];

      if (h.request) buyRequested(h, R, card(id));

      order.forEach(function (want) {
        S.shelf.forEach(function (pid) {
          var p = PROD[pid];
          var it = stockOne(pid);
          if (!p || !it || h.gold < p.price) return;
          if (buyGroup(p) !== want || p.kind === 'fuel') return;
          if (p.kind !== 'consumable') {
            if (isTankPart(p) && !hasTank(h)) return;         // 戦車がないと部品は要らない
            if ((p.power || 0) <= (h.equip[p.slot] ? curPow(h, p.slot) : -1)) return;   // 今より良いものだけ
          }
          sell(it, id, R);
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
      if (ri >= rooms.length) { card(id).lines.push('部屋が空いておらず、通りで夜を明かした。'); return; }
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
       頼まれた物を作って棚に置き、翌日それを渡す余地が生まれる */
    comers.forEach(function (id) {
      var h = S.hunters[id], hd = HUN[id];
      var power = hunterPower(h);
      var c = card(id);
      c.power = power;
      if (h.justBack) {
        h.justBack = false;
        c.lines.push('今夜は宿に泊まる。明日また荒野へ出るらしい。');
        return;
      }
      var fc = chooseDungeon(h);
      if (!fc) {
        c.lines.push('まだ荒野に出られない。装備が足りていない。');
        return;
      }
      if (h.request) {
        if (!h.request.got) c.talk.push(say(id, 'missing', { req: reqLabel(h.request, h) }));
        h.request = null;
      }
      var dun = DUN[fc.dungeon];
      h.forecast = forecastText(fc);
      h.fc = { full: fc.full, boss: fc.boss, avg: fc.avg };
      var days = Math.max(1, dun.days - Math.floor((power - dun.reqPower) / 25) - (S.bossDown[dun.id] ? 1 : 0));
      h.place = 'dungeon';
      h.dungeon = dun.id;
      h.back = S.day + days;
      c.lines.push(dun.name + '（Lv' + dun.level + '）へ発った。戻りは' + days + '日後。' +
        '持ち物：' + gearText(h));
      c.lines.push('見込み：' + h.forecast);
    });
    R.cards.forEach(function (c) { if (c.power == null) c.power = hunterPower(S.hunters[c.hunter]); });
    R.away = D.hunters.filter(function (hd) {
      return S.hunters[hd.id].place === 'dungeon' && !cardOf[hd.id];
    }).map(function (hd) {
      var h = S.hunters[hd.id];
      return { hunter: hd.id, dungeon: h.dungeon, back: h.back, forecast: h.forecast };
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

  /* 持っている店の品を短く並べる */
  function gearText(h) {
    var parts = [];
    Object.keys(h.equip).forEach(function (slot) {
      if (h.equip[slot] && PROD[h.equip[slot]]) parts.push(PROD[h.equip[slot]].name);
    });
    if (bagCount(h)) parts.push('消耗品' + bagCount(h) + '個');
    return parts.length ? parts.join('、') : '手ぶら';
  }

  /* 頼んだ物を棚から探して買う。強い物から見る */
  function buyRequested(h, R, c) {
    var req = h.request;
    var cands = S.shelf.filter(function (pid) {
      return stockCount(pid) > 0 && reqMatch(req, h, PROD[pid]);
    }).sort(function (a, b) { return (PROD[b].power || 0) - (PROD[a].power || 0); });
    if (!cands.length) return;

    var bought = [], short = null;
    if (req.cons || req.fuel) {
      var want = req.need || 1;
      cands.forEach(function (pid) {
        while (want > 0 && stockCount(pid) > 0) {
          if (h.gold < PROD[pid].price) { short = short || pid; break; }
          bought.push(PROD[pid]);
          sell(stockOne(pid), h.id, R);
          want--;
        }
      });
      if (want > 0 && bought.length) { req.need = want; req.got = true; }   // 足りない分は頼みとして残る
      else if (bought.length) req.done = true;
    } else {
      for (var i = 0; i < cands.length; i++) {
        var p = PROD[cands[i]];
        if (h.gold < p.price) { short = short || cands[i]; continue; }
        bought.push(p);
        sell(stockOne(cands[i]), h.id, R);
        req.done = true;
        break;
      }
    }

    if (req.done) {
      var tip = Math.round(bought.reduce(function (a, p) { return a + p.price; }, 0) * D.request.tip);
      tip = Math.min(tip, Math.max(0, h.gold));
      h.gold -= tip;
      S.gold += tip; S.earned += tip; R.tips += tip;
      h.intimacy += tip;
      S.counters.request++;
      c.talk.push(say(h.id, 'thanks', { item: bought[0].name }) + (tip ? '（お礼 ' + gold(tip) + '）' : ''));
      c.thanked = true;
      h.request = null;
    } else if (short) {
      c.talk.push(say(h.id, 'short', { item: PROD[short].name }));
    }
  }

  /* 1個売る。ハンターに渡った品は捨てずに持たせ、使われ方を追いかける */
  function sell(it, hunterId, R) {
    var p = PROD[it.id];
    S.gold += p.price;
    S.earned += p.price;
    S.counters.sold++;
    S.counters.soldItem[p.id] = (S.counters.soldItem[p.id] || 0) + 1;
    R.sales.push({ id: p.id, name: p.name, price: p.price, to: hunterId ? HUN[hunterId].name : 'モブ' });
    removeItem(it.uid);
    if (S.shelfSince[p.id] != null) S.shelfSince[p.id] = S.day;   // 売れた日を「最後に動いた日」として更新

    it.history = (it.history || []).concat([S.day + '日目、' + (hunterId ? HUN[hunterId].name : '名も知らぬ客') + 'の手に渡った']);
    it.soldDay = S.day;
    if (!hunterId) { endLife(it, 'その先は分からない'); return; }

    var h = S.hunters[hunterId];
    h.gold -= p.price;
    h.intimacy += p.price;
    if (p.kind === 'consumable') { h.pack.push(it); return; }
    if (p.kind === 'fuel') { endLife(it, '戦車の腹に収まった'); return; }

    var old = h.gear[p.slot];
    if (old) endLife(old, S.day + '日目、新しい' + p.name + 'に替えられた。' + deeds(old));
    h.equip[p.slot] = p.id;
    h.gear[p.slot] = it;
    h.dur[p.slot] = p.dur || 999;          // 買った時点で耐久が満タンになる
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
    endLife(it, S.day + '日目、売れないまま分解された');
    S.counters.dismantle++;

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
    /* 買取の代金は持ち帰ったハンターの手に入る。それがまた、この店の棚で使われる */
    if (S.hunters[p.from]) S.hunters[p.from].gold += info.cost;
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
  var playing = false;
  function advanceDay() {
    if (playing) return;
    playing = true;
    closeWindow();
    SND.se('sleep');
    var R = nextDay();
    renderHud();
    drawScene();
    playMorning(R, function () { playing = false; showResult(R); });
  }

  /* 一言。断られたとき（金が足りない等）に出す。info は知らせだけで、断りの音を鳴らさない */
  function toast(msg, info) {
    if (!msg) return;
    if (!info) SND.se('deny');
    var t = el('div', 'sp-toast', msg);
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1600);
  }
  /* 操作の結果。err があれば断り、無ければその操作の音を鳴らす */
  function act(sound, err) {
    if (err) toast(err);
    else SND.se(sound);
  }

  var VIEWS = {
    shop: viewShop, workshop: viewWorkshop, merchant: viewMerchant,
    inn: viewInn, saloon: viewSaloon, library: viewLibrary,
    office: viewOffice, bedroom: viewBedroom
  };
  /* 管理室とデータルームは、右上の歯車と同じオプションを開く */
  var OPT_PLACES = { data: true, admin: true };

  function render() {
    renderHud();
    drawScene();
    if (currentWindow) renderWindow(currentWindow);
  }

  /* 同じ窓を描き直すときは、読んでいた位置を保つ（作る・並べるたびに先頭へ戻らないように） */
  function renderWindow(key) {
    var keep = elMain.scrollTop;
    elWinTitle.textContent = ROOM_TITLES[key] || '';
    elMain.innerHTML = '';
    (VIEWS[key] || function () {})();
    elMain.scrollTop = keep;
  }
  function openWindow(key) {
    if (key === 'inn' && !S.tutSeen.inn) { S.tutSeen.inn = true; save(); }
    currentWindow = key;
    elWindow.hidden = false;
    elMain.scrollTop = 0;
    SND.se('open');
    renderWindow(key);
    elMain.scrollTop = 0;
  }
  function closeWindow() {
    currentWindow = null;
    elWindow.hidden = true;
  }
  document.getElementById('winClose').addEventListener('click', function () { SND.se('close'); closeWindow(); });

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
      hot.dataset.place = h.place;
      hot.dataset.label = h.label;
      hot.addEventListener('mouseenter', function () { showTip(hot, h.label, roomTip(h.place)); });
      hot.addEventListener('mouseleave', hideTip);
      hot.addEventListener('click', function () {
        hideTip();
        if (OPT_PLACES[h.place]) openOpt(true);
        else openWindow(h.place);
      });
      elStage.appendChild(hot);

      var tag = el('div', 'sp-tag', h.label);
      tag.style.left = pct(h.x + 2, SCENE.W); tag.style.top = pct(h.y + 2, SCENE.H);
      if (h.place === 'office' && S.pending.length) tag.appendChild(el('i', 'sp-dot'));
      if ((h.place === 'workshop' || h.place === 'inn') && openRequests().length) tag.appendChild(el('i', 'sp-dot'));
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
    dayBtn.id = 'btnDay';
    if (S.pending.length) dayBtn.appendChild(el('i', 'sp-dot'));
    elHud.appendChild(dayBtn);

    var help = btn('？', function () { SND.se('ui'); $('help').hidden = false; }, 'sp-hud-i');
    help.title = '遊び方';
    help.setAttribute('aria-label', '遊び方');
    elHud.appendChild(help);

    /* 右上は歯車ひとつ。ほかのブラウザゲームと揃える */
    var gear = btn('', function () { openOpt(true); }, 'sp-hud-i sp-icon-gear');
    gear.id = 'btnOpt';
    gear.title = 'オプション';
    gear.setAttribute('aria-label', 'オプション');
    if (SND.ready() && SND.muted()) gear.classList.add('is-mute');
    elHud.appendChild(gear);
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
      act('buy', buyFromMerchant('mat', m.id, n)); render();
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
        var waiting = requestersOf(pid);
        if (waiting.length) {
          cell.appendChild(el('span', 'sp-wait', waiting.map(function (w) { return HUN[w.id].name; }).join('・') + 'が待つ'));
          cell.classList.add('is-wanted');
        }
        // 何日も売れていない種類は、置き場所を間違えているということ
        var since = S.shelfSince[pid] != null ? S.shelfSince[pid] : S.day;
        var stale = S.day - since;
        if (n > 0 && stale >= 2) {
          cell.appendChild(el('span', 'sp-stale', stale + '日 売れ残り'));
          cell.classList.add('is-stale');
        }
        (function (id) {
          cell.addEventListener('click', function () { takeOffShelf(id); SND.se('shelf'); render(); });
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
        : btn('棚に出す', function () { act('shelf', putOnShelf(pid)); render(); }, 'sp-btn-s' + (requestersOf(pid).length ? ' is-main' : ''));
      var row = itemRow(p, right, grouped[pid]);
      if (!onShelf && requestersOf(pid).length) {
        row.querySelector('.sp-row-mid').appendChild(el('div', 'sp-wait', requestersOf(pid).map(function (w) { return HUN[w.id].name; }).join('・') + 'が頼んでいる品'));
      }
      s2.appendChild(row);
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
    var reqs = openRequests();
    if (reqs.length) {
      var sr = section('頼まれごと', '明日の朝、棚にあれば真っ先に買っていく');
      reqs.forEach(function (h) {
        var c = el('div', 'sp-card');
        c.appendChild(el('b', null, HUN[h.id].name));
        c.appendChild(el('p', 'sp-say', '「' + h.request.say + '」'));
        c.appendChild(reqTag(h));
        sr.appendChild(c);
      });
    }
    section('設計図', '作れる設計図レベル：' + lv + '　（工房を上げると増える）');
    S.bps.forEach(function (id) {
      var b = BP[id], p = b.product;
      var can = lv >= b.level && b.cost.every(function (c) { return matCount(c.id) >= c.n; });
      var box = el('div', 'sp-card' + (can ? '' : ' is-off'));
      var who = requestersOf(p.id);
      if (who.length) box.classList.add('is-wanted');
      box.appendChild(itemRow(p, btn('作る', function () {
        act('craft', craft(id)); render();
      }, 'sp-btn-s' + (can ? ' is-main' : ''))));
      var cost = el('div', 'sp-cost');
      cost.appendChild(el('span', 'sp-k', 'Lv' + b.level + '　素材'));
      b.cost.forEach(function (c) {
        var ok = matCount(c.id) >= c.n;
        cost.appendChild(el('span', 'sp-tag' + (ok ? '' : ' is-lack'),
          MAT[c.id].name + ' ' + matCount(c.id) + '/' + c.n));
      });
      box.appendChild(cost);
      if (who.length) box.appendChild(el('div', 'sp-wait', who.map(function (w) { return HUN[w.id].name; }).join('・') + 'の頼みに応えられる'));
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
        act('dismantle', dismantle(pid)); render();
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
        act('buy', buyFromMerchant('bp', b.id)); render();
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
        act('upgrade', upgrade(key)); render();
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
      var desc = (d.desc ? d.desc + '\n' : '') + 'Lv' + d.level + '　' + d.floors + '層　賞金首：' + d.boss.name;
      var extra = known && S.bossDown[d.id] ? '討伐済' : null;
      s3.appendChild(dexEntry('dun:' + d.id, known, d.name, 'gate', desc, 'dungeon', d.id, extra));
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

  /* その商品の現物のうち、今ハンターが身につけている物 */
  function itemsInUse(pid) {
    var out = [];
    D.hunters.forEach(function (hd) {
      var h = S.hunters[hd.id];
      Object.keys(h.gear || {}).forEach(function (slot) {
        var it = h.gear[slot];
        if (it && it.id === pid) out.push({ who: hd.id, it: it });
      });
    });
    return out;
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
    var inUse = on === 'item' ? itemsInUse(target) : [];
    var hasMore = known && (evs.length || chron.length || inUse.length);
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
      if (inUse.length) {
        box.appendChild(el('div', 'sp-chron-h', '今も使われている'));
        inUse.forEach(function (u) {
          var c = el('div', 'sp-chron');
          (u.it.history || []).forEach(function (lineText) { c.appendChild(el('p', null, lineText)); });
          c.appendChild(el('p', null, '今は' + HUN[u.who].name + 'の手にある。' +
            (u.it.kills || u.it.blocks ? deeds(u.it) : 'まだ出番を待っている')));
          box.appendChild(c);
        });
      }
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
        var g = st2.gear && st2.gear[pair[0]];
        var rec = g && g.kills ? '・' + g.kills + '体' : '';
        eq.appendChild(el('span', 'sp-tag' + (low ? ' is-lack' : ''),
          pair[1] + '：' + PROD[pid].name + (max ? '（残り ' + left + rec + '）' : '')));
      });
      card.appendChild(eq);
      if (st2.place === 'town' && st2.request) {
        card.appendChild(el('p', 'sp-say', '「' + st2.request.say + '」'));
        card.appendChild(reqTag(st2));
      } else if (st2.place === 'town') {
        card.appendChild(forecastLines(st2));
      } else if (st2.place === 'dungeon' && st2.forecast) {
        card.appendChild(el('div', 'sp-fac-next', '出発時の見込み：' + st2.forecast));
      }
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

  function renderPending(parent) {
    if (S.pending.length > 1) {
      parent.appendChild(btn('全部買う', function () {
        var n = buyAllPending();
        if (n) { SND.se('buy'); toast(n + '件買った', true); }
        else toast('資金が足りない');
        render();
        if (elOverlay.classList.contains('is-open')) refreshOverlayBuys();
      }, 'sp-btn-s is-main'));
    }
    S.pending.forEach(function (p, i) {
      var info = pendingInfo(p);
      var b = btn('買う ' + gold(info.cost), function () {
        act('buy', buyPending(i)); render();
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

    // 賞金首。この店の品で仕留めたなら、それを一番上に
    (R.boss || []).forEach(function (b) {
      var c = el('div', 'sp-bossdown');
      c.appendChild(el('span', 'sp-unlock-k', '賞金首討伐'));
      c.appendChild(el('b', null, HUN[b.hunter].name + 'が' + b.boss + 'を仕留めた'));
      if (b.item) c.appendChild(el('p', null, 'とどめは、この店の' + b.item + 'だった。'));
      var cd = (R.cards || []).filter(function (x) { return x.hunter === b.hunter; })[0];
      if (cd && cd.verdict && cd.verdict.kind === 'up') c.appendChild(el('p', 'sp-upset', '分の悪い賭けだった。見込みを覆した。'));
      box.appendChild(c);
    });

    // ハンターの報告。1組1枚
    if (R.cards && R.cards.length) {
      var s2 = el('div', 'sp-rsec');
      s2.appendChild(el('h3', null, 'ハンター'));
      R.cards.forEach(function (c) { s2.appendChild(hunterCard(c)); });
      box.appendChild(s2);
    }
    if (R.away && R.away.length) {
      var sa = el('div', 'sp-rsec');
      sa.appendChild(el('h3', null, '荒野に出ている'));
      R.away.forEach(function (a) {
        var h = S.hunters[a.hunter];
        var line = el('div', 'sp-line');
        line.appendChild(el('span', null, HUN[a.hunter].name + '　' + DUN[a.dungeon].name +
          (a.forecast ? '（見込み：' + a.forecast + '）' : '')));
        line.appendChild(el('b', null, a.back + '日目に戻る'));
        sa.appendChild(line);
      });
      box.appendChild(sa);
    }

    // 売上
    var total = R.sales.reduce(function (a, s) { return a + s.price; }, 0);
    var sec = el('div', 'sp-rsec');
    sec.appendChild(el('h3', null, '売上　' + gold(total + R.inn + (R.tips || 0))));
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
    if (R.tips) {
      var tl = el('div', 'sp-line');
      tl.appendChild(el('span', null, '頼みごとのお礼'));
      tl.appendChild(el('b', null, gold(R.tips)));
      sec.appendChild(tl);
    }
    if (R.inn) {
      var l = el('div', 'sp-line');
      l.appendChild(el('span', null, '宿泊料（' + (R.rooms || []).length + '部屋）'));
      l.appendChild(el('b', null, gold(R.inn)));
      sec.appendChild(l);
    }
    box.appendChild(sec);

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
      SND.se('close');
      closeResult();
      render();
    }, 'sp-btn-big'));

    elOverlay.appendChild(box);
    refreshOverlayBuys();

    /* 賞金首とクリアは、結果の上に札を出して祝う */
    (R.boss || []).forEach(function (b) {
      discover({ ribbon: '賞金首討伐', boss: true, icon: b.icon || 'hunter',
        name: b.boss, flavor: HUN[b.hunter].name + 'が' + b.dungeon + 'の最下層で仕留めた。' +
          (b.item ? 'とどめは、この店の' + b.item + '。' : ''),
        meta: '賞金 ' + gold(b.reward) });
    });
    R.unlocks.forEach(function (u) {
      if (u.kind === 'クリア') discover({ ribbon: 'クリア', boss: true, icon: 'tank', name: u.name, flavor: u.text });
    });
  }

  function closeResult() {
    if (elOverlay.classList.contains('is-open') && !S.tutSeen.result) { S.tutSeen.result = true; save(); }
    elOverlay.classList.remove('is-open');
    elOverlay.innerHTML = '';
  }

  /* 結果画面のハンター1組ぶん：何があったか → 店の品の活躍 → 本人の言葉 */
  function hunterCard(c) {
    var h = S.hunters[c.hunter];
    var box = el('div', 'sp-hcard');
    var head = el('div', 'sp-fac-head');
    head.appendChild(el('b', null, HUN[c.hunter].name));
    head.appendChild(el('span', 'sp-lv', '強さ ' + c.power));
    box.appendChild(head);

    if (c.verdict) {
      var vd = el('div', 'sp-verdict is-' + c.verdict.kind);
      vd.appendChild(el('b', null, c.verdict.text));
      if (c.verdict.why) vd.appendChild(el('span', null, c.verdict.why));
      box.appendChild(vd);
    }

    c.lines.forEach(function (t) {
      var p = el('p', 'sp-report');
      p.innerHTML = escapeHtml(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      box.appendChild(p);
    });

    if (c.mine && c.mine.length) {
      var m = el('div', 'sp-mine');
      m.appendChild(el('div', 'sp-mine-h', 'この店の品'));
      c.mine.forEach(function (x) { m.appendChild(el('p', x.big ? 'is-big' : null, x.text)); });
      box.appendChild(m);
    }

    c.talk.forEach(function (t) { box.appendChild(el('p', 'sp-say', '「' + t + '」')); });

    if (c.req && h.request === c.req) box.appendChild(reqTag(h));

    /* 戦闘の中身は畳んでおく。見たい人だけ開く */
    if (c.battle && c.battle.length) {
      var open = !!(S.opt && S.opt.autoLog);
      var detail = el('div', 'sp-battle');
      c.battle.forEach(function (lineText) { detail.appendChild(el('div', null, lineText)); });
      detail.hidden = !open;
      var tg = btn(open ? '戦闘の詳細を閉じる' : '戦闘の詳細を見る', function () {
        detail.hidden = !detail.hidden;
        tg.textContent = detail.hidden ? '戦闘の詳細を見る' : '戦闘の詳細を閉じる';
      }, 'sp-btn-s sp-battle-toggle');
      box.appendChild(tg);
      box.appendChild(detail);
    }
    return box;
  }

  /* 頼みの札。何を置けば応えられるかまで書く */
  function reqTag(h) {
    var t = el('div', 'sp-req');
    t.appendChild(el('span', 'sp-req-k', '頼み'));
    t.appendChild(el('b', null, reqLabel(h.request, h)));
    t.appendChild(el('span', 'sp-req-hint', reqHint(h)));
    t.appendChild(forecastLines(h));
    return t;
  }

  /* 応える手立て：棚にある／在庫がある／作れる／商人にある／まだ無い */
  function reqHint(h) {
    var req = h.request;
    var match = D.blueprints.filter(function (b) { return reqMatch(req, h, b.product); })
      .sort(function (a, b) { return (b.product.power || 0) - (a.product.power || 0); });
    var onShelf = match.filter(function (b) {
      return S.shelf.indexOf(b.product.id) >= 0 && stockCount(b.product.id) > 0;
    });
    if (onShelf.length) return '棚に' + onShelf[0].product.name + 'がある。明日買っていく';
    var held = match.filter(function (b) { return stockCount(b.product.id) > 0; });
    if (held.length) return '在庫の' + held[0].product.name + 'を棚に出せば渡せる';
    var own = match.filter(function (b) { return S.bps.indexOf(b.id) >= 0; });
    if (own.length) return '工房で' + own[0].product.name + 'を作れば応えられる';
    var shop = match.filter(function (b) { return merchantBlueprints().indexOf(b) >= 0; });
    if (shop.length) return '商人が' + shop[0].name + 'を売っている';
    var later = match.filter(function (b) { return !b.rare; })[0];
    if (later) return '工房をLv' + later.level + 'に広げると、商人が' + later.name + 'を出す';
    return 'まだ応えられる設計図がない';
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

  /* ==========================================================
     営業の場面
     寝たあと、その日の営業を絵の上で見せてから結果を出す。
     帰ってきた組・新顔・モブが通りから店に入り、棚から買って出ていく。
     押せば飛ばせる
     ========================================================== */
  var WALK_SPEED = 190;     // 1倍座標で1秒あたりの歩く距離
  var MORNING_MAX = 7;      // これより長くなるなら全体を早回しにする

  function playMorning(R, done) {
    if (document.hidden || (S.opt && S.opt.noMorning)) { done(); return; }   // 見ている人がいなければ飛ばす
    var SP = SCENE.SPOTS, W = SCENE.W, Y = SP.streetY;
    var bg = document.createElement('canvas');
    bg.width = W; bg.height = SCENE.H;
    bg.getContext('2d').drawImage(elCv, 0, 0);
    var g = elCv.getContext('2d');
    g.imageSmoothingEnabled = false;

    var layer = el('div', 'sp-morning');
    layer.appendChild(el('div', 'sp-morning-title', R.day + '日目の営業'));
    layer.appendChild(el('div', 'sp-morning-skip', '押すと飛ばす'));
    elStage.appendChild(layer);

    function P(x, y) { return { x: x, y: y }; }
    function rackSpot() { return P(SP.racks.x0 + rnd(SP.racks.x1 - SP.racks.x0), SP.racks.y + rnd(5)); }
    var inShop = [P(SP.shopDoor.x, Y), SP.shopDoor, SP.shopAisle, SP.shopFloor];
    var outShop = [SP.shopFloor, SP.shopAisle, SP.shopDoor, P(SP.shopDoor.x, Y)];
    var fromBar = [SP.barIn, SP.barDoor, P(SP.barDoor.x, Y)];
    var toBar = [P(SP.barDoor.x, Y), SP.barDoor, SP.barIn];

    /* 役者：道のり（pts）と、着いた地点で出す一言（at[i]） */
    var actors = [];
    function actor(kind, t0, pts, at) {
      var times = [0], wait = 0;
      for (var i = 1; i < pts.length; i++) {
        var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
        times.push(times[i - 1] + (pts[i - 1].wait || 0) + Math.sqrt(dx * dx + dy * dy) / WALK_SPEED);
      }
      actors.push({ kind: kind, t0: t0, pts: pts, times: times, at: at || {}, fired: {},
        end: t0 + times[times.length - 1] + (pts[pts.length - 1].wait || 0) });
    }
    function stop(p, sec) { return { x: p.x, y: p.y, wait: sec }; }

    var salesTo = {};
    R.sales.forEach(function (s) { (salesTo[s.to] = salesTo[s.to] || []).push(s); });

    /* ハンター：来た道 → 棚 → 発つか、宿へ戻る */
    var t = 0.5;
    (R.cards || []).forEach(function (c) {
      var name = HUN[c.hunter].name;
      var buys = salesTo[name] || [];
      var returned = !!c.battle, isNew = /^初めて/.test(c.lines[0] || '');
      var leaves = c.lines.some(function (l) { return /へ発った/.test(l); });
      var dest = leaves && S.hunters[c.hunter].place === 'dungeon' ? DUN[S.hunters[c.hunter].dungeon].name : null;

      var head = [], at = {};
      if (returned || isNew) {
        head = [P(-12, Y)];
        at[0] = [[returned ? name + ' 帰還' : '新顔：' + name, 'is-name is-long']];
        if (c.verdict && c.verdict.kind !== 'even') at[0].push([c.verdict.text, c.verdict.kind === 'up' ? 'is-good is-long' : 'is-bad is-long']);
      } else {
        head = fromBar.slice();
        at[0] = [[name, 'is-name']];
      }
      var pts = head.concat(inShop);
      var shopAt = pts.length;
      var spot = rackSpot();
      pts.push(stop(spot, 0.5 + buys.length * 0.35));
      at[shopAt] = buys.map(function (s) { return ['+' + gold(s.price) + '　' + s.name, 'is-gold', s.price]; });
      if (c.thanked) at[shopAt].push(['頼みに応えた', 'is-good is-long']);
      pts.push(SP.shopFloor);
      pts = pts.concat(outShop.slice(1));
      if (dest) {
        at[pts.length - 1] = [['→ ' + dest, 'is-name is-long']];
        pts.push(P(-12, Y));
      } else {
        pts = pts.concat(toBar);
      }
      actor(c.hunter, t, pts, at);
      t += 0.55;
    });

    /* モブ：通りから入って消耗品を買い、右へ抜ける */
    var mobSales = salesTo['モブ'] || [];
    var mobN = Math.min(6, mobSales.length);
    var tm = 0.8;
    for (var m = 0; m < mobN; m++) {
      var mine = m < mobN - 1 ? [mobSales[m]] : mobSales.slice(m);
      var sum = mine.reduce(function (a, s) { return a + s.price; }, 0);
      var sx = 160 + rnd(160);
      var pts = [P(sx, Y)].concat(inShop);
      var at = {};
      at[pts.length] = [['+' + gold(sum) + '　' + mine[0].name + (mine.length > 1 ? ' ×' + mine.length : ''), 'is-gold', sum]];
      pts.push(stop(rackSpot(), 0.45));
      pts.push(SP.shopFloor);
      pts = pts.concat(outShop.slice(1));
      pts.push(P(W + 12, Y));
      actor(['mobA', 'mobB', 'mobC'][m % 3], tm, pts, at);
      tm += 0.4;
    }

    var total = actors.reduce(function (a, x) { return Math.max(a, x.end); }, 1.2) + 0.5;
    var rate = total > MORNING_MAX ? total / MORNING_MAX : 1;

    function where(a, tt) {
      var lt = tt - a.t0;
      if (lt < 0 || tt > a.end) return null;
      for (var i = 1; i < a.pts.length; i++) {
        var p0 = a.pts[i - 1], p1 = a.pts[i];
        var leave = a.times[i - 1] + (p0.wait || 0);
        if (lt < leave) return { x: p0.x, y: p0.y, i: i - 1 };
        if (lt < a.times[i]) {
          var k = (lt - leave) / (a.times[i] - leave);
          return { x: p0.x + (p1.x - p0.x) * k, y: p0.y + (p1.y - p0.y) * k, i: i - 1 };
        }
      }
      var last = a.pts[a.pts.length - 1];
      return { x: last.x, y: last.y, i: a.pts.length - 1 };
    }

    function floatText(x, y, text, cls, delay) {
      var f = el('div', 'sp-float ' + (cls || ''), text);
      f.style.left = (x / W * 100) + '%';
      f.style.top = (y / SCENE.H * 100) + '%';
      f.style.animationDelay = (delay || 0) + 's';
      layer.appendChild(f);
      setTimeout(function () { f.remove(); }, 3200 + (delay || 0) * 1000);
    }

    var start = null, raf = 0, finished = false;
    function frame(now) {
      if (finished) return;
      if (start == null) start = now;
      var tt = (now - start) / 1000 * rate;
      g.drawImage(bg, 0, 0);
      actors.slice().sort(function (a, b) {
        var pa = where(a, tt), pb = where(b, tt);
        return (pa ? pa.y : 0) - (pb ? pb.y : 0);
      }).forEach(function (a) {
        var p = where(a, tt);
        if (!p) return;
        /* 動いている間だけ足を運ぶ。止まっている（棚の前など）ときは立ちのコマ */
        var moving = a.lx != null && (a.lx !== p.x || a.ly !== p.y);
        a.lx = p.x; a.ly = p.y;
        SCENE.walker(g, a.kind, p.x, p.y, moving ? Math.floor(tt * 7) % 4 : 0);
        for (var i = 0; i <= p.i; i++) {
          if (a.fired[i] || !a.at[i]) continue;
          a.fired[i] = true;
          a.at[i].forEach(function (x, n) { floatText(p.x, p.y - 16 - n * 9, x[0], x[1], n * 0.25); });
          /* 売れた音。高い品ほど高い音にする */
          var top = a.at[i].reduce(function (m, x) { return x[2] ? Math.max(m, x[2]) : m; }, 0);
          if (top) SND.se('sell', { rate: Math.min(1.6, 0.8 + Math.log(top) / 12), gain: 0.7 });
        }
      });
      if (tt < 0.8) {                      // 夜明け
        g.fillStyle = 'rgba(5,7,10,' + (0.75 * (1 - tt / 0.8)) + ')';
        g.fillRect(0, 0, W, SCENE.H);
      }
      if (tt >= total) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }
    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onHide);
      layer.remove();
      drawScene();
      done();
    }
    function onHide() { if (document.hidden) finish(); }
    layer.addEventListener('click', finish);
    document.addEventListener('visibilitychange', onHide);
    raf = requestAnimationFrame(frame);
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ==========================================================
     図鑑に載った札
     初めて作った品・賞金首の討伐は、真ん中に札を出して紙吹雪で祝う。続いたら順番に出す。
     タイトルや営業の場面の間は待たせる
     ========================================================== */
  var disc = { queue: [], cur: null, timer: 0 };
  var DISC_HOLD = 2800;
  var confetti = [], confRaf = 0, confLast = 0;

  function discover(c) { disc.queue.push(c); pumpDisc(); }
  function pumpDisc() {
    if (disc.cur || !disc.queue.length || playing || !$('ovTitle').hidden) return;
    discOpen(disc.queue.shift());
  }
  function discOpen(c) {
    disc.cur = c;
    var card = $('discCard');
    $('discRibbon').textContent = c.ribbon;
    var ic = $('discIcon');
    ic.innerHTML = '';
    if (c.icon && ART.has(c.icon)) ic.appendChild(ART.img(c.icon, 6));
    $('discName').textContent = c.name;
    $('discFlavor').textContent = c.flavor || '';
    $('discMeta').textContent = c.meta || '';
    $('discCount').textContent = '解放 ' + dexCount() + ' / ' + DEX_TOTAL;
    card.classList.toggle('is-boss', !!c.boss);
    card.classList.remove('is-out');
    card.hidden = false;
    void card.offsetWidth;               // 続けて出すときも、出てくる動きを最初からやり直す
    $('discover').hidden = false;
    SND.se('discover');
    burstConfetti();
    disc.timer = setTimeout(discClose, DISC_HOLD);
  }
  function discClose() {
    if (!disc.cur) return;
    clearTimeout(disc.timer);
    var card = $('discCard');
    card.classList.add('is-out');
    setTimeout(function () {
      card.hidden = true;
      disc.cur = null;
      if (!confetti.length) $('discover').hidden = true;
      pumpDisc();
    }, 250);
  }

  /* 紙吹雪。真ん中から上へはじけ、左右の下からも打ち上げる。四角いドットのまま落ちながら翻る */
  function burstConfetti() {
    var W = window.innerWidth, H = window.innerHeight;
    var cols = ['#d9a441', '#e03919', '#3fb87a', '#3d8be0', '#e7ecf1'];
    function add(x, y, a0, spread, n, sp) {
      for (var i = 0; i < n; i++) {
        var a = a0 + (Math.random() - .5) * spread, v = sp * (.55 + Math.random() * .6);
        confetti.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, f: Math.random() * 6.3, vf: 6 + Math.random() * 10,
          s: 4 + Math.floor(Math.random() * 3) * 2, col: cols[(Math.random() * cols.length) | 0], t: 0, life: 2400 + Math.random() * 1200 });
      }
    }
    add(W / 2, H * .45, -Math.PI / 2, Math.PI * 1.3, 60, 850);
    add(-10, H * .95, -Math.PI / 3, .55, 36, 1200);
    add(W + 10, H * .95, -Math.PI * 2 / 3, .55, 36, 1200);
    if (confetti.length > 360) confetti.splice(0, confetti.length - 360);
    if (!confRaf) { confLast = 0; confRaf = requestAnimationFrame(stepConfetti); }
  }
  function stepConfetti(now) {
    var c = $('confetti');
    var dt = confLast ? Math.min(50, now - confLast) : 16;
    confLast = now;
    var W = window.innerWidth, H = window.innerHeight;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    var g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    var k = dt / 1000;
    confetti = confetti.filter(function (p) {
      p.t += dt;
      p.vy += 1500 * k;
      p.vx *= Math.pow(.35, k); p.vy *= Math.pow(.5, k);
      p.vy = Math.min(p.vy, 240);
      p.vx += Math.sin(p.f) * 30 * k;
      p.x += p.vx * k; p.y += p.vy * k; p.f += p.vf * k;
      var a = Math.min(1, (p.life - p.t) / 500);
      if (a <= 0 || p.y > H + 20) return false;
      var h = Math.max(1, Math.round(p.s * Math.abs(Math.cos(p.f))));
      g.globalAlpha = a;
      g.fillStyle = p.col;
      g.fillRect(Math.round(p.x), Math.round(p.y - h / 2), p.s, h);
      return true;
    });
    g.globalAlpha = 1;
    if (confetti.length) { confRaf = requestAnimationFrame(stepConfetti); return; }
    confRaf = 0;
    c.width = 0; c.height = 0;
    if (!disc.cur) $('discover').hidden = true;
  }

  /* ==========================================================
     部屋の説明
     絵の部屋にマウスを乗せると、そこで何ができるかと、いまの様子を出す
     ========================================================== */
  var FAC_OF = { shop: 'shop', workshop: 'workshop', inn: 'inn', saloon: 'saloon' };
  function roomTip(place) {
    var L = [];
    function line(text, cls) { L.push([text, cls]); }
    var reqs = openRequests().length;
    switch (place) {
      case 'workshop':
        var lv = fac('workshop').craft;
        var can = S.bps.filter(function (id) {
          var b = BP[id];
          return lv >= b.level && b.cost.every(function (c) { return matCount(c.id) >= c.n; });
        }).length;
        line('設計図と素材から品を作る。売れ残りは分解して素材に戻せる');
        line('いま作れる設計図 ' + can + ' / ' + S.bps.length, can ? 'is-good' : null);
        if (reqs) line('頼みごと ' + reqs + '件', 'is-warn');
        break;
      case 'shop':
        var empty = S.shelf.filter(function (pid) { return !stockCount(pid); }).length;
        line('作った品を棚に並べる。在庫がある限り、翌日そのまま売れていく');
        line('棚 ' + S.shelf.length + ' / ' + fac('shop').slots + '枠');
        if (empty) line('在庫切れ ' + empty + '種類', 'is-warn');
        break;
      case 'office':
        line('持ち帰りの買取と、前日の売上');
        line(S.pending.length ? '買取待ち ' + S.pending.length + '件' : '買取待ちはない', S.pending.length ? 'is-warn' : null);
        break;
      case 'inn':
        var town = D.hunters.filter(function (hd) { return S.hunters[hd.id].place === 'town'; }).length;
        line('ハンターの装備・強さ・頼みごと・明日の見込み');
        line('滞在 ' + town + ' / ' + innCapacity() + '組');
        if (reqs) line('頼みごと ' + reqs + '件', 'is-warn');
        break;
      case 'saloon':
        var sl = fac('saloon');
        line('ここに来る客の数が、毎日の回転を決める');
        line('ハンター ' + sl.hunters + '組　モブ ' + sl.mobs[0] + '〜' + sl.mobs[1] + '人');
        break;
      case 'merchant':
        var nb = merchantBlueprints().length;
        line('素材と設計図を買う。高いが、在庫は尽きない');
        if (nb) line('新しい設計図 ' + nb + '枚', 'is-good');
        break;
      case 'library':
        line('図鑑。品・ハンター・ダンジョンと、品が辿った道');
        line('解放 ' + dexCount() + ' / ' + DEX_TOTAL);
        break;
      case 'bedroom':
        line('寝て次の日へ進む');
        break;
      default:
        line('オプション。音量・控え・やり直し');
    }
    var key = FAC_OF[place], nx = key && facNext(key);
    if (nx && S.gold >= nx.cost) line('増築できる（' + gold(nx.cost) + '）', 'is-good');
    return L;
  }
  function showTip(anchor, head, lines) {
    var t = $('tip');
    t.innerHTML = '';
    t.appendChild(el('span', 'is-head', head));
    lines.forEach(function (x) { t.appendChild(el('span', x[1] || null, x[0])); });
    t.hidden = false;
    var a = anchor.getBoundingClientRect(), r = t.getBoundingClientRect();
    var y = a.bottom + 6;
    if (y + r.height > window.innerHeight - 8) y = a.top - r.height - 6;
    t.style.left = Math.max(8, Math.min(a.left, window.innerWidth - r.width - 8)) + 'px';
    t.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { $('tip').hidden = true; }

  /* ==========================================================
     はじめのてびき
     1手ずつ教える。押すところを枠で囲み、まわりを暗くする。
     手順ごとに show() が「いまどこを指して何を言うか」を返す。関係のない画面が開いていれば null で隠れる。
     at は要素。null なら枠を出さず真ん中に出す。soft は暗くしない（眺める手順）
     ========================================================== */
  var COVERS = ['ovTitle', 'ovOpt', 'ask', 'help'];
  function covered() { return COVERS.some(function (id) { return !$(id).hidden; }); }
  function resultOpen() { return elOverlay.classList.contains('is-open'); }
  function calm() { return !covered() && !resultOpen() && !playing && !disc.cur; }
  function hotOf(place) { return elStage.querySelector('.sp-hot[data-place="' + place + '"]'); }
  function buttonIn(box, label) {
    var bs = box.querySelectorAll('button');
    var main = null, any = null;
    for (var i = 0; i < bs.length; i++) {
      if (bs[i].textContent !== label) continue;
      any = any || bs[i];
      if (!main && bs[i].classList.contains('is-main')) main = bs[i];
    }
    return main || any;
  }

  /* 部屋へ案内する手順。その部屋が開いていれば inside を、別の部屋なら閉じるよう促す */
  function roomStep(place, outside, inside) {
    return function () {
      if (!calm()) return null;
      if (currentWindow === place) return inside();
      var hot = hotOf(place);
      if (currentWindow) return { at: $('winClose'), text: 'いったん閉じて、' + (hot ? hot.dataset.label : ROOM_TITLES[place]) + 'へ' };
      return { at: hotOf(place), text: outside };
    };
  }

  var TUT = [
    { done: function () { return S.counters.craft > 0; },
      show: roomStep('workshop',
        'ようこそ、店主。ここは荒野のハンター相手の店だ。\nまずは工房で品を作ろう',
        function () {
          return { at: buttonIn(elMain, '作る'), text: '「作る」を押すと、設計図と素材から品ができる。\n素材が足りている設計図は、ボタンが赤くなる' };
        }) },
    { done: function () { return S.shelf.length > 0; },
      show: roomStep('shop',
        'できた品は在庫に入る。\n店舗の棚に並べよう',
        function () {
          return { at: buttonIn(elMain, '棚に出す'), text: '「棚に出す」で並べると、在庫がある限り売れていく。\n棚の枠は種類ごとに1つ使う' };
        }) },
    { done: function () { return S.day > 1; },
      show: function () {
        return !covered() && !resultOpen() && !playing &&
          { at: $('btnDay'), text: '準備ができたら「次の日へ」。\n店が開き、客が棚から買っていく' };
      } },
    { done: function () { return !!S.tutSeen.result; },
      show: function () {
        return resultOpen() && !covered() &&
          { at: null, soft: true, text: 'その日の結果だ。売上と、ハンターの報告が出る。\n持ち帰った素材は「買取」で買う。買わないと流れる。\n見終わったら一番下の「閉じる」' };
      } },
    { done: function () { return !!S.tutSeen.inn; },
      show: function () {
        return calm() && !currentWindow &&
          { at: hotOf('inn'), text: 'ハンターは帰るたびに頼みごとをする。\n宿屋で、誰が何を欲しがっているか見られる' };
      } },
    { done: function () { return false; },
      show: function () {
        return calm() &&
          { at: null, ok: true, text: 'あとはこの繰り返しだ。\n頼みに応えるほどハンターは深く潜り、良い素材と賞金首の話を持ち帰る。\n店は各部屋の「増築」で広げられる' };
      } }
  ];

  var coachSig = '';
  function updateCoach() {
    var step = null;
    if (S.tut >= 0) {
      while (S.tut < TUT.length && TUT[S.tut].done()) { S.tut++; save(); }
      if (S.tut < TUT.length) step = TUT[S.tut];
      else S.tut = -1;
    }
    var s = step && step.show();
    var coach = $('coach'), spot = $('spot');
    if (!s) { coach.hidden = true; spot.hidden = true; return; }

    var r = null;
    if (s.at) {
      var b = s.at.getBoundingClientRect();
      if (b.width) r = { x: b.left - 3, y: b.top - 3, w: b.width + 6, h: b.height + 6 };
    }
    spot.hidden = !r;
    if (r) {
      spot.style.left = r.x + 'px'; spot.style.top = r.y + 'px';
      spot.style.width = r.w + 'px'; spot.style.height = r.h + 'px';
      spot.classList.toggle('dim', !s.soft);
    }
    var sig = S.tut + '|' + s.text + '|' + !!s.ok;
    if (sig !== coachSig) {
      coachSig = sig;
      $('coachText').textContent = s.text;
      $('coachStep').textContent = (S.tut + 1) + ' / ' + TUT.length;
      $('coachOk').hidden = !s.ok;
    }
    coach.hidden = false;
    /* 枠と重ならない側に出す。枠が下半分なら上、右半分なら左 */
    var W = window.innerWidth, H = window.innerHeight, cw = coach.offsetWidth, ch = coach.offsetHeight;
    var left, top;
    if (!r) { left = (W - cw) / 2; top = H - ch - 16; }
    else {
      left = r.x + r.w / 2 > W / 2 ? 12 : W - cw - 12;
      top = r.y + r.h / 2 > H / 2 ? Math.max(8, r.y - ch - 12) : Math.min(H - ch - 8, r.y + r.h + 12);
    }
    coach.style.left = Math.max(8, left) + 'px';
    coach.style.top = Math.max(8, top) + 'px';
  }
  function endTut() {
    S.tut = -1; save();
    $('coach').hidden = true; $('spot').hidden = true;
  }
  /* 案内役の顔。店の絵の店主の胸から上 */
  function drawGuide() {
    var c = $('guideCv'), g = c.getContext('2d');
    g.clearRect(0, 0, 16, 16);
    SPRITES.draw(g, 'keeper', 0, 1);
  }

  /* ==========================================================
     確かめる窓
     ブラウザの確認ダイアログの代わり。はい なら done(true)。
     no を null にすると はい だけの知らせになる
     ========================================================== */
  var askDone = null;
  function ask(o, done) {
    if (askDone) askDone(false);
    $('askHead').textContent = o.head || '';
    $('askText').textContent = o.text || '';
    $('askYes').textContent = o.yes || 'はい';
    $('askNo').textContent = o.no || 'やめる';
    $('askNo').hidden = o.no === null;
    $('ask').hidden = false;
    askDone = function (v) { askDone = null; $('ask').hidden = true; if (done) done(v); };
  }
  function $(id) { return document.getElementById(id); }

  /* ==========================================================
     オプション
     右上の歯車ひとつ。表示・控え・タイトル・やり直し・サイトへの導線をここにまとめる
     ========================================================== */
  function openOpt(inGame) {
    S.opt = S.opt || {};
    $('optMorning').checked = !S.opt.noMorning;
    $('optLog').checked = !!S.opt.autoLog;
    $('optToTitle').hidden = !inGame;
    syncSound();
    if (inGame) SND.se('ui');
    $('ovOpt').hidden = false;
  }

  /* 控え。localStorage 1枚に預けたままにせず、ファイルに出せるようにしておく */
  var noteT = 0;
  function note(text) {
    var e = $('saveNote');
    e.textContent = text;
    e.hidden = false;
    clearTimeout(noteT);
    noteT = setTimeout(function () { e.hidden = true; }, 6000);
  }
  function exportSave() {
    save();
    var d = new Date();
    var stamp = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    var name = 'ハンター向けのショップ_' + S.day + '日目_' + stamp + '.txt';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'text/plain' }));
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    note('控えを書き出しました。' + name);
  }
  function importSave(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var st = null;
      try { st = JSON.parse(fr.result); } catch (e) { st = null; }
      if (!st || !st.hunters) {
        ask({ head: '読み込めませんでした', text: 'この控えは読めませんでした。', yes: '閉じる', no: null });
        return;
      }
      ask({ head: '控えを読み込む',
        text: '「' + (st.day || 1) + '日目／所持金 ' + gold(st.gold || 0) + '」を読み込みます。\nいまの店は消えます。',
        yes: '読み込む' }, function (ok) {
        if (!ok) return;
        uidSeq = st.uid || 1;
        fillNewHunters(st);
        S = st; save();
        closeWindow(); closeResult(); render();
        note('控えを読み込みました。' + S.day + '日目');
      });
    };
    fr.readAsText(file);
  }

  function startFresh() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    uidSeq = 1;
    S = freshState(); save();
    closeWindow(); closeResult(); render();
  }

  /* ==========================================================
     タイトル
     続きがあるときは「つづきから」と、どこまで来たかを見せる。
     最初は「クリックしてはじめる」だけ出す。そのクリックで音を鳴らせるようになる（ブラウザの決まり）
     ========================================================== */
  var titleReady = false;
  function showTitle(resume) {
    $('btnStart').textContent = resume ? 'つづきから' : 'はじめる';
    $('btnTitleNew').hidden = !resume;
    $('titleNote').textContent = resume
      ? S.day + '日目　所持金 ' + gold(S.gold) + '　解放 ' + dexCount() + ' / ' + DEX_TOTAL
      : '';
    $('titlePress').hidden = titleReady;
    $('titleMenu').hidden = !titleReady;
    closeWindow();
    $('ovTitle').hidden = false;
    if (window.TITLE) TITLE.start();
  }
  function titleWake() {
    if (titleReady) return;
    titleReady = true;
    SND.unlock(); SND.se('wake'); SND.bgm('title');
    $('titlePress').hidden = true;
    $('titleMenu').hidden = false;
  }
  function hideTitle() {
    $('ovTitle').hidden = true;
    if (window.TITLE) TITLE.stop();
    SND.bgm('play');
    render();
  }

  /* 音量。素材が1つも無いときは音量の欄を隠す */
  function syncSound() {
    var on = SND.ready();
    $('volBox').hidden = !on;
    var gear = $('btnOpt');
    if (gear) gear.classList.toggle('is-mute', on && SND.muted());
    if (!on) return;
    var v = SND.vol();
    $('vBgm').value = v.bgm; $('vBgmV').textContent = Math.round(v.bgm * 100) + '%';
    $('vSe').value = v.se; $('vSeV').textContent = Math.round(v.se * 100) + '%';
    $('btnMute').textContent = SND.muted() ? 'ミュート解除' : 'ミュート';
  }
  function setupSound() {
    $('btnMute').onclick = function () { SND.setMute(!SND.muted()); syncSound(); };
    $('vBgm').oninput = function (e) { SND.setVol('bgm', +e.target.value); syncSound(); };
    $('vSe').oninput = function (e) { SND.setVol('se', +e.target.value); syncSound(); };
    $('vSe').onchange = function () { SND.se('ui'); };
    var cr = SND.credits();
    if (cr.length) {
      $('credits').hidden = false;
      $('credits').innerHTML = cr.map(function (c) {
        return c.what + '：' + (c.url ? '<a href="' + c.url + '" target="_blank" rel="noopener">' + c.who + '</a>' : c.who);
      }).join('　');
    }
    syncSound();
  }

  /* ==========================================================
     起動
     ========================================================== */
  function init() {
    var saved = load();
    S = saved || freshState();
    save();
    render();

    /* 覆いの上のボタンはどれも押した音を返す */
    ['ovOpt', 'ask', 'ovTitle'].forEach(function (id) {
      $(id).addEventListener('click', function (e) {
        if (e.target.closest('button') && e.target.id !== 'btnOpt') SND.se('ui');
      });
    });
    $('btnOptClose').onclick = function () { $('ovOpt').hidden = true; renderHud(); };
    $('optMorning').onchange = function (e) { S.opt.noMorning = !e.target.checked; save(); };
    $('optLog').onchange = function (e) { S.opt.autoLog = e.target.checked; save(); };
    $('btnExport').onclick = exportSave;
    $('btnImport').onclick = function () { $('fileSave').click(); };
    $('fileSave').onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importSave(f);
    };
    $('btnToTitle').onclick = function () {
      save();
      $('ovOpt').hidden = true;
      showTitle(true);
    };
    $('btnReset').onclick = function () {
      ask({ head: '最初からやり直す', text: '所持金・設備・設計図・図鑑をすべて消して、開店の日からやり直します。', yes: 'やり直す' }, function (ok) {
        if (!ok) return;
        startFresh();
        $('ovOpt').hidden = true;
        if (!$('ovTitle').hidden) showTitle(false);
      });
    };
    $('askYes').onclick = function () { if (askDone) askDone(true); };
    $('askNo').onclick = function () { if (askDone) askDone(false); };

    if (window.TITLE) TITLE.attach($('titleCv'));
    $('ovTitle').addEventListener('pointerdown', titleWake);
    $('btnStart').onclick = hideTitle;
    $('btnTitleNew').onclick = function () {
      ask({ head: 'はじめから', text: 'いまの店の所持金・設備・設計図・図鑑はすべて消えます。', yes: 'はじめから遊ぶ' }, function (ok) {
        if (!ok) return;
        startFresh();
        hideTitle();
      });
    };
    $('btnTitleOpt').onclick = function () { openOpt(false); };
    $('btnTitleHelp').onclick = function () { $('help').hidden = false; };
    $('btnHelpClose').onclick = function () { $('help').hidden = true; };
    $('btnTut').onclick = function () {
      S.tut = 0; save();
      $('help').hidden = true;
      if (!$('ovTitle').hidden) hideTitle();
    };
    $('help').addEventListener('click', function (e) { if (e.target.closest('button')) SND.se('ui'); });
    $('coachSkip').onclick = function () { SND.se('ui'); endTut(); };
    $('coachOk').onclick = function () { SND.se('ui'); endTut(); };
    drawGuide();
    $('discCard').addEventListener('click', discClose);
    /* 枠の移動は CSS が滑らかにするので、毎フレームでなくてよい。
       待たせていた札（タイトル・営業の場面が終わった）もここで出す */
    setInterval(function () { updateCoach(); pumpDisc(); }, 120);
    setupSound();
    showTitle(!!saved);
  }

  init();

  /* 中身をブラウザから覗くための口。動作確認（_autoplay.js）に使う */
  window.__shop = {
    S: function () { return S; },
    nextDay: nextDay, craft: craft, dismantle: dismantle,
    putOnShelf: putOnShelf, takeOffShelf: takeOffShelf,
    buyPending: buyPending, buyFromMerchant: buyFromMerchant, upgrade: upgrade,
    merchantBlueprints: merchantBlueprints, usefulMaterials: usefulMaterials,
    requestersOf: requestersOf, openRequests: openRequests, stockCount: stockCount,
    hunterPower: hunterPower, chooseDungeon: chooseDungeon, fac: fac, facNext: facNext,
    reset: function () { uidSeq = 1; S = freshState(); }
  };

})();
