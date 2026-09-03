/* ==========================================================
   荒野の戦車乗り（試作）

   企画書の方針
   - 区画選択制ではなく、2Dトップダウンの地続きのフィールド
   - シンボルエンカウント（敵が見えていて、触れると戦闘）
   - 雑魚はワンボタンのオート戦闘、賞金首はターン制で部位を狙う
   - 街とイベントは data.js に外出しし、後から足せるようにする

   外部ライブラリなし。素の Canvas 2D。
   ========================================================== */
(function () {
  'use strict';

  var D = window.GAME_DATA;
  var cv = document.getElementById('cv');
  var g  = cv.getContext('2d');

  var TILE = 32, MAPW = 60, MAPH = 45;
  var SAND = 0, ROCK = 1, ROAD = 2, TOWN = 3;
  var SAVE_KEY = 'tank-save-v1';

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
      parts: { cannon: 0, armor: 0, engine: 0 },
      defeated: {},
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
    if (S.hp == null) S.hp = maxHp();
    S.hp = Math.min(S.hp, maxHp());
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
  }

  function cannon() { return D.parts.cannon[S.parts.cannon]; }
  function armor()  { return D.parts.armor[S.parts.armor]; }
  function engine() { return D.parts.engine[S.parts.engine]; }
  function maxHp()  { return armor().hp; }

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
      mobs.push(makeMob(x, y, lv, rnd));
    }
  }
  function makeMob(x, y, lv, rnd) {
    return {
      x: x * TILE + TILE / 2, y: y * TILE + TILE / 2,
      lv: lv, t: rnd() * 100,
      vx: (rnd() - .5) * .5, vy: (rnd() - .5) * .5
    };
  }
  function nearTown(x, y, r) {
    return D.towns.some(function (t) { return Math.abs(t.x - x) <= r && Math.abs(t.y - y) <= r; });
  }
  function setupBosses() {
    bosses = D.enemies.filter(function (e) { return e.kind === 'boss'; })
      .map(function (e) { return { def: e, x: e.x * TILE + TILE / 2, y: e.y * TILE + TILE / 2 }; });
  }

  /* ==========================================================
     入力
     ========================================================== */
  var keys = {}, pad = { up: 0, down: 0, left: 0, right: 0 };

  addEventListener('keydown', function (e) {
    keys[e.key.toLowerCase()] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(e.key.toLowerCase()) >= 0) e.preventDefault();
  });
  addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });

  Array.prototype.forEach.call(document.querySelectorAll('#pad button'), function (b) {
    var d = b.dataset.dir;
    function on(e) { e.preventDefault(); pad[d] = 1; }
    function off(e) { e.preventDefault(); pad[d] = 0; }
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
  });

  function axis() {
    var ax = 0, ay = 0;
    if (keys.arrowleft  || keys.a || pad.left)  ax -= 1;
    if (keys.arrowright || keys.d || pad.right) ax += 1;
    if (keys.arrowup    || keys.w || pad.up)    ay -= 1;
    if (keys.arrowdown  || keys.s || pad.down)  ay += 1;
    return [ax, ay];
  }

  /* ==========================================================
     進行状態
     ========================================================== */
  var scene = 'field';      // field / mob / boss / town
  var ang = 0;              // 車体の向き
  var cool = 0;             // 戦闘直後の無敵時間
  var townLock = null;      // 同じ街で繰り返し開かないようにする

  var toastEl = document.getElementById('toast'), toastT = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastT = 150;
  }

  function panel(id, show) { document.getElementById(id).hidden = !show; }

  function hud() {
    document.getElementById('hud-hp').textContent = 'HP ' + Math.max(0, Math.round(S.hp)) + ' / ' + maxHp();
    document.getElementById('hud-gold').textContent = S.gold.toLocaleString() + ' G';
  }

  /* ==========================================================
     フィールドの更新
     ========================================================== */
  function update() {
    if (toastT > 0 && --toastT === 0) toastEl.hidden = true;
    if (scene !== 'field') return;
    if (cool > 0) cool--;

    var a = axis(), ax = a[0], ay = a[1];
    var sp = engine().spd;
    if (ax || ay) {
      var len = Math.hypot(ax, ay);
      var nx = S.x + ax / len * sp, ny = S.y + ay / len * sp;
      // 縦横を別々に判定して、壁ぎわで引っかからないようにする
      if (!blocked(nx, S.y)) S.x = nx;
      if (!blocked(S.x, ny)) S.y = ny;
      ang = Math.atan2(ay, ax);
    }

    // 雑魚はゆっくり漂う
    mobs.forEach(function (m) {
      m.t += .02;
      var mx = m.x + Math.cos(m.t) * .35, my = m.y + Math.sin(m.t * .7) * .35;
      if (!blocked(mx, my)) { m.x = mx; m.y = my; }
    });

    if (cool === 0) checkEncounter();
    checkTown();
  }

  function checkEncounter() {
    for (var i = 0; i < mobs.length; i++) {
      if (Math.hypot(mobs[i].x - S.x, mobs[i].y - S.y) < 20) { startMob(i); return; }
    }
    for (var j = 0; j < bosses.length; j++) {
      var b = bosses[j];
      if (S.defeated[b.def.id]) continue;
      if (Math.hypot(b.x - S.x, b.y - S.y) < 26) { startBoss(j); return; }
    }
  }

  function checkTown() {
    var tx = Math.floor(S.x / TILE), ty = Math.floor(S.y / TILE);
    var here = D.towns.filter(function (t) { return Math.abs(t.x - tx) <= 1 && Math.abs(t.y - ty) <= 1; })[0];
    if (!here) { townLock = null; return; }
    if (townLock === here.id) return;
    townLock = here.id;
    openTown(here);
  }

  /* ==========================================================
     描画
     ========================================================== */
  function draw() {
    var camX = Math.max(0, Math.min(S.x - cv.width / 2, MAPW * TILE - cv.width));
    var camY = Math.max(0, Math.min(S.y - cv.height / 2, MAPH * TILE - cv.height));

    g.fillStyle = '#14181c';
    g.fillRect(0, 0, cv.width, cv.height);

    var x0 = Math.floor(camX / TILE), y0 = Math.floor(camY / TILE);
    var x1 = Math.ceil((camX + cv.width) / TILE), y1 = Math.ceil((camY + cv.height) / TILE);

    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        if (!map[y] || map[y][x] === undefined) continue;
        var t = map[y][x], sx = x * TILE - camX, sy = y * TILE - camY;
        if (t === SAND)      { g.fillStyle = ((x + y) % 2) ? '#3a3325' : '#3d3627'; }
        else if (t === ROAD) { g.fillStyle = '#4a4433'; }
        else if (t === TOWN) { g.fillStyle = '#5a4a30'; }
        else                 { g.fillStyle = '#23262a'; }
        g.fillRect(sx, sy, TILE, TILE);

        if (t === ROCK) {
          g.fillStyle = '#2c3136';
          g.beginPath();
          g.arc(sx + 16, sy + 17, 11, 0, 6.29);
          g.fill();
        }
        if (t === TOWN) drawTown(sx, sy);
      }
    }

    bosses.forEach(function (b) {
      if (S.defeated[b.def.id]) return;
      drawBoss(b.x - camX, b.y - camY);
    });
    mobs.forEach(function (m) { drawMob(m.x - camX, m.y - camY, m.lv); });
    drawTank(S.x - camX, S.y - camY);

    drawMinimap();
  }

  function drawTown(sx, sy) {
    g.fillStyle = '#d9a441';
    g.fillRect(sx + 7, sy + 12, 8, 12);
    g.fillRect(sx + 18, sy + 8, 8, 16);
    g.fillStyle = '#8a6a28';
    g.fillRect(sx + 5, sy + 24, 23, 3);
  }

  function drawTank(x, y) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.fillStyle = '#3fb87a';
    g.fillRect(-11, -8, 22, 16);
    g.fillStyle = '#2b8a58';
    g.fillRect(-11, -10, 22, 3);
    g.fillRect(-11, 7, 22, 3);
    g.fillStyle = '#dfe8ef';
    g.fillRect(0, -2.5, 17, 5);        // 砲身
    g.restore();
  }

  function drawMob(x, y, lv) {
    var col = ['#8d93a0', '#c98a3a', '#c0503a'][lv];
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x, y - 9); g.lineTo(x + 8, y + 7); g.lineTo(x - 8, y + 7);
    g.closePath(); g.fill();
  }

  function drawBoss(x, y) {
    g.fillStyle = '#e03919';
    g.beginPath(); g.arc(x, y, 13, 0, 6.29); g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 13px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('!', x, y + 1);
  }

  function drawMinimap() {
    var w = 116, h = 88, px = cv.width - w - 12, py = 12;
    g.fillStyle = 'rgba(5,7,10,.78)';
    g.fillRect(px - 4, py - 4, w + 8, h + 8);
    var sx = w / MAPW, sy = h / MAPH;
    D.towns.forEach(function (t) {
      g.fillStyle = '#d9a441';
      g.fillRect(px + t.x * sx - 1, py + t.y * sy - 1, 3, 3);
    });
    bosses.forEach(function (b) {
      if (S.defeated[b.def.id]) return;
      g.fillStyle = '#e03919';
      g.fillRect(px + b.def.x * sx - 1, py + b.def.y * sy - 1, 3, 3);
    });
    g.fillStyle = '#3fb87a';
    g.fillRect(px + (S.x / TILE) * sx - 1, py + (S.y / TILE) * sy - 1, 3, 3);
  }

  /* ==========================================================
     雑魚戦：ワンボタンのオート戦闘
     ========================================================== */
  var mobIdx = -1;

  function startMob(i) {
    mobIdx = i;
    scene = 'mob';
    var e = D.enemies[mobs[i].lv];
    document.getElementById('mob-title').textContent = e.name + 'と遭遇';
    document.getElementById('mob-log').innerHTML = '<p>' + e.name + 'が向かってくる。</p>';
    document.getElementById('mob-fight').hidden = false;
    document.getElementById('mob-run').hidden = false;
    document.getElementById('mob-close').hidden = true;
    panel('mob', true);
  }

  function resolveMob() {
    var m = mobs[mobIdx], e = D.enemies[m.lv];
    var ehp = e.hp, log = [], guard = 0;

    while (ehp > 0 && S.hp > 0 && guard++ < 40) {
      var d1 = Math.max(1, cannon().atk - e.def + Math.floor(Math.random() * 7) - 3);
      ehp -= d1;
      log.push('<p>主砲命中。<span class="hit">' + d1 + '</span> のダメージ。</p>');
      if (ehp <= 0) break;
      var d2 = Math.max(1, e.atk - armor().def + Math.floor(Math.random() * 5) - 2);
      S.hp -= d2;
      log.push('<p>' + e.name + 'の反撃。<span class="dmg">' + d2 + '</span> を受けた。</p>');
    }

    if (S.hp > 0) {
      S.gold += e.gold;
      log.push('<p class="good">' + e.name + 'を撃破。' + e.gold + ' G を獲得した。</p>');
      // 倒した敵は別の場所に湧き直す
      relocate(m);
    } else {
      S.hp = Math.max(1, Math.floor(maxHp() * 0.2));
      S.gold = Math.floor(S.gold * 0.7);
      log.push('<p class="dmg">大破。牽引されて基地へ戻された。修理費として所持金の一部を失った。</p>');
      warpHome();
    }

    document.getElementById('mob-log').innerHTML = log.join('');
    document.getElementById('mob-fight').hidden = true;
    document.getElementById('mob-run').hidden = true;
    document.getElementById('mob-close').hidden = false;
    hud(); save();
  }

  function relocate(m) {
    var rnd = Math.random;
    for (var i = 0; i < 400; i++) {
      var x = Math.floor(rnd() * MAPW), y = Math.floor(rnd() * MAPH);
      if (map[y][x] === ROCK || map[y][x] === TOWN || nearTown(x, y, 3)) continue;
      if (Math.hypot(x * TILE - S.x, y * TILE - S.y) < 260) continue;
      m.x = x * TILE + TILE / 2; m.y = y * TILE + TILE / 2;
      return;
    }
  }

  function warpHome() {
    var h = D.towns[0];
    S.x = h.x * TILE + TILE / 2;
    S.y = (h.y + 2) * TILE + TILE / 2;
    townLock = h.id;
  }

  document.getElementById('mob-fight').addEventListener('click', resolveMob);
  document.getElementById('mob-run').addEventListener('click', function () {
    closeMob('離脱した。');
  });
  document.getElementById('mob-close').addEventListener('click', function () { closeMob(''); });

  function closeMob(msg) {
    panel('mob', false);
    scene = 'field';
    cool = 60;
    if (msg) toast(msg);
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

  function bossLog(html) {
    var el = document.getElementById('boss-log');
    el.innerHTML += html;
    el.scrollTop = el.scrollHeight;
  }

  function fire(idx) {
    if (B.over) return;
    var p = B.parts[idx];
    var d = Math.max(1, cannon().atk - p.def.def + Math.floor(Math.random() * 9) - 4);
    p.hp -= d;
    bossLog('<p>' + p.def.name + 'に命中。<span class="hit">' + d + '</span> のダメージ。</p>');
    if (p.hp <= 0) {
      p.hp = 0;
      bossLog('<p class="good">' + p.def.name + 'を破壊した。</p>');
      if (p.def.key === 'body') return winBoss();
    }
    enemyTurn();
  }

  document.getElementById('boss-repair').addEventListener('click', function () {
    if (B.over || B.repairs <= 0) return;
    B.repairs--;
    var heal = Math.floor(maxHp() * 0.28);
    S.hp = Math.min(maxHp(), S.hp + heal);
    bossLog('<p class="good">応急修理。' + heal + ' 回復した。（残り ' + B.repairs + ' 回）</p>');
    enemyTurn();
  });

  document.getElementById('boss-run').addEventListener('click', function () {
    panel('boss', false); scene = 'field'; cool = 90; B = null;
    toast('撤退した。');
  });

  document.getElementById('boss-close').addEventListener('click', function () {
    panel('boss', false); scene = 'field'; cool = 90; B = null;
  });

  function enemyTurn() {
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
    });

    if (S.hp <= 0) return loseBoss();
    renderBoss(); hud(); save();
  }

  function winBoss() {
    B.over = true;
    S.defeated[B.def.id] = true;
    S.gold += B.def.gold;
    bossLog('<p class="good">' + B.def.name + 'を撃破した。賞金 ' + B.def.gold + ' G。</p>');
    endBoss();
  }

  function loseBoss() {
    B.over = true;
    S.hp = Math.max(1, Math.floor(maxHp() * 0.2));
    S.gold = Math.floor(S.gold * 0.7);
    bossLog('<p class="dmg">大破。牽引されて基地へ戻された。</p>');
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
        S.gold -= cost; S.hp = maxHp(); hud(); save(); renderShop();
      });

    // パーツ強化
    [['cannon', '主砲'], ['armor', '装甲'], ['engine', 'エンジン']].forEach(function (pair) {
      var key = pair[0], label = pair[1];
      var list = D.parts[key], cur = S.parts[key], next = list[cur + 1];
      if (!next) {
        addItem(host, label + '：' + list[cur].name, 'これ以上は強化できない', '—', false, null);
        return;
      }
      var desc = list[cur].name + ' → ' + next.name;
      addItem(host, label + 'の強化', desc, next.price + ' G', S.gold >= next.price, function () {
        S.gold -= next.price;
        S.parts[key] = cur + 1;
        if (key === 'armor') S.hp = maxHp();
        hud(); save(); renderShop();
      });
    });
  }

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
    var list = D.enemies.filter(function (e) { return e.kind === 'boss' && e.town === curTown.id; });
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
    // 街の外へ少し押し出して、閉じた直後に開き直さないようにする
    S.y = (curTown.y + 2) * TILE + TILE / 2;
    save();
  });

  /* ==========================================================
     やり直し
     ========================================================== */
  document.getElementById('reset').addEventListener('click', function () {
    if (!confirm('最初からやり直しますか。強化したパーツと所持金は消えます。')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    S = fresh(); S.hp = maxHp();
    spawnMobs();
    panel('town', false); panel('mob', false); panel('boss', false);
    scene = 'field'; townLock = null;
    hud(); save();
    toast('最初から始めます。');
  });

  /* ==========================================================
     起動
     ========================================================== */
  buildMap();
  load();
  spawnMobs();
  setupBosses();
  hud();

  (function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  })();

  /* URL に ?debug=1 が付いているときだけ、動作確認用の入口を開ける。
     通常の閲覧では何も生えない。 */
  if (/[?&]debug=1/.test(location.search)) {
    window.__tank = {
      step: function (n) { for (var i = 0; i < (n || 1); i++) update(); },
      state: function () { return S; },
      info: function () { return { scene: scene, cool: cool, townLock: townLock, mobs: mobs.length }; },
      mobAt: function (i) { return mobs[i]; },
      towns: function () { return D.towns; },
      openTown: openTown,
      startBoss: startBoss,
      warp: function (tx, ty) { S.x = tx * TILE + TILE / 2; S.y = ty * TILE + TILE / 2; }
    };
  }
})();
