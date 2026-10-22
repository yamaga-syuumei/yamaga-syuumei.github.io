/* ==========================================================
   荒野の戦車乗り

   - 地続きの荒野を走る。主砲は荒野でも撃てる（岩・廃車・雑魚に当たる）
   - 雑魚はシンボルで、触れると自動の撃ち合い。後ろから触れると先手
   - 賞金首はターン制。武器を選んで部位を撃つ。本体より先に壊した部位は部品になる
   - 部品は積める重さ（エンジンの power）の中で組む。関所は部品の印で越える

   描画は Phaser 3（CDN）。街・整備・戦闘の操作は DOM。
   座標はタイル16px。カメラを2倍に拡大するので画面上は32px。
   ========================================================== */
(function () {
  'use strict';

  var D = window.GAME_DATA;

  var TILE = 16;
  var MAPH = D.map.length, MAPW = D.map[0].length;
  var WORLD_W = MAPW * TILE, WORLD_H = MAPH * TILE;
  var VIEW_W = 704, VIEW_H = 448, ZOOM = 2;
  var SAVE_KEY = 'tank-save-v3';
  var SLOTS = ['main', 'sub', 'special', 'armor', 'engine', 'track', 'extra'];
  var SLOT_NAME = { main: '主砲', sub: '副砲', special: '特殊砲', armor: '装甲', engine: 'エンジン', track: 'キャタピラ', extra: '道具' };
  var REQUIRED = { main: 1, armor: 1, engine: 1, track: 1 };

  var PART = {}, MOB = D.mobs, BOSS = {}, TOWN = {}, QUEST = {};
  D.parts.forEach(function (p) { PART[p.id] = p; });
  D.bosses.forEach(function (b) { BOSS[b.id] = b; });
  D.towns.forEach(function (t) { TOWN[t.id] = t; });
  D.quests.forEach(function (q) { QUEST[q.id] = q; });

  function $(id) { return document.getElementById(id); }
  function r(n) { return Math.floor(Math.random() * (n * 2 + 1)) - n; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function rngFrom(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ==========================================================
     セーブデータ
     ========================================================== */
  var S;

  function fresh() {
    var home = homeTown(), s = {
      gold: D.start.gold, scrap: 0, kits: D.start.kits, hp: 0, ammo: 0,
      x: home.x * TILE + TILE / 2, y: (home.y + 2) * TILE + TILE / 2,
      bag: [], eq: {}, uid: 1,
      broken: {}, found: {}, defeated: {}, stripped: {}, notes: {},
      quests: {}, met: {}, owned: {}, tut: 0, tutOff: false, tips: {}, cleared: false
    };
    SLOTS.forEach(function (sl) {
      var id = D.start.equip[sl];
      s.eq[sl] = id ? addPart(s, id) : null;
    });
    return s;
  }
  function addPart(s, id) {
    var it = { uid: s.uid++, id: id, mod: null };
    s.bag.push(it);
    s.owned[id] = 1;
    return it.uid;
  }
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) S = JSON.parse(raw);
    } catch (e) { /* 保存できない環境でも遊べるようにする */ }
    return !!S;
  }
  function save() {
    if (!S) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
  }
  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  function homeTown() { return D.towns.filter(function (t) { return t.home; })[0]; }

  /* ==========================================================
     車の性能
     部品1つの値は、元の値に改造の足し引きと割合を掛けたもの。
     ========================================================== */
  function item(uid) {
    for (var i = 0; i < S.bag.length; i++) if (S.bag[i].uid === uid) return S.bag[i];
    return null;
  }
  function stat(it, key) {
    var p = PART[it.id], v = p[key] || 0, m = it.mod && D.mods[it.mod];
    if (m) {
      if (m.pct && m.pct[key]) v = Math.round(v * (100 + m.pct[key]) / 100);
      if (m.add && m.add[key]) v += m.add[key];
    }
    if (key === 'w') return Math.max(0, v);
    return key === 'spd' ? Math.round(v * 10) / 10 : v;
  }
  function equipped(sl) { var u = S.eq[sl]; return u ? item(u) : null; }

  function car() {
    var c = { atk: 0, ammo: 0, sub: 0, sp: null, def: 0, hp: 1, power: 0, w: 0, spd: 0, tags: {}, ram: 0 };
    SLOTS.forEach(function (sl) {
      var it = equipped(sl);
      if (!it) return;
      var p = PART[it.id];
      (p.tags || []).forEach(function (t) { c.tags[t] = 1; });
      if (sl !== 'engine') c.w += stat(it, 'w');
      if (sl === 'main')    { c.atk = stat(it, 'atk'); c.ammo = stat(it, 'ammo'); }
      if (sl === 'sub')     c.sub = stat(it, 'atk');
      if (sl === 'special') c.sp = { name: p.name, atk: stat(it, 'atk'), shots: stat(it, 'shots'), tags: p.tags || [] };
      if (sl === 'armor')   { c.def = stat(it, 'def'); c.hp = stat(it, 'hp'); }
      if (sl === 'engine')  { c.power = stat(it, 'power'); c.spd += stat(it, 'spd'); }
      if (sl === 'track')   c.spd += stat(it, 'spd');
      if (sl === 'extra' && p.tags && p.tags.indexOf('ram') >= 0) c.ram = stat(it, 'atk');
    });
    if (c.tags.ammo) c.ammo = Math.round(c.ammo * 1.5);
    c.spd = Math.max(1.2, c.spd);
    return c;
  }
  function has(tag) { return !!car().tags[tag]; }
  function maxHp() { return car().hp; }
  function overloaded() { var c = car(); return c.w > c.power; }

  function tankPal() {
    var a = equipped('armor'), t = equipped('track'), m = equipped('main'), s = equipped('sub'), x = equipped('extra');
    var xt = x ? PART[x.id].tags || [] : [];
    var kind = xt.indexOf('dozer') >= 0 ? 'dozer' : xt.indexOf('float') >= 0 ? 'float' : xt.indexOf('ram') >= 0 ? 'ram' : null;
    return {
      body: PART[a.id].color, tread: PART[t.id].color,
      barrel: PART[m.id].color, sub: s ? PART[s.id].color : null,
      extra: kind ? { kind: kind, color: PART[x.id].color } : null
    };
  }

  /* ==========================================================
     地図
     ========================================================== */
  var grid = [];
  var PASS = { '.': 1, ',': 1, 'T': 1 };

  function buildGrid() {
    grid = D.map.map(function (row) { return row.split(''); });
    Object.keys(S.broken).forEach(function (k) {
      var p = k.split(','), x = +p[0], y = +p[1];
      grid[y][x] = S.broken[k];
    });
  }
  function at(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return '#';
    return grid[ty][tx];
  }
  function canPass(ch, forMob) {
    if (PASS[ch]) return true;
    if (forMob) return false;
    var g = D.gates[ch];
    return !!(g && has(g.need));
  }
  function regionAt(tx, ty) {
    for (var i = 0; i < D.regions.length; i++) {
      var rc = D.regions[i].rect;
      if (tx >= rc[0] && tx <= rc[2] && ty >= rc[1] && ty <= rc[3]) return D.regions[i];
    }
    return null;
  }
  function nearTown(tx, ty, rad) {
    return D.towns.some(function (t) { return Math.abs(t.x - tx) <= rad && Math.abs(t.y - ty) <= rad; });
  }
  function tkey(tx, ty) { return tx + ',' + ty; }

  /* ==========================================================
     状態表示
     ========================================================== */
  var scene = 'title';     // title / field / mob / boss / town / ending
  var cool = 0;            // 戦闘直後に再び触れないための猶予（フレーム）
  var townLock = null;
  var curRegion = null;

  var toastEl = $('toast'), toastT = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastT = 170;
  }

  var PANELS = ['idle', 'mob', 'boss', 'town', 'ending'];
  function panel(id) {
    PANELS.forEach(function (k) { $(k).hidden = k !== id; });
    if (id === 'idle') renderIdle();
  }

  function hud() {
    var c = car(), hp = Math.max(0, Math.round(S.hp));
    $('hud-hp').textContent = hp + ' / ' + c.hp;
    $('hud-hpbar').style.width = (hp / c.hp * 100) + '%';
    $('hud-gold').textContent = S.gold.toLocaleString() + ' G';
    $('hud-scrap').textContent = S.scrap.toLocaleString() + ' G';
    $('hud-ammo').textContent = S.ammo + ' / ' + c.ammo;
    $('hud-ammo').classList.toggle('is-low', S.ammo <= Math.ceil(c.ammo / 4));
    $('hud-kits').textContent = S.kits;
    $('hud-region').textContent = curRegion ? curRegion.name : '';
  }

  function renderIdle() {
    var all = D.bosses.length, done = D.bosses.filter(function (b) { return S.defeated[b.id]; }).length;
    $('goal-count').textContent = done + ' / ' + all;
    $('goal-note').textContent = S.cleared ? '灰色の亡霊は倒れた。荒野はまだ続く'
      : '最後の賞金首は、崖の上の「灰色の亡霊」';
    $('goal').classList.toggle('is-done', !!S.cleared);
    $('idle-region').textContent = curRegion ? curRegion.name : '荒野';

    var host = $('idle-quests');
    host.innerHTML = '';
    D.quests.forEach(function (q) {
      var st = S.quests[q.id];
      if (!st || st.st === 'done') return;
      var el = document.createElement('div');
      el.className = 'tk-qline';
      el.innerHTML = '<b>' + esc(q.name) + '</b><span>' + esc(questHint(q, st)) + '</span>';
      host.appendChild(el);
    });
    $('idle-quest-box').hidden = !host.children.length;
  }

  /* ==========================================================
     無線（サキ）
     始めの案内は D.tutorial を順に出す。tip は初めての場面で1度だけ。
     ========================================================== */
  var radioEl = $('radio'), radioText = $('radio-text');
  var spotEl = $('spot'), spotTarget = null, spotDim = false;
  var radioTip = null, radioT = 0, tipQueue = [];
  var fieldMark = null;    // 荒野で行き先を示す印 {x, y}

  (function drawFace() {
    var sp = window.SPRITES && window.SPRITES['face-saki'], cv = $('radio-face');
    if (!sp) return;
    var img = ART.fromRows(sp);
    cv.width = img.width; cv.height = img.height;
    cv.getContext('2d').drawImage(img, 0, 0);
  })();

  function tutStep() {
    if (S.tutOff || S.tut >= D.tutorial.length) return null;
    return D.tutorial[S.tut];
  }
  function tutDone(id) {
    var st = tutStep();
    if (!st || st.id !== id) return;
    S.tut++;
    SFX.radio();
    save();
    showRadio();
  }
  function tip(key) {
    if (S.tips[key] || !D.tips[key]) return;
    S.tips[key] = 1;
    tipQueue.push(D.tips[key]);
    save();
    showRadio();
  }

  /* 案内を1つだけ出す。始めの案内が残っていればそちらが先 */
  function showRadio() {
    if (scene === 'title' || scene === 'ending') { radioEl.hidden = true; return; }
    var st = tutStep();
    if (st) {
      radioTip = null;
      radioText.textContent = st.text;
      $('radio-step').textContent = (S.tut + 1) + ' / ' + D.tutorial.length;
      $('radio-close').textContent = st.id === 'end' ? 'わかった' : 'とじる';
      radioEl.hidden = false;
      tutTargets(st.id);
      return;
    }
    setSpot(null); fieldMark = null;
    if (!radioTip && tipQueue.length && scene !== 'boss' && scene !== 'mob') {
      radioTip = tipQueue.shift();
      radioT = 600;
    }
    if (radioTip) {
      radioText.textContent = radioTip;
      $('radio-step').textContent = '';
      $('radio-close').textContent = 'わかった';
      radioEl.hidden = false;
    } else {
      radioEl.hidden = true;
    }
  }

  $('radio-close').addEventListener('click', function () {
    var st = tutStep();
    if (st) {
      if (st.id === 'end') S.tut++; else S.tutOff = true;
      save();
    } else {
      radioTip = null;
    }
    showRadio();
  });

  /* 案内の行き先。荒野なら地図に印、画面の部品なら金の枠で囲む */
  function tutTargets(id) {
    fieldMark = null; setSpot(null);
    var skip = false;
    if (id === 'shoot') {
      if (S.broken['13,56']) skip = true; else fieldMark = { x: 13, y: 56 };
    }
    if (id === 'mob') {
      var m = mobs.filter(function (m) { return m.tut && !m.dead; })[0];
      if (m) fieldMark = { px: m, x: 0, y: 0 }; else skip = true;
    }
    if (id === 'pick') {
      var pk = pickups.filter(function (p) { return p.kind === 'part'; })[0];
      if (pk) fieldMark = { px: pk, x: 0, y: 0 }; else skip = true;
    }
    if (id === 'equip') {
      if (!S.bag.some(function (b) { return !isEquipped(b.uid); })) skip = true;
      else if (scene === 'town') {
        if (townTab !== 'gear') setSpot($('tab-btn-gear'), true);
        else setSpot(document.querySelector('[data-equip-hint="2"]') || document.querySelector('[data-equip-hint]'), true);
      } else {
        var h = homeTown();
        fieldMark = { x: h.x, y: h.y };
      }
    }
    if (id === 'bounty') {
      if (scene === 'town') setSpot($('tab-btn-bounty'), true);
      else { var h2 = homeTown(); fieldMark = { x: h2.x, y: h2.y }; }
    }
    if (skip) setTimeout(function () { tutDone(id); }, 0);
  }

  function setSpot(el, dim) {
    spotTarget = el || null; spotDim = !!dim;
    placeSpot();
  }
  function placeSpot() {
    if (!spotTarget || !document.body.contains(spotTarget) || spotTarget.offsetParent === null) {
      spotEl.hidden = true; return;
    }
    var rc = spotTarget.getBoundingClientRect();
    spotEl.hidden = false;
    spotEl.classList.toggle('dim', spotDim);
    spotEl.style.left = (rc.left - 4) + 'px';
    spotEl.style.top = (rc.top - 4) + 'px';
    spotEl.style.width = (rc.width + 8) + 'px';
    spotEl.style.height = (rc.height + 8) + 'px';
  }
  window.addEventListener('scroll', placeSpot, { passive: true });
  window.addEventListener('resize', placeSpot);

  /* ==========================================================
     荒野にいるもの
     ========================================================== */
  var mobs = [], bossObjs = [], pickups = [], shells = [];

  function spawnMobs() {
    var rnd = rngFrom(777);
    mobs = [];
    D.regions.forEach(function (rg) {
      var made = 0, tries = 0;
      while (made < rg.count && tries++ < 3000) {
        var p = randomSpot(rg, rnd);
        if (!p) continue;
        var id = rg.mobs[Math.floor(rnd() * rg.mobs.length)];
        if (MOB[id].move === 'swarm') {
          for (var k = 0; k < 3; k++) mobs.push(newMob(id, rg, p.x + (k - 1) * 14, p.y + (k % 2) * 12, made));
        } else {
          mobs.push(newMob(id, rg, p.x, p.y, made));
        }
        made++;
      }
    });
    if (tutStep() && S.tut <= 2) {
      var m = newMob('drone', regionAt(18, 56), 18 * TILE + 8, 56 * TILE + 8, 0);
      m.tut = true;
      mobs.push(m);
    }
  }
  function newMob(id, rg, x, y, group) {
    return { id: id, def: MOB[id], rg: rg, x: x, y: y, hx: x, hy: y, vx: 0, vy: 0,
             t: Math.random() * 100, cd: 60, group: group, dead: false, respawn: 0, view: null };
  }
  function randomSpot(rg, rnd) {
    var rc = rg.rect;
    var tx = rc[0] + Math.floor(rnd() * (rc[2] - rc[0] + 1));
    var ty = rc[1] + Math.floor(rnd() * (rc[3] - rc[1] + 1));
    if (at(tx, ty) !== '.') return null;
    if (nearTown(tx, ty, 4)) return null;
    if (Math.hypot(tx * TILE - S.x, ty * TILE - S.y) < 8 * TILE) return null;
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }

  function setupBosses() {
    bossObjs = D.bosses.map(function (b) {
      return { def: b, x: b.x * TILE + TILE / 2, y: b.y * TILE + TILE / 2, views: null };
    });
  }

  /* 拾い物。見えている物と、壊した廃車から出た物、依頼の品 */
  function setupFinds() {
    pickups = [];
    D.finds.forEach(function (f) {
      if (S.found[f.id]) return;
      if (f.hidden && !S.broken[tkey(f.x, f.y)]) return;
      addFindPickup(f);
    });
    D.quests.forEach(function (q) {
      var st = S.quests[q.id];
      if (st && st.st === 'active' && q.step.kind === 'fetch') addQuestPickup(q);
    });
  }
  function addFindPickup(f) {
    var kind = f.part ? 'part' : f.note ? 'note' : 'gold';
    addPickup({ kind: kind, x: f.x * TILE + 8, y: f.y * TILE + 8, find: f.id, part: f.part, gold: f.gold, note: f.note });
  }
  function addQuestPickup(q) {
    if (pickups.some(function (p) { return p.quest === q.id; })) return;
    addPickup({ kind: 'quest', x: q.step.x * TILE + 8, y: q.step.y * TILE + 8, quest: q.id });
  }
  function addPickup(p) {
    p.vx = p.vx || 0; p.vy = p.vy || 0; p.t = 0;
    pickups.push(p);
    if (G) makePickupView(p);
    return p;
  }

  /* 雑魚を倒した場所にスクラップと部品を散らす */
  function scatter(x, y, def, forcePart) {
    var n = 3 + Math.floor(Math.random() * 3), each = Math.round(def.scrap / n);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = 1.2 + Math.random() * 1.6;
      addPickup({ kind: 'scrap', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, value: each });
    }
    var drop = forcePart;
    if (!drop) (def.drop || []).forEach(function (d) { if (!drop && Math.random() < d[1]) drop = d[0]; });
    if (drop) {
      var a2 = Math.random() * Math.PI * 2;
      addPickup({ kind: 'part', x: x, y: y, vx: Math.cos(a2) * 1.4, vy: Math.sin(a2) * 1.4, part: drop });
    }
  }

  function collect(p) {
    var i = pickups.indexOf(p);
    if (i < 0) return;
    pickups.splice(i, 1);
    if (p.view) p.view.destroy();
    if (p.find) S.found[p.find] = 1;
    if (p.kind === 'scrap') {
      S.scrap += p.value;
      SFX.pick(0.8);
    } else if (p.kind === 'gold') {
      S.gold += p.gold;
      SFX.pick(1.2);
      toast(p.gold.toLocaleString() + ' G を拾った');
    } else if (p.kind === 'part') {
      addPart(S, p.part);
      SFX.pick(1.4);
      toast(PART[p.part].name + ' を拾った。倉庫へ送った');
      tutDone('pick');
    } else if (p.kind === 'note') {
      S.notes[p.note] = 1;
      SFX.pick(1.2);
      toast('手配書の切れ端：' + BOSS[p.note].name + 'の居場所が分かった');
    } else if (p.kind === 'quest') {
      var q = QUEST[p.quest];
      S.quests[q.id].st = 'ready';
      SFX.pick(1.4);
      toast(q.step.item + ' を見つけた。' + TOWN[q.town].name + 'へ届けよう');
    }
    hud(); save();
  }

  /* ==========================================================
     入力
     ========================================================== */
  var pad = { up: 0, down: 0, left: 0, right: 0, fire: 0 };

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
     Phaser：荒野
     ========================================================== */
  var G = null;
  var face = 'right', flipX = false, fireCd = 0, moved = 0, bumpT = 0, saveT = 0, trailT = 0;

  /* 絵の無い物は色の塊で代わりに描く。tint は既存の絵の色替え */
  var STAND_IN = {
    mob: { drone: ['mob-0'], buggy: ['mob-1'], raider: ['mob-1', 0xff9a6a], gunner: ['mob-2', 0xffd27a],
           junk: ['mob-2'], swarm: ['mob-0', 0x9affc8], crab: ['mob-2', 0xffffff], boat: ['mob-1', 0x8ad8ff],
           golem: ['mob-2', 0xc8a07a], hawk: ['mob-0', 0xd8d8ff] }
  };
  function mobTex(id) {
    var own = 'mob-' + id;
    if (G.textures.exists(own)) return [own, null];
    var s = STAND_IN.mob[id] || ['mob-0'];
    return [s[0], s[1] || null];
  }
  function bossTex(id, key) {
    var k = 'boss-' + id + '-' + key;
    if (!G.textures.exists(k)) placeholder(k, 32, 32, '#7a6a8a');
    return k;
  }
  function placeholder(key, w, h, col) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.fillStyle = '#1c1226';
    g.fillRect(w * 0.2 - 1, h * 0.25 - 1, w * 0.6 + 2, h * 0.5 + 2);
    g.fillStyle = col;
    g.fillRect(w * 0.2, h * 0.25, w * 0.6, h * 0.5);
    G.textures.addCanvas(key, c);
  }
  /* 地面・道・岩・小岩・廃車は地域ごとの絵。ほかは共通 */
  function tileTex(ch, tx, ty) {
    var v = (tx * 5 + ty * 3) % 3, rg = regionAt(tx, ty), id = rg ? rg.id : 'sand';
    var key = {
      '.': 'tile-ground-' + id + '-' + v, ',': 'tile-road-' + id + '-' + v,
      '#': 'tile-rock-' + id + '-' + ((tx * 3 + ty) % 3),
      'o': 'tile-stone-' + id, 'x': 'tile-wreck-' + id,
      'T': 'tile-town-0', 'B': 'tile-bldg-' + ((tx + ty) % 2), 'w': 'tile-deep-0', '~': 'tile-river-' + (ty % 2),
      '^': 'tile-slope-0', '%': 'tile-rubble-0', '=': 'tile-marsh-' + (tx % 2)
    }[ch];
    return key && G.textures.exists(key) ? key : 'tile-sand-0';
  }
  var STAND_TILE = {
    'tile-bldg-0':   ['#4a4e56', '#2e3138'], 'tile-deep-0':  ['#2a5a6a', '#1e4250'],
    'tile-river-0':  ['#3a7a8a', '#5aa0aa'], 'tile-slope-0': ['#8a6a3a', '#a8844a'],
    'tile-rubble-0': ['#6a625a', '#8a8278'], 'tile-marsh-0': ['#c8c4b0', '#a8a490'],
    'tile-stone-0':  ['#8a7a5a', '#5a4e38'], 'tile-wreck-0': ['#6a4a3a', '#3a2a22'],
    'pk-scrap': ['#b8c0c8', '#6a7480'], 'pk-part': ['#ffd27a', '#a8742a'],
    'pk-gold': ['#ffe27a', '#d8a028'], 'pk-note': ['#f0e8d0', '#a89c84'], 'pk-quest': ['#ff9ab0', '#a8344a']
  };
  function ensureStandIns() {
    Object.keys(STAND_TILE).forEach(function (k) {
      if (G.textures.exists(k)) return;
      var col = STAND_TILE[k], small = k.indexOf('pk-') === 0;
      var c = document.createElement('canvas');
      c.width = small ? 8 : 16; c.height = small ? 8 : 16;
      var g = c.getContext('2d');
      g.fillStyle = col[0]; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = col[1];
      for (var i = 0; i < c.width; i += 3) g.fillRect(i, (i * 7) % c.height, 2, 1);
      G.textures.addCanvas(k, c);
    });
  }
  function drawTile(tx, ty) {
    var ch = at(tx, ty);
    G.ground.draw(tileTex(ch, tx, ty), tx * TILE, ty * TILE);
  }

  function makeMobView(m) {
    var t = mobTex(m.id);
    m.view = G.add.sprite(m.x, m.y, t[0]).setDepth(m.y);
    if (t[1]) m.view.setTint(t[1]);
  }
  function makePickupView(p) {
    p.view = G.add.sprite(p.x, p.y, 'pk-' + p.kind).setDepth(p.y - 1);
  }
  function makeBossView(b) {
    var c = G.add.container(b.x, b.y).setDepth(b.y);
    b.def.parts.forEach(function (pt) {
      var sp = G.add.sprite(0, 0, bossTex(b.def.id, pt.key));
      c.add(sp);
    });
    b.views = c;
    c.setVisible(!S.defeated[b.def.id]);
  }

  var Field = {
    key: 'field',

    create: function () {
      G = this;
      ART.register(this, tankPal());
      ensureStandIns();

      this.ground = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0).setDepth(0);
      for (var y = 0; y < MAPH; y++) for (var x = 0; x < MAPW; x++) drawTile(x, y);

      this.trail = [];
      bossObjs.forEach(makeBossView);
      mobs.forEach(makeMobView);
      pickups.forEach(makePickupView);

      this.tank = this.add.sprite(S.x, S.y, 'tank-right').setDepth(S.y + 1);
      this.mark = this.add.triangle(0, 0, 0, 0, 10, 0, 5, 8, 0xf0c46a).setDepth(9999).setVisible(false);
      this.fx = this.add.graphics().setDepth(9000);

      this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H).setZoom(ZOOM).startFollow(this.tank, true, 0.18, 0.18);
      this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE');
      this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');

      buildMinimapBase();
      hud();
    },

    update: function (time, delta) {
      var step = Math.min(delta, 50) / 16.667;
      if (toastT > 0) { toastT -= step; if (toastT <= 0) toastEl.hidden = true; }
      if (radioTip && radioT > 0) { radioT -= step; if (radioT <= 0) { radioTip = null; showRadio(); } }
      if (bumpT > 0) bumpT -= step;

      updateMobs(step);
      updatePickups(step);
      updateShells(step);
      updateMark(time);

      if (scene !== 'field') return;
      if (cool > 0) cool -= step;
      if (fireCd > 0) fireCd -= step;

      moveTank(step);
      if ((this.keys.SPACE.isDown || pad.fire) && fireCd <= 0) fieldFire();

      if (cool <= 0) checkTouch();
      checkTown();
      checkRegion();
      drawMinimap();
      saveT += step;
      if (saveT > 300) { saveT = 0; save(); }
    }
  };

  function axis() {
    var k = G.keys, ax = 0, ay = 0;
    if (k.LEFT.isDown  || k.A.isDown || pad.left)  ax -= 1;
    if (k.RIGHT.isDown || k.D.isDown || pad.right) ax += 1;
    if (k.UP.isDown    || k.W.isDown || pad.up)    ay -= 1;
    if (k.DOWN.isDown  || k.S.isDown || pad.down)  ay += 1;
    return [ax, ay];
  }

  /* 車体は10px四方として四隅で判定する */
  function blockedAt(px, py) {
    var hit = null;
    [[-5, -4], [5, -4], [-5, 5], [5, 5]].some(function (o) {
      var tx = Math.floor((px + o[0]) / TILE), ty = Math.floor((py + o[1]) / TILE);
      var ch = at(tx, ty);
      if (ch === '%' && has('dozer')) { breakTile(tx, ty, ','); SFX.destroy(); toast('瓦礫を押しのけた'); return false; }
      if (!canPass(ch)) { hit = { ch: ch, tx: tx, ty: ty }; return true; }
      return false;
    });
    return hit;
  }

  function moveTank(step) {
    var a = axis(), ax = a[0], ay = a[1];
    if (!ax && !ay) { G.tank.setTexture('tank-' + face).setFlipX(flipX); return; }
    var len = Math.hypot(ax, ay), sp = car().spd * (TILE / 32) * step;
    var nx = S.x + ax / len * sp, ny = S.y + ay / len * sp;
    var stuck = blockedAt(S.x, S.y);
    var hx = stuck ? null : blockedAt(nx, S.y);
    if (stuck || !hx) S.x = nx;
    var hy = stuck ? null : blockedAt(S.x, ny);
    if (stuck || !hy) S.y = ny;
    var hit = hx || hy;
    if (hit && D.gates[hit.ch] && bumpT <= 0) {
      bumpT = 150;
      toast(D.gates[hit.ch].tip);
      tipGate(hit.ch);
    }

    if (Math.abs(ax) >= Math.abs(ay)) { face = 'right'; flipX = ax < 0; }
    else { face = ay < 0 ? 'up' : 'down'; flipX = false; }
    G.tank.setTexture('tank-' + face).setFlipX(flipX)
      .setPosition(Math.round(S.x), Math.round(S.y)).setDepth(S.y + 1);

    moved += sp;
    if (moved > 48) tutDone('move');
    trailT += sp;
    if (trailT > 5) { trailT = 0; addTrail(); }
  }
  function tipGate(ch) {
    var k = 'gate' + ch;
    if (S.tips[k]) return;
    S.tips[k] = 1;
    tipQueue.push(D.gates[ch].tip);
    showRadio();
  }

  /* 轍と砂煙 */
  function addTrail() {
    var horiz = face === 'right';
    var t = G.add.rectangle(Math.round(S.x), Math.round(S.y) + 4, horiz ? 3 : 10, horiz ? 10 : 3, 0x2a2014, 0.35).setDepth(1);
    if (!horiz) t.setSize(10, 3);
    G.tweens.add({ targets: t, alpha: 0, duration: 4000, onComplete: function () { t.destroy(); } });
    if (Math.random() < 0.5) {
      var d = G.add.circle(S.x + r(4), S.y + 6, 2 + Math.random() * 2, 0xd8c8a0, 0.5).setDepth(S.y + 2);
      G.tweens.add({ targets: d, alpha: 0, scale: 2.2, y: d.y - 4, duration: 500, onComplete: function () { d.destroy(); } });
    }
  }

  /* ==========================================================
     荒野で撃つ
     ========================================================== */
  var DIRV = { right: [1, 0], up: [0, -1], down: [0, 1] };
  function fieldFire() {
    if (S.ammo <= 0) {
      fireCd = 40;
      toast('主砲の弾が無い。街で補給しよう');
      SFX.empty();
      tip('noammo');
      return;
    }
    fireCd = 30;
    S.ammo--;
    var d = DIRV[face], dx = face === 'right' && flipX ? -1 : d[0], dy = d[1];
    var x = S.x + dx * 10, y = S.y + dy * 10 - 2;
    var sh = G.add.rectangle(x, y, dx ? 6 : 3, dx ? 3 : 6, 0xffd479).setDepth(9000);
    shells.push({ x: x, y: y, vx: dx * 5, vy: dy * 5, life: 26, view: sh, mine: true });
    var mf = G.add.circle(x, y, 5, 0xffe9a8, 0.95).setDepth(9001);
    G.tweens.add({ targets: mf, scale: 0.2, alpha: 0, duration: 120, onComplete: function () { mf.destroy(); } });
    G.cameras.main.shake(70, 0.003);
    SFX.fire();
    hud();
    if (S.ammo <= 0) tip('noammo');
  }

  function updateShells(step) {
    for (var i = shells.length - 1; i >= 0; i--) {
      var s = shells[i], done = false;
      for (var k = 0; k < 2 && !done; k++) {
        s.x += s.vx * step / 2; s.y += s.vy * step / 2;
        done = s.mine ? myShellHit(s) : foeShellHit(s);
      }
      s.life -= step;
      if (s.life <= 0 && !done) { puff(s.x, s.y, 0xd8c8a0); done = true; }
      if (done) { s.view.destroy(); shells.splice(i, 1); }
      else s.view.setPosition(s.x, s.y);
    }
  }

  function myShellHit(s) {
    var tx = Math.floor(s.x / TILE), ty = Math.floor(s.y / TILE), ch = at(tx, ty);
    if (ch === 'o' || ch === 'x') {
      breakTile(tx, ty, '.');
      SFX.destroy();
      debris(tx * TILE + 8, ty * TILE + 8, ch === 'x' ? 0x8a6a4a : 0x9a8a6a);
      if (ch === 'x') scatter(tx * TILE + 8, ty * TILE + 8, { scrap: 60 });
      tutDone('shoot');
      return true;
    }
    if (ch === '%') {
      if (has('heavy')) {
        breakTile(tx, ty, ',');
        SFX.destroy();
        debris(tx * TILE + 8, ty * TILE + 8, 0x8a8278);
        toast('瓦礫を吹き飛ばした');
      } else {
        puff(s.x, s.y, 0xd8c8a0);
        toast('この砲では瓦礫が崩れない。重砲が要る');
      }
      return true;
    }
    if (!PASS[ch] && !D.gates[ch]) { puff(s.x, s.y, 0xd8c8a0); SFX.hit(); return true; }

    for (var i = 0; i < mobs.length; i++) {
      var m = mobs[i];
      if (m.dead || Math.hypot(m.x - s.x, m.y - s.y) > 9) continue;
      var dmg = Math.max(1, car().atk - m.def.def + r(2));
      SFX.hit();
      puff(m.x, m.y, 0xfff0c0);
      if (dmg >= m.def.hp) {
        floatNum(m.x, m.y - 10, dmg, '#ffd479');
        killMob(m);
        toast(m.def.name + 'を一撃で仕留めた');
      } else {
        startMob(m, true, dmg);
      }
      return true;
    }
    for (var j = 0; j < bossObjs.length; j++) {
      var b = bossObjs[j];
      if (S.defeated[b.def.id] || Math.hypot(b.x - s.x, b.y - s.y) > 16) continue;
      SFX.hit();
      startBoss(b, Math.max(1, car().atk - partDef(b.def.parts.filter(function (p) { return p.key === 'body'; })[0]) + r(3)));
      return true;
    }
    return false;
  }

  function foeShellHit(s) {
    var ch = at(Math.floor(s.x / TILE), Math.floor(s.y / TILE));
    if (!PASS[ch] && !D.gates[ch] && ch !== 'w') { puff(s.x, s.y, 0xd8c8a0); return true; }
    if (scene === 'field' && Math.hypot(S.x - s.x, S.y - s.y) < 8) {
      var dmg = Math.max(1, Math.round(s.atk / 2) - car().def + r(2));
      S.hp -= dmg;
      SFX.damage();
      G.cameras.main.shake(120, 0.006);
      G.tank.setTintFill(0xffffff);
      G.time.delayedCall(70, function () { G.tank.clearTint(); });
      floatNum(S.x, S.y - 12, dmg, '#ff7a5a');
      hud();
      if (S.hp <= 0) lost('砲台に撃ち抜かれて大破した。');
      return true;
    }
    return false;
  }

  function breakTile(tx, ty, to) {
    grid[ty][tx] = to;
    S.broken[tkey(tx, ty)] = to;
    if (G) drawTile(tx, ty);
    D.finds.forEach(function (f) {
      if (f.hidden && f.x === tx && f.y === ty && !S.found[f.id]) {
        addFindPickup(f);
        toast('廃車の中から何か出てきた');
      }
    });
    minimapDirty = true;
    save();
  }

  function puff(x, y, col) {
    var c = G.add.circle(x, y, 4, col, 0.8).setDepth(9001);
    G.tweens.add({ targets: c, scale: 2.4, alpha: 0, duration: 260, onComplete: function () { c.destroy(); } });
  }
  function debris(x, y, col) {
    G.cameras.main.shake(140, 0.006);
    for (var i = 0; i < 9; i++) {
      (function () {
        var a = Math.random() * Math.PI * 2, d = 8 + Math.random() * 14;
        var f = G.add.rectangle(x, y, 3, 3, i % 3 ? col : 0xd8c8a0).setDepth(9001);
        G.tweens.add({ targets: f, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, angle: 200,
                       duration: 420 + Math.random() * 200, onComplete: function () { f.destroy(); } });
      })();
    }
  }
  function floatNum(x, y, v, color) {
    var t = G.add.text(x, y, String(v), {
      fontFamily: '"Yu Gothic", "Meiryo", sans-serif', fontSize: '10px', fontStyle: 'bold',
      color: color, stroke: '#12161a', strokeThickness: 3
    }).setOrigin(0.5).setDepth(9500).setResolution(2);
    G.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 700, onComplete: function () { t.destroy(); } });
  }

  /* ==========================================================
     雑魚の動き
     ========================================================== */
  function updateMobs(step) {
    var frozen = scene !== 'field';
    mobs.forEach(function (m) {
      if (m.dead) {
        if (!m.tut && (m.respawn -= step) <= 0) respawnMob(m);
        return;
      }
      m.t += 0.02 * step;
      if (!frozen) moveMob(m, step);
      m.view.setPosition(Math.round(m.x), Math.round(m.y)).setDepth(m.y);
      if (Math.abs(m.vx) > 0.05) m.view.setFlipX(m.vx < 0);
    });
  }
  function moveMob(m, step) {
    var dx = S.x - m.x, dy = S.y - m.y, dist = Math.hypot(dx, dy), sp = m.def.spd * 0.5 * step;
    var tvx = 0, tvy = 0, mv = m.def.move;
    if (mv === 'chase' && dist < 6 * TILE) { tvx = dx / dist; tvy = dy / dist; }
    else if (mv === 'flee' && dist < 5 * TILE) { tvx = -dx / dist; tvy = -dy / dist; sp *= 1.2; }
    else if (mv === 'turret') {
      m.vx = dx > 0 ? 0.01 : -0.01;
      if (dist < 7 * TILE && (m.cd -= step) <= 0) { m.cd = 110; foeFire(m, dx / dist, dy / dist); tip('turret'); }
      return;
    } else {
      var hx = m.hx + Math.cos(m.t + m.group) * 20 - m.x, hy = m.hy + Math.sin(m.t * 0.7 + m.group) * 20 - m.y;
      var hl = Math.hypot(hx, hy) || 1;
      tvx = hx / hl * 0.5; tvy = hy / hl * 0.5;
    }
    m.vx += (tvx - m.vx) * 0.15; m.vy += (tvy - m.vy) * 0.15;
    var nx = m.x + m.vx * sp, ny = m.y + m.vy * sp;
    if (mobCan(nx, m.y)) m.x = nx; else m.vx = -m.vx;
    if (mobCan(m.x, ny)) m.y = ny; else m.vy = -m.vy;
  }
  function mobCan(px, py) {
    var tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    return canPass(at(tx, ty), true) && at(tx, ty) !== 'T' && !nearTown(tx, ty, 2);
  }
  function foeFire(m, ux, uy) {
    var sh = G.add.circle(m.x, m.y, 2.5, 0xff8a5a).setDepth(9000);
    shells.push({ x: m.x, y: m.y, vx: ux * 2.4, vy: uy * 2.4, life: 70, view: sh, mine: false, atk: m.def.atk });
    SFX.subFire();
  }
  function killMob(m) {
    m.dead = true;
    m.view.setVisible(false);
    m.respawn = 1800;
    S.met[m.id] = 1;
    scatter(m.x, m.y, m.def, m.tut ? 's_mg' : null);
    countHunt(m.id);
    if (m.tut) tutDone('mob');
    hud(); save();
  }
  function respawnMob(m) {
    var p = null, rnd = Math.random;
    for (var i = 0; i < 60 && !p; i++) p = randomSpot(m.rg, rnd);
    if (!p) { m.respawn = 600; return; }
    m.x = m.hx = p.x; m.y = m.hy = p.y; m.dead = false;
    m.view.setVisible(true);
  }

  function updatePickups(step) {
    pickups.forEach(function (p) {
      p.t += step;
      if (p.vx || p.vy) {
        p.x += p.vx * step; p.y += p.vy * step;
        p.vx *= 0.88; p.vy *= 0.88;
        if (Math.abs(p.vx) + Math.abs(p.vy) < 0.05) { p.vx = 0; p.vy = 0; }
      }
      if (scene === 'field' && p.t > 20) {
        var dx = S.x - p.x, dy = S.y - p.y, d = Math.hypot(dx, dy);
        if (d < 30 && d > 2) { p.x += dx / d * 2.2 * step; p.y += dy / d * 2.2 * step; }
      }
      if (p.view) p.view.setPosition(Math.round(p.x), Math.round(p.y + Math.sin(p.t / 12) * 1.5));
    });
    if (scene !== 'field') return;
    pickups.slice().forEach(function (p) {
      if (p.t > 20 && Math.hypot(S.x - p.x, S.y - p.y) < 9) collect(p);
    });
  }

  function updateMark(time) {
    var m = fieldMark;
    if (!m || scene !== 'field') { G.mark.setVisible(false); return; }
    var x = m.px ? m.px.x : m.x * TILE + 8, y = m.px ? m.px.y : m.y * TILE + 8;
    G.mark.setVisible(true).setPosition(x - 5, y - 22 + Math.sin(time / 180) * 3);
  }

  /* ==========================================================
     触れる・入る
     ========================================================== */
  function checkTouch() {
    for (var i = 0; i < mobs.length; i++) {
      var m = mobs[i];
      if (m.dead || Math.hypot(m.x - S.x, m.y - S.y) > 12) continue;
      /* 雑魚の進む向きの反対側から触れたら、背後を取ったことにする */
      var mv = Math.hypot(m.vx, m.vy), behind = mv > 0.1 && (m.vx * (S.x - m.x) + m.vy * (S.y - m.y)) < 0;
      startMob(m, behind, 0);
      return;
    }
    for (var j = 0; j < bossObjs.length; j++) {
      var b = bossObjs[j];
      if (S.defeated[b.def.id]) continue;
      if (Math.hypot(b.x - S.x, b.y - S.y) < 20) { startBoss(b, 0); return; }
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

  function checkRegion() {
    var rg = regionAt(Math.floor(S.x / TILE), Math.floor(S.y / TILE));
    if (!rg || rg === curRegion) return;
    var first = !!curRegion;
    curRegion = rg;
    if (first) toast(rg.name);
    SFX.bgmMood(rg.bgm);
    if (!$('idle').hidden) renderIdle();
    hud();
  }

  /* ==========================================================
     ミニマップ
     ========================================================== */
  var mmEl = $('minimap'), mmG = mmEl.getContext('2d'), mmBase = null, minimapDirty = true;
  var MM_COL = { '.': '#5a4a32', ',': '#7a6a4a', '#': '#2a241c', 'B': '#3a3c42', 'w': '#1e4250', '~': '#3a7a8a',
                 '^': '#a8844a', '%': '#8a8278', '=': '#c8c4b0', 'o': '#5a4a32', 'x': '#5a4a32', 'T': '#d9a441' };
  function buildMinimapBase() {
    mmBase = document.createElement('canvas');
    mmBase.width = MAPW; mmBase.height = MAPH;
    var g = mmBase.getContext('2d');
    for (var y = 0; y < MAPH; y++) for (var x = 0; x < MAPW; x++) {
      g.fillStyle = MM_COL[grid[y][x]] || '#5a4a32';
      g.fillRect(x, y, 1, 1);
    }
    minimapDirty = false;
  }
  function drawMinimap() {
    if (minimapDirty) buildMinimapBase();
    var w = mmEl.width, h = mmEl.height, sx = w / MAPW, sy = h / MAPH;
    mmG.imageSmoothingEnabled = false;
    mmG.drawImage(mmBase, 0, 0, w, h);
    D.towns.forEach(function (t) { dot(t.x, t.y, '#ffd27a', 3); });
    bossObjs.forEach(function (b) {
      if (!S.defeated[b.def.id] && S.notes[b.def.id]) dot(b.def.x, b.def.y, '#ff4a2a', 3);
    });
    if (fieldMark && !fieldMark.px) dot(fieldMark.x, fieldMark.y, '#f0c46a', 3);
    dot(S.x / TILE, S.y / TILE, '#7fe3a6', 3);
    function dot(x, y, c, s) { mmG.fillStyle = c; mmG.fillRect(x * sx - 1, y * sy - 1, s, s); }
  }

  /* ==========================================================
     戦闘の画面（Phaser）
     荒野の上に暗い幕を下ろして、その上で撃ち合う。
     数値とログは DOM 側が持ち、ここは見せるだけ。
     ========================================================== */
  var BG = null, battleOpen = false;
  var CX = VIEW_W / 2, ENEMY_Y = 168, PLAYER_Y = 360;

  var BattleScene = {
    key: 'battle',
    create: function (data) {
      BG = this;
      this.parts = {};
      this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x0d1013, 0.72).setOrigin(0, 0);
      var vig = this.add.graphics();
      vig.fillStyle(0x000000, 0.4);
      vig.fillRect(0, 0, VIEW_W, 24); vig.fillRect(0, VIEW_H - 24, VIEW_W, 24);
      vig.fillRect(0, 0, 24, VIEW_H); vig.fillRect(VIEW_W - 24, 0, 24, VIEW_H);

      this.shadow = this.add.ellipse(CX, ENEMY_Y + 60, 120, 22, 0x000000, 0.3).setDepth(4);
      this.enemyBox = this.add.container(CX, ENEMY_Y).setDepth(5);
      this.playerShadow = this.add.ellipse(CX, PLAYER_Y + 40, 76, 16, 0x000000, 0.3).setDepth(5);
      this.player = this.add.sprite(CX, PLAYER_Y, 'tank-up').setScale(5).setDepth(6);
      this.flash = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xffffff).setOrigin(0, 0).setDepth(50).setAlpha(0);

      var sc = this;
      if (data.kind === 'mob') {
        var t = mobTex(data.id);
        sc.enemyMain = sc.add.sprite(0, 0, t[0]).setScale(6);
        if (t[1]) sc.enemyMain.setTint(t[1]);
        sc.enemyBox.add(sc.enemyMain);
        sc.shadow.setPosition(CX, ENEMY_Y + 54).setDisplaySize(110, 20);
      } else {
        data.def.parts.forEach(function (p) {
          var sp = sc.add.sprite(0, 0, bossTex(data.def.id, p.key)).setScale(5);
          sc.enemyBox.add(sp);
          sc.parts[p.key] = sp;
          if (data.broken && data.broken[p.key]) sp.setAlpha(0);
        });
        sc.enemyMain = sc.parts.body;
        sc.shadow.setPosition(CX, ENEMY_Y + 76).setDisplaySize(150, 26);
      }
      sc.enemyBox.setScale(0.6).setAlpha(0);
      sc.tweens.add({ targets: sc.enemyBox, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    }
  };

  var Battle = {
    open: function (kind, data) {
      battleOpen = true;
      G.scene.pause();
      data.kind = kind;
      G.scene.launch('battle', data);
      mmEl.hidden = true;
      SFX.encounter();
    },
    playerFire: function (kind, damage, targetKey) {
      if (!battleOpen || !BG) return;
      var sc = BG, sub = kind === 'sub', sp = kind === 'special';
      var bx = CX + (sub ? 26 : 0), by = PLAYER_Y - 40;
      var mf = sc.add.circle(bx, by, sub ? 7 : 12, sp ? 0xffa0ff : 0xffe9a8, 0.95).setDepth(7);
      sc.tweens.add({ targets: mf, scale: 0.2, alpha: 0, duration: 130, onComplete: function () { mf.destroy(); } });
      sc.cameras.main.shake(sub ? 60 : 110, sub ? 0.002 : 0.005);
      if (sub) SFX.subFire(); else SFX.fire();
      var shell = sc.add.rectangle(bx, by, sub ? 4 : 6, sub ? 10 : 16, sp ? 0xe0a0ff : sub ? 0xd6e2ee : 0xffd479).setDepth(7);
      var tx = CX + r(20), ty = ENEMY_Y + 8;
      sc.tweens.add({ targets: shell, x: tx, y: ty, duration: sub ? 130 : 180, ease: 'Quad.easeIn',
        onComplete: function () { shell.destroy(); Battle.impact(tx, ty, damage, sub, targetKey); } });
    },
    impact: function (x, y, damage, small, targetKey) {
      if (!battleOpen || !BG) return;
      var sc = BG;
      SFX.hit();
      var burst = sc.add.circle(x, y, small ? 12 : 20, 0xfff0c0, 0.9).setDepth(8);
      sc.tweens.add({ targets: burst, scale: 2.2, alpha: 0, duration: 240, onComplete: function () { burst.destroy(); } });
      for (var i = 0; i < (small ? 5 : 10); i++) {
        (function () {
          var a = Math.random() * Math.PI * 2, dist = 30 + Math.random() * 55;
          var p = sc.add.rectangle(x, y, 4, 4, i % 2 ? 0xffb454 : 0xc8ced4).setDepth(8);
          sc.tweens.add({ targets: p, x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist + 30, alpha: 0, angle: 180,
                          duration: 380 + Math.random() * 180, onComplete: function () { p.destroy(); } });
        })();
      }
      var target = (targetKey && sc.parts[targetKey]) || sc.enemyMain;
      if (target && target.active) {
        target.setTintFill(0xffffff);
        sc.time.delayedCall(70, function () { if (target.active) target.clearTint(); });
      }
      sc.enemyBox.x = CX + (small ? 4 : 8);
      sc.tweens.add({ targets: sc.enemyBox, x: CX, duration: 160, ease: 'Elastic.easeOut' });
      if (damage != null) Battle.number(x, y - 16, damage, small ? '#ffe9a8' : '#ffd479', small ? 20 : 28);
    },
    enemyFire: function (damage) {
      if (!battleOpen || !BG) return;
      var sc = BG;
      var shell = sc.add.rectangle(CX, ENEMY_Y + 40, 6, 14, 0xff8a5a).setDepth(7);
      sc.tweens.add({ targets: shell, x: CX + r(15), y: PLAYER_Y - 20, duration: 200, ease: 'Quad.easeIn',
        onComplete: function () {
          shell.destroy();
          if (!battleOpen || !BG) return;
          if (damage === 'miss') { Battle.number(CX + 40, PLAYER_Y - 50, 'MISS', '#9aa6b2', 20); return; }
          SFX.damage();
          sc.cameras.main.shake(200, 0.012);
          sc.flash.setFillStyle(0xe03919).setAlpha(0.35);
          sc.tweens.add({ targets: sc.flash, alpha: 0, duration: 220 });
          sc.player.setTintFill(0xffffff);
          sc.time.delayedCall(80, function () { if (sc.player.active) sc.player.clearTint(); });
          Battle.number(CX, PLAYER_Y - 50, damage, '#ff7a5a', 26);
        } });
    },
    number: function (x, y, v, color, size) {
      if (!battleOpen || !BG) return;
      var sc = BG;
      var t = sc.add.text(x, y, String(v), {
        fontFamily: '"Yu Gothic", "Meiryo", sans-serif', fontSize: size + 'px', fontStyle: 'bold',
        color: color, stroke: '#12161a', strokeThickness: 5
      }).setOrigin(0.5).setDepth(20);
      sc.tweens.add({ targets: t, y: y - 46, alpha: 0, duration: 780, ease: 'Quad.easeOut', onComplete: function () { t.destroy(); } });
    },
    /* 部位が外れて落ちる。剥いだ部位は光ってから落ちる */
    breakPart: function (key, stripped) {
      if (!battleOpen || !BG) return;
      var sc = BG, sp = sc.parts[key];
      SFX.destroy();
      sc.cameras.main.shake(280, 0.016);
      var ring = sc.add.circle(CX, ENEMY_Y, 16, stripped ? 0xf0c46a : 0xffc46a, 0.85).setDepth(9);
      sc.tweens.add({ targets: ring, scale: 4.5, alpha: 0, duration: 420, onComplete: function () { ring.destroy(); } });
      if (!sp) return;
      sc.tweens.add({ targets: sp, y: 90, angle: r(30), alpha: 0, duration: 700, ease: 'Quad.easeIn' });
      if (stripped) Battle.number(CX, ENEMY_Y + 90, '剥ぎ取り!', '#f0c46a', 22);
    },
    burrow: function (down) {
      if (!battleOpen || !BG) return;
      BG.tweens.add({ targets: BG.enemyBox, y: down ? ENEMY_Y + 70 : ENEMY_Y, alpha: down ? 0.15 : 1, duration: 300 });
    },
    win: function () {
      if (!battleOpen || !BG) return;
      var sc = BG;
      SFX.defeat();
      sc.cameras.main.shake(500, 0.02);
      sc.flash.setFillStyle(0xffffff).setAlpha(0.6);
      sc.tweens.add({ targets: sc.flash, alpha: 0, duration: 420 });
      sc.tweens.add({ targets: sc.enemyBox, alpha: 0, scale: 1.3, angle: 8, duration: 520 });
      sc.tweens.add({ targets: sc.shadow, alpha: 0, duration: 420 });
    },
    lose: function () {
      if (!battleOpen || !BG) return;
      var sc = BG;
      SFX.defeat();
      sc.cameras.main.shake(500, 0.022);
      sc.flash.setFillStyle(0xe03919).setAlpha(0.55);
      sc.tweens.add({ targets: sc.flash, alpha: 0, duration: 520 });
      sc.tweens.add({ targets: sc.player, alpha: 0.25, angle: -14, duration: 520 });
    },
    flee: function () {
      if (!battleOpen || !BG) return;
      BG.tweens.add({ targets: BG.enemyBox, x: CX + 420, duration: 600, ease: 'Quad.easeIn' });
    },
    repair: function (amount) {
      if (!battleOpen || !BG) return;
      var sc = BG;
      SFX.repair();
      var ring = sc.add.circle(CX, PLAYER_Y, 30, 0x3fb87a, 0).setStrokeStyle(3, 0x7fe3a6, 0.9).setDepth(9);
      sc.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 480, onComplete: function () { ring.destroy(); } });
      Battle.number(CX, PLAYER_Y - 50, '+' + amount, '#7fe3a6', 26);
    },
    close: function () {
      if (!battleOpen) return;
      battleOpen = false;
      if (BG) { BG.scene.stop(); BG = null; }
      mmEl.hidden = false;
      if (G) G.scene.resume();
    }
  };

  /* ==========================================================
     雑魚戦：自動の撃ち合い
     ========================================================== */
  var M = null;

  function startMob(m, first, preDmg) {
    var e = m.def;
    M = { m: m, first: first, ehp: e.hp - (preDmg || 0), pre: preDmg || 0 };
    scene = 'mob';
    S.met[m.id] = 1;
    Battle.open('mob', { id: m.id });
    SFX.bgmMood('mob');
    $('mob-title').textContent = e.name;
    $('mob-stat').textContent = 'HP ' + M.ehp + ' / ' + e.hp + '　攻 ' + e.atk + '　防 ' + e.def;
    var lead = first ? (preDmg ? '先制の一発が当たった。' + preDmg + ' のダメージ。' : '背後を取った。こちらの先手。')
                     : e.name + 'が向かってくる。';
    $('mob-log').innerHTML = '<p class="' + (first ? 'good' : '') + '">' + lead + '</p>';
    $('mob-fight').hidden = false;
    $('mob-subonly').hidden = !car().sub;
    $('mob-run').hidden = false;
    $('mob-close').hidden = true;
    panel('mob');
  }

  function resolveMob(useMain) {
    var e = M.m.def, c = car(), log = [], shots = [], guard = 0, mine = M.first;
    if (c.ram && M.first) {
      var dr = Math.max(1, c.ram - e.def + r(2));
      M.ehp -= dr; shots.push({ who: 'main', d: dr });
      log.push('<p>衝角で体当たり。<span class="hit">' + dr + '</span></p>');
    }
    while (M.ehp > 0 && S.hp > 0 && guard++ < 60) {
      if (mine) {
        if (useMain && S.ammo > 0) {
          var d1 = Math.max(1, c.atk - e.def + r(3));
          M.ehp -= d1; S.ammo--;
          shots.push({ who: 'main', d: d1 });
          log.push('<p>主砲命中。<span class="hit">' + d1 + '</span></p>');
        }
        if (M.ehp > 0 && c.sub) {
          var ds = Math.max(1, c.sub - e.def + r(2));
          M.ehp -= ds;
          shots.push({ who: 'sub', d: ds });
          log.push('<p>副砲。<span class="hit">' + ds + '</span></p>');
        }
        if ((!useMain || S.ammo <= 0) && !c.sub) {
          log.push('<p class="dmg">撃てる砲が無い。</p>');
          break;
        }
      } else {
        var d2 = Math.max(1, e.atk - c.def + r(2));
        S.hp -= d2;
        shots.push({ who: 'enemy', d: d2 });
        log.push('<p>' + esc(e.name) + 'の攻撃。<span class="dmg">' + d2 + '</span> を受けた。</p>');
      }
      mine = !mine;
    }
    var won = M.ehp <= 0, m = M.m;
    playVolley(shots, won);
    if (won) {
      log.push('<p class="good">' + esc(e.name) + 'を倒した。スクラップが散らばった。</p>');
      M.after = function () { killMob(m); };
    } else if (S.hp <= 0) {
      M.after = function () { lost(e.name + 'に大破させられた。'); };
    } else {
      log.push('<p class="dmg">撃てる砲が無く、引き下がった。</p>');
    }
    if (S.ammo <= 0) tip('noammo');
    $('mob-log').innerHTML = log.reverse().join('');
    $('mob-fight').hidden = true; $('mob-subonly').hidden = true; $('mob-run').hidden = true;
    $('mob-close').hidden = false;
    hud(); save();
  }

  function playVolley(shots, won) {
    var stepMs = 140, shown = shots.slice(0, 14), t = 0;
    shown.forEach(function (sh) {
      setTimeout(function () {
        if (sh.who === 'enemy') Battle.enemyFire(sh.d);
        else Battle.playerFire(sh.who, sh.d, null);
      }, t);
      t += stepMs;
    });
    setTimeout(function () { if (won) Battle.win(); else if (S.hp <= 0) Battle.lose(); }, t + 120);
  }

  $('mob-fight').addEventListener('click', function () { resolveMob(true); });
  $('mob-subonly').addEventListener('click', function () { resolveMob(false); });
  $('mob-run').addEventListener('click', function () {
    var e = M.m.def;
    if (!M.first) {
      var d = Math.max(1, e.atk - car().def + r(2));
      S.hp -= d;
      if (S.hp <= 0) { S.hp = 1; }
      toast('離脱した。背中に ' + d + ' もらった');
    } else {
      toast('離脱した');
    }
    SFX.escape();
    closeMob();
  });
  $('mob-close').addEventListener('click', closeMob);

  function closeMob() {
    Battle.close();
    var after = M && M.after;
    M = null;
    scene = 'field'; cool = 60;
    panel('idle');
    SFX.bgmMood(curRegion ? curRegion.bgm : 'field');
    if (after) after();
    hud(); showRadio();
  }

  /* ==========================================================
     賞金首戦：ターン制
     武器を選んでから部位を撃つ。次の手は先に見えている。
     ========================================================== */
  var B = null;

  function partDef(pd) { return pd.def; }

  function startBoss(b, preDmg) {
    var def = b.def, c = car();
    B = {
      b: b, def: def, turn: 0, over: false, weapon: S.ammo > 0 ? 'main' : (c.sub ? 'sub' : 'main'),
      parts: def.parts.map(function (p) { return { def: p, hp: p.hp, broken: false }; }),
      shots: c.sp ? c.sp.shots : 0, guard: false, stun: false, intent: null,
      burrowed: false, facing: 0, cycle: 0, fleeing: false, strippedNow: []
    };
    scene = 'boss';
    S.notes[def.id] = 1;
    Battle.open('boss', { def: def });
    SFX.bgmMood(def.final ? 'finalboss' : 'midboss');
    $('boss-title').textContent = def.name;
    $('boss-log').innerHTML = '<p>' + esc(def.desc) + '</p>';
    if (preDmg) {
      var body = bpart('body');
      body.hp -= preDmg;
      bossLog('<p class="good">先制の一発が本体に当たった。<span class="hit">' + preDmg + '</span></p>');
    }
    if (c.ram) {
      var bd = bpart('body'), dr = Math.max(1, c.ram - effDef(bd) + r(2));
      bd.hp -= dr;
      bossLog('<p>衝角で体当たり。<span class="hit">' + dr + '</span></p>');
      setTimeout(function () { Battle.impact(CX, ENEMY_Y, dr, false, 'body'); }, 300);
    }
    $('boss-actions').hidden = false;
    $('boss-end').hidden = true;
    chooseIntent();
    renderBoss();
    panel('boss');
    tip('intent');
  }

  function bpart(key) { return B.parts.filter(function (p) { return p.def.key === key; })[0]; }
  function alive(key) { var p = bpart(key); return p && !p.broken; }
  function bodyRatio() { var p = bpart('body'); return p.hp / p.def.hp; }
  function phase2() { return bodyRatio() < B.def.phase; }

  /* 防御の補正。甲殻・砲塔の向きなど、賞金首ごとの仕掛けはここ */
  function effDef(p) {
    var d = p.def.def, k = p.def.key, ai = B.def.ai;
    if (ai === 'scorpion' && k === 'body' && alive('shell')) d += 10;
    if (ai === 'ghost' && k === 'cannon' && B.facing !== 1) d = Math.round(d / 2);
    return d;
  }
  function dmgScale(p) {
    if (B.def.ai === 'floater' && p.def.key === 'body' && alive('shield')) return 0.2;
    return 1;
  }
  function targetable(p) { return !p.broken && !B.burrowed; }

  /* 次の手を決める。intent は { part, name, atk, times, big, kind } */
  function chooseIntent() {
    var ai = B.def.ai, it = null;
    function sk(key, kind) {
      var p = bpart(key);
      if (!p || p.broken || !p.def.skill) return null;
      var s = p.def.skill;
      return { part: key, name: s.name, atk: s.atk, times: s.times || 1, big: !!s.big, kind: kind || 'hit' };
    }
    B.cycle++;
    if (ai === 'mantis') {
      if (phase2() && alive('track') && !B.fleeing) it = { part: 'track', name: '逃げようとしている', kind: 'flee' };
      else if (B.fleeing && alive('track')) it = { part: 'track', name: '逃げ出す', kind: 'escape' };
      else it = (B.cycle % 2 === 0 && sk('arm')) || sk('body');
    } else if (ai === 'scorpion') {
      var seq = phase2() ? ['charge', 'tail'] : ['body', 'charge', 'tail'];
      var s = seq[B.cycle % seq.length];
      if (s === 'charge' && alive('tail')) it = { part: 'tail', name: '尾の砲が溜めている', kind: 'charge' };
      else if (s === 'tail' && B.charged && alive('tail')) it = sk('tail');
      if (!it) it = sk('body');
      B.charged = false;
    } else if (ai === 'worm') {
      if (B.burrowed) it = alive('jaw') ? sk('jaw', 'emerge') : null;
      else if (alive('jaw') && B.cycle % (phase2() ? 2 : 3) === 0) it = { part: 'jaw', name: '地中へ潜ろうとしている', kind: 'burrow' };
      if (!it) it = sk('body');
    } else if (ai === 'floater') {
      it = (B.cycle % 2 === 0 && sk('gun')) || sk('body');
      if (phase2() && sk('gun')) it = sk('gun');
    } else if (ai === 'ghost') {
      if (B.facing === 1 && alive('cannon')) it = sk('cannon');
      else it = (B.cycle % 2 === 0 && sk('sub')) || sk('body');
    }
    B.intent = it || sk('body');
  }

  function renderBoss() {
    var c = car(), it = B.intent;
    var turret = B.def.ai === 'ghost' ? ['左を向いている', '正面を向いている', '右を向いている'][B.facing] : '';
    $('boss-intent').innerHTML = B.over ? '' :
      '<span class="tk-intent-k">次の手</span><b class="' + (it && it.big ? 'is-big' : '') + '">' +
      (B.stun ? 'ネットに絡まっている' : B.burrowed ? '地中に潜っている' : esc(it ? it.name : '—')) + '</b>' +
      (it && it.part && it.part !== 'body' && !B.stun ? '<em>' + esc(bpart(it.part).def.name) + 'を壊せば止まる</em>' : '') +
      (turret ? '<em>主砲塔は' + turret + '</em>' : '');

    if (B.weapon === 'main' && S.ammo <= 0 && c.sub) B.weapon = 'sub';
    if (B.weapon === 'special' && B.shots <= 0) B.weapon = S.ammo > 0 ? 'main' : 'sub';
    var wh = $('boss-weapons');
    wh.innerHTML = '';
    weaponBtn('main', '主砲', '弾 ' + S.ammo, S.ammo > 0 && c.atk > 0);
    if (c.sub) weaponBtn('sub', '副砲', '弾いらず', true);
    if (c.sp) weaponBtn('special', c.sp.name, '残り ' + B.shots, B.shots > 0);
    function weaponBtn(k, name, sub, ok) {
      var b = document.createElement('button');
      b.className = 'tk-wpn' + (B.weapon === k ? ' is-on' : '');
      b.innerHTML = '<b>' + esc(name) + '</b><span>' + esc(sub) + '</span>';
      b.disabled = !ok || B.over;
      b.addEventListener('click', function () { B.weapon = k; renderBoss(); });
      wh.appendChild(b);
    }

    var host = $('boss-parts');
    host.innerHTML = '';
    B.parts.forEach(function (p, idx) {
      var row = document.createElement('div');
      var src = it && it.part === p.def.key && !B.stun;
      row.className = 'tk-part' + (p.broken ? ' is-broken' : '') + (src ? ' is-src' : '');
      var drop = p.def.drop && !p.broken ? '<span class="tk-part-drop">剥げば ' + esc(PART[p.def.drop].name) + '</span>' : '';
      var gotIt = p.broken && B.strippedNow.indexOf(p.def.key) >= 0 ? '<span class="tk-part-drop">剥ぎ取った</span>' : '';
      row.innerHTML =
        '<span class="tk-part-name">' + esc(p.def.name) + '</span>' +
        '<span class="tk-part-num">' + Math.max(0, p.hp) + ' / ' + p.def.hp + '　防 ' + effDef(p) + '</span>' +
        '<span class="tk-bar"><i style="width:' + Math.max(0, p.hp / p.def.hp * 100) + '%"></i></span>' +
        '<span class="tk-part-note">' + (p.def.note ? esc(p.def.note) : '') + drop + gotIt + '</span>';
      var btn = document.createElement('button');
      btn.className = 'tk-btn';
      btn.textContent = p.broken ? '破壊' : '撃つ';
      btn.disabled = !targetable(p) || B.over || !canShoot();
      btn.addEventListener('click', function () { fire(idx); });
      row.appendChild(btn);
      host.appendChild(row);
    });

    $('boss-selfhp').style.width = Math.max(0, S.hp / c.hp * 100) + '%';
    $('boss-selfnum').textContent = Math.max(0, Math.round(S.hp)) + ' / ' + c.hp;
    $('boss-kit').textContent = '修理キット（' + S.kits + '）';
    $('boss-kit').disabled = S.kits <= 0 || B.over;
    $('boss-guard').disabled = B.over;
  }

  function canShoot() {
    var c = car();
    if (B.weapon === 'main') return S.ammo > 0;
    if (B.weapon === 'sub') return c.sub > 0;
    return B.shots > 0;
  }

  function bossLog(html) {
    var el = $('boss-log');
    el.insertAdjacentHTML('afterbegin', html);
    el.scrollTop = 0;
  }

  function fire(idx) {
    if (B.over || !canShoot()) return;
    var c = car(), p = B.parts[idx], w = B.weapon, atk, tags = [], label;
    if (w === 'main') { atk = c.atk; S.ammo--; label = '主砲'; }
    else if (w === 'sub') { atk = c.sub; label = '副砲'; }
    else { atk = c.sp.atk; tags = c.sp.tags; B.shots--; label = c.sp.name; }

    var targets = tags.indexOf('area') >= 0 ? B.parts.filter(targetable) : [p];
    targets.forEach(function (t, k) {
      var def = tags.indexOf('pierce') >= 0 ? 0 : effDef(t);
      var d = Math.max(1, Math.round((atk - def + r(4)) * dmgScale(t)));
      t.hp -= d;
      bossLog('<p>' + esc(label) + '：' + esc(t.def.name) + 'に命中。<span class="hit">' + d + '</span>' +
              (dmgScale(t) < 1 ? '（盾に弾かれた）' : '') + '</p>');
      setTimeout(function () { Battle.playerFire(w, d, t.def.key); }, k * 120);
    });
    if (tags.indexOf('stun') >= 0) {
      B.stun = true;
      bossLog('<p class="good">ネットが絡みついた。次の手が止まる。</p>');
    }
    if (w === 'main' && S.ammo <= 0) tip('noammo');

    var bodyDown = false;
    targets.forEach(function (t) {
      if (t.hp > 0 || t.broken) return;
      t.hp = 0; t.broken = true;
      if (t.def.key === 'body') { bodyDown = true; return; }
      var stripped = !!t.def.drop;
      if (stripped) {
        B.strippedNow.push(t.def.key);
        S.stripped[B.def.id] = S.stripped[B.def.id] || {};
        S.stripped[B.def.id][t.def.key] = 1;
        bossLog('<p class="good">' + esc(t.def.name) + 'を剥ぎ取った。' + esc(PART[t.def.drop].name) + 'が手に入る。</p>');
        tip('strip');
      } else {
        bossLog('<p class="good">' + esc(t.def.name) + 'を破壊した。</p>');
      }
      setTimeout(function () { Battle.breakPart(t.def.key, stripped); }, 420);
      if (B.def.ai === 'worm' && t.def.key === 'jaw') B.burrowed = false;
    });
    if (bodyDown) return winBoss();
    enemyTurn();
  }

  $('boss-guard').addEventListener('click', function () {
    if (B.over) return;
    B.guard = true;
    bossLog('<p>身構えた。次の一撃を半分に抑える。</p>');
    enemyTurn();
  });
  $('boss-kit').addEventListener('click', function () {
    if (B.over || S.kits <= 0) return;
    S.kits--;
    var heal = Math.floor(maxHp() * 0.35);
    S.hp = Math.min(maxHp(), S.hp + heal);
    bossLog('<p class="good">修理キットを使った。' + heal + ' 回復。（残り ' + S.kits + '）</p>');
    Battle.repair(heal);
    enemyTurn();
  });
  $('boss-run').addEventListener('click', function () {
    Battle.close();
    B = null;
    scene = 'field'; cool = 120;
    panel('idle');
    SFX.bgmMood(curRegion ? curRegion.bgm : 'field');
    SFX.escape();
    toast('撤退した');
    hud(); save(); showRadio();
  });
  $('boss-close').addEventListener('click', function () {
    var won = B && B.won, final = B && B.def.final, dead = B && B.lostNow, name = B && B.def.name;
    if (dead) { lost(name + 'に大破させられた。'); return; }
    Battle.close();
    B = null;
    scene = 'field'; cool = 120;
    panel('idle');
    SFX.bgmMood(curRegion ? curRegion.bgm : 'field');
    if (won && final && !S.cleared) { S.cleared = true; save(); openEnding(); return; }
    hud(); showRadio();
  });

  function enemyTurn() {
    var it = B.intent, c = car();
    B.turn++;
    if (B.stun) {
      B.stun = false;
      bossLog('<p>' + esc(B.def.name) + 'はネットを振りほどこうともがいている。</p>');
    } else if (!it) {
      /* 何もしない */
    } else if (it.part !== 'body' && !alive(it.part) && it.kind !== 'emerge') {
      bossLog('<p class="good">' + esc(bpart(it.part).def.name) + 'が壊れていて、「' + esc(it.name) + '」は不発。</p>');
    } else if (it.kind === 'flee') {
      B.fleeing = true;
      bossLog('<p class="dmg">' + esc(B.def.name) + 'が後ずさりを始めた。脚を壊さないと逃げられる。</p>');
    } else if (it.kind === 'escape') {
      bossLog('<p class="dmg">' + esc(B.def.name) + 'は荒野の向こうへ逃げ去った。</p>');
      Battle.flee();
      return endBoss(false, true);
    } else if (it.kind === 'charge') {
      B.charged = true;
      bossLog('<p class="dmg">尾の砲が赤く光り始めた。</p>');
    } else if (it.kind === 'burrow') {
      B.burrowed = true;
      Battle.burrow(true);
      bossLog('<p class="dmg">' + esc(B.def.name) + 'が地中に潜った。</p>');
    } else {
      if (it.kind === 'emerge') { B.burrowed = false; Battle.burrow(false); }
      var missRate = 0;
      if ((B.def.ai === 'mantis' || B.def.ai === 'ghost') && !alive('track')) missRate = 0.35;
      if (B.def.ai === 'floater' && !alive('bag')) missRate = 0.3;
      for (var i = 0; i < it.times; i++) {
        if (Math.random() < missRate) {
          bossLog('<p>「' + esc(it.name) + '」は狙いが逸れた。</p>');
          (function (k) { setTimeout(function () { Battle.enemyFire('miss'); }, 620 + k * 220); })(i);
          continue;
        }
        var d = Math.max(1, it.atk - c.def + r(3));
        if (B.guard) d = Math.ceil(d / 2);
        S.hp -= d;
        bossLog('<p>' + esc(B.def.name) + 'の「' + esc(it.name) + '」。<span class="dmg">' + d + '</span> を受けた。</p>');
        (function (dd, k) { setTimeout(function () { Battle.enemyFire(dd); }, 620 + k * 220); })(d, i);
      }
    }
    B.guard = false;
    if (B.def.ai === 'ghost') B.facing = phase2() ? (B.facing === 1 ? 0 : 1) : (B.facing + 1) % 3;
    if (c.tags.mend && S.hp > 0) {
      var heal = Math.ceil(c.hp * 0.04);
      S.hp = Math.min(c.hp, S.hp + heal);
      bossLog('<p class="good">自動修理装置が ' + heal + ' 直した。</p>');
    }
    if (S.hp <= 0) return loseBoss();
    chooseIntent();
    renderBoss(); hud(); save();
  }

  function winBoss() {
    var def = B.def;
    B.won = true;
    S.defeated[def.id] = true;
    S.gold += def.gold;
    bossLog('<p class="good">' + esc(def.name) + 'を倒した。賞金 ' + def.gold.toLocaleString() + ' G。</p>');
    B.strippedNow.forEach(function (k) {
      var pd = def.parts.filter(function (p) { return p.key === k; })[0];
      addPart(S, pd.drop);
    });
    if (B.strippedNow.length) bossLog('<p class="good">剥いだ部品は倉庫へ送った。</p>');
    D.quests.forEach(function (q) {
      var st = S.quests[q.id];
      if (st && st.st === 'active' && q.step.kind === 'strip' && q.step.boss === def.id &&
          B.strippedNow.indexOf(q.step.part) >= 0) {
        st.st = 'ready';
        bossLog('<p class="good">依頼の品「' + esc(q.step.item) + '」を手に入れた。</p>');
      }
    });
    setTimeout(function () { Battle.win(); }, 200);
    if (B.b.views) B.b.views.setVisible(false);
    endBoss(true);
  }
  function loseBoss() {
    bossLog('<p class="dmg">大破した。</p>');
    setTimeout(function () { Battle.lose(); }, 200);
    B.lostNow = true;
    endBoss(false);
  }
  function endBoss(won, fled) {
    B.over = true;
    renderBoss();
    $('boss-actions').hidden = true;
    $('boss-end').hidden = false;
    $('boss-close').textContent = won && B.def.final ? '崖の上へ' : '閉じる';
    if (fled) bossLog('<p>また探し出して、今度こそ脚を止めよう。</p>');
    hud(); save();
  }

  /* 大破。基地へ牽引され、所持金の一部を失う */
  function lost(msg) {
    Battle.close();
    B = null; M = null;
    S.hp = Math.max(1, Math.floor(maxHp() * 0.3));
    S.gold = Math.floor(S.gold * 0.7);
    var h = homeTown();
    S.x = h.x * TILE + TILE / 2; S.y = (h.y + 2) * TILE + TILE / 2;
    townLock = h.id;
    if (G) G.tank.setPosition(S.x, S.y);
    scene = 'field'; cool = 120;
    panel('idle');
    toast(msg || '大破した。基地へ牽引された');
    tip('lost');
    hud(); save();
  }

  /* ==========================================================
     街
     ========================================================== */
  var curTown = null, townTab = 'talk', gearOpen = null;

  function openTown(t) {
    curTown = t;
    scene = 'town';
    pad.up = pad.down = pad.left = pad.right = pad.fire = 0;
    $('town-name').textContent = t.name;
    $('town-intro').textContent = t.intro;
    var msg = [];
    if (S.scrap > 0) {
      msg.push('スクラップを ' + S.scrap.toLocaleString() + ' G で売った。');
      S.gold += S.scrap; S.scrap = 0;
      SFX.coin();
    }
    D.quests.forEach(function (q) {
      var st = S.quests[q.id];
      if (st && st.st === 'active' && q.step.kind === 'visit' && q.step.town === t.id) {
        msg.push(q.step.item + 'を届けた。「' + q.done + '」');
        reward(q);
      }
    });
    $('town-news').innerHTML = msg.map(function (m) { return '<p>' + esc(m) + '</p>'; }).join('');
    $('town-news').hidden = !msg.length;
    gearOpen = null;
    showTab('talk');
    panel('town');
    SFX.bgmMood('town');
    hud(); save(); showRadio();
  }

  Array.prototype.forEach.call(document.querySelectorAll('.tk-tab'), function (b) {
    b.addEventListener('click', function () { showTab(b.dataset.tab); });
  });

  function showTab(name) {
    townTab = name;
    Array.prototype.forEach.call(document.querySelectorAll('.tk-tab'), function (b) {
      b.classList.toggle('is-on', b.dataset.tab === name);
    });
    ['talk', 'gear', 'shop', 'mod', 'bounty'].forEach(function (k) { $('tab-' + k).hidden = k !== name; });
    renderTab();
    if (name === 'bounty') tutDone('bounty');
    showRadio();
  }
  function renderTab() {
    ({ talk: renderTalk, gear: renderGear, shop: renderShop, mod: renderMod, bounty: renderBounty })[townTab]();
    var over = overloaded();
    $('town-close').disabled = over;
    $('town-over').hidden = !over;
    if (over) tip('overload');
    placeSpot();
  }

  /* ---------- 話す ---------- */
  var talkIdx = {};
  function renderTalk() {
    var host = $('tab-talk');
    host.innerHTML = '';
    curTown.npcs.forEach(function (n, i) {
      var key = curTown.id + i, el = document.createElement('div');
      el.className = 'tk-npc';
      var q = n.quest && QUEST[n.quest], st = q && S.quests[q.id];
      var line = n.lines[(talkIdx[key] || 0) % n.lines.length];
      var html = '<div class="tk-npc-who">' + esc(n.who) + '</div><p>' + esc(line) + '</p>';
      if (q) {
        if (!st) html += '<div class="tk-quest"><b>依頼：' + esc(q.name) + '</b><p>' + esc(q.ask) + '</p></div>';
        else if (st.st === 'active') html += '<div class="tk-quest"><b>依頼中：' + esc(q.name) + '</b><p>' + esc(questHint(q, st)) + '</p></div>';
        else if (st.st === 'ready') html += '<div class="tk-quest is-ready"><b>' + esc(q.name) + '</b><p>報告できる。</p></div>';
        else html += '<div class="tk-quest is-done"><b>' + esc(q.name) + '（済み）</b></div>';
      }
      el.innerHTML = html;
      var row = document.createElement('div');
      row.className = 'tk-actions';
      var talk = document.createElement('button');
      talk.className = 'tk-btn';
      talk.textContent = '話す';
      talk.addEventListener('click', function () { talkIdx[key] = (talkIdx[key] || 0) + 1; SFX.coin(); renderTalk(); });
      row.appendChild(talk);
      if (q && !st) row.appendChild(btn('引き受ける', true, function () { acceptQuest(q); }));
      if (q && st && st.st === 'ready') row.appendChild(btn('報告する', true, function () { reportQuest(q); }));
      el.appendChild(row);
      host.appendChild(el);
    });
  }
  function btn(label, main, fn) {
    var b = document.createElement('button');
    b.className = 'tk-btn' + (main ? ' tk-btn-main' : '');
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  function questHint(q, st) {
    var s = q.step;
    if (st.st === 'ready') return TOWN[q.town].name + 'へ戻って報告する';
    if (s.kind === 'fetch') return s.item + 'を探す（地図の金の点）';
    if (s.kind === 'hunt') return MOB[s.mob].name + 'を倒す（' + (st.n || 0) + ' / ' + s.n + '）';
    if (s.kind === 'visit') return s.item + 'を' + TOWN[s.town].name + 'へ届ける';
    if (s.kind === 'strip') return BOSS[s.boss].name + 'の' + BOSS[s.boss].parts.filter(function (p) { return p.key === s.part; })[0].name + 'を剥ぐ';
    return '';
  }
  function acceptQuest(q) {
    S.quests[q.id] = { st: 'active', n: 0 };
    if (q.step.kind === 'strip' && S.stripped[q.step.boss] && S.stripped[q.step.boss][q.step.part]) S.quests[q.id].st = 'ready';
    if (q.step.kind === 'fetch') addQuestPickup(q);
    SFX.coin();
    toast('依頼「' + q.name + '」を引き受けた');
    save(); renderTalk();
  }
  function reportQuest(q) {
    $('town-news').innerHTML = '<p>「' + esc(q.done) + '」</p>';
    $('town-news').hidden = false;
    reward(q);
    save(); renderTalk(); hud();
  }
  function reward(q) {
    S.quests[q.id].st = 'done';
    var got = [];
    if (q.reward.gold) { S.gold += q.reward.gold; got.push(q.reward.gold.toLocaleString() + ' G'); }
    if (q.reward.part) { addPart(S, q.reward.part); got.push(PART[q.reward.part].name + '（倉庫へ）'); }
    SFX.clear();
    toast('報酬：' + got.join('、'));
  }
  function countHunt(mobId) {
    D.quests.forEach(function (q) {
      var st = S.quests[q.id];
      if (!st || st.st !== 'active' || q.step.kind !== 'hunt' || q.step.mob !== mobId) return;
      st.n = (st.n || 0) + 1;
      if (st.n >= q.step.n) { st.st = 'ready'; toast('依頼「' + q.name + '」：' + TOWN[q.town].name + 'へ報告しよう'); }
    });
  }

  /* ---------- 整備（積み替え） ---------- */
  var STAT_SHOW = {
    main: [['atk', '威力'], ['ammo', '弾']], sub: [['atk', '威力']], special: [['atk', '威力'], ['shots', '弾数']],
    armor: [['def', '防御'], ['hp', 'HP']], engine: [['power', '積める重さ'], ['spd', '速さ']],
    track: [['spd', '速さ']], extra: [['atk', '威力']]
  };
  var TAG_NAME = { wide: '川を渡る', climb: '急坂を登る', dozer: '瓦礫を押す', float: '沼を渡る', heavy: '瓦礫を撃って壊す',
                   pierce: '防御を無視', area: '全部位に当たる', stun: '次の手を止める', ram: '体当たり',
                   ammo: '主砲の弾 1.5倍', mend: '戦闘中に少しずつ直る' };

  function statText(it) {
    var p = PART[it.id], sl = p.slot, out = [];
    STAT_SHOW[sl].forEach(function (s) {
      var v = stat(it, s[0]);
      if (v || s[0] !== 'atk') out.push(s[1] + ' ' + (s[0] === 'spd' && sl === 'track' && v > 0 ? '+' : '') + v);
    });
    if (sl !== 'engine') out.push('重さ ' + stat(it, 'w'));
    (p.tags || []).forEach(function (t) { out.push(TAG_NAME[t]); });
    if (it.mod) out.push('改造：' + D.mods[it.mod].name);
    return out.join('　');
  }

  function renderGear() {
    var host = $('tab-gear'), c = car();
    host.innerHTML = '';
    var load = document.createElement('div');
    load.className = 'tk-load' + (c.w > c.power ? ' is-over' : '');
    load.innerHTML = '<span>積んだ重さ</span><span class="tk-bar"><i style="width:' + Math.min(100, c.w / c.power * 100) + '%"></i></span><b>' + c.w + ' / ' + c.power + '</b>';
    host.appendChild(load);
    var sum = document.createElement('p');
    sum.className = 'tk-item-desc';
    sum.textContent = '攻 ' + c.atk + '（弾 ' + c.ammo + '）　副 ' + c.sub + '　防 ' + c.def + '　HP ' + c.hp + '　速さ ' + c.spd;
    host.appendChild(sum);

    var hinted = false;
    SLOTS.forEach(function (sl) {
      var it = equipped(sl);
      var spare = S.bag.filter(function (b) { return PART[b.id].slot === sl && !isEquipped(b.uid); });
      var row = document.createElement('div');
      row.className = 'tk-slot';
      row.innerHTML = '<div class="tk-slot-head"><span class="tk-slot-k">' + SLOT_NAME[sl] + '</span>' +
        '<b>' + (it ? esc(PART[it.id].name) : '（なし）') + '</b></div>' +
        (it ? '<span class="tk-item-desc">' + esc(statText(it)) + '</span>' : '');
      var acts = document.createElement('div');
      acts.className = 'tk-actions';
      if (spare.length) {
        var b = btn(gearOpen === sl ? 'とじる' : '替える（' + spare.length + '）', false, function () {
          gearOpen = gearOpen === sl ? null : sl; renderTab();
        });
        if (!hinted && tutStep() && tutStep().id === 'equip') { b.setAttribute('data-equip-hint', '1'); hinted = true; }
        acts.appendChild(b);
      }
      if (it && !REQUIRED[sl]) acts.appendChild(btn('降ろす', false, function () { S.eq[sl] = null; afterEquip(); }));
      row.appendChild(acts);
      if (gearOpen === sl) {
        spare.forEach(function (sp) {
          var opt = document.createElement('div');
          opt.className = 'tk-item';
          opt.innerHTML = '<span><span class="tk-item-name">' + esc(PART[sp.id].name) + '</span>' +
            '<span class="tk-item-desc"><br>' + esc(statText(sp)) + '</span></span>';
          var eb = btn('積む', true, function () { S.eq[sl] = sp.uid; gearOpen = null; afterEquip(); });
          if (tutStep() && tutStep().id === 'equip' && !document.querySelector('[data-equip-hint="2"]')) eb.setAttribute('data-equip-hint', '2');
          opt.appendChild(eb);
          row.appendChild(opt);
        });
      }
      host.appendChild(row);
    });
    if (tutStep() && tutStep().id === 'equip') {
      var h2 = document.querySelector('[data-equip-hint="2"]') || document.querySelector('[data-equip-hint]');
      setSpot(h2, true);
    }
  }
  function isEquipped(uid) { return SLOTS.some(function (sl) { return S.eq[sl] === uid; }); }
  function afterEquip() {
    var c = car();
    S.hp = Math.min(S.hp, c.hp);
    S.ammo = Math.min(S.ammo, c.ammo);
    SFX.coin();
    refreshTank();
    tutDone('equip');
    renderTab(); hud(); save();
  }
  function refreshTank() {
    if (!G) return;
    ART.retank(G, tankPal());
    G.tank.setTexture('tank-' + face);
  }

  /* ---------- 店 ---------- */
  function renderShop() {
    var host = $('tab-shop'), c = car();
    host.innerHTML = '';
    var need = c.hp - Math.round(S.hp), rc = Math.ceil(need * 1.2);
    addRow(host, '修理', need > 0 ? 'HP を ' + need + ' 直す' : '傷は無い', need > 0 ? rc + ' G' : '—',
      need > 0 && S.gold >= rc, function () { S.gold -= rc; S.hp = c.hp; SFX.repair(); renderTab(); hud(); save(); });
    var lack = c.ammo - S.ammo, ac = lack * 8;
    addRow(host, '主砲の弾を補給', lack > 0 ? lack + ' 発' : '満タン', lack > 0 ? ac + ' G' : '—',
      lack > 0 && S.gold >= ac, function () { S.gold -= ac; S.ammo = c.ammo; SFX.coin(); renderTab(); hud(); save(); });
    addRow(host, '修理キット', '賞金首戦で HP を 35% 直す。持っている数 ' + S.kits + '（5 まで）', '200 G',
      S.gold >= 200 && S.kits < 5, function () { S.gold -= 200; S.kits++; SFX.coin(); renderTab(); hud(); save(); });

    sub(host, '部品を買う');
    curTown.shop.forEach(function (id) {
      var p = PART[id], tmp = { id: id, mod: null };
      addRow(host, p.name + '<span class="tk-tagslot">' + SLOT_NAME[p.slot] + '</span>', esc(statText(tmp)),
        p.price.toLocaleString() + ' G', S.gold >= p.price, function () {
          S.gold -= p.price; addPart(S, id); SFX.coin();
          toast(p.name + 'を買った。「整備」で積める');
          renderTab(); hud(); save();
        }, '買う');
    });

    var spare = S.bag.filter(function (b) { return !isEquipped(b.uid); });
    if (spare.length) {
      sub(host, '倉庫の部品を売る');
      spare.forEach(function (sp) {
        var p = PART[sp.id], price = Math.floor(p.price / 2);
        addRow(host, p.name + '<span class="tk-tagslot">' + SLOT_NAME[p.slot] + '</span>', esc(statText(sp)),
          price.toLocaleString() + ' G', true, function () {
            S.bag.splice(S.bag.indexOf(sp), 1); S.gold += price; SFX.coin();
            renderTab(); hud(); save();
          }, '売る');
      });
    }
  }
  function sub(host, text) {
    var h = document.createElement('h3');
    h.className = 'tk-sub';
    h.textContent = text;
    host.appendChild(h);
  }
  function addRow(host, nameHtml, descHtml, price, can, fn, label) {
    var el = document.createElement('div');
    el.className = 'tk-item';
    el.innerHTML = '<span><span class="tk-item-name">' + nameHtml + '</span>' +
      '<span class="tk-item-desc"><br>' + descHtml + '</span></span>' +
      '<span class="tk-item-price">' + price + '</span>';
    var b = document.createElement('button');
    b.className = 'tk-btn';
    b.textContent = fn ? (label || '頼む') : '—';
    b.disabled = !can;
    if (fn) b.addEventListener('click', fn);
    el.appendChild(b);
    host.appendChild(el);
  }

  /* ---------- 改造 ---------- */
  function renderMod() {
    var host = $('tab-mod');
    host.innerHTML = '<p class="tk-item-desc">積んでいる部品に1つだけ施せる。施し直すと前の改造は消える。</p>';
    curTown.mods.forEach(function (mid) {
      var m = D.mods[mid], it = equipped(m.slot);
      if (!it) {
        addRow(host, esc(m.name), esc(SLOT_NAME[m.slot] + 'を積んでいないと頼めない'), m.price.toLocaleString() + ' G', false, null);
        return;
      }
      var after = { id: it.id, mod: mid };
      var desc = esc(m.about) + '<br>' + esc(PART[it.id].name) + '：' + esc(statText(it)) + '<br>→ ' + esc(statText(after));
      addRow(host, esc(m.name) + '<span class="tk-tagslot">' + SLOT_NAME[m.slot] + '</span>', desc,
        m.price.toLocaleString() + ' G', S.gold >= m.price && it.mod !== mid, function () {
          S.gold -= m.price; it.mod = mid; SFX.repair();
          toast(PART[it.id].name + 'に「' + m.name + '」を施した');
          afterEquip();
        });
    });
  }

  /* ---------- 手配書 ---------- */
  function renderBounty() {
    var host = $('tab-bounty');
    host.innerHTML = '';
    D.bosses.forEach(function (b) {
      var here = b.town === curTown.id;
      if (here) S.notes[b.id] = 1;
      if (!here && !S.notes[b.id] && !S.defeated[b.id]) return;
      var done = !!S.defeated[b.id], st = S.stripped[b.id] || {};
      var parts = b.parts.filter(function (p) { return p.drop; }).map(function (p) {
        return (st[p.key] ? '✓ ' : '・') + p.name + ' → ' + PART[p.drop].name;
      }).join('　');
      var el = document.createElement('div');
      el.className = 'tk-bounty' + (done ? ' is-done' : '');
      el.innerHTML = '<canvas width="64" height="64"></canvas><div><b>' + esc(b.name) + (done ? '（討伐済み）' : '') + '</b>' +
        '<span class="tk-item-price">' + b.gold.toLocaleString() + ' G</span>' +
        '<p class="tk-item-desc">' + esc(b.desc) + '</p>' +
        '<p class="tk-item-desc">' + esc(regionName(b.region)) + '。地図の赤い点が居場所。</p>' +
        '<p class="tk-about">剥げる部位　' + esc(parts) + '</p></div>';
      host.appendChild(el);
      drawBossIcon(el.querySelector('canvas'), b);
    });
    save();
  }
  function regionName(id) { return D.regions.filter(function (r) { return r.id === id; })[0].name; }
  function drawBossIcon(cv, b) {
    if (!G) return;
    var g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    b.parts.forEach(function (p) {
      var k = bossTex(b.id, p.key), img = G.textures.get(k).getSourceImage();
      g.drawImage(img, (64 - img.width * 2) / 2, (64 - img.height * 2) / 2, img.width * 2, img.height * 2);
    });
  }

  $('town-close').addEventListener('click', function () {
    if (overloaded()) return;
    scene = 'field';
    panel('idle');
    setSpot(null);
    SFX.bgmMood(curRegion ? curRegion.bgm : 'field');
    save(); showRadio();
  });

  /* ==========================================================
     エンディング
     ========================================================== */
  function openEnding() {
    scene = 'ending';
    radioEl.hidden = true;
    SFX.clear();
    SFX.bgmMood('town');
    $('ending-text').innerHTML = D.ending.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');
    var strips = 0, all = 0;
    D.bosses.forEach(function (b) {
      b.parts.forEach(function (p) { if (p.drop) { all++; if (S.stripped[b.id] && S.stripped[b.id][p.key]) strips++; } });
    });
    var c = car(), host = $('ending-result');
    host.innerHTML = '';
    [['討伐した賞金首', D.bosses.filter(function (b) { return S.defeated[b.id]; }).length + ' / ' + D.bosses.length],
     ['剥ぎ取った部位', strips + ' / ' + all],
     ['手に入れた部品', Object.keys(S.owned).length + ' / ' + D.parts.length],
     ['所持金', S.gold.toLocaleString() + ' G'],
     ['主砲', PART[equipped('main').id].name],
     ['装甲', PART[equipped('armor').id].name],
     ['エンジン', PART[equipped('engine').id].name]
    ].forEach(function (row) {
      var el = document.createElement('div');
      el.innerHTML = '<span>' + esc(row[0]) + '</span><b>' + esc(row[1]) + '</b>';
      host.appendChild(el);
    });
    panel('ending');
  }
  $('ending-close').addEventListener('click', function () {
    scene = 'field';
    panel('idle');
    SFX.bgmMood(curRegion ? curRegion.bgm : 'field');
    toast('荒野はまだ続く');
    showRadio();
  });

  /* ==========================================================
     タイトル
     ========================================================== */
  var titleEl = $('title');
  function openTitle() {
    scene = 'title';
    titleEl.hidden = false;
    $('title-cont').disabled = !hasSave();
    $('title-ask').hidden = true;
    radioEl.hidden = true;
  }
  $('title-new').addEventListener('click', function () {
    if (hasSave()) { $('title-ask').hidden = false; return; }
    beginGame(false);
  });
  $('title-ask-yes').addEventListener('click', function () { beginGame(false); });
  $('title-ask-no').addEventListener('click', function () { $('title-ask').hidden = true; });
  $('title-cont').addEventListener('click', function () { beginGame(true); });

  function beginGame(cont) {
    S = null;
    if (!cont) { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
    if (!cont || !load()) S = fresh();
    if (!S.hp) S.hp = maxHp();
    if (!S.ammo && !cont) S.ammo = car().ammo;
    titleEl.hidden = true;
    startWorld();
  }

  var game = null;
  function startWorld() {
    G = null;
    buildGrid();
    spawnMobs();
    setupBosses();
    setupFinds();
    curRegion = regionAt(Math.floor(S.x / TILE), Math.floor(S.y / TILE));
    townLock = null;
    var here = D.towns.filter(function (t) { return t.x === Math.floor(S.x / TILE) && t.y === Math.floor(S.y / TILE); })[0];
    if (here) townLock = here.id;
    scene = 'field';
    panel('idle');
    SFX.bgmMood(curRegion ? curRegion.bgm : 'field');
    if (game) {
      game.scene.getScene('battle').scene.stop();
      game.scene.getScene('field').scene.restart();
    } else {
      game = new Phaser.Game({
        type: Phaser.AUTO, parent: 'stage', width: VIEW_W, height: VIEW_H, pixelArt: true,
        backgroundColor: '#14181c',
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
        scene: [Field, BattleScene]
      });
    }
    hud(); save();
    showRadio();
  }

  /* ==========================================================
     オプション・図鑑
     ========================================================== */
  var OPT_KEY = 'tank-opt-v1';
  function loadOpt() {
    var o = { sfx: 70, bgm: 30 };
    try {
      var saved = JSON.parse(localStorage.getItem(OPT_KEY) || 'null');
      if (saved && typeof saved.sfx === 'number') o.sfx = saved.sfx;
      if (saved && typeof saved.bgm === 'number') o.bgm = saved.bgm;
    } catch (e) {}
    return o;
  }
  var OPT = loadOpt();
  function saveOpt() { try { localStorage.setItem(OPT_KEY, JSON.stringify(OPT)); } catch (e) {} }
  function applyVolume() { SFX.setVolume('sfx', OPT.sfx / 100); SFX.setVolume('bgm', OPT.bgm / 100); }
  applyVolume();

  ['pointerdown', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function once() { SFX.unlock(); window.removeEventListener(ev, once); });
  });

  var optModal = $('opt-modal');
  var sfxSlider = $('opt-sfx'), sfxVal = $('opt-sfx-v'), bgmSlider = $('opt-bgm'), bgmVal = $('opt-bgm-v');
  function openOpt(show) {
    optModal.hidden = !show;
    if (show) {
      sfxSlider.value = OPT.sfx; sfxVal.textContent = OPT.sfx;
      bgmSlider.value = OPT.bgm; bgmVal.textContent = OPT.bgm;
      $('opt-audio-note').hidden = SFX.isUsable();
      $('opt-tut').disabled = !S;
      $('opt-zukan').disabled = !S;
      $('reset').disabled = !S;
    } else closeAsk();
    if (G && !battleOpen && scene !== 'title') { if (show) G.scene.pause(); else G.scene.resume(); }
  }
  $('open-opt').addEventListener('click', function () { openOpt(true); });
  $('opt-close').addEventListener('click', function () { openOpt(false); });
  optModal.addEventListener('pointerdown', function (e) { if (e.target === optModal) openOpt(false); });
  sfxSlider.addEventListener('input', function () { OPT.sfx = +this.value; sfxVal.textContent = OPT.sfx; applyVolume(); saveOpt(); });
  sfxSlider.addEventListener('change', function () { SFX.coin(); });
  bgmSlider.addEventListener('input', function () { OPT.bgm = +this.value; bgmVal.textContent = OPT.bgm; applyVolume(); saveOpt(); });

  $('opt-tut').addEventListener('click', function () {
    S.tut = 0; S.tutOff = false;
    if (!mobs.some(function (m) { return m.tut; })) {
      var m = newMob('drone', regionAt(18, 56), 18 * TILE + 8, 56 * TILE + 8, 0);
      m.tut = true; mobs.push(m); if (G) makeMobView(m);
    }
    openOpt(false); save(); showRadio();
  });

  /* 確認はページの中で聞く。ブラウザの confirm は止められると黙って失敗する */
  var resetBtn = $('reset'), resetAsk = $('reset-ask'), askTimer = null;
  resetBtn.addEventListener('click', function () {
    resetBtn.hidden = true; resetAsk.hidden = false;
    clearTimeout(askTimer); askTimer = setTimeout(closeAsk, 10000);
  });
  $('reset-no').addEventListener('click', closeAsk);
  $('reset-yes').addEventListener('click', function () {
    closeAsk();
    Battle.close();
    openOpt(false);
    beginGame(false);
    toast('最初から始めます');
  });
  function closeAsk() { clearTimeout(askTimer); resetAsk.hidden = true; resetBtn.hidden = false; }

  var zModal = $('zukan-modal');
  $('opt-zukan').addEventListener('click', function () { optModal.hidden = true; renderZukan(); zModal.hidden = false; });
  $('zukan-close').addEventListener('click', function () { zModal.hidden = true; if (G && !battleOpen && scene !== 'title') G.scene.resume(); });
  zModal.addEventListener('pointerdown', function (e) { if (e.target === zModal) $('zukan-close').click(); });

  function renderZukan() {
    var host = $('zukan-body');
    host.innerHTML = '';
    sub(host, '賞金首');
    D.bosses.forEach(function (b) {
      var st = S.stripped[b.id] || {}, seen = S.notes[b.id] || S.defeated[b.id];
      var strips = b.parts.filter(function (p) { return p.drop; }).map(function (p) {
        return (st[p.key] ? '剥いだ' : 'まだ') + '：' + p.name;
      }).join('　');
      zRow(host, seen ? b.name : '？？？', seen ? (S.defeated[b.id] ? '討伐済み　' : '') + strips : '', !!S.defeated[b.id]);
    });
    sub(host, '雑魚');
    Object.keys(MOB).forEach(function (id) {
      var m = MOB[id], met = S.met[id];
      zRow(host, met ? m.name : '？？？', met ? 'HP ' + m.hp + '　攻 ' + m.atk + '　防 ' + m.def : '', !!met);
    });
    var own = Object.keys(S.owned).length;
    sub(host, '部品（' + own + ' / ' + D.parts.length + '）');
    D.parts.forEach(function (p) {
      var got = S.owned[p.id];
      zRow(host, got ? p.name : '？？？', got ? SLOT_NAME[p.slot] + '　' + statText({ id: p.id, mod: null }) : '', !!got);
    });
  }
  function zRow(host, name, desc, on) {
    var el = document.createElement('div');
    el.className = 'tk-zrow' + (on ? '' : ' is-off');
    el.innerHTML = '<b>' + esc(name) + '</b><span>' + esc(desc) + '</span>';
    host.appendChild(el);
  }

  /* ==========================================================
     起動
     ========================================================== */
  setInterval(placeSpot, 400);
  openTitle();

  /* dev:start */
  if (/[?&]debug=1/.test(location.search)) {
    window.__tank = {
      state: function () { return S; },
      info: function () { return { scene: scene, region: curRegion && curRegion.id, mobs: mobs.length, pickups: pickups.length, car: car(), tut: S && S.tut }; },
      begin: beginGame,
      warp: function (tx, ty) { S.x = tx * TILE + 8; S.y = ty * TILE + 8; if (G) G.tank.setPosition(S.x, S.y); },
      give: function (id) { return addPart(S, id); },
      equip: function (uid) { S.eq[PART[item(uid).id].slot] = uid; refreshTank(); hud(); },
      openTown: function (id) { openTown(TOWN[id]); },
      boss: function (id) { startBoss(bossObjs.filter(function (b) { return b.def.id === id; })[0], 0); },
      B: function () { return B; },
      fire: fire,
      mob: function (i) { startMob(mobs[i], true, 0); },
      mobs: function () { return mobs; },
      pickups: function () { return pickups; },
      collect: collect,
      shoot: fieldFire,
      face: function (f, fl) { face = f; flipX = !!fl; },
      at: at,
      tile: function (tx, ty) { return grid[ty][tx]; },
      ending: openEnding,
      game: function () { return game; }
    };
  }
  /* dev:end */
})();
